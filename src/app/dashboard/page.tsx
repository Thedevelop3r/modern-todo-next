"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { CalendarDays, CheckSquare, Columns3, LayoutGrid, List, Plus, RotateCw } from "lucide-react";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  SegmentedControl,
  TodoCardSkeleton,
  useToast,
} from "@/components/ui";
import { TodoCard, type TodoCardActions } from "@/components/todo/TodoCard";
import { FilterBar } from "@/components/todo/FilterBar";
import { BulkBar, type BulkAction } from "@/components/todo/BulkBar";
import { TodoBoard } from "@/components/todo/TodoBoard";
import { TodoCalendar } from "@/components/todo/TodoCalendar";
import { Pagination } from "@/components/todo/Pagination";
import { useTodoFilters } from "@/hooks/useFilters";
import { useMe } from "@/hooks/useAuth";
import {
  useBulkTodos,
  useDeleteTodo,
  useDuplicateTodo,
  useRecoverTrash,
  useTodos,
  useUpdateTodo,
} from "@/hooks/useTodos";
import { useUiStore } from "@/store/state";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS = [
  { value: "list" as const, label: "List", icon: <List className="h-3.5 w-3.5" /> },
  { value: "grid" as const, label: "Grid", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { value: "board" as const, label: "Board", icon: <Columns3 className="h-3.5 w-3.5" /> },
  { value: "calendar" as const, label: "Calendar", icon: <CalendarDays className="h-3.5 w-3.5" /> },
];

const NEXT_STATUS: Record<TodoStatus, TodoStatus> = {
  pending: "progress",
  progress: "completed",
  completed: "pending",
};

export default function DashboardPage() {
  const toast = useToast();
  const { data: user } = useMe();
  const { filter, setFilter, reset, activeCount } = useTodoFilters(user?.preferences?.pageSize || 10);
  const { view, setView, selection, toggleSelected, selectMany, clearSelection } = useUiStore();

  // Board and calendar need the whole set, not one page of it.
  const isWholeSetView = view === "board" || view === "calendar";
  const query = isWholeSetView ? { ...filter, limit: 100, page: 1 } : filter;
  const { data, isLoading, isFetching, refetch } = useTodos(query);

  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const duplicateTodo = useDuplicateTodo();
  const recoverTrash = useRecoverTrash();
  const bulk = useBulkTodos();

  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  const todos = data?.data || [];
  const meta = data?.meta;
  const compact = user?.preferences?.density === "compact";

  // Drop ids that are no longer on screen so the bulk bar cannot act on them.
  React.useEffect(() => {
    const visible = new Set(todos.map((t) => t._id));
    const stale = selection.filter((id) => !visible.has(id));
    if (stale.length) selectMany(selection.filter((id) => visible.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const actions: TodoCardActions = {
    onToggleStatus: (todo) => {
      const status = NEXT_STATUS[todo.status || "pending"];
      updateTodo.mutate(
        { id: todo._id as string, input: { status } },
        {
          onError: (error) => toast.error("Could not update status", { description: (error as Error).message }),
          onSuccess: () => {
            if (status === "completed" && todo.recurrence !== "none") {
              toast.success("Completed", { description: "The next occurrence has been scheduled." });
            }
          },
        }
      );
    },

    onTogglePin: (todo) => {
      updateTodo.mutate({ id: todo._id as string, input: { pinned: !todo.pinned } });
    },

    onArchive: (todo) => {
      updateTodo.mutate(
        { id: todo._id as string, input: { archived: !todo.archived } },
        {
          onSuccess: () =>
            toast.success(todo.archived ? "Restored from archive" : "Archived", {
              action: {
                label: "Undo",
                onClick: () => updateTodo.mutate({ id: todo._id as string, input: { archived: todo.archived } }),
              },
            }),
        }
      );
    },

    onDuplicate: (todo) => {
      duplicateTodo.mutate(todo._id as string, {
        onSuccess: () => toast.success("Duplicated", { description: `"${todo.title}" was copied.` }),
        onError: (error) => toast.error("Could not duplicate", { description: (error as Error).message }),
      });
    },

    onDelete: (todo) => {
      deleteTodo.mutate(todo._id as string, {
        onSuccess: (trashed) =>
          toast.success("Moved to trash", {
            description: todo.title,
            action: {
              // The delete response carries the todo; recovering needs the
              // trash record, so look it up by the original id.
              label: "Undo",
              onClick: async () => {
                try {
                  const { api } = await import("@/lib/api");
                  const trash = await api.listTrash({ limit: 50 });
                  const entry = trash.data.find((t) => t.todoId === todo._id);
                  if (entry?._id) recoverTrash.mutate(entry._id);
                } catch {
                  toast.error("Could not restore the todo");
                }
              },
            },
          }),
        onError: (error) => toast.error("Could not delete", { description: (error as Error).message }),
      });
    },

    onTagClick: (tag) => {
      const current = filter.tags || [];
      setFilter({ tags: current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag] });
    },
  };

  const runBulk = ({ action, value }: BulkAction) => {
    if (action === "delete") {
      setConfirmBulkDelete(true);
      return;
    }
    bulk.mutate(
      { ids: selection, action, value },
      {
        onSuccess: (result) => {
          toast.success(`${result.modified} todo${result.modified === 1 ? "" : "s"} updated`);
          clearSelection();
        },
        onError: (error) => toast.error("Bulk action failed", { description: (error as Error).message }),
      }
    );
  };

  const confirmDelete = () => {
    bulk.mutate(
      { ids: selection, action: "delete" },
      {
        onSuccess: (result) => {
          toast.success(`${result.modified} todo${result.modified === 1 ? "" : "s"} moved to trash`);
          clearSelection();
          setConfirmBulkDelete(false);
        },
        onError: (error) => {
          toast.error("Could not delete", { description: (error as Error).message });
          setConfirmBulkDelete(false);
        },
      }
    );
  };

  const allSelected = todos.length > 0 && selection.length === todos.length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <FilterBar
        filter={filter}
        setFilter={setFilter}
        reset={reset}
        activeCount={activeCount}
        right={
          <div className="flex items-center gap-2">
            <SegmentedControl value={view} onChange={setView} options={VIEW_OPTIONS} />
            <Button variant="secondary" size="md" onClick={() => refetch()} disabled={isFetching}>
              <RotateCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              <span className="sr-only sm:not-sr-only">Refresh</span>
            </Button>
            <Link href="/dashboard/create-todo">
              <Button size="md">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New</span>
              </Button>
            </Link>
          </div>
        }
      />

      {(view === "list" || view === "grid") && todos.length > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => (allSelected ? clearSelection() : selectMany(todos.map((t) => t._id as string)))}
            className="font-medium text-primary hover:underline"
          >
            {allSelected ? "Clear selection" : "Select all on this page"}
          </button>
          {meta && <span className="text-fg-subtle">{meta.totalRecords} todos</span>}
        </div>
      )}

      {isLoading ? (
        <div className={cn("gap-3", view === "grid" ? "grid sm:grid-cols-2" : "flex flex-col")}>
          {Array.from({ length: 4 }).map((_, i) => (
            <TodoCardSkeleton key={i} />
          ))}
        </div>
      ) : todos.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-6 w-6" />}
          title={activeCount > 0 ? "No todos match these filters" : "Nothing here yet"}
          description={
            activeCount > 0
              ? "Try loosening or clearing the filters to see more."
              : "Create your first todo and it will show up right here."
          }
          action={
            activeCount > 0 ? (
              <Button variant="secondary" onClick={reset}>
                Clear filters
              </Button>
            ) : (
              <Link href="/dashboard/create-todo">
                <Button>
                  <Plus className="h-4 w-4" />
                  New todo
                </Button>
              </Link>
            )
          }
        />
      ) : view === "board" ? (
        <TodoBoard
          todos={todos}
          onStatusChange={(todo, status) =>
            updateTodo.mutate(
              { id: todo._id as string, input: { status } },
              { onError: (error) => toast.error("Could not move todo", { description: (error as Error).message }) }
            )
          }
        />
      ) : view === "calendar" ? (
        <TodoCalendar todos={todos} />
      ) : (
        <div className={cn("gap-3", view === "grid" ? "grid sm:grid-cols-2" : "flex flex-col")}>
          <AnimatePresence mode="popLayout">
            {todos.map((todo) => (
              <TodoCard
                key={todo._id}
                todo={todo}
                query={filter.q}
                actions={actions}
                compact={compact}
                selectable
                selected={selection.includes(todo._id as string)}
                onSelectedChange={() => toggleSelected(todo._id as string)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {!isWholeSetView && meta && (
        <Pagination
          currentPage={meta.page || 1}
          totalPages={meta.totalPages || 1}
          totalRecords={meta.totalRecords}
          onPageChange={(page) => setFilter({ page })}
        />
      )}

      <BulkBar count={selection.length} onClear={clearSelection} onAction={runBulk} busy={bulk.isPending} />

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Move ${selection.length} todo${selection.length === 1 ? "" : "s"} to trash?`}
        description="You can restore them from the trash afterwards."
        confirmLabel="Move to trash"
        loading={bulk.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
