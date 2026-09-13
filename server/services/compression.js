// compression.js - shrink a file before it is stored, and say how far along it is.
//
// Three tools, three very different progress stories:
//
//   ffmpeg  reports genuine progress on its own stdout, so video and audio get
//           a true percentage.
//   sharp   and qpdf expose no progress hook whatsoever. Rather than invent a
//           number, those report an indeterminate stage - both finish in well
//           under a second at the sizes we accept.
//
// Nothing here ever makes a file bigger: if the result is not smaller than the
// original, the original is kept.

const { execFile, spawn } = require("node:child_process");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { jobRegistry } = require("./job-registry");

/** ffmpeg would otherwise starve Node, Next and the PDF service in one container. */
const MAX_CONCURRENT_TRANSCODES = Number(process.env.MAX_CONCURRENT_TRANSCODES) || 2;
const FFMPEG_THREADS = Number(process.env.FFMPEG_THREADS) || 2;

/**
 * A "compressed" file below this fraction of the original is treated as
 * truncated rather than well compressed - only applied above
 * MIN_RATIO_CHECK_BYTES, because tiny files legitimately compress very hard.
 */
const MIN_PLAUSIBLE_RATIO = 0.02;
const MIN_RATIO_CHECK_BYTES = 1024 * 1024;

/**
 * The largest image we will decode - 50 MP, comfortably above any camera or
 * screenshot and far below what it takes to exhaust the container. A bigger
 * image is stored as uploaded rather than compressed.
 */
const MAX_INPUT_PIXELS = 50_000_000;

let running = 0;
const waiting = [];

/** A counting semaphore, so only so many transcodes run at once. */
function acquire() {
  if (running < MAX_CONCURRENT_TRANSCODES) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else running = Math.max(0, running - 1);
}

// ------------------------------------------------------- capabilities ----

let capabilities = null;

/**
 * Run a tool and report what happened.
 *
 * The outcome is deliberately not collapsed to "stdout or null": a tool killed
 * by the timeout leaves a *partially written output file* behind, and a caller
 * that cannot tell that from success will happily store the fragment. See
 * `compressPdf`, where that mistake cost a 300 MB PDF.
 *
 * `timeout: 0` means no limit - for anything whose runtime scales with the file,
 * where a fixed ceiling is the bug rather than the safeguard.
 */
const run = (command, args, { timeout = 10_000 } = {}) =>
  new Promise((resolve) => {
    execFile(command, args, { timeout, maxBuffer: 1 << 22 }, (error, stdout) =>
      resolve({
        ok: !error,
        stdout: stdout || "",
        code: typeof error?.code === "number" ? error.code : null,
        // execFile sets both when it kills the child for exceeding `timeout`.
        killed: Boolean(error?.killed) || Boolean(error?.signal),
        signal: error?.signal || null,
      })
    );
  });

/** Just the stdout, for the probes that only care whether a tool answered. */
const runForOutput = async (command, args, options) => {
  const result = await run(command, args, options);
  return result.ok ? result.stdout : null;
};

/**
 * What this machine can actually do, probed once.
 *
 * Encoder availability is not a given: a stock Ubuntu ffmpeg build may have no
 * libx264 at all, and qpdf is frequently not installed. Assuming either is
 * present is how compression silently breaks in one environment and not another.
 */
async function detect() {
  if (capabilities) return capabilities;

  const [encoders, qpdf] = await Promise.all([
    runForOutput("ffmpeg", ["-hide_banner", "-encoders"]),
    runForOutput("qpdf", ["--version"]),
  ]);
  const has = (name) => Boolean(encoders && new RegExp(`\\b${name}\\b`).test(encoders));

  capabilities = {
    ffmpeg: Boolean(encoders),
    qpdf: Boolean(qpdf),
    // Best available, in descending order of quality-per-byte.
    videoCodec: has("libx264") ? "libx264" : has("libopenh264") ? "libopenh264" : has("mpeg4") ? "mpeg4" : null,
    audioCodec: has("libopus") ? "libopus" : has("aac") ? "aac" : null,
  };
  return capabilities;
}

/** Exposed so tests can force a re-probe. */
const resetCapabilities = () => {
  capabilities = null;
};

// ------------------------------------------------------------- ffmpeg ----

