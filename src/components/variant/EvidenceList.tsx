"use client";

import * as React from "react";
import Link from "next/link";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardContent, EmptyState, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { formatDateTime } from "@/lib/date";
import { useFileActivity, useFiles } from "@/hooks/useFiles";

/**
 * Stored files with the trail of what happened to each.
 *
 * Nothing here is Law Enforcement specific: the files are the same attachments
 * every variant already has, and the trail is the append-only `Activity` model
 * the todo timeline has always used. The variant's contribution is asking for
 * this page - not a different way of storing anything.
 */
export function EvidenceList() {
  const { data, isLoading } = useFiles();
  const files = (data?.data || []).filter((file) => file.source !== "generated");

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!files.length) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" />}
        title="Nothing stored yet"
        description="Attach a file to a record and it appears here, with everything that happens to it."
        action={
          <Link href="/dashboard/files">
            <Button variant="secondary">Open the drive</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {files.map((file) => (
        <EvidenceRow key={file._id} file={file} />
      ))}
    </div>
  );
}

function EvidenceRow({ file }: { file: StoredFile }) {
  const [open, setOpen] = React.useState(false);
  // The trail is only fetched once someone actually asks to see it.
  const { data: trail, isLoading } = useFileActivity(file._id, open);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-fg-muted">
            <FileText className="h-4 w-4" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{file.filename}</p>
            <p className="truncate text-xs text-fg-muted">
              {file.kind} · {formatBytes(file.storedSize)}
              {file.createdAt ? ` · ${formatDateTime(file.createdAt)}` : ""}
            </p>
          </div>

          {/* The checksum is the point: a printed manifest is checked against it. */}
          {file.checksum && (
            <Badge tone="neutral" className="font-mono">
              {file.checksum.slice(0, 12)}
            </Badge>
          )}

          <Button variant="ghost" size="xs" onClick={() => setOpen((current) => !current)}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {open ? "Hide custody" : "Custody"}
          </Button>

          <Button
            variant="ghost"
            size="xs"
            onClick={() => api.downloadFile(file._id, file.filename).catch(() => undefined)}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>

        {open && (
          <div className="rounded-lg bg-surface-sunken p-3">
            {isLoading ? (
              <p className="text-xs text-fg-muted">Loading…</p>
            ) : !trail?.length ? (
              <p className="text-xs text-fg-muted">
                Nothing recorded. Files stored before custody logging existed have no trail.
              </p>
            ) : (
              <ol className="space-y-2">
                {trail.map((entry) => (
                  <li key={entry._id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-medium text-fg">{ACTION_LABEL[entry.action] || entry.action}</span>
                    <span className="text-fg-muted">{formatDateTime(entry.createdAt)}</span>
                    {typeof entry.meta?.sizeBytes === "number" && (
                      <span className="text-fg-subtle">{formatBytes(entry.meta.sizeBytes as number)}</span>
                    )}
                    {typeof entry.meta?.checksum === "string" && (
                      <span className="font-mono text-fg-subtle">{(entry.meta.checksum as string).slice(0, 12)}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const ACTION_LABEL: Record<string, string> = {
  "file.stored": "Stored",
  "file.deleted": "Deleted",
};
