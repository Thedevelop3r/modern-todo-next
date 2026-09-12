/* eslint-disable @next/next/no-img-element --
 * next/image is wrong for these: the bytes sit behind the session cookie on
 * /api/files, and the image optimizer fetches server-side with no session, so
 * every stored image would 401. A plain <img> carries the cookie itself.
 */
"use client";

import * as React from "react";
import { Download, FileAudio, FileText, FileVideo, Image as ImageIcon, Trash2 } from "lucide-react";
import { ConfirmDialog, EmptyState, IconButton, Skeleton, useToast } from "@/components/ui";
import { FilePreviewModal } from "./FilePreview";
import { useDeleteFile, useFiles } from "@/hooks/useFiles";
import { api } from "@/lib/api";
import { cn, formatBytes } from "@/lib/utils";
import { relativeTime } from "@/lib/date";

const KIND_ICON = {
  image: ImageIcon,
  video: FileVideo,
  audio: FileAudio,
  document: FileText,
  pdf: FileText,
} as const;

function Thumbnail({ file }: { file: StoredFile }) {
  const Icon = KIND_ICON[file.kind] || FileText;

  if (file.kind === "image") {
    return (
      <img
        src={api.fileUrl(file._id)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-sunken">
      <Icon className="h-7 w-7 text-fg-subtle" />
    </div>
  );
}

/** The files attached to one record, or the whole personal drive. */
export function FileGrid({
  scopeKind = "user",
  scopeId,
  kind,
  emptyHint = "Nothing stored here yet.",
  className,
}: {
  scopeKind?: FileScopeKind;
  scopeId?: string;
  kind?: FileKind;
  emptyHint?: string;
  className?: string;
}) {
  const toast = useToast();
  const { data, isLoading } = useFiles(scopeKind, scopeId, kind);
  const deleteFile = useDeleteFile();

  const [preview, setPreview] = React.useState<StoredFile | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<StoredFile | null>(null);

  if (isLoading) {
    return (
      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", className)}>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="aspect-[4/3] rounded-xl" />
        ))}
      </div>
    );
  }

  const files = data?.data || [];
  if (!files.length) {
    return <EmptyState icon={<FileText className="h-5 w-5" />} title="No files" description={emptyHint} />;
  }

  return (
    <div className={className}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {files.map((file) => (
          <li
            key={file._id}
            className="group overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong"
          >
            <button
              type="button"
              onClick={() => setPreview(file)}
              className="block aspect-[4/3] w-full overflow-hidden"
              aria-label={`Preview ${file.filename}`}
            >
              <Thumbnail file={file} />
            </button>

            <div className="flex items-center gap-1 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-fg" title={file.filename}>
                  {file.filename}
                </p>
                <p className="text-[11px] text-fg-subtle">
                  {formatBytes(file.storedSize)}
                  {file.compression?.applied ? " · compressed" : ""}
                  {file.createdAt ? ` · ${relativeTime(file.createdAt)}` : ""}
                </p>
              </div>

              <IconButton
                label={`Download ${file.filename}`}
                size="xs"
                variant="ghost"
                onClick={() =>
                  api
                    .downloadFile(file._id, file.filename)
                    .catch((error) => toast.error("Download failed", { description: (error as Error).message }))
                }
              >
                <Download className="h-3.5 w-3.5" />
              </IconButton>

              <IconButton
                label={`Delete ${file.filename}`}
                size="xs"
                variant="danger"
                onClick={() => setPendingDelete(file)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>

      <FilePreviewModal file={preview} open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this file?"
        description={`${pendingDelete?.filename || ""} will be removed for good. This does not go to the trash.`}
        confirmLabel="Delete"
        loading={deleteFile.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteFile.mutate(pendingDelete._id, {
            onSuccess: (result) => {
              toast.success("File deleted", { description: `${formatBytes(result.freedBytes)} freed` });
              setPendingDelete(null);
            },
            onError: (error) => toast.error("Could not delete", { description: (error as Error).message }),
          });
        }}
      />
    </div>
  );
}
