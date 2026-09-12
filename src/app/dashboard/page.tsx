"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { CalendarDays, CheckSquare, Columns3, LayoutGrid, List, Pencil, Plus, RotateCw, Table2 } from "lucide-react";
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
import { QuickAdd } from "@/components/todo/QuickAdd";
import { SavedViewsMenu } from "@/components/todo/SavedViews";
import { BulkEditModal } from "@/components/todo/BulkEditModal";
import { SortableTodoList } from "@/components/todo/SortableTodoList";
import { TodoTable } from "@/components/todo/TodoTable";
import { QuickLook } from "@/components/todo/QuickLook";
import { OnboardingCard } from "@/components/todo/OnboardingCard";
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
import { useVariant } from "@/hooks/useVariant";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useUiStore } from "@/store/state";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS = [
  { value: "list" as const, label: "List", icon: <List className="h-3.5 w-3.5" /> },
  { value: "grid" as const, label: "Grid", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { value: "board" as const, label: "Board", icon: <Columns3 className="h-3.5 w-3.5" /> },
  { value: "calendar" as const, label: "Calendar", icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { value: "table" as const, label: "Table", icon: <Table2 className="h-3.5 w-3.5" /> },
];

const NEXT_STATUS: Record<TodoStatus, TodoStatus> = {
  pending: "progress",
  progress: "completed",
  completed: "pending",
};

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const { data: user } = useMe();
  const { filter, setFilter, reset, activeCount } = useTodoFilters(user?.preferences?.pageSize || 10);
  const { view, setView, selection, toggleSelected, selectMany, clearSelection, pushUndo } = useUiStore();
  const { lower } = useVariant(filter.projectId);

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
  const [bulkEditOpen, setBulkEditOpen] = React.useState(false);
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  // Memoised so the keyboard-navigation ids do not change identity every render.
  const todos = React.useMemo(() => data?.data || [], [data]);
  const meta = data?.meta;
  const compact = user?.preferences?.density === "compact";

  // Drop ids that are no longer on screen so the bulk bar cannot act on them.
  React.useEffect(() => {
    const visible = new Set(todos.map((t) => t._id));
    const stale = selection.filter((id) => !visible.has(id));
    if (stale.length) selectMany(selection.filter((id) => visible.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  /**
   * Deleting answers with the todo, not the trash row, so restoring means
   * finding the rows by their original ids. Shared by the toast action and the
   * undo stack.
   */
  const restoreFromTrash = React.useCallback(
    async (ids: string[]) => {
      const { api } = await import("@/lib/api");
      const trash = await api.listTrash({ limit: 100 });
      const entries = trash.data.filter((entry) => ids.includes(entry.todoId as string));
      if (!entries.length) throw new Error("Nothing left to restore");
      await Promise.all(entries.map((entry) => recoverTrash.mutateAsync(entry._id as string)));
    },
    [recoverTrash]
  );

  const actions: TodoCardActions = {
    onToggleStatus: (todo) => {
      const status = NEXT_STATUS[todo.status || "pending"];
      updateTodo.mutate(
        { id: todo._id as string, input: { status } },
        {
          onError: (error) => toast.error("Could not update status", { description: (error as Error).message }),
          onSuccess: () => {
            const previous = todo.status || "pending";
            pushUndo({
              label: `"${todo.title}" set to ${status}`,
              undo: () => updateTodo.mutate({ id: todo._id as string, input: { status: previous } }),
            });
            if (status === "completed" && todo.recurrence !== "none") {
              toast.success("Completed", { description: "The next occurrence has been scheduled." });
            }
          },
        }
      );
    },

    onTogglePin: (todo) => {
      updateTodo.mutate(
        { id: todo._id as string, input: { pinned: !todo.pinned } },
        {
          onSuccess: () =>
            pushUndo({
              label: todo.pinned ? `Unpinned "${todo.title}"` : `Pinned "${todo.title}"`,
              undo: () => updateTodo.mutate({ id: todo._id as string, input: { pinned: todo.pinned } }),
            }),
        }
      );
    },

    onArchive: (todo) => {
      updateTodo.mutate(
        { id: todo._id as string, input: { archived: !todo.archived } },
        {
          onSuccess: () => {
            const revert = () =>
              updateTodo.mutate({ id: todo._id as string, input: { archived: todo.archived } });
            pushUndo({
              label: todo.archived ? `Unarchived "${todo.title}"` : `Archived "${todo.title}"`,
              undo: revert,
            });
            toast.success(todo.archived ? "Restored from archive" : "Archived", {
              action: { label: "Undo", onClick: revert },
            });
          },
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
        onSuccess: () => {
          const restore = () => restoreFromTrash([todo._id as string]);
          pushUndo({ label: `Deleted "${todo.title}"`, undo: restore });
          toast.success("Moved to trash", {
            description: todo.title,
            action: {
              label: "Undo",
              onClick: () => restore().catch(() => toast.error("Could not restore the todo")),
            },
          });
        },
        onError: (error) => toast.error("Could not delete", { description: (error as Error).message }),
      });
    },

    onTagClick: (tag) => {
      const current = filter.tags || [];
      setFilter({ tags: current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag] });
    },
  };

  /**
   * The reverse of a bulk action. Toggle-shaped actions have a plain inverse;
   * value-shaped ones are grouped by the value each todo had before and
   * replayed one group per request, because the API takes one action at a time.
   */
  const bulkUndo = (action: string, value: unknown, before: Todos) => {
    const ids = before.map((todo) => todo._id as string);
    if (!ids.length) return null;

    const inverse: Record<string, string> = {
      pin: "unpin",
      unpin: "pin",
      archive: "unarchive",
      unarchive: "archive",
      tag: "untag",
      untag: "tag",
    };
    if (inverse[action]) return () => bulk.mutate({ ids, action: inverse[action], value });

    const previous = (todo: Todo) =>
      action === "status" ? todo.status : action === "priority" ? todo.priority : todo.projectId ?? null;
    if (!["status", "priority", "project"].includes(action)) return null;

    const groups = new Map<unknown, string[]>();
    before.forEach((todo) => {
      const key = previous(todo) ?? null;
      groups.set(key, [...(groups.get(key) || []), todo._id as string]);
    });

    return async () => {
      for (const [groupValue, groupIds] of Array.from(groups)) {
        await bulk.mutateAsync({ ids: groupIds, action, value: groupValue });
      }
    };
  };

  const runBulk = ({ action, value }: BulkAction) => {
    if (action === "delete") {
      setConfirmBulkDelete(true);
      return;
    }
    if (action === "edit") {
      setBulkEditOpen(true);
      return;
    }

    const before = todos.filter((todo) => selection.includes(todo._id as string));

    bulk.mutate(
      { ids: selection, action, value },
      {
        onSuccess: (result) => {
          const undo = bulkUndo(action, value, before);
          if (undo) {
            pushUndo({ label: `${result.modified} todo${result.modified === 1 ? "" : "s"}: ${action}`, undo });
          }
          toast.success(`${result.modified} todo${result.modified === 1 ? "" : "s"} updated`);
          clearSelection();
        },
        onError: (error) => toast.error("Bulk action failed", { description: (error as Error).message }),
      }
    );
  };

  const confirmDelete = () => {
    const deleted = [...selection];
    bulk.mutate(
      { ids: selection, action: "delete" },
      {
        onSuccess: (result) => {
          pushUndo({
            label: `Deleted ${result.modified} todo${result.modified === 1 ? "" : "s"}`,
            undo: () => restoreFromTrash(deleted),
          });
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

  // Keyboard navigation only makes sense where cards are stacked in one column.
  const navIds = React.useMemo(
    () => (view === "list" || view === "grid" ? todos.map((todo) => todo._id as string) : []),
    [todos, view]
  );

  const { activeId } = useListNavigation({
    ids: navIds,
    enabled: navIds.length > 0 && !bulkEditOpen && !confirmBulkDelete,
    previewOpen: Boolean(previewId),
    onToggleSelect: toggleSelected,
    onOpen: (id) => router.push(`/dashboard/todo/${id}`),
    onPreview: (id) => setPreviewId((current) => (current === id ? null : id)),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <QuickAdd defaultProjectId={filter.projectId} />

      <FilterBar
        filter={filter}
        setFilter={setFilter}
        reset={reset}
        activeCount={activeCount}
        right={
          <div className="flex items-center gap-2">
            <SavedViewsMenu filter={filter} activeCount={activeCount} />
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
        // No todos at all is a different problem from no todos matching a filter.
        activeCount > 0 ? (
          <EmptyState
            icon={<CheckSquare className="h-6 w-6" />}
            title={`No ${lower("todo", "many")} match these filters`}
            description="Try loosening or clearing the filters to see more."
            action={
              <Button variant="secondary" onClick={reset}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <OnboardingCard />
        )
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
      ) : view === "table" ? (
        <TodoTable
          todos={todos}
          filter={filter}
          setFilter={setFilter}
          selection={selection}
          onToggleSelected={toggleSelected}
          onSelectAll={() =>
            allSelected ? clearSelection() : selectMany(todos.map((t) => t._id as string))
          }
        />
      ) : view === "list" ? (
        <SortableTodoList
          todos={todos}
          actions={actions}
          query={filter.q}
          compact={compact}
          selection={selection}
          activeId={activeId}
          onToggleSelected={toggleSelected}
          // Manual order only shows if the list is actually sorted by it.
          onReordered={() => {
            if (filter.sort !== "order") setFilter({ sort: "order", order: "asc" });
          }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
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
                active={activeId === todo._id}
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

      <QuickLook
        todo={todos.find((todo) => todo._id === previewId)}
        open={Boolean(previewId)}
        onOpenChange={(open) => !open && setPreviewId(null)}
      />

      <BulkEditModal
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        ids={selection}
        onDone={clearSelection}
      />

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
