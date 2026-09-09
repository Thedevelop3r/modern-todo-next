"use client";

import * as React from "react";
import { Button, Field, Input, Modal, NativeSelect, Switch, useToast } from "@/components/ui";
import { useBulkTodos } from "@/hooks/useTodos";
import { useProjects } from "@/hooks/useProjects";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from "@/lib/utils";

const UNCHANGED = "__unchanged__";

/**
 * Edits several fields across a selection in one dialog.
 *
 * The API's bulk endpoint takes one action at a time, so this applies the
 * enabled fields in sequence and reports what actually landed.
 */
export function BulkEditModal({
  open,
  onOpenChange,
  ids,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: string[];
  onDone: () => void;
}) {
  const toast = useToast();
  const bulk = useBulkTodos();
  const { data: projects } = useProjects();

  const [status, setStatus] = React.useState(UNCHANGED);
  const [priority, setPriority] = React.useState(UNCHANGED);
  const [project, setProject] = React.useState(UNCHANGED);
  const [tag, setTag] = React.useState("");
  const [pin, setPin] = React.useState(false);
  const [archive, setArchive] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Start from a blank slate whenever the dialog reopens.
  React.useEffect(() => {
    if (open) {
      setStatus(UNCHANGED);
      setPriority(UNCHANGED);
      setProject(UNCHANGED);
      setTag("");
      setPin(false);
      setArchive(false);
    }
  }, [open]);

  const operations: Array<{ action: string; value?: unknown }> = [];
  if (status !== UNCHANGED) operations.push({ action: "status", value: status });
  if (priority !== UNCHANGED) operations.push({ action: "priority", value: priority });
  if (project !== UNCHANGED) operations.push({ action: "project", value: project === "none" ? null : project });
  if (tag.trim()) operations.push({ action: "tag", value: tag.trim().toLowerCase() });
  if (pin) operations.push({ action: "pin" });
  if (archive) operations.push({ action: "archive" });

  const apply = async () => {
    if (!operations.length) return;
    setBusy(true);

    try {
      for (const operation of operations) {
        await bulk.mutateAsync({ ids, ...operation });
      }
      toast.success(`${ids.length} todo${ids.length === 1 ? "" : "s"} updated`, {
        description: `${operations.length} change${operations.length === 1 ? "" : "s"} applied.`,
      });
      onOpenChange(false);
      onDone();
    } catch (error) {
      toast.error("Bulk edit failed", { description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${ids.length} todo${ids.length === 1 ? "" : "s"}`}
      description="Only the fields you change are applied."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply} loading={busy} disabled={!operations.length}>
            {operations.length ? `Apply ${operations.length} change${operations.length === 1 ? "" : "s"}` : "Nothing to apply"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Status" htmlFor="bulk-status">
          <NativeSelect id="bulk-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value={UNCHANGED}>Leave unchanged</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Priority" htmlFor="bulk-priority">
          <NativeSelect id="bulk-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value={UNCHANGED}>Leave unchanged</option>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABEL[value]}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Project" htmlFor="bulk-project">
          <NativeSelect id="bulk-project" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value={UNCHANGED}>Leave unchanged</option>
            <option value="none">No project</option>
            {projects?.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Add a tag" htmlFor="bulk-tag" hint="Existing tags are kept.">
          <Input
            id="bulk-tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Leave blank to skip"
            maxLength={24}
          />
        </Field>

        <label className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-fg">Pin all to top</span>
          <Switch checked={pin} onCheckedChange={setPin} label="Pin all" />
        </label>

        <label className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-fg">Archive all</span>
          <Switch checked={archive} onCheckedChange={setArchive} label="Archive all" />
        </label>
      </div>
    </Modal>
  );
}
