"use client";

import * as React from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, Circle, Minus, Zap } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn, PRIORITY_LABEL, STATUS_DOT, STATUS_LABEL, splitHighlight } from "@/lib/utils";
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
