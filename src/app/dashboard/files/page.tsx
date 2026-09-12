"use client";

import * as React from "react";
import { PageTransition, SegmentedControl } from "@/components/ui";
import { FileGrid, FileUploader, QuotaMeter } from "@/components/files";

const KIND_FILTERS = [
  { value: "all" as const, label: "All" },
  { value: "image" as const, label: "Images" },
  { value: "video" as const, label: "Video" },
  { value: "audio" as const, label: "Audio" },
  { value: "document" as const, label: "Documents" },
];

/** The personal drive: files that belong to the account rather than to a todo. */
export default function FilesPage() {
  const [kind, setKind] = React.useState<(typeof KIND_FILTERS)[number]["value"]>("all");

  return (
    <PageTransition className="mx-auto max-w-4xl space-y-5">
      <QuotaMeter />

      <FileUploader scopeKind="user" label="Add to your drive" />

      <div>
        <SegmentedControl value={kind} onChange={setKind} options={KIND_FILTERS} className="mb-4" />
        <FileGrid
          scopeKind="user"
          kind={kind === "all" ? undefined : kind}
          emptyHint="Anything you upload here stays with your account rather than a single todo."
        />
      </div>
    </PageTransition>
  );
}
