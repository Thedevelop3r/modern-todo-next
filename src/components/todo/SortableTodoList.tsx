"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { TodoCard, type TodoCardActions } from "./TodoCard";
import { useReorderTodos } from "@/hooks/useTodos";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

function SortableRow({
  todo,
  children,
}: {
  todo: Todo;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo._id as string,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-80")}
    >
      {/* The handle is the only draggable area, so links and buttons stay clickable. */}
      <button
        type="button"
        aria-label={`Reorder ${todo.title}`}
        {...attributes}
        {...listeners}
        className="absolute -left-1 top-1/2 z-10 hidden -translate-y-1/2 cursor-grab rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:text-fg focus:opacity-100 active:cursor-grabbing group-hover/list:opacity-100 sm:block"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

/**
 * List view with manual drag-to-reorder. Reordering writes `order` for every
 * visible todo, and the list must be sorted by `order` for it to stick - the
 * dashboard switches the sort automatically when a drag happens.
 */
export function SortableTodoList({
  todos,
  actions,
  query,
  compact,
  selection,
  activeId,
  onToggleSelected,
  onReordered,
}: {
  todos: Todos;
  actions: TodoCardActions;
  query?: string;
  compact?: boolean;
  selection: string[];
  /** Row under the keyboard cursor, if any. */
  activeId?: string | null;
  onToggleSelected: (id: string) => void;
  onReordered?: () => void;
}) {
  const toast = useToast();
  const reorder = useReorderTodos();
  const [items, setItems] = React.useState(todos);

  // Keep local order in step with the server unless a drag is mid-flight.
  React.useEffect(() => setItems(todos), [todos]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((t) => t._id === active.id);
    const newIndex = items.findIndex((t) => t._id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next); // optimistic

    reorder.mutate(
      { ids: next.map((t) => t._id as string) },
      {
        onSuccess: () => onReordered?.(),
        onError: (error) => {
          setItems(todos); // roll back
          toast.error("Could not reorder", { description: (error as Error).message });
        },
      }
    );
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((t) => t._id as string)} strategy={verticalListSortingStrategy}>
        <div className="group/list flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {items.map((todo) => (
              <SortableRow key={todo._id} todo={todo}>
                <TodoCard
                  todo={todo}
                  query={query}
                  actions={actions}
                  compact={compact}
                  selectable
                  selected={selection.includes(todo._id as string)}
                  active={activeId === todo._id}
                  onSelectedChange={() => onToggleSelected(todo._id as string)}
                />
              </SortableRow>
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>
    </DndContext>
  );
}
