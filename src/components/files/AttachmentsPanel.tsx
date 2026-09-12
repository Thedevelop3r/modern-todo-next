"use client";

import * as React from "react";
import { Paperclip } from "lucide-react";
import { Button, Card, CardContent } from "@/components/ui";
import { FileGrid } from "./FileGrid";
import { FileUploader } from "./FileUploader";
import { useFiles } from "@/hooks/useFiles";
import { formatBytes } from "@/lib/utils";

/** The files attached to one todo, project or template. */
export function AttachmentsPanel({
  scopeKind,
  scopeId,
  title = "Attachments",
}: {
  scopeKind: FileScopeKind;
  scopeId: string;
  title?: string;
}) {
  const { data } = useFiles(scopeKind, scopeId);
  const [adding, setAdding] = React.useState(false);

  const files = data?.data || [];
  const total = files.reduce((sum, file) => sum + (file.storedSize || 0), 0);

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Paperclip className="h-4 w-4 text-fg-subtle" />
            {title}
            {files.length > 0 && (
              <span className="text-xs font-normal text-fg-muted">
                {files.length} · {formatBytes(total)}
              </span>
            )}
          </h2>
          <Button variant="ghost" size="xs" onClick={() => setAdding((open) => !open)}>
            {adding ? "Done" : "Add"}
          </Button>
        </div>

        {adding && <FileUploader scopeKind={scopeKind} scopeId={scopeId} label="Attach files" />}

        <FileGrid scopeKind={scopeKind} scopeId={scopeId} emptyHint="Attach an image, video, recording or PDF." />
      </CardContent>
    </Card>
  );
}
