"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Combine, Pencil, Tags as TagsIcon, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageTransition,
  Skeleton,
  Tag,
  useToast,
} from "@/components/ui";
import { useTags } from "@/hooks/useTodos";
import { useTagActions } from "@/hooks/useLibrary";

export default function TagsPage() {
  const toast = useToast();
  const { data: tags, isLoading } = useTags();
  const { rename, merge, remove } = useTagActions();

  const [selected, setSelected] = React.useState<string[]>([]);
  const [renaming, setRenaming] = React.useState<TagCount | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [mergeTarget, setMergeTarget] = React.useState("");
  const [deleting, setDeleting] = React.useState<TagCount | null>(null);

  const toggle = (name: string) =>
    setSelected((current) =>
      current.includes(name) ? current.filter((t) => t !== name) : [...current, name]
    );

  const doRename = () => {
    if (!renaming || !renameValue.trim()) return;
    rename.mutate(
      { from: renaming.name, to: renameValue.trim() },
      {
        onSuccess: (result) => {
          toast.success(`Renamed on ${result.modified} todo${result.modified === 1 ? "" : "s"}`);
          setRenaming(null);
        },
        onError: (error) => toast.error("Could not rename", { description: (error as Error).message }),
      }
    );
  };

  const doMerge = () => {
    const target = mergeTarget.trim();
    if (!target || selected.length === 0) return;
    merge.mutate(
      { sources: selected, target },
      {
        onSuccess: (result) => {
          toast.success(`Merged into #${target}`, {
            description: `${result.modified} todo${result.modified === 1 ? "" : "s"} updated.`,
          });
          setMergeOpen(false);
          setSelected([]);
          setMergeTarget("");
        },
        onError: (error) => toast.error("Could not merge", { description: (error as Error).message }),
      }
    );
  };

  return (
    <PageTransition className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          Rename, merge or remove tags across every todo at once.
        </p>
        {selected.length > 1 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setMergeTarget(selected[0]);
              setMergeOpen(true);
            }}
          >
            <Combine className="h-4 w-4" />
            Merge {selected.length}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : !tags?.length ? (
        <EmptyState
          icon={<TagsIcon className="h-6 w-6" />}
          title="No tags yet"
          description="Add a tag to a todo and it will show up here."
          action={
            <Link href="/dashboard/create-todo">
              <Button>New todo</Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              <AnimatePresence initial={false}>
                {tags.map((tag) => (
                  <motion.li
                    key={tag.name}
                    layout
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <Checkbox
                      checked={selected.includes(tag.name)}
                      onCheckedChange={() => toggle(tag.name)}
                      label={`Select ${tag.name}`}
                    />

                    <Link href={`/dashboard?tags=${encodeURIComponent(tag.name)}`}>
                      <Tag label={tag.name} />
                    </Link>

                    <span className="text-xs tabular-nums text-fg-subtle">
                      {tag.count} todo{tag.count === 1 ? "" : "s"}
                    </span>

                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setRenaming(tag);
                          setRenameValue(tag.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Rename
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-danger hover:bg-danger-soft"
                        onClick={() => setDeleting(tag)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </CardContent>
        </Card>
      )}

      <Modal
        open={Boolean(renaming)}
        onOpenChange={(open) => !open && setRenaming(null)}
        title={`Rename #${renaming?.name}`}
        description="Every todo carrying this tag is updated."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button onClick={doRename} loading={rename.isPending} disabled={!renameValue.trim()}>
              Rename
            </Button>
          </>
        }
      >
        <Field label="New name" required htmlFor="tag-rename">
          <Input
            id="tag-rename"
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doRename()}
            maxLength={24}
          />
        </Field>
      </Modal>

      <Modal
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        title={`Merge ${selected.length} tags`}
        description="All selected tags are replaced by the target on every todo."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMergeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doMerge} loading={merge.isPending} disabled={!mergeTarget.trim()}>
              Merge
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {selected.map((name) => (
              <Tag key={name} label={name} />
            ))}
          </div>
          <Field label="Merge into" required htmlFor="tag-merge" hint="May be one of the above or a new name.">
            <Input
              id="tag-merge"
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
              maxLength={24}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove #${deleting?.name}?`}
        description={`It will be removed from ${deleting?.count} todo${deleting?.count === 1 ? "" : "s"}. The todos themselves are kept.`}
        confirmLabel="Remove tag"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting?.name as string, {
            onSuccess: (result) => {
              toast.success(`Removed from ${result.modified} todo${result.modified === 1 ? "" : "s"}`);
              setDeleting(null);
            },
            onError: (error) => {
              toast.error("Could not remove tag", { description: (error as Error).message });
              setDeleting(null);
            },
          })
        }
      />
    </PageTransition>
  );
}
