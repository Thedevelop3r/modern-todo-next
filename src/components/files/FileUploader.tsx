"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, Paperclip, Upload, X } from "lucide-react";
import { Button, Progress, Switch, useToast } from "@/components/ui";
import { uploadDisplay, useUpload, type UploadItem } from "@/hooks/useFiles";
import { cn, formatBytes } from "@/lib/utils";

/** Everything the API is willing to store, as an `accept` attribute. */
const ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "application/pdf",
].join(",");

function UploadRow({ item, onDismiss }: { item: UploadItem; onDismiss: (id: string) => void }) {
  const { percent, label, indeterminate } = uploadDisplay(item);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-lg border border-border bg-surface-sunken px-3 py-2.5"
    >
      <div className="flex items-center gap-2.5">
        {item.state === "done" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        ) : item.state === "error" ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
        ) : (
          <Paperclip className="h-4 w-4 shrink-0 text-fg-subtle" />
        )}

        <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-fg-subtle">{formatBytes(item.size)}</span>

        {item.state !== "uploading" && (
          <button
            type="button"
            onClick={() => onDismiss(item.id)}
            aria-label={`Dismiss ${item.name}`}
            className="shrink-0 rounded p-0.5 text-fg-subtle transition-colors hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {item.state === "uploading" && (
        <div className="mt-2">
          <Progress value={percent} label={label} indeterminate={indeterminate} showLabel />
          <p className="mt-1 text-[11px] text-fg-subtle">
            {indeterminate
              ? `${label}… this step reports no percentage, and is usually over in a moment.`
              : `${label} · ${percent}%`}
          </p>
        </div>
      )}

      {item.state === "error" && <p className="mt-1.5 text-xs text-danger">{item.error}</p>}
    </motion.li>
  );
}

/**
 * Drag-and-drop or click-to-pick, with a byte-exact bar per file.
 *
 * The compression switch is the user's choice, not ours: a photographer
 * uploading a master image wants it left alone, and someone attaching a phone
 * video wants it made smaller.
 */
export function FileUploader({
  scopeKind = "user",
  scopeId,
  className,
  label = "Add files",
}: {
  scopeKind?: FileScopeKind;
  scopeId?: string;
  className?: string;
  label?: string;
}) {
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [compress, setCompress] = React.useState(true);
  const { items, start, dismiss, clearFinished, busy } = useUpload(scopeKind, scopeId);

  const accept = React.useCallback(
    (files: FileList | null) => {
      const list = Array.from(files || []);
      if (!list.length) return;
      start(list, { compress }).catch((error) =>
        toast.error("Upload failed", { description: (error as Error).message })
      );
    },
    [compress, start, toast]
  );

  return (
    <div className={className}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-primary bg-primary-soft" : "border-border bg-surface-sunken"
        )}
      >
        <Upload className={cn("mx-auto h-6 w-6", dragging ? "text-primary" : "text-fg-subtle")} />
        <p className="mt-2 text-sm font-medium text-fg">{label}</p>
        <p className="mt-0.5 text-xs text-fg-muted">
          Drop them here, or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-primary hover:underline"
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-fg-subtle">Images, video, audio and PDFs</p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => {
            accept(event.target.files);
            // Let the same file be picked again after a failure.
            event.target.value = "";
          }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2.5">
          <Switch checked={compress} onCheckedChange={setCompress} label="Compress before storing" />
          <span>
            <span className="block text-sm font-medium text-fg">Compress before storing</span>
            <span className="block text-xs text-fg-muted">Smaller files, near-identical quality.</span>
          </span>
        </label>
        {items.some((item) => item.state !== "uploading") && (
          <Button variant="ghost" size="xs" onClick={clearFinished}>
            Clear finished
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <UploadRow key={item.id} item={item} onDismiss={dismiss} />
            ))}
          </AnimatePresence>
        </ul>
      )}

      {busy && (
        <p className="mt-2 text-xs text-fg-subtle" aria-live="polite">
          Uploading - you can keep working, but do not close this tab.
        </p>
      )}
    </div>
  );
}
