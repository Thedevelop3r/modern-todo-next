// job-registry.js - live progress for uploads, held in memory.
//
// Progress moves several times a second. Writing that to mongo would be a
// stream of pointless updates, so only *state transitions* are persisted (onto
// StoredFile.state) and the moment-to-moment numbers live here. The cost is
// that a restart loses them - which is honest, because a half-received upload
// cannot be resumed either. The boot sweep marks those failed and the UI
// offers Retry.

const { EventEmitter } = require("node:events");

/**
 * How the three legs of an upload divide the bar.
 *
 * Upload and store are byte-exact for every kind of file. Only the compress leg
 * varies: ffmpeg reports genuine progress, while sharp and qpdf expose none at
 * all, so those are shown as an indeterminate stage rather than a made-up
 * percentage.
 */
const PHASE_WEIGHTS = { upload: 0.35, compress: 0.45, store: 0.2 };

/** With no compression the middle leg disappears and the others take its share. */
const PHASE_WEIGHTS_NO_COMPRESS = { upload: 0.7, compress: 0, store: 0.3 };

/** The legs of an upload, in the order they run. */
const UPLOAD_PHASES = ["upload", "compress", "store"];

/**
 * Generating a PDF has its own two legs: the renderer, then the same store
 * step every file goes through. Render dominates the wall clock and reports
 * nothing measurable - typst compiles or it does not - so it is weighted
 * heavily and shown as an indeterminate stage rather than a made-up
 * percentage.
 */
const RENDER_JOB = { order: ["render", "store"], weights: { render: 0.8, store: 0.2 } };

/** Finished jobs linger briefly so a slow client still sees the final event. */
const RETAIN_MS = 60_000;

/** Progress events are throttled to this, so a fast ffmpeg cannot flood a tab. */
const EMIT_INTERVAL_MS = 250;

class JobRegistry extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, object>} */
    this.jobs = new Map();
    /** @type {Map<string, Set<import("http").ServerResponse>>} */
    this.subscribers = new Map();
  }

  /**
   * Register a job. `phases` overrides the upload legs for work that has its
   * own shape - see RENDER_JOB - and everything downstream reads the job's own
   * order rather than assuming an upload.
   */
  start({ jobId, ownerId, filename, totalBytes, compress, phases, state }) {
    const order = phases?.order || UPLOAD_PHASES;
    const job = {
      jobId,
      ownerId: String(ownerId),
      fileId: null,
      filename,
      totalBytes,
      order,
      weights: phases?.weights || (compress ? PHASE_WEIGHTS : PHASE_WEIGHTS_NO_COMPRESS),
      phase: order[0],
      phaseProgress: 0,
      determinate: true,
      state: state || "uploading",
      error: null,
      child: null,
      lastEmit: 0,
      startedAt: Date.now(),
    };
    this.jobs.set(jobId, job);
    this.publish(job, { force: true });
    return job;
  }

  get(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Correct the phase weighting once the compress field has actually been read.
   *
   * A job has to exist before the first byte arrives so the bar can move, but
   * the field that says whether to compress is only parsed a moment later. The
   * job starts assuming compression and is corrected here, which shifts the
   * weights rather than making the bar jump backwards.
   */
  setCompress(jobId, compress) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.weights = compress ? PHASE_WEIGHTS : PHASE_WEIGHTS_NO_COMPRESS;
    this.publish(job, { force: true });
  }

  /**
   * Report progress within the current phase. `fraction` is 0-1, or null when
   * the tool gives us nothing to measure.
   */
  update(jobId, { phase, fraction, determinate, state, fileId }) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (phase && phase !== job.phase) {
      job.phase = phase;
      job.phaseProgress = 0;
      job.lastEmit = 0; // a phase change is always worth an immediate event
    }
    if (typeof fraction === "number") job.phaseProgress = Math.max(0, Math.min(1, fraction));
    if (typeof determinate === "boolean") job.determinate = determinate;
    if (state) job.state = state;
    if (fileId) job.fileId = String(fileId);

    this.publish(job);
  }

  finish(jobId, { fileId, state = "ready", error = null } = {}) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.state = state;
    job.error = error;
    job.phase = "done";
    job.phaseProgress = 1;
    job.determinate = true;
    if (fileId) job.fileId = String(fileId);

    this.publish(job, { force: true });
    setTimeout(() => this.jobs.delete(jobId), RETAIN_MS).unref?.();
  }

  /** Overall completion, 0-1, weighting the phases that actually apply. */
  static overall(job) {
    if (job.state === "ready" || job.state === "failed") return 1;

    const order = job.order || UPLOAD_PHASES;
    const index = order.indexOf(job.phase);
    if (index < 0) return 1;

    let done = 0;
    for (let step = 0; step < index; step += 1) done += job.weights[order[step]];
    return Math.min(1, done + job.weights[job.phase] * job.phaseProgress);
  }

  static snapshot(job) {
    return {
      jobId: job.jobId,
      fileId: job.fileId,
      filename: job.filename,
      state: job.state,
      phase: job.phase,
      phaseProgress: Number(job.phaseProgress.toFixed(4)),
      overall: Number(JobRegistry.overall(job).toFixed(4)),
      determinate: job.determinate,
      totalBytes: job.totalBytes,
      error: job.error,
    };
  }

  publish(job, { force = false } = {}) {
    const now = Date.now();
    if (!force && now - job.lastEmit < EMIT_INTERVAL_MS) return;
    job.lastEmit = now;

    const listeners = this.subscribers.get(job.ownerId);
    if (!listeners?.size) return;

    const payload = `event: progress\ndata: ${JSON.stringify(JobRegistry.snapshot(job))}\n\n`;
    for (const res of listeners) {
      // A client that has gone away must not take the upload down with it.
      try {
        res.write(payload);
      } catch {
        listeners.delete(res);
      }
    }
  }

  subscribe(ownerId, res) {
    const key = String(ownerId);
    if (!this.subscribers.has(key)) this.subscribers.set(key, new Set());
    this.subscribers.get(key).add(res);

    // Whatever is already running, so a reloaded tab catches up immediately.
    for (const job of this.jobs.values()) {
      if (job.ownerId === key) {
        res.write(`event: progress\ndata: ${JSON.stringify(JobRegistry.snapshot(job))}\n\n`);
      }
    }

    return () => {
      const listeners = this.subscribers.get(key);
      listeners?.delete(res);
      if (listeners && !listeners.size) this.subscribers.delete(key);
    };
  }

  /** Kill everything in flight - called from the server's shutdown path. */
  abortAll() {
    for (const job of this.jobs.values()) {
      try {
        job.child?.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
    for (const listeners of this.subscribers.values()) {
      for (const res of listeners) {
        try {
          res.end();
        } catch {
          /* already closed */
        }
      }
    }
    this.jobs.clear();
    this.subscribers.clear();
  }
}

const jobRegistry = new JobRegistry();

module.exports = { RENDER_JOB, jobRegistry, JobRegistry, PHASE_WEIGHTS, PHASE_WEIGHTS_NO_COMPRESS };
