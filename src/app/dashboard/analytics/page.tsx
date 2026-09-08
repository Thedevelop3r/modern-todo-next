"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarCheck, CheckCircle2, Flame, ListTodo, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, EmptyState, Skeleton, StaggerItem, StaggerList } from "@/components/ui";
import { ChartLegend, ChartTooltip, useChartColors } from "@/components/todo/charts";
import { useStats } from "@/hooks/useTodos";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/utils";

/** Counts up to the final value - a small bit of life on an otherwise static tile. */
function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    let frame: number;
    const start = performance.now();
    const duration = 700;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // ease-out cubic
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span>
      {display}
      {suffix}
    </span>
  );
}

function StatTile({
  icon,
  label,
  value,
  suffix,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
  tone?: "default" | "danger" | "success";
}) {
  const toneClass = {
    default: "bg-primary-soft text-primary",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-fg">
            <CountUp value={value} suffix={suffix} />
          </p>
          {hint && <p className="mt-0.5 truncate text-xs text-fg-muted">{hint}</p>}
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>{icon}</span>
      </div>
    </Card>
  );
}

function ChartCard({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
        </div>
        {aside ? (
          <div className="grid gap-5 sm:grid-cols-[1fr_180px] sm:items-center">
            <div>{children}</div>
            <div>{aside}</div>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const colors = useChartColors();
  const { data: stats, isLoading } = useStats();

  if (isLoading || !stats) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const { summary, byStatus, byPriority, completionTrend, topTags } = stats;

  if (summary.total === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-6 w-6" />}
        title="No data yet"
        description="Create and complete a few todos and your insights will appear here."
        className="mx-auto max-w-2xl"
      />
    );
  }

  const trend = completionTrend.map((point) => ({
    ...point,
    label: format(parseISO(point.date), "d MMM"),
  }));

  const statusItems = byStatus.map((entry) => ({
    label: STATUS_LABEL[entry.name],
    value: entry.value,
    color: colors.status[entry.name],
  }));

  const priorityData = byPriority.map((entry, index) => ({
    name: PRIORITY_LABEL[entry.name],
    value: entry.value,
    fill: colors.priority[index],
  }));

  const axisProps = {
    stroke: colors.axis,
    tick: { fill: colors.axis, fontSize: 11 },
    tickLine: false,
    axisLine: false,
  };

  return (
    <StaggerList className="mx-auto max-w-6xl space-y-5">
      <StaggerItem>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile icon={<ListTodo className="h-4 w-4" />} label="Total todos" value={summary.total} hint={`${summary.pending} pending`} />
          <StatTile
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Completion rate"
            value={summary.completionRate}
            suffix="%"
            hint={`${summary.completed} completed`}
            tone="success"
          />
          <StatTile
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Overdue"
            value={summary.overdue}
            hint={summary.dueToday ? `${summary.dueToday} due today` : "Nothing due today"}
            tone={summary.overdue > 0 ? "danger" : "default"}
          />
          <StatTile
            icon={<Flame className="h-4 w-4" />}
            label="Current streak"
            value={summary.currentStreak}
            hint={summary.currentStreak === 1 ? "day in a row" : "days in a row"}
          />
        </div>
      </StaggerItem>

      <StaggerItem>
        <ChartCard title="Created vs completed" description="The last 30 days.">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" {...axisProps} minTickGap={24} />
                <YAxis {...axisProps} allowDecimals={false} width={40} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: colors.grid, strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="created"
                  name="Created"
                  stroke={colors.series[0]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: colors.surface }}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke={colors.series[1]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: colors.surface }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legend is always present for two or more series. */}
          <div className="mt-3 flex items-center gap-4">
            {["Created", "Completed"].map((name, index) => (
              <span key={name} className="flex items-center gap-1.5 text-xs text-fg-muted">
                <span className="h-0.5 w-4 rounded-full" style={{ background: colors.series[index] }} />
                {name}
              </span>
            ))}
          </div>
        </ChartCard>
      </StaggerItem>

      <div className="grid gap-4 lg:grid-cols-2">
        <StaggerItem>
          <ChartCard
            title="By status"
            description="Where your open work sits."
            aside={<ChartLegend items={statusItems} />}
          >
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusItems}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="58%"
                    outerRadius="86%"
                    paddingAngle={2}
                    stroke={colors.surface}
                    strokeWidth={2}
                  >
                    {statusItems.map((item) => (
                      <Cell key={item.label} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </StaggerItem>

        <StaggerItem>
          <ChartCard title="By priority" description="Ordered from none to urgent.">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" {...axisProps} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" {...axisProps} width={64} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.grid, fillOpacity: 0.25 }} />
                  <Bar dataKey="value" name="Todos" radius={[0, 4, 4, 0]} barSize={16}>
                    {priorityData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </StaggerItem>
      </div>

      {topTags.length > 0 && (
        <StaggerItem>
          <ChartCard title="Most used tags" description="Across every todo, including archived.">
            <ul className="space-y-2.5">
              {topTags.map((tag) => {
                const max = Math.max(...topTags.map((t) => t.value));
                return (
                  <li key={tag.name} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-sm text-fg-muted">#{tag.name}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: colors.series[0] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(tag.value / max) * 100}%` }}
                        transition={{ type: "spring", stiffness: 120, damping: 20 }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-fg">{tag.value}</span>
                  </li>
                );
              })}
            </ul>
          </ChartCard>
        </StaggerItem>
      )}

      <StaggerItem>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile icon={<CalendarCheck className="h-4 w-4" />} label="In progress" value={summary.progress} />
          <StatTile icon={<ListTodo className="h-4 w-4" />} label="Archived" value={summary.archived} />
          <StatTile icon={<ListTodo className="h-4 w-4" />} label="In trash" value={summary.trashed} />
        </div>
      </StaggerItem>
    </StaggerList>
  );
}