/** Media duration in seconds, which is what turns ffmpeg's output into a percentage. */
async function probeDuration(file) {
  const out = await runForOutput("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const seconds = Number(String(out || "").trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Run ffmpeg, turning `-progress pipe:1` into fractions of the whole.
 *
 * The progress stream is `key=value` lines; `out_time_us` against the probed
 * duration is the only honest measure of how far through it is.
 */
function runFfmpeg({ args, durationSeconds, jobId }) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    const job = jobRegistry.get(jobId);
    if (job) job.child = child;

    let stderr = "";
    let buffer = "";

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      // Keep the last, possibly partial, line for the next chunk.
      buffer = lines.pop() || "";

      for (const line of lines) {
        const [key, value] = line.split("=");
        if (key !== "out_time_us" || !durationSeconds) continue;

        const seconds = Number(value) / 1e6;
        if (!Number.isFinite(seconds)) continue;
        jobRegistry.update(jobId, {
          phase: "compress",
          fraction: seconds / durationSeconds,
          determinate: true,
        });
      }
    });

    child.stderr.on("data", (chunk) => {
      // Only the tail matters; a failing ffmpeg says why in its last few lines.
      stderr = (stderr + chunk.toString()).slice(-2000);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (job) job.child = null;
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim().split("\n").pop() || "no output"}`));
    });
  });
}

// --------------------------------------------------------- compressors ----

/** ffmpeg and sharp both infer the container from the extension, so it matters. */
const OUTPUT_EXTENSION = {
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "application/pdf": ".pdf",
};

async function compressImage({ input, output, jobId }) {
  const sharp = require("sharp");

  // sharp gives no progress, so the stage is reported and the bar is shown as
  // indeterminate rather than pretending to measure something.
  jobRegistry.update(jobId, { phase: "compress", fraction: 0, determinate: false });

  // limitInputPixels matters more than the byte cap: a few hundred KB of
  // crafted PNG decodes to gigabytes of bitmap at sharp's ~268 MP default, and
  // this process also serves the pages and hosts the PDF renderer.
  await sharp(input, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true })
    // Honour the EXIF orientation, then drop the metadata - it can carry GPS.
    .rotate()
    .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toFile(output);

  return { mime: "image/webp", codec: "sharp/webp" };
}

compressImage.outputMime = "image/webp";

async function compressVideo({ input, output, jobId }) {
  const { videoCodec, audioCodec } = await detect();
  if (!videoCodec) return null;

  const durationSeconds = await probeDuration(input);
  jobRegistry.update(jobId, { phase: "compress", fraction: 0, determinate: Boolean(durationSeconds) });

  const args = [
    "-nostdin", "-y",
    "-i", input,
    "-threads", String(FFMPEG_THREADS),
    "-c:v", videoCodec,
    ...(videoCodec === "libx264" ? ["-crf", "23", "-preset", "veryfast"] : ["-q:v", "5"]),
    "-vf", "scale='min(1920,iw)':-2",
    "-pix_fmt", "yuv420p",
    ...(audioCodec ? ["-c:a", audioCodec, "-b:a", "128k"] : ["-an"]),
    // Without faststart the moov atom sits at the end of the file and seeking a
    // streamed video does not work at all.
    "-movflags", "+faststart",
    "-progress", "pipe:1",
    "-nostats",
    output,
  ];

  await runFfmpeg({ args, durationSeconds, jobId });
  return { mime: "video/mp4", codec: `ffmpeg/${videoCodec}` };
}

compressVideo.outputMime = "video/mp4";

async function compressAudio({ input, output, jobId }) {
  const { audioCodec } = await detect();
  if (!audioCodec) return null;

  const durationSeconds = await probeDuration(input);
  jobRegistry.update(jobId, { phase: "compress", fraction: 0, determinate: Boolean(durationSeconds) });

  const opus = audioCodec === "libopus";
  const args = [
    "-nostdin", "-y",
    "-i", input,
    "-threads", String(FFMPEG_THREADS),
    "-c:a", audioCodec,
    "-b:a", opus ? "96k" : "128k",
    "-progress", "pipe:1",
    "-nostats",
    output,
  ];

  await runFfmpeg({ args, durationSeconds, jobId });
  return { mime: opus ? "audio/ogg" : "audio/mp4", codec: `ffmpeg/${audioCodec}` };
}

// Opus in an Ogg container when available, AAC in MP4 otherwise.
compressAudio.outputMime = () => (capabilities?.audioCodec === "libopus" ? "audio/ogg" : "audio/mp4");

async function compressPdf({ input, output, jobId }) {
  const { qpdf } = await detect();
  if (!qpdf) return null;

  // qpdf has no progress output either.
  jobRegistry.update(jobId, { phase: "compress", fraction: 0, determinate: false });

  // No timeout: qpdf's runtime scales with the file, and a large PDF takes
  // minutes. A fixed ceiling does not abort the work safely - it kills qpdf
  // mid-write and leaves a truncated file that looks like a great compression
  // ratio. The concurrency semaphore in `compress` is what bounds the load.
  const result = await run(
    "qpdf",
    ["--object-streams=generate", "--recompress-flate", "--compression-level=9", input, output],
    { timeout: 0 }
  );

  const discard = async (note) => {
    await fsp.unlink(output).catch(() => {});
    return { failed: note };
  };

  // Killed by a signal means the output is however far it got - never usable.
  if (result.killed) return discard(`qpdf was killed (${result.signal || "signal"})`);
  // qpdf answers 0 on success and 3 on warnings, having still written a valid
  // file. Anything else is a real failure, whatever landed on disk.
  if (!result.ok && result.code !== 3) return discard(`qpdf exited with ${result.code ?? "no code"}`);

  // The exit code is necessary but not sufficient: verify the bytes are a
  // complete PDF before we agree to store them in place of the original.
  if (!(await endsWithPdfTrailer(output))) return discard("qpdf output is not a complete PDF");

  return { mime: "application/pdf", codec: "qpdf/objstreams" };
}

/**
 * Is this file a whole PDF?
 *
 * A complete PDF ends with `%%EOF`, possibly followed by whitespace. Reading
 * the last kilobyte is the cheapest check that separates "compressed well"
 * from "cut off part way through", which byte size alone cannot do.
 */
async function endsWithPdfTrailer(file) {
  let handle;
  try {
    handle = await fsp.open(file, "r");
    const { size } = await handle.stat();
    if (size < 32) return false;
    const length = Math.min(1024, size);
    const tail = Buffer.alloc(length);
    await handle.read(tail, 0, length, size - length);
    return tail.toString("latin1").trimEnd().endsWith("%%EOF");
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => {});
  }
}

compressPdf.outputMime = "application/pdf";

const COMPRESSORS = {
  image: compressImage,
  video: compressVideo,
  audio: compressAudio,
  document: compressPdf,
  pdf: compressPdf,
};

/**
 * Compress `input` if we usefully can.
 *
 * Resolves to `{ path, mime, codec, applied }`. When compression is impossible
 * or counter-productive, `applied` is false and `path` is the original - the
 * caller stores that instead, rather than a larger "compressed" file.
 */
async function compress({ input, kind, jobId, tmpDir }) {
  const compressor = COMPRESSORS[kind];
  if (!compressor) return { path: input, applied: false };

  // The extension is not cosmetic: ffmpeg picks its output container from it,
  // and without one it fails with "Error opening output files".
  await detect();
  const target = typeof compressor.outputMime === "function" ? compressor.outputMime() : compressor.outputMime;
  const output = path.join(tmpDir, `${jobId}.out${OUTPUT_EXTENSION[target] || ""}`);

  await acquire();

  try {
    const result = await compressor({ input, output, jobId });
    if (!result) return { path: input, applied: false, note: `no ${kind} compressor available on this host` };
    // The compressor ran and rejected its own output - it has already cleaned
    // up, and the original is what gets stored.
    if (result.failed) return { path: input, applied: false, note: `compression failed: ${result.failed}` };

    const [before, after] = await Promise.all([fsp.stat(input), fsp.stat(output)]);
    if (after.size >= before.size) {
      // Re-encoding made it bigger, which happens often with screenshots and
      // already-optimised media. Keep what the user gave us.
      await fsp.unlink(output).catch(() => {});
      return { path: input, applied: false, note: "re-encoding would have made it larger" };
    }
    // A ratio this good is not compression, it is a truncated file. Real codecs
    // do reach it on synthetic input, so this is a backstop behind each
    // compressor's own integrity check rather than the primary defence.
    if (before.size >= MIN_RATIO_CHECK_BYTES && after.size / before.size < MIN_PLAUSIBLE_RATIO) {
      await fsp.unlink(output).catch(() => {});
      return {
        path: input,
        applied: false,
        note: `compressed output was implausibly small (${((after.size / before.size) * 100).toFixed(1)}%) and was discarded`,
      };
    }

    jobRegistry.update(jobId, { phase: "compress", fraction: 1, determinate: true });
    return { path: output, mime: result.mime, codec: result.codec, applied: true };
  } catch (error) {
    // A failed compression must never fail the upload - store the original.
    await fsp.unlink(output).catch(() => {});
    return { path: input, applied: false, error: error.message, note: `compression failed: ${error.message}` };
  } finally {
    release();
  }
}

module.exports = {
  compress,
  detect,
  resetCapabilities,
  probeDuration,
  MAX_CONCURRENT_TRANSCODES,
  // Exported for the tests that cover the integrity checks directly.
  endsWithPdfTrailer,
  MIN_PLAUSIBLE_RATIO,
};
