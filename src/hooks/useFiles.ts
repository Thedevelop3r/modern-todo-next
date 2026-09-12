"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PHASE_LABEL, useUploadProgress, type JobProgress } from "./useUploadProgress";

export const fileKeys = {
  all: ["files"] as const,
  list: (scopeKind?: FileScopeKind, scopeId?: string, kind?: FileKind) =>
    ["files", { scopeKind, scopeId, kind }] as const,
  storage: ["storage"] as const,
};

/** The files attached to one record, or the personal drive when no scope is given. */
export function useFiles(scopeKind?: FileScopeKind, scopeId?: string, kind?: FileKind) {
  return useQuery({
    queryKey: fileKeys.list(scopeKind, scopeId, kind),
    // A scoped list waits for its id; the drive has none to wait for.
    enabled: scopeKind ? Boolean(scopeId) || scopeKind === "user" : true,
    queryFn: () => api.files({ scopeKind, scopeId, kind, limit: 100 }),
    staleTime: 30_000,
  });
}

export function useStorage() {
  return useQuery({ queryKey: fileKeys.storage, queryFn: api.storage, staleTime: 30_000 });
}

/** Every file write moves the quota, so both caches are refreshed together. */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: fileKeys.all });
  queryClient.invalidateQueries({ queryKey: fileKeys.storage });
}

/** One file's chain of custody. Fetched only when a row is actually opened. */
export function useFileActivity(id?: string, enabled = true) {
  return useQuery({
    queryKey: [...fileKeys.all, "activity", id],
    enabled: Boolean(id) && enabled,
    queryFn: () => api.fileActivity(id as string),
    staleTime: 30_000,
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteFile(id),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useSetStorageTier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.setStorageTier,
    onSuccess: (summary) => {
      queryClient.setQueryData(fileKeys.storage, summary);
    },
  });
}

/** One file on its way to the server, as the uploader renders it. */
export type UploadItem = {
  id: string;
  /** Also the job id, so server-side progress can be matched to this row. */
  jobId: string;
  name: string;
  size: number;
  /** 0-1, byte-exact: what the browser has actually sent. */
  sent: number;
  state: "uploading" | "done" | "error";
  error?: string;
  /** Filled in from the events stream once the server starts work. */
  job?: JobProgress;
};

/**
 * What to draw for one row.
 *
 * The browser knows the upload leg exactly; the server owns the rest. Once the
 * server starts reporting, its number wins, because it accounts for
 * compression and storage as well.
 */
export function uploadDisplay(item: UploadItem) {
  if (item.state === "error") return { percent: 0, label: "Failed", indeterminate: false };
  if (item.state === "done") return { percent: 100, label: "Done", indeterminate: false };

  if (item.job && item.job.phase !== "upload") {
    return {
      percent: Math.round(item.job.overall * 100),
      label: PHASE_LABEL[item.job.phase],
      indeterminate: !item.job.determinate,
    };
  }

  // Before the server says anything, the browser's own byte count is the truth.
  const uploadWeight = 0.35;
  return {
    percent: Math.round(item.sent * uploadWeight * 100),
    label: PHASE_LABEL.upload,
    indeterminate: false,
  };
}

/**
 * Drives one or more uploads and reports progress per file.
 *
 * Progress here is the upload leg only. Server-side compression reports itself
 * separately, over the events stream, so the two never pretend to be one number.
 */
export function useUpload(scopeKind: FileScopeKind = "user", scopeId?: string) {
  const queryClient = useQueryClient();
  const [items, setItems] = React.useState<UploadItem[]>([]);
  const { jobs, forget } = useUploadProgress();

  const patch = React.useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  // Marry each row to the server's view of the same job.
  const withProgress = React.useMemo(
    () => items.map((item) => ({ ...item, job: jobs[item.jobId] })),
    [items, jobs]
  );

  const start = React.useCallback(
    async (files: File[], options: { compress?: boolean } = {}) => {
      const queued: UploadItem[] = files.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        jobId: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        sent: 0,
        state: "uploading",
      }));
      setItems((current) => [...current, ...queued]);

      // Sequential on purpose: parallel large uploads compete for the same
      // bandwidth and make every bar crawl.
      for (const [index, file] of files.entries()) {
        const item = queued[index];
        try {
          await api.uploadFile(
            file,
            { scopeKind, scopeId, compress: options.compress },
            {
              jobId: item.jobId,
              onProgress: (loaded, total) => patch(item.id, { sent: total > 0 ? loaded / total : 0 }),
            }
          );
          patch(item.id, { sent: 1, state: "done" });
        } catch (error) {
          patch(item.id, { state: "error", error: (error as Error).message });
        }
      }

      invalidate(queryClient);
    },
    [patch, queryClient, scopeId, scopeKind]
  );

  // State updaters stay pure - React invokes them twice in development, so the
  // matching `forget` is worked out from the current list instead.
  const dismiss = React.useCallback(
    (id: string) => {
      const going = items.find((item) => item.id === id);
      if (going) forget(going.jobId);
      setItems((current) => current.filter((item) => item.id !== id));
    },
    [forget, items]
  );

  const clearFinished = React.useCallback(() => {
    items.filter((item) => item.state !== "uploading").forEach((item) => forget(item.jobId));
    setItems((current) => current.filter((item) => item.state === "uploading"));
  }, [forget, items]);

  return {
    items: withProgress,
    start,
    dismiss,
    clearFinished,
    busy: items.some((item) => item.state === "uploading"),
  };
}
