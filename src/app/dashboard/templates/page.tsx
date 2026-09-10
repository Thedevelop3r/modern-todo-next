"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FileStack, Play, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  PageTransition,
  Skeleton,
  Tag,
  useToast,
} from "@/components/ui";
import { PriorityBadge } from "@/components/todo/TodoBits";
import { useDeleteTemplate, useTemplates, useUseTemplate } from "@/hooks/useLibrary";

export default function TemplatesPage() {
  const router = useRouter();
  const toast = useToast();
  const { data: templates, isLoading } = useTemplates();
  const useTemplate = useUseTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [deleting, setDeleting] = React.useState<TodoTemplate | null>(null);

  return (
    <PageTransition className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          Reusable skeletons for work you do again and again.
        </p>
        <Button size="sm" onClick={() => router.push("/dashboard/templates/new")}>
          <Plus className="h-4 w-4" />
          New template
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !templates?.length ? (
        <EmptyState
          icon={<FileStack className="h-6 w-6" />}
          title="No templates yet"
          description="Create one here, or save any existing todo as a template from its detail page."
          action={
            <Button onClick={() => router.push("/dashboard/templates/new")}>
              <Plus className="h-4 w-4" />
              New template
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {templates.map((template) => (
              <motion.div key={template._id} layout exit={{ opacity: 0, scale: 0.97 }}>
                <Card interactive className="h-full">
                  <CardContent className="flex h-full flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-fg">{template.name}</h3>
                      <button
                        type="button"
                        onClick={() => setDeleting(template)}
                        aria-label={`Delete ${template.name}`}
                        className="rounded p-1 text-fg-subtle transition-colors hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <p className="mt-1 text-sm text-fg-muted">{template.title}</p>
                    {template.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-fg-subtle">{template.description}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <PriorityBadge priority={template.priority} />
                      {template.dueInDays !== null && template.dueInDays !== undefined && (
                        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-fg-muted">
                          due in {template.dueInDays}d
                        </span>
                      )}
                      {template.subtasks?.length ? (
                        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-fg-muted">
                          {template.subtasks.length} subtasks
                        </span>
                      ) : null}
                      {template.tags?.map((tag) => (
                        <Tag key={tag} label={tag} />
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 pt-1">
                      <span className="text-xs text-fg-subtle">used {template.useCount || 0}×</span>
                      <Button
                        size="sm"
                        loading={useTemplate.isPending}
                        onClick={() =>
                          useTemplate.mutate(template._id as string, {
                            onSuccess: (todo) => {
                              toast.success("Todo created", { description: todo.title });
                              router.push(`/dashboard/todo/${todo._id}`);
                            },
                            onError: (error) =>
                              toast.error("Could not use template", { description: (error as Error).message }),
                          })
                        }
                      >
                        <Play className="h-3.5 w-3.5" />
                        Use
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="Todos already created from it are unaffected."
        confirmLabel="Delete template"
        loading={deleteTemplate.isPending}
        onConfirm={() =>
          deleteTemplate.mutate(deleting?._id as string, {
            onSuccess: () => {
              toast.success("Template deleted");
              setDeleting(null);
            },
            onError: () => setDeleting(null),
          })
        }
      />
    </PageTransition>
  );
}
