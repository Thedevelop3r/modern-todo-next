"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Circle,
  Copy,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Timer,
  Trash2,
} from "lucide-react";
import {
  Checkbox,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Progress,
  Tag,
  Tooltip,
} from "@/components/ui";
import { cn, subtaskProgress } from "@/lib/utils";
import { DueBadge, Highlight, PriorityBadge, StatusBadge } from "./TodoBits";

export type TodoCardActions = {
  onToggleStatus: (todo: Todo) => void;
  onTogglePin: (todo: Todo) => void;
  onArchive: (todo: Todo) => void;
  onDuplicate: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onTagClick?: (tag: string) => void;
};

/** The status button cycles pending -> progress -> completed -> pending. */
const NEXT_STATUS: Record<TodoStatus, TodoStatus> = {
  pending: "progress",
  progress: "completed",
  completed: "pending",
};

export function TodoCard({
  todo,
  query,
  actions,
  selectable,
  selected,
  onSelectedChange,
  compact,
  className,
}: {
  todo: Todo;
  query?: string;
  actions: TodoCardActions;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (checked: boolean) => void;
  compact?: boolean;
  className?: string;
}) {
  const progress = subtaskProgress(todo.subtasks);
  const completed = todo.status === "completed";

  const StatusIcon = completed ? CheckCircle2 : todo.status === "progress" ? Timer : Circle;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "group relative rounded-xl border bg-surface transition-shadow hover:shadow-md",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
        todo.pinned && !selected && "border-l-2 border-l-primary",
        compact ? "p-3.5" : "p-4 sm:p-5",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {selectable && (
          <div className="pt-0.5">
            <Checkbox
              checked={Boolean(selected)}
              onCheckedChange={(checked) => onSelectedChange?.(checked)}
              label={`Select ${todo.title}`}
            />
          </div>
        )}

        <Tooltip content={completed ? "Mark as pending" : `Mark as ${NEXT_STATUS[todo.status || "pending"]}`}>
          <button
            type="button"
            onClick={() => actions.onToggleStatus(todo)}
            aria-label="Change status"
            className={cn(
              "mt-0.5 shrink-0 rounded-full transition-colors",
              completed ? "text-success" : todo.status === "progress" ? "text-warning" : "text-fg-subtle hover:text-primary"
            )}
          >
            <StatusIcon className="h-5 w-5" />
          </button>
        </Tooltip>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/dashboard/todo/${todo._id}`}
              className={cn(
                "font-semibold leading-snug text-fg transition-colors hover:text-primary",
                compact ? "text-sm" : "text-base",
                completed && "text-fg-muted line-through decoration-fg-subtle"
              )}
            >
              <Highlight text={todo.title || ""} query={query} />
            </Link>

            <div className="flex shrink-0 items-center gap-0.5">
              {todo.pinned && (
                <Tooltip content="Pinned">
                  <Pin className="h-3.5 w-3.5 fill-primary text-primary" />
                </Tooltip>
              )}
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Todo actions"
                    className="rounded-md p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-surface-sunken hover:text-fg focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={<Pencil className="h-4 w-4" />}>
                    <Link href={`/dashboard/edit-todo/${todo._id}`} className="flex-1">
                      Edit
                    </Link>
                  </MenuItem>
                  <MenuItem
                    icon={todo.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    onSelect={() => actions.onTogglePin(todo)}
                  >
                    {todo.pinned ? "Unpin" : "Pin to top"}
                  </MenuItem>
                  <MenuItem icon={<Copy className="h-4 w-4" />} onSelect={() => actions.onDuplicate(todo)}>
                    Duplicate
                  </MenuItem>
                  <MenuItem
                    icon={todo.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    onSelect={() => actions.onArchive(todo)}
                  >
                    {todo.archived ? "Unarchive" : "Archive"}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger icon={<Trash2 className="h-4 w-4" />} onSelect={() => actions.onDelete(todo)}>
                    Move to trash
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </div>

          {todo.description && !compact && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-fg-muted">
              <Highlight text={todo.description} query={query} />
            </p>
          )}

          {progress && (
            <div className="mt-3 flex items-center gap-2.5">
              <Progress value={progress.percent} tone={progress.percent === 100 ? "success" : "primary"} className="max-w-[160px]" />
              <span className="text-xs tabular-nums text-fg-muted">
                {progress.done}/{progress.total}
              </span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={todo.status} />
            <PriorityBadge priority={todo.priority} />
            <DueBadge todo={todo} />
            {todo.tags?.map((tag) => (
              <Tag key={tag} label={tag} onClick={actions.onTagClick ? () => actions.onTagClick?.(tag) : undefined} />
            ))}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
