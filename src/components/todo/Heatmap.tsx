"use client";

import * as React from "react";
import { eachWeekOfInterval, format, getDay, parseISO, startOfWeek, subDays } from "date-fns";
import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Contribution-style completion heatmap.
 *
 * SEQUENTIAL encoding: one hue, magnitude carried by lightness. Index 0 is the
 * "nothing happened" cell and is deliberately a neutral, not a pale blue, so it
 * never reads as a low value - it is drawn from the live surface token so an
 * empty day sinks into whichever theme is active. The five live steps are the same blue ramp used
 * for priority, and both sets pass the validator against this app's surfaces
 * (light end 2.11:1 on white, 2.62:1 on the dark surface).
 *
 * On dark, the ramp runs the other way - brighter means more - because a step
 * that sinks toward a dark surface would make busy days the quietest cells.
 */
const LIGHT_STEPS = ["rgb(var(--surface-sunken))", "#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];
const DARK_STEPS = ["rgb(var(--surface-sunken))", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"];

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

function stepFor(count: number, max: number) {
  if (count <= 0) return 0;
  if (max <= 1) return 3;
  // Five live steps above zero.
  const ratio = count / max;
  if (ratio <= 0.2) return 1;
  if (ratio <= 0.4) return 2;
  if (ratio <= 0.6) return 3;
  if (ratio <= 0.8) return 4;
  return 5;
}

export function CompletionHeatmap({
  trend,
  isDark,
}: {
  trend: Array<{ date: string; completed: number }>;
  isDark: boolean;
}) {
  const steps = isDark ? DARK_STEPS : LIGHT_STEPS;

  const byDate = React.useMemo(
    () => new Map(trend.map((point) => [point.date, point.completed])),
    [trend]
  );
  const max = React.useMemo(
    () => Math.max(1, ...trend.map((point) => point.completed)),
    [trend]
  );

  // Build week columns covering the whole trend window.
  const end = new Date();
  const start = subDays(end, trend.length - 1);
  const weeks = eachWeekOfInterval({ start: startOfWeek(start, { weekStartsOn: 1 }), end }, { weekStartsOn: 1 });

  const total = trend.reduce((sum, point) => sum + point.completed, 0);
  const activeDays = trend.filter((point) => point.completed > 0).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm text-fg">
          <span className="font-semibold">{total}</span> completed in the last {trend.length} days
        </p>
        <p className="text-xs text-fg-subtle">{activeDays} active days</p>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px]">
          {/* Weekday gutter */}
          <div className="mr-1 flex flex-col gap-[3px] pt-[15px]">
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={index} className="h-[11px] text-[9px] leading-[11px] text-fg-subtle">
                {label}
              </span>
            ))}
          </div>

          {weeks.map((weekStart, weekIndex) => {
            const previousMonth = weekIndex > 0 ? format(weeks[weekIndex - 1], "MMM") : null;
            const thisMonth = format(weekStart, "MMM");

            return (
              <div key={weekStart.toISOString()} className="flex flex-col gap-[3px]">
                <span className="h-3 text-[9px] leading-3 text-fg-subtle">
                  {thisMonth !== previousMonth ? thisMonth : ""}
                </span>

                {Array.from({ length: 7 }).map((_, dayIndex) => {
                  const date = new Date(weekStart);
                  date.setDate(date.getDate() + dayIndex);
                  const key = format(date, "yyyy-MM-dd");

                  // Days outside the requested window get no cell at all.
                  if (date > end || !byDate.has(key)) {
                    return <span key={dayIndex} className="h-[11px] w-[11px]" />;
                  }

                  const count = byDate.get(key) || 0;
                  const step = stepFor(count, max);

                  return (
                    <Tooltip
                      key={dayIndex}
                      content={`${count} completed · ${format(date, "d MMM yyyy")}`}
                    >
                      <span
                        className={cn(
                          "h-[11px] w-[11px] rounded-[2px] ring-1 ring-inset ring-fg/5 transition-transform hover:scale-125"
                        )}
                        style={{ backgroundColor: steps[step] }}
                      />
                    </Tooltip>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-fg-subtle">
        Less
        {steps.map((color, index) => (
          <span
            key={index}
            className="h-[11px] w-[11px] rounded-[2px] ring-1 ring-inset ring-fg/5"
            style={{ backgroundColor: color }}
          />
        ))}
        More
      </div>
    </div>
  );
}
