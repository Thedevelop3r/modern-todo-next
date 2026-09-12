"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fileKeys } from "./useFiles";
import { useUploadProgress, type JobProgress } from "./useUploadProgress";

export const pdfKeys = {
  all: ["pdfs"] as const,
  list: (kind: PdfSubjectKind, id: string) => ["pdfs", kind, id] as const,
};

/** Every version of one todo or project, newest first. */
export function usePdfs(kind: PdfSubjectKind, id: string) {
  return useQuery({
    queryKey: pdfKeys.list(kind, id),
    enabled: Boolean(id),
    queryFn: () => api.pdfs(kind, id),
    staleTime: 30_000,
  });
}

/**
 * Generate a new version.
 *
 * The POST answers 202 and the work continues on the server, so the caller
 * watches the same events stream uploads use and refreshes the list when the
 * job reports itself done. The alternative - polling the list - would either
 * be slow to notice or busy for nothing.
 */
export function useGeneratePdf(kind: PdfSubjectKind, id: string) {
  const queryClient = useQueryClient();
  const { jobs, forget } = useUploadProgress();
  const [jobId, setJobId] = React.useState<string | null>(null);

  const job: JobProgress | undefined = jobId ? jobs[jobId] : undefined;

  const mutation = useMutation({
    mutationFn: async () => {
      const id = crypto.randomUUID();
      setJobId(id);
      return api.generatePdf(kind, id, id);
    },
    onError: () => setJobId(null),
  });

  React.useEffect(() => {
    if (!job || (job.state !== "ready" && job.state !== "failed")) return;

    if (job.state === "ready") {
      queryClient.invalidateQueries({ queryKey: pdfKeys.list(kind, id) });
      // A generated PDF is a stored file, so it moves the quota too.
      queryClient.invalidateQueries({ queryKey: fileKeys.storage });
    }
    // Held one tick so the row can show its final state, then released.
    const timer = setTimeout(() => {
      forget(job.jobId);
      setJobId(null);
    }, 1200);
    return () => clearTimeout(timer);
  }, [job, queryClient, forget, kind, id]);

  return {
    generate: mutation.mutate,
    /** True from the click until the job ends, not just until the POST returns. */
    generating: mutation.isPending || Boolean(job && job.state !== "ready" && job.state !== "failed"),
    job,
    error: job?.state === "failed" ? job.error : mutation.error ? (mutation.error as Error).message : null,
  };
}

export function useDeletePdf(kind: PdfSubjectKind, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pdfId: string) => api.deletePdf(kind, id, pdfId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pdfKeys.list(kind, id) });
      queryClient.invalidateQueries({ queryKey: fileKeys.storage });
    },
  });
}
