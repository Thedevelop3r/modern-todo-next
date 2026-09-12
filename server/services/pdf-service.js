// pdf-service.js - runs the Rust renderer as a child of this process.
//
// No supervisor is involved. server.js already owns the application's
// lifecycle, so it owns the renderer's too: one fewer moving part than
// supervisord, and the switch to running the renderer as its own container is
// a single environment variable - see
// example-seperate-service-internal-network-only.txt.

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

/** Where the multi-stage Docker build puts the binary. Checked in this order. */
const CANDIDATE_PATHS = [process.env.PDF_SERVICE_BIN, "/usr/local/bin/modern-todo-pdf"].filter(Boolean);

/** Where cargo puts it. Neither profile is preferred - see binaryPath. */
const CARGO_PATHS = [
  path.join(__dirname, "../../services/pdf/target/release/modern-todo-pdf"),
  path.join(__dirname, "../../services/pdf/target/debug/modern-todo-pdf"),
];

/** Back off further after each crash, so a broken binary is not respawned hot. */
const BACKOFF_MS = [500, 1000, 2000, 5000, 15000];

let child = null;
let restarts = 0;
let stopping = false;

/**
 * The binary to run.
 *
 * A configured or installed path always wins. Between the two cargo profiles
 * the **newest** one wins rather than release unconditionally: a stale
 * `target/release` left over from an earlier build otherwise beats the debug
 * build you just made, and the only symptom is a PDF quietly rendered by last
 * week's templates.
 */
const binaryPath = () => {
  const installed = CANDIDATE_PATHS.find((candidate) => fs.existsSync(candidate));
  if (installed) return installed;

  return (
    CARGO_PATHS.filter((candidate) => fs.existsSync(candidate))
      .map((candidate) => ({ candidate, mtime: fs.statSync(candidate).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0]?.candidate || null
  );
};

function start() {
  if (stopping) return;

  const binary = binaryPath();
  if (!binary) {
    console.warn("pdf service: no binary found; PDF generation will be unavailable");
    return;
  }
  if (!process.env.PDF_SERVICE_KEY) {
    console.warn("pdf service: PDF_SERVICE_KEY is not set; not starting the renderer");
    return;
  }

  child = spawn(binary, [], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // The renderer logs JSON; pass it through so both sets of lines land in one
  // place and share the request id.
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) return;

    const delay = BACKOFF_MS[Math.min(restarts, BACKOFF_MS.length - 1)];
    restarts += 1;
    console.warn(`pdf service exited (code ${code}, signal ${signal}); restarting in ${delay}ms`);
    setTimeout(start, delay).unref();
  });

  child.on("error", (error) => {
    console.warn(`pdf service failed to start: ${error.message}`);
  });
}

/**
 * Start the renderer, unless it is being run separately.
 *
 * `PDF_SERVICE_SPAWN=0` is the entire difference between "in this container"
 * and "its own service": point `PDF_SERVICE_URL` elsewhere and nothing else
 * changes.
 */
function startPdfService() {
  if (process.env.PDF_SERVICE_SPAWN === "0" || process.env.PDF_SERVICE_SPAWN === "false") {
    console.log("pdf service: not spawned (PDF_SERVICE_SPAWN=0)");
    return false;
  }
  if (process.env.NODE_ENV === "test") return false;

  start();
  return true;
}

/** Called from the server's shutdown path, before the database goes away. */
function stopPdfService() {
  stopping = true;
  if (!child) return;
  child.kill("SIGTERM");
  // A renderer mid-compile gets a moment, then goes the hard way.
  const timer = setTimeout(() => child?.kill("SIGKILL"), 3000);
  timer.unref();
}

module.exports = { startPdfService, stopPdfService, binaryPath };
