/* eslint-disable @next/next/no-img-element --
 * next/image is wrong for these: the bytes sit behind the session cookie on
 * /api/files, and the image optimizer fetches server-side with no session, so
 * every stored image would 401. A plain <img> carries the cookie itself.
 */
"use client";

import * as React from "react";
import { Download, FileText } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/utils";

/**
 * Shows a stored file in place.
 *
 * The elements below point straight at `/api/files/:id/raw`. That works because
 * the API is on this origin and the session cookie is SameSite=Lax, so the
 * browser sends it on a subresource GET - no token ever goes in a URL. Do not
 * add `crossOrigin` to any of these: it would suppress the cookie and every
 * file would silently fail to load.
 */
export function FileViewer({ file }: { file: StoredFile }) {
  const toast = useToast();
  const source = api.fileUrl(file._id);

  // A media element reports an auth failure as "unsupported source" with no
  // status, so a broken session would otherwise look like a corrupt file.
  const explainError = React.useCallback(() => {
    api
      .me()
      .then(() => toast.error("This file could not be played", { description: file.filename }))
      .catch(() => toast.error("Your session expired", { description: "Sign in again to view this file." }));
  }, [file.filename, toast]);

  if (file.kind === "image") {
    return (
      <img
        src={source}
        alt={file.filename}
        className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain"
        onError={explainError}
      />
    );
  }

  if (file.kind === "video") {
    return (
      <video
        src={source}
        controls
        preload="metadata"
        onError={explainError}
        className="mx-auto max-h-[70vh] w-full rounded-lg bg-black"
      />
    );
  }

  if (file.kind === "audio") {
    return <audio src={source} controls onError={explainError} className="w-full" />;
  }

  if (file.mime === "application/pdf") {
    return (
      <iframe
        src={source}
        title={file.filename}
        className="h-[70vh] w-full rounded-lg border border-border bg-surface"
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <FileText className="h-10 w-10 text-fg-subtle" />
      <p className="text-sm text-fg-muted">This file type cannot be shown here.</p>
    </div>
  );
}

export function FilePreviewModal({
  file,
  open,
  onOpenChange,
}: {
  file: StoredFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={file?.filename}
      description={file ? `${formatBytes(file.storedSize)} · ${file.mime}` : undefined}
      footer={
        file ? (
          <Button
            variant="secondary"
            onClick={() =>
              api
                .downloadFile(file._id, file.filename)
                .catch((error) => toast.error("Download failed", { description: (error as Error).message }))
            }
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
        ) : null
      }
    >
      {file && <FileViewer file={file} />}
    </Modal>
  );
}
