"use client";

import * as React from "react";
import Link from "next/link";
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isSameDay,
  startOfDay,
} from "date-fns";
import { CalendarRange, ChevronRight, Plus } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  PageTransition,
  SegmentedControl,
  Skeleton,
  useToast,
} from "@/components/ui";
import { PriorityBadge } from "@/components/todo/TodoBits";
import { useTodos, useUpdateTodo } from "@/hooks/useTodos";
import { toDate } from "@/lib/date";
import { cn, STATUS_DOT } from "@/lib/utils";

const RANGES = [
  { value: "7" as const, label: "7 days" },
  { value: "14" as const, label: "14 days" },
  { value: "30" as const, label: "30 days" },
];

/** Everything with a due date, laid out day by day. */
export default function UpcomingPage() {
  const toast = useToast();
  const updateTodo = useUpdateTodo();
  const [range, setRange] = React.useState<"7" | "14" | "30">("14");

  const days = Number(range);
  // Fetch a wide window once and bucket on the client - simpler than a
  // request per day, and the volume here is small.
  const { data, isLoading } = useTodos({ limit: 100, sort: "dueDate", order: "asc" });

  const todos = (data?.data || []).filter((t) => t.dueDate && t.status !== "completed");

  const dayList = eachDayOfInterval({ start: startOfDay(new Date()), end: addDays(new Date(), days - 1) });

  const buckets = dayList.map((day) => ({
    day,
    todos: todos.filter((todo) => {
      const due = toDate(todo.dueDate);
      return due && isSameDay(due, day);
    }),
  }));

  const overdue = todos.filter((todo) => {
    const due = toDate(todo.dueDate);
    return due && differenceInCalendarDays(due, new Date()) < 0;
  });

  const later = todos.filter((todo) => {
    const due = toDate(todo.dueDate);
    return due && differenceInCalendarDays(due, new Date()) >= days;
  });

  const Row = ({ todo }: { todo: Todo }) => (
    <li className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-sunken">
      <button
        type="button"
        aria-label="Complete"
        onClick={() =>
          updateTodo.mutate(
            { id: todo._id as string, input: { status: "completed" } },
            {
              onSuccess: () => toast.success("Completed", { description: todo.title }),
              onError: (e) => toast.error("Could not complete", { description: (e as Error).message }),
            }
          )
        }
        className={cn("h-2.5 w-2.5 shrink-0 rounded-full transition-transform hover:scale-125", STATUS_DOT[todo.status || "pending"])}
      />
      <Link href={`/dashboard/todo/${todo._id}`} className="min-w-0 flex-1 truncate text-sm text-fg hover:underline">
        {todo.title}
      </Link>
      <PriorityBadge priority={todo.priority} />
    </li>
  );

  return (
    <PageTransition className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Everything with a due date, day by day.</p>
        <SegmentedControl value={range} onChange={setRange} options={RANGES} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : todos.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="h-6 w-6" />}
          title="Nothing scheduled"
          description="Give a todo a due date and it will appear on this timeline."
          action={
            <Link href="/dashboard/create-todo">
              <Button>
                <Plus className="h-4 w-4" />
                New todo
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {overdue.length > 0 && (
            <Card className="border-danger/40">
              <CardContent>
                <h3 className="mb-2 text-sm font-semibold text-danger">Overdue ({overdue.length})</h3>
                <ul className="space-y-0.5">
                  {overdue.map((todo) => (
                    <Row key={todo._id} todo={todo} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {buckets.map(({ day, todos: dayTodos }) => {
            const isToday = isSameDay(day, new Date());
            // Over a week-long range, empty days are hidden rather than filling
            // the page with blanks; inside a week they keep the calendar rhythm.
            if (!dayTodos.length && days > 7) return null;

            return (
              <Card key={day.toISOString()} className={cn(isToday && "border-primary/40")}>
                <CardContent className="py-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <h3 className={cn("text-sm font-semibold", isToday ? "text-primary" : "text-fg")}>
                      {isToday ? "Today" : format(day, "EEEE d MMM")}
                    </h3>
                    <Link
                      href={`/dashboard/create-todo?due=${format(day, "yyyy-MM-dd")}`}
                      className="rounded p-1 text-fg-subtle transition-colors hover:text-primary"
                      aria-label={`Add a todo on ${format(day, "d MMM")}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  {dayTodos.length ? (
                    <ul className="space-y-0.5">
                      {dayTodos.map((todo) => (
                        <Row key={todo._id} todo={todo} />
                      ))}
                    </ul>
                  ) : (
                    <p className="px-2 py-1 text-xs text-fg-subtle">Nothing due</p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {later.length > 0 && (
            <Card>
              <CardContent>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg">
                  Later
                  <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" />
                  <span className="font-normal text-fg-subtle">beyond {days} days</span>
                </h3>
                <ul className="space-y-0.5">
                  {later.map((todo) => (
                    <Row key={todo._id} todo={todo} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageTransition>
  );
}
