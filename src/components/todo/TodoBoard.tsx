"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { cn, STATUSES, STATUS_LABEL, subtaskProgress } from "@/lib/utils";
import { DueBadge, PriorityBadge } from "./TodoBits";
import { Tag } from "@/components/ui";

const COLUMN_ACCENT: Record<TodoStatus, string> = {
  pending: "bg-status-pending",
  progress: "bg-status-progress",
  completed: "bg-status-completed",
};

function BoardCard({ todo, dragging }: { todo: Todo; dragging?: boolean }) {
  const progress = subtaskProgress(todo.subtasks);

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-3 shadow-xs",
        dragging && "rotate-2 shadow-lg ring-2 ring-primary"
      )}
    >
      <p className={cn("text-sm font-medium leading-snug text-fg", todo.status === "completed" && "line-through text-fg-muted")}>
        {todo.title}
      </p>
      {progress && (
        <p className="mt-1.5 text-xs text-fg-muted">
          {progress.done}/{progress.total} subtasks
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-1">
        <PriorityBadge priority={todo.priority} />
        <DueBadge todo={todo} />
        {todo.tags?.slice(0, 2).map((tag) => (
          <Tag key={tag} label={tag} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ todo }: { todo: Todo }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: todo._id as string });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <BoardCard todo={todo} />
    </div>
  );
}

function Column({ status, todos }: { status: TodoStatus; todos: Todos }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[240px] flex-1 flex-col rounded-xl border bg-surface-sunken/60 p-3 transition-colors",
        isOver ? "border-primary bg-primary-soft/40" : "border-border"
      )}
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={cn("h-2 w-2 rounded-full", COLUMN_ACCENT[status])} />
        <h3 className="text-sm font-semibold text-fg">{STATUS_LABEL[status]}</h3>
        <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-xs font-medium tabular-nums text-fg-muted">
          {todos.length}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {todos.map((todo) => (
          <motion.div key={todo._id} layout transition={{ type: "spring", stiffness: 320, damping: 30 }}>
            <DraggableCard todo={todo} />
          </motion.div>
        ))}
        {todos.length === 0 && (
          <p className="rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-xs text-fg-subtle">
            Drop a todo here
          </p>
        )}
      </div>
    </div>
  );
}

/** Kanban board: dragging a card between columns writes its new status. */
export function TodoBoard({ todos, onStatusChange }: { todos: Todos; onStatusChange: (todo: Todo, status: TodoStatus) => void }) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // A small distance threshold keeps clicks (open the todo) distinct from drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const columns = React.useMemo(() => {
    const grouped: Record<TodoStatus, Todos> = { pending: [], progress: [], completed: [] };
    todos.forEach((todo) => grouped[todo.status || "pending"].push(todo));
    return grouped;
  }, [todos]);

  const activeTodo = todos.find((todo) => todo._id === activeId);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const overId = event.over?.id as TodoStatus | undefined;
    if (!overId) return;

    const todo = todos.find((t) => t._id === event.active.id);
    if (!todo || todo.status === overId) return;

    onStatusChange(todo, overId);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event: DragStartEvent) => setActiveId(event.active.id as string)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-col gap-3 lg:flex-row">
        {STATUSES.map((status) => (
          <Column key={status} status={status} todos={columns[status]} />
        ))}
      </div>

      <DragOverlay>{activeTodo ? <BoardCard todo={activeTodo} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
