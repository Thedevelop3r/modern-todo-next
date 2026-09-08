"use client";

import * as React from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Ban, CalendarDays, Circle, Clock, Gauge, Minus, Zap } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn, formatDuration, liveMinutes, PRIORITY_LABEL, STATUS_DOT, STATUS_LABEL, splitHighlight } from "@/lib/utils";
import { dueLabel, dueState } from "@/lib/date";

/** Status pill. Colour comes from the status tokens so both themes stay legible. */
export function StatusBadge({ status = "pending", className }: { status?: TodoStatus; className?: string }) {
  const tone = { pending: "danger", progress: "warning", completed: "success" } as const;
  return (
    <Badge tone={tone[status]} className={className}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const PRIORITY_ICON: Record<TodoPriority, React.ComponentType<{ className?: string }>> = {
  none: Minus,
  low: ArrowDown,
  medium: Circle,
  high: ArrowUp,
  urgent: Zap,
};

export function PriorityBadge({ priority = "none", className }: { priority?: TodoPriority; className?: string }) {
  if (priority === "none") return null;
  const Icon = PRIORITY_ICON[priority];
  const tone = { low: "info", medium: "warning", high: "warning", urgent: "danger" } as const;

  return (
    <Badge tone={tone[priority as keyof typeof tone]} className={className}>
      <Icon className="h-3 w-3" />
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

/** Due-date pill whose urgency colour is derived from the todo, not passed in. */
export function DueBadge({ todo, className }: { todo: Todo; className?: string }) {
  const state = dueState(todo);
  if (state === "none") return null;

  const tone = { overdue: "danger", today: "warning", soon: "info", later: "neutral", done: "neutral" } as const;
  const Icon = state === "overdue" ? AlertTriangle : CalendarDays;

  return (
    <Badge tone={tone[state]} className={className}>
      <Icon className="h-3 w-3" />
      {dueLabel(todo)}
    </Badge>
  );
}

/** Renders text with search matches highlighted. */
export function Highlight({ text, query }: { text: string; query?: string }) {
  const parts = React.useMemo(() => splitHighlight(text, query), [text, query]);
  return (
    <>
      {parts.map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded bg-warning/30 px-0.5 text-fg">
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        )
      )}
    </>
  );
}

/** Effort estimate. Zero is a real estimate and is shown; null is not. */
export function EstimateBadge({ estimate, className }: { estimate?: number | null; className?: string }) {
  if (estimate === null || estimate === undefined) return null;
  return (
    <Badge tone="neutral" className={className}>
      <Gauge className="h-3 w-3" />
      {estimate} pt{estimate === 1 ? "" : "s"}
    </Badge>
  );
}

/** Tracked time; turns danger-toned while a timer is running. */
export function TimeBadge({ todo, className }: { todo: Todo; className?: string }) {
  const running = Boolean(todo.timerStartedAt);
  const minutes = liveMinutes(todo);
  if (!minutes && !running) return null;

  return (
    <Badge tone={running ? "danger" : "neutral"} className={className}>
      <Clock className="h-3 w-3" />
      {formatDuration(minutes)}
      {running && <span className="h-1 w-1 animate-pulse rounded-full bg-danger" />}
    </Badge>
  );
}

export function BlockedBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <Badge tone="danger" className={className}>
      <Ban className="h-3 w-3" />
      Blocked
    </Badge>
  );
}

/** "Starts in 3 days" for work that has not begun. */
export function StartBadge({ todo, className }: { todo: Todo; className?: string }) {
  if (!todo.startDate || todo.status !== "pending") return null;
  const start = new Date(todo.startDate);
  if (Number.isNaN(start.getTime()) || start <= new Date()) return null;

  const days = Math.ceil((start.getTime() - Date.now()) / 86400000);
  return (
    <Badge tone="info" className={className}>
      <CalendarDays className="h-3 w-3" />
      Starts in {days}d
    </Badge>
  );
}
