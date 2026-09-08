"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Checkbox, Tag } from "@/components/ui";
import { DueBadge, PriorityBadge, StatusBadge } from "./TodoBits";
import { ProjectBadge } from "./ProjectPicker";
import { useProjects } from "@/hooks/useProjects";
import { formatDate } from "@/lib/date";
import { cn, formatDuration } from "@/lib/utils";

type Column = {
  key: NonNullable<TodoFilter["sort"]> | "none";
  label: string;
  sortable: boolean;
  className?: string;
};

const COLUMNS: Column[] = [
  { key: "title", label: "Title", sortable: true, className: "min-w-[220px]" },
  { key: "none", label: "Status", sortable: false },
  { key: "priority", label: "Priority", sortable: true },
  { key: "dueDate", label: "Due", sortable: true },
  { key: "estimate", label: "Est.", sortable: true, className: "text-right" },
  { key: "none", label: "Time", sortable: false, className: "text-right" },
  { key: "none", label: "Project", sortable: false },
  { key: "none", label: "Tags", sortable: false },
  { key: "updatedAt", label: "Updated", sortable: true },
];

/**
 * Spreadsheet-style view. Sorting is delegated to the API through the same
 * filter object the rest of the dashboard uses, so it stays consistent with the
 * other views and survives a refresh.
 */
export function TodoTable({
  todos,
  filter,
  setFilter,
  selection,
  onToggleSelected,
  onSelectAll,
}: {
  todos: Todos;
  filter: TodoFilter;
  setFilter: (patch: Partial<TodoFilter>) => void;
  selection: string[];
  onToggleSelected: (id: string) => void;
  onSelectAll: () => void;
}) {
  const { data: projects } = useProjects();
  const allSelected = todos.length > 0 && selection.length === todos.length;

  const toggleSort = (key: NonNullable<TodoFilter["sort"]>) => {
    if (filter.sort === key) {
      setFilter({ order: filter.order === "asc" ? "desc" : "asc" });
    } else {
      setFilter({ sort: key, order: "asc" });
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-sunken/60">
            <th scope="col" className="w-10 px-3 py-2.5">
              <Checkbox
                checked={allSelected}
                indeterminate={selection.length > 0 && !allSelected}
                onCheckedChange={onSelectAll}
                label="Select all"
              />
            </th>

            {COLUMNS.map((column, index) => {
              const active = column.sortable && filter.sort === column.key;
              const Icon = !active ? ChevronsUpDown : filter.order === "asc" ? ArrowUp : ArrowDown;

              return (
                <th
                  key={`${column.label}-${index}`}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-fg-subtle",
                    column.className
                  )}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key as NonNullable<TodoFilter["sort"]>)}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors hover:text-fg",
                        active && "text-primary"
                      )}
                    >
                      {column.label}
                      <Icon className="h-3 w-3" />
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {todos.map((todo) => {
            const project = projects?.find((p) => p._id === todo.projectId);
            const selected = selection.includes(todo._id as string);

            return (
              <tr
                key={todo._id}
                className={cn(
                  "border-b border-border last:border-0 transition-colors hover:bg-surface-sunken/50",
                  selected && "bg-primary-soft/40"
                )}
              >
                <td className="px-3 py-2.5">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => onToggleSelected(todo._id as string)}
                    label={`Select ${todo.title}`}
                  />
                </td>

                <td className="px-3 py-2.5">
                  <Link
                    href={`/dashboard/todo/${todo._id}`}
                    className={cn(
                      "font-medium text-fg hover:text-primary hover:underline",
                      todo.status === "completed" && "text-fg-muted line-through"
                    )}
                  >
                    {todo.title}
                  </Link>
                </td>

                <td className="px-3 py-2.5">
                  <StatusBadge status={todo.status} />
                </td>
                <td className="px-3 py-2.5">
                  <PriorityBadge priority={todo.priority} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <DueBadge todo={todo} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-fg-muted">
                  {todo.estimate ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-fg-muted">
                  {todo.timeSpent ? formatDuration(todo.timeSpent) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <ProjectBadge project={project} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {todo.tags?.slice(0, 3).map((tag) => (
                      <Tag key={tag} label={tag} />
                    ))}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-fg-subtle">
                  {formatDate(todo.updatedAt, "d MMM")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
