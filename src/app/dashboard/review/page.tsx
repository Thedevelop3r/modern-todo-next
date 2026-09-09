"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { endOfWeek, format, isWithinInterval, startOfWeek, subWeeks } from "date-fns";
import { AlertTriangle, CheckCircle2, Flame, Printer, TrendingUp } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  PageTransition,
  Progress,
  SegmentedControl,
  Skeleton,
} from "@/components/ui";
import { CompletionHeatmap } from "@/components/todo/Heatmap";
import { PriorityBadge } from "@/components/todo/TodoBits";
import { useStats, useTodos } from "@/hooks/useTodos";
import { toDate } from "@/lib/date";
import { formatDuration } from "@/lib/utils";

const OFFSETS = [
  { value: "0" as const, label: "This week" },
  { value: "1" as const, label: "Last week" },
];

/**
 * A weekly retrospective: what got done, what slipped, and what is still open.
 * Prints cleanly - see the print rules in globals.css.
 */
export default function ReviewPage() {
  const { resolvedTheme } = useTheme();
  const [offset, setOffset] = React.useState<"0" | "1">("0");

  const { data: stats, isLoading: statsLoading } = useStats();
  // A wide pull so the week can be sliced client-side without extra endpoints.
  const { data: all, isLoading: todosLoading } = useTodos({ limit: 100, sort: "updatedAt", order: "desc" });

  const weekStart = startOfWeek(subWeeks(new Date(), Number(offset)), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const interval = { start: weekStart, end: weekEnd };

  const todos = all?.data || [];

  const inWeek = (value?: string | null) => {
    const date = toDate(value);
    return date ? isWithinInterval(date, interval) : false;
  };

  const completed = todos.filter((t) => t.status === "completed" && inWeek(t.completedAt));
  const created = todos.filter((t) => inWeek(t.createdAt));
  const slipped = todos.filter((t) => t.status !== "completed" && t.dueDate && toDate(t.dueDate)! < new Date());
  const open = todos.filter((t) => t.status !== "completed" && !t.archived);

  const points = completed.reduce((sum, t) => sum + (t.estimate || 0), 0);
  const minutes = completed.reduce((sum, t) => sum + (t.timeSpent || 0), 0);
  const rate = created.length ? Math.round((completed.length / created.length) * 100) : 0;

  const isLoading = statsLoading || todosLoading;

  const Section = ({
    title,
    icon,
    items,
    empty,
    tone,
  }: {
    title: string;
    icon: React.ReactNode;
    items: Todos;
    empty: string;
    tone?: string;
  }) => (
    <Card>
      <CardContent>
        <h3 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${tone || "text-fg"}`}>
          {icon}
          {title} ({items.length})
        </h3>
        {items.length === 0 ? (
          <p className="text-sm text-fg-muted">{empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {items.slice(0, 12).map((todo) => (
              <li key={todo._id} className="flex items-center gap-2.5">
                <Link
                  href={`/dashboard/todo/${todo._id}`}
                  className="min-w-0 flex-1 truncate text-sm text-fg hover:underline"
                >
                  {todo.title}
                </Link>
                <PriorityBadge priority={todo.priority} />
              </li>
            ))}
            {items.length > 12 && (
              <li className="pt-1 text-xs text-fg-subtle">and {items.length - 12} more</li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  return (
    <PageTransition className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-sm text-fg-muted">
            {format(weekStart, "d MMM")} – {format(weekEnd, "d MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl value={offset} onChange={setOffset} options={OFFSETS} />
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <>
          <Card>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-fg-subtle">Completed</p>
                  <p className="mt-1 text-2xl font-semibold text-fg">{completed.length}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-fg-subtle">Created</p>
                  <p className="mt-1 text-2xl font-semibold text-fg">{created.length}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-fg-subtle">Points done</p>
                  <p className="mt-1 text-2xl font-semibold text-fg">{points}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-fg-subtle">Time tracked</p>
                  <p className="mt-1 text-2xl font-semibold text-fg">{formatDuration(minutes)}</p>
                </div>
              </div>

              {created.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-fg-muted">
                    <span>Completed vs created this week</span>
                    <span className="tabular-nums">{rate}%</span>
                  </div>
                  <Progress value={Math.min(rate, 100)} tone={rate >= 100 ? "success" : "primary"} />
                </div>
              )}
            </CardContent>
          </Card>

          {stats && (
            <Card>
              <CardContent>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
                  <Flame className="h-4 w-4 text-warning" />
                  Momentum
                  <span className="ml-auto text-xs font-normal text-fg-muted">
                    {stats.summary.currentStreak} day streak
                  </span>
                </h3>
                <CompletionHeatmap trend={stats.completionTrend} isDark={resolvedTheme === "dark"} />
              </CardContent>
            </Card>
          )}

          <Section
            title="Finished this week"
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            items={completed}
            empty="Nothing completed yet this week."
            tone="text-success"
          />

          <Section
            title="Slipped past their due date"
            icon={<AlertTriangle className="h-4 w-4 text-danger" />}
            items={slipped}
            empty="Nothing is overdue. "
            tone="text-danger"
          />

          <Section
            title="Still open"
            icon={<TrendingUp className="h-4 w-4 text-fg-subtle" />}
            items={open}
            empty="Everything is done."
          />
        </>
      )}
    </PageTransition>
  );
}
