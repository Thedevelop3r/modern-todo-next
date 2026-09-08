"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Link2, Pencil, Pin, PinOff, Repeat, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  ConfirmDialog,
  PageTransition,
  Progress,
  Spinner,
  Tag,
  useToast,
} from "@/components/ui";
import { DueBadge, PriorityBadge, StatusBadge } from "@/components/todo/TodoBits";
import { useDeleteTodo, useDuplicateTodo, useTodo, useUpdateTodo } from "@/hooks/useTodos";
import { formatDateTime, relativeTime } from "@/lib/date";
import { subtaskProgress } from "@/lib/utils";

export default function TodoDetailPage({ params }: { params: { todoId: string } }) {
  const router = useRouter();
  const toast = useToast();
  const { todoId } = params;

  const { data: todo, isLoading, isError, error } = useTodo(todoId);
  const updateTodo = useUpdateTodo();
  const duplicateTodo = useDuplicateTodo();
  const deleteTodo = useDeleteTodo();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (isError || !todo) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <p className="text-sm text-fg-muted">{(error as Error)?.message || "Todo not found"}</p>
        <Button className="mt-4" variant="secondary" onClick={() => router.push("/dashboard")}>
          Back to todos
        </Button>
      </div>
    );
  }

  const progress = subtaskProgress(todo.subtasks);

  /** Subtasks are toggled in place and the whole array is written back. */
  const toggleSubtask = (index: number, done: boolean) => {
    const subtasks = (todo.subtasks || []).map((s, i) => (i === index ? { ...s, done } : s));
    updateTodo.mutate({ id: todoId, input: { subtasks } });
  };

  return (
    <PageTransition className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateTodo.mutate({ id: todoId, input: { pinned: !todo.pinned } })}
          >
            {todo.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {todo.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              duplicateTodo.mutate(todoId, {
                onSuccess: (copy) => {
                  toast.success("Duplicated");
                  router.push(`/dashboard/todo/${copy._id}`);
                },
              })
            }
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </Button>
          <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          <Button size="sm" onClick={() => router.push(`/dashboard/edit-todo/${todoId}`)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-fg">{todo.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={todo.status} />
              <PriorityBadge priority={todo.priority} />
              <DueBadge todo={todo} />
              {todo.recurrence !== "none" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/25">
                  <Repeat className="h-3 w-3" />
                  Repeats {todo.recurrence}
                </span>
              )}
              {todo.tags?.map((tag) => (
                <Tag key={tag} label={tag} />
              ))}
            </div>
          </div>

          {todo.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">{todo.description}</p>
          )}

          {progress && (
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">Subtasks</h2>
                <span className="text-xs tabular-nums text-fg-muted">
                  {progress.done} of {progress.total} done
                </span>
              </div>
              <Progress value={progress.percent} tone={progress.percent === 100 ? "success" : "primary"} />
              <ul className="mt-3 space-y-1.5">
                {todo.subtasks?.map((subtask, index) => (
                  <li key={index} className="flex items-center gap-2.5 rounded-lg bg-surface-sunken px-3 py-2">
                    <Checkbox
                      checked={subtask.done}
                      onCheckedChange={(done) => toggleSubtask(index, done)}
                      label={subtask.title}
                    />
                    <span className={subtask.done ? "text-sm text-fg-muted line-through" : "text-sm text-fg"}>
                      {subtask.title}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Created</p>
            <p className="mt-1 text-fg">{formatDateTime(todo.createdAt)}</p>
            <p className="text-xs text-fg-subtle">{relativeTime(todo.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Last updated</p>
            <p className="mt-1 text-fg">{formatDateTime(todo.updatedAt)}</p>
            <p className="text-xs text-fg-subtle">{relativeTime(todo.updatedAt)}</p>
          </div>
          {todo.completedAt && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Completed</p>
              <p className="mt-1 text-fg">{formatDateTime(todo.completedAt)}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Reference</p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(todo._id || "");
                toast.success("Id copied to clipboard");
              }}
              className="mt-1 flex items-center gap-1.5 font-mono text-xs text-primary hover:underline"
            >
              <Link2 className="h-3 w-3" />
              {todo._id}
            </button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Move this todo to trash?"
        description="You can restore it from the trash afterwards."
        confirmLabel="Move to trash"
        loading={deleteTodo.isPending}
        onConfirm={() =>
          deleteTodo.mutate(todoId, {
            onSuccess: () => {
              toast.success("Moved to trash");
              router.push("/dashboard");
            },
            onError: (err) => toast.error("Could not delete", { description: (err as Error).message }),
          })
        }
      />
    </PageTransition>
  );
}
