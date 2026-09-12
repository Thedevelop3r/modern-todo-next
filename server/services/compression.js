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

const run = (command, args) =>
  new Promise((resolve) => {
    execFile(command, args, { timeout: 10_000, maxBuffer: 1 << 22 }, (error, stdout) =>
      resolve(error ? null : stdout)
    );
  });

/**
 * What this machine can actually do, probed once.
 *
 * Encoder availability is not a given: a stock Ubuntu ffmpeg build may have no
 * libx264 at all, and qpdf is frequently not installed. Assuming either is
 * present is how compression silently breaks in one environment and not another.
 */
async function detect() {
  if (capabilities) return capabilities;

  const [encoders, qpdf] = await Promise.all([run("ffmpeg", ["-hide_banner", "-encoders"]), run("qpdf", ["--version"])]);
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
  const out = await run("ffprobe", [
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

  await sharp(input, { failOn: "none" })
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

  const result = await run("qpdf", [
    "--object-streams=generate",
    "--recompress-flate",
    "--compression-level=9",
    input,
    output,
  ]);
  // qpdf answers 3 on warnings but still writes a valid file, so the output
  // file is the thing to check, not the exit code.
  try {
    await fsp.access(output);
  } catch {
    return null;
  }
  void result;

  return { mime: "application/pdf", codec: "qpdf/objstreams" };
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

    const [before, after] = await Promise.all([fsp.stat(input), fsp.stat(output)]);
    if (after.size >= before.size) {
      // Re-encoding made it bigger, which happens often with screenshots and
      // already-optimised media. Keep what the user gave us.
      await fsp.unlink(output).catch(() => {});
      return { path: input, applied: false, note: "re-encoding would have made it larger" };
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

module.exports = { compress, detect, resetCapabilities, probeDuration, MAX_CONCURRENT_TRANSCODES };
