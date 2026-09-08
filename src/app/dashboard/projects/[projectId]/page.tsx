"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, Clock, Gauge, ListTodo, Pencil, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageTransition,
  Progress,
  Skeleton,
  Textarea,
  TodoCardSkeleton,
  useToast,
} from "@/components/ui";
import { TodoCard, type TodoCardActions } from "@/components/todo/TodoCard";
import { ColorSwatches } from "@/components/todo/ProjectPicker";
import { useDeleteProject, useProjects, useUpdateProject } from "@/hooks/useProjects";
import { useDeleteTodo, useDuplicateTodo, useStats, useTodos, useUpdateTodo } from "@/hooks/useTodos";
import { PROJECT_COLORS, cn, formatDuration } from "@/lib/utils";

const NEXT_STATUS: Record<TodoStatus, TodoStatus> = {
  pending: "progress",
  progress: "completed",
  completed: "pending",
};

/** A single project: its todos plus roll-ups scoped to it. */
export default function ProjectPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const router = useRouter();
  const toast = useToast();

  const { data: projects, isLoading: projectsLoading } = useProjects();
  const project = projects?.find((p) => p._id === projectId);

  const { data, isLoading } = useTodos({ projectId, limit: 50 });
  const { data: stats } = useStats({ projectId });

  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const duplicateTodo = useDuplicateTodo();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: "", description: "", color: "indigo" as ProjectColor });

  React.useEffect(() => {
    if (project) {
      setDraft({
        name: project.name,
        description: project.description || "",
        color: project.color,
      });
    }
  }, [project]);

  const actions: TodoCardActions = {
    onToggleStatus: (todo) =>
      updateTodo.mutate(
        { id: todo._id as string, input: { status: NEXT_STATUS[todo.status || "pending"] } },
        { onError: (e) => toast.error("Could not update", { description: (e as Error).message }) }
      ),
    onTogglePin: (todo) => updateTodo.mutate({ id: todo._id as string, input: { pinned: !todo.pinned } }),
    onArchive: (todo) => updateTodo.mutate({ id: todo._id as string, input: { archived: !todo.archived } }),
    onDuplicate: (todo) => duplicateTodo.mutate(todo._id as string),
    onDelete: (todo) =>
      deleteTodo.mutate(todo._id as string, { onSuccess: () => toast.success("Moved to trash") }),
  };

  if (projectsLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <p className="text-sm text-fg-muted">That project no longer exists.</p>
        <Button className="mt-4" variant="secondary" onClick={() => router.push("/dashboard")}>
          Back to todos
        </Button>
      </div>
    );
  }

  const todos = data?.data || [];
  const summary = stats?.summary;
  const color = PROJECT_COLORS[project.color];

  return (
    <PageTransition className="mx-auto max-w-4xl space-y-5">
      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        className="flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        All todos
      </button>

      <Card>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className={cn("h-3 w-3 shrink-0 rounded-full", color.dot)} />
                <h1 className="truncate text-xl font-semibold tracking-tight text-fg">{project.name}</h1>
              </div>
              {project.description && <p className="mt-1.5 text-sm text-fg-muted">{project.description}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-soft"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {summary && (
            <>
              <div className="mt-5 grid gap-4 sm:grid-cols-4">
                <div>
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-fg-subtle">
                    <ListTodo className="h-3 w-3" />
                    Todos
                  </p>
                  <p className="mt-1 text-xl font-semibold text-fg">{summary.total}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-fg-subtle">Completed</p>
                  <p className="mt-1 text-xl font-semibold text-fg">{summary.completed}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-fg-subtle">
                    <Gauge className="h-3 w-3" />
                    Points
                  </p>
                  <p className="mt-1 text-xl font-semibold text-fg">
                    {summary.completedPoints}
                    <span className="text-sm font-normal text-fg-subtle">/{summary.estimatedPoints}</span>
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-fg-subtle">
                    <Clock className="h-3 w-3" />
                    Tracked
                  </p>
                  <p className="mt-1 text-xl font-semibold text-fg">{formatDuration(summary.timeSpent)}</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs text-fg-muted">
                  <span>Progress</span>
                  <span className="tabular-nums">{summary.completionRate}%</span>
                </div>
                <Progress
                  value={summary.completionRate}
                  tone={summary.completionRate === 100 ? "success" : "primary"}
                />
              </div>

              {summary.overdue > 0 && (
                <p className="mt-3 text-sm text-danger">
                  {summary.overdue} todo{summary.overdue === 1 ? " is" : "s are"} overdue in this project.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <TodoCardSkeleton key={i} />
          ))}
        </div>
      ) : todos.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="h-6 w-6" />}
          title="No todos in this project"
          description="Assign a todo to this project from its editor, or create one here."
          action={
            <Link href="/dashboard/create-todo">
              <Button>New todo</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {todos.map((todo) => (
              <TodoCard key={todo._id} todo={todo} actions={actions} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <Modal
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit project"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={updateProject.isPending}
              disabled={!draft.name.trim()}
              onClick={() =>
                updateProject.mutate(
                  { id: projectId, input: draft },
                  {
                    onSuccess: () => {
                      toast.success("Project updated");
                      setEditOpen(false);
                    },
                    onError: (e) => toast.error("Could not save", { description: (e as Error).message }),
                  }
                )
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required htmlFor="project-edit-name">
            <Input
              id="project-edit-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              maxLength={60}
            />
          </Field>
          <Field label="Description" htmlFor="project-edit-description">
            <Textarea
              id="project-edit-description"
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              maxLength={500}
            />
          </Field>
          <Field label="Colour">
            <ColorSwatches value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${project.name}"?`}
        description="Its todos are kept and simply lose their project."
        confirmLabel="Delete project"
        loading={deleteProject.isPending}
        onConfirm={() =>
          deleteProject.mutate(projectId, {
            onSuccess: (result) => {
              toast.success("Project deleted", {
                description: `${result.unassigned} todo${result.unassigned === 1 ? "" : "s"} kept.`,
              });
              router.push("/dashboard");
            },
            onError: (e) => toast.error("Could not delete", { description: (e as Error).message }),
          })
        }
      />
    </PageTransition>
  );
}
