"use client";

import * as React from "react";

/** One progress event, exactly as server/services/job-registry.js publishes it. */
export type JobProgress = {
  jobId: string;
  fileId: string | null;
  filename: string;
  state: "uploading" | "compressing" | "rendering" | "storing" | "ready" | "failed";
  /** "render" belongs to PDF generation, which has its own two legs. */
  phase: "upload" | "compress" | "render" | "store" | "done";
  phaseProgress: number;
  /** 0-1 across all three phases. */
  overall: number;
  /** False while a tool that reports no progress is working. */
  determinate: boolean;
  totalBytes: number;
  error: string | null;
};

/**
 * One EventSource per tab, shared by every uploader on the page.
 *
 * Deliberately not one stream per upload: HTTP/1.1 allows six connections per
 * origin, so a handful of concurrent uploads would starve the rest of the app
 * of connections. The server multiplexes by job id and we fan out here.
 */
const listeners = new Set<(event: JobProgress) => void>();
let source: EventSource | null = null;

function ensureStream() {
  if (source || typeof window === "undefined") return;

  source = new EventSource("/api/files/events", { withCredentials: true });
  source.addEventListener("progress", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as JobProgress;
      listeners.forEach((listener) => listener(payload));
    } catch {
      // A malformed frame is not worth tearing the stream down for.
    }
  });

  // EventSource reconnects on its own; dropping our handle would leak the old one.
  source.onerror = () => {
    if (source?.readyState === EventSource.CLOSED) source = null;
  };
}

function closeStreamIfIdle() {
  if (listeners.size === 0 && source) {
    source.close();
    source = null;
  }
}

/**
 * Server-side progress, keyed by job id.
 *
 * This covers the compression and storage legs. The upload leg is measured in
 * the browser, where the bytes actually are.
 */
export function useUploadProgress() {
  const [jobs, setJobs] = React.useState<Record<string, JobProgress>>({});

  React.useEffect(() => {
    const onEvent = (event: JobProgress) =>
      setJobs((current) => ({ ...current, [event.jobId]: event }));

    listeners.add(onEvent);
    ensureStream();

    return () => {
      listeners.delete(onEvent);
      closeStreamIfIdle();
    };
  }, []);

  const forget = React.useCallback((jobId: string) => {
    setJobs((current) => {
      if (!(jobId in current)) return current;
      const next = { ...current };
      delete next[jobId];
      return next;
    });
  }, []);

  return { jobs, forget };
}

/** What the bar should say while a given phase is running. */
export const PHASE_LABEL: Record<JobProgress["phase"], string> = {
  upload: "Uploading",
  compress: "Compressing",
  render: "Rendering",
  store: "Storing",
  done: "Done",
};
