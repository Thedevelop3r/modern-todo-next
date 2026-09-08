"use client";

import * as React from "react";
import { AnimatePresence } from "framer-motion";
import { Archive } from "lucide-react";
import { EmptyState, TodoCardSkeleton, useToast } from "@/components/ui";
import { TodoCard, type TodoCardActions } from "@/components/todo/TodoCard";
import { Pagination } from "@/components/todo/Pagination";
import { useDeleteTodo, useDuplicateTodo, useTodos, useUpdateTodo } from "@/hooks/useTodos";

const NEXT_STATUS: Record<TodoStatus, TodoStatus> = {
  pending: "progress",
  progress: "completed",
  completed: "pending",
};

/** Archived todos: out of the main list, but not deleted. */
export default function ArchivePage() {
  const toast = useToast();
  const [page, setPage] = React.useState(1);

  const { data, isLoading } = useTodos({ archived: true, page, limit: 10 });
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const duplicateTodo = useDuplicateTodo();

  const todos = data?.data || [];
  const meta = data?.meta;

  const actions: TodoCardActions = {
    onToggleStatus: (todo) =>
      updateTodo.mutate({ id: todo._id as string, input: { status: NEXT_STATUS[todo.status || "pending"] } }),
    onTogglePin: (todo) => updateTodo.mutate({ id: todo._id as string, input: { pinned: !todo.pinned } }),
    onArchive: (todo) =>
      updateTodo.mutate(
        { id: todo._id as string, input: { archived: false } },
        { onSuccess: () => toast.success("Restored from archive", { description: todo.title }) }
      ),
    onDuplicate: (todo) =>
      duplicateTodo.mutate(todo._id as string, { onSuccess: () => toast.success("Duplicated") }),
    onDelete: (todo) =>
      deleteTodo.mutate(todo._id as string, { onSuccess: () => toast.success("Moved to trash") }),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <p className="text-sm text-fg-muted">
        Archived todos stay out of your main list but keep all their detail.
      </p>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <TodoCardSkeleton key={i} />
          ))}
        </div>
      ) : todos.length === 0 ? (
        <EmptyState
          icon={<Archive className="h-6 w-6" />}
          title="Nothing archived"
          description="Archive a todo when it is no longer active but still worth keeping."
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

      {meta && (
        <Pagination
          currentPage={meta.page || 1}
          totalPages={meta.totalPages || 1}
          totalRecords={meta.totalRecords}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
