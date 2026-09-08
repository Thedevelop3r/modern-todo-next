"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { cn, STATUS_DOT } from "@/lib/utils";
import { toDate } from "@/lib/date";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month grid of todos placed on their due dates. Clicking a day starts a new
 * todo already dated to that day.
 */
export function TodoCalendar({ todos }: { todos: Todos }) {
  const router = useRouter();
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));

  const days = React.useMemo(() => {
    // Pad to whole weeks so the grid is always rectangular.
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const byDay = React.useMemo(() => {
    const map = new Map<string, Todos>();
    todos.forEach((todo) => {
      const date = toDate(todo.dueDate);
      if (!date) return;
      const key = format(date, "yyyy-MM-dd");
      map.set(key, [...(map.get(key) || []), todo]);
    });
    return map;
  }, [todos]);

  const undated = todos.filter((todo) => !todo.dueDate);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{format(month, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1">
          <IconButton label="Previous month" variant="outline" onClick={() => setMonth(subMonths(month, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <Button variant="secondary" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </Button>
          <IconButton label="Next month" variant="outline" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 gap-px rounded-t-xl border border-border bg-border">
            {WEEKDAYS.map((day) => (
              <div key={day} className="bg-surface-sunken px-2 py-2 text-center text-xs font-semibold text-fg-muted">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px rounded-b-xl border-x border-b border-border bg-border">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayTodos = byDay.get(key) || [];
              const outside = !isSameMonth(day, month);

              return (
                <div
                  key={key}
                  className={cn(
                    "group relative min-h-[104px] bg-surface p-1.5 transition-colors",
                    outside && "bg-surface-sunken/50"
                  )}
                >
                  <div className="mb-1 flex items-center justify-between px-0.5">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                        isToday(day) ? "bg-primary text-primary-fg" : outside ? "text-fg-subtle" : "text-fg-muted"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <button
                      type="button"
                      aria-label={`Add todo on ${format(day, "d MMM")}`}
                      onClick={() => router.push(`/dashboard/create-todo?due=${key}`)}
                      className="rounded p-0.5 text-fg-subtle opacity-0 transition-opacity hover:text-primary focus:opacity-100 group-hover:opacity-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    {dayTodos.slice(0, 3).map((todo) => (
                      <Link
                        key={todo._id}
                        href={`/dashboard/todo/${todo._id}`}
                        className="flex items-center gap-1.5 rounded bg-surface-sunken px-1.5 py-1 text-[11px] leading-tight text-fg transition-colors hover:bg-primary-soft"
                      >
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[todo.status || "pending"])} />
                        <span className="truncate">{todo.title}</span>
                      </Link>
                    ))}
                    {dayTodos.length > 3 && (
                      <p className="px-1.5 text-[10px] font-medium text-fg-subtle">+{dayTodos.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {undated.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2.5 text-sm font-semibold text-fg">No due date ({undated.length})</h3>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((todo) => (
              <Link
                key={todo._id}
                href={`/dashboard/todo/${todo._id}`}
                className="flex items-center gap-1.5 rounded-lg bg-surface-sunken px-2.5 py-1.5 text-xs text-fg transition-colors hover:bg-primary-soft"
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[todo.status || "pending"])} />
                {todo.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
