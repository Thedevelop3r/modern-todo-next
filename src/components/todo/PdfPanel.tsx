"use client";

import * as React from "react";
import { Download, Eye, FileDown, RefreshCw, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  IconButton,
  Modal,
  Progress,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { formatDateTime } from "@/lib/date";
import { PHASE_LABEL } from "@/hooks/useUploadProgress";
import { useDeletePdf, useGeneratePdf, usePdfs } from "@/hooks/usePdfs";

/**
 * The rendered versions of one todo or project.
 *
 * Versions are never pruned automatically: keeping ten of them is the owner's
 * call and so is losing one, which is why the delete dialog says plainly that
 * it is permanent and does not go to Trash.
 */
export function PdfPanel({
  kind,
  id,
  title = "Document versions",
}: {
  kind: PdfSubjectKind;
  id: string;
  title?: string;
}) {
  const toast = useToast();
  const { data, isLoading } = usePdfs(kind, id);
  const { generate, generating, job, error } = useGeneratePdf(kind, id);
  const remove = useDeletePdf(kind, id);

  const [preview, setPreview] = React.useState<GeneratedPdf | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<GeneratedPdf | null>(null);

  const versions = data || [];
  const newest = versions[0];

  React.useEffect(() => {
    if (error) toast.error("That document could not be generated", { description: error });
  }, [error, toast]);

  const download = (version: GeneratedPdf) =>
    api
      .downloadPdf(kind, id, version._id, version.filename)
      .catch((problem) => toast.error("Download failed", { description: (problem as Error).message }));

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <FileDown className="h-4 w-4 text-fg-subtle" />
            {title}
            {versions.length > 0 && (
              <span className="text-xs font-normal text-fg-muted">{versions.length}</span>
            )}
          </h2>
          <Button variant="ghost" size="xs" onClick={() => generate()} disabled={generating}>
            <RefreshCw className={generating ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            {versions.length ? "Generate new version" : "Generate PDF"}
          </Button>
        </div>

        {generating && (
          <Progress
            value={Math.round((job?.overall || 0) * 100)}
            // The renderer reports nothing measurable, so the bar says so
            // rather than inventing a percentage.
            indeterminate={job ? !job.determinate : true}
            label={job ? PHASE_LABEL[job.phase] : "Rendering"}
            showLabel
          />
        )}

        {/* An honest statement about the newest version, not a guess from timestamps. */}
        {newest && (
          <p className="text-xs text-fg-muted">
            {newest.current
              ? `Up to date with the current ${kind}.`
              : `The ${kind} has changed since v${newest.version}.`}
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No versions yet. Generate one for a branded, printable record of this {kind}.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {versions.map((version) => (
              <li key={version._id} className="flex items-center gap-3 py-2">
                <Badge tone={version.current ? "primary" : "neutral"}>v{version.version}</Badge>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{version.snapshotTitle || version.filename}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {formatDateTime(version.generatedAt)} · {formatBytes(version.sizeBytes)}
                    {version.generatedBy?.name ? ` · by ${version.generatedBy.name}` : ""}
                  </p>
                </div>

                <IconButton label={`Preview version ${version.version}`} onClick={() => setPreview(version)}>
                  <Eye className="h-4 w-4" />
                </IconButton>
                <IconButton label={`Download version ${version.version}`} onClick={() => download(version)}>
                  <Download className="h-4 w-4" />
                </IconButton>
                <IconButton
                  variant="danger"
                  label={`Delete version ${version.version}`}
                  onClick={() => setPendingDelete(version)}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal
        open={Boolean(preview)}
        onOpenChange={(open) => !open && setPreview(null)}
        size="lg"
        title={preview?.filename}
        description={preview ? `Version ${preview.version} · ${formatBytes(preview.sizeBytes)}` : undefined}
        footer={
          preview ? (
            <Button variant="secondary" onClick={() => download(preview)}>
              <Download className="h-4 w-4" />
              Download
            </Button>
          ) : null
        }
      >
        {/* Same-origin and cookie-authenticated, so the frame just works; no
            token ever goes in a URL. */}
        {preview && (
          <iframe
            src={api.pdfUrl(kind, id, preview._id)}
            title={preview.filename}
            className="h-[70vh] w-full rounded-lg border border-border bg-surface"
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Delete version ${pendingDelete.version}?` : ""}
        description="This is permanent. A deleted version does not go to Trash, and its number is never handed out again."
        confirmLabel="Delete for good"
        loading={remove.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          const version = pendingDelete.version;
          remove.mutate(pendingDelete._id, {
            onSuccess: () => toast.success(`Version ${version} deleted`),
            onError: (problem) => toast.error("Delete failed", { description: (problem as Error).message }),
          });
          setPendingDelete(null);
        }}
      />
    </Card>
  );
}
