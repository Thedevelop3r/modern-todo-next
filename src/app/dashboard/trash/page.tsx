"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, Trash2 } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Tag,
  TodoCardSkeleton,
  useToast,
} from "@/components/ui";
import { DueBadge, PriorityBadge, StatusBadge } from "@/components/todo/TodoBits";
import { Pagination } from "@/components/todo/Pagination";
import { useDeleteTrash, useEmptyTrash, useRecoverTrash, useTrash } from "@/hooks/useTodos";
import { relativeTime } from "@/lib/date";

export default function TrashPage() {
  const toast = useToast();
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = useTrash({ page, limit: 10 });

  const recover = useRecoverTrash();
  const remove = useDeleteTrash();
  const empty = useEmptyTrash();

  const [confirmEmpty, setConfirmEmpty] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Todo | null>(null);

  const items = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          Deleted todos are kept here until you remove them permanently.
        </p>
        {items.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setConfirmEmpty(true)}>
            <Trash2 className="h-4 w-4" />
            Empty trash
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <TodoCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="h-6 w-6" />}
          title="Trash is empty"
          description="Todos you delete will appear here, ready to restore."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {items.map((item) => (
              <motion.article
                key={item._id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                className="rounded-xl border border-border bg-surface p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-fg">{item.title}</h3>
                    {item.description && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-fg-muted">{item.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={item.status} />
                      <PriorityBadge priority={item.priority} />
                      <DueBadge todo={item} />
                      {item.tags?.map((tag) => (
                        <Tag key={tag} label={tag} />
                      ))}
                    </div>
                    <p className="mt-2.5 text-xs text-fg-subtle">Deleted {relativeTime(item.updatedAt)}</p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        recover.mutate(item._id as string, {
                          onSuccess: () => toast.success("Restored", { description: item.title }),
                          onError: (error) =>
                            toast.error("Could not restore", { description: (error as Error).message }),
                        })
                      }
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger-soft"
                      onClick={() => setConfirmDelete(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}

      {meta && (
        <Pagination
          currentPage={meta.page || 1}
          totalPages={meta.totalPages || 1}
          totalRecords={meta.totalRecords}
          onPageChange={setPage}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Delete permanently?"
        description={`"${confirmDelete?.title}" cannot be recovered after this.`}
        confirmLabel="Delete forever"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(confirmDelete?._id as string, {
            onSuccess: () => {
              toast.success("Deleted permanently");
              setConfirmDelete(null);
            },
            onError: (error) => {
              toast.error("Could not delete", { description: (error as Error).message });
              setConfirmDelete(null);
            },
          })
        }
      />

      <ConfirmDialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title="Empty the trash?"
        description="Every item in the trash will be deleted permanently."
        confirmLabel="Empty trash"
        loading={empty.isPending}
        onConfirm={() =>
          empty.mutate(undefined, {
            onSuccess: (result) => {
              toast.success(`${result.deleted} item${result.deleted === 1 ? "" : "s"} deleted`);
              setConfirmEmpty(false);
            },
            onError: (error) => {
              toast.error("Could not empty trash", { description: (error as Error).message });
              setConfirmEmpty(false);
            },
          })
        }
      />
    </div>
  );
}
