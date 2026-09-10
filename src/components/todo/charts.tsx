"use client";

import * as React from "react";
import { useTheme } from "next-themes";

/**
 * Chart palette.
 *
 * Every set below was checked with the data-viz validator against this app's
 * own surfaces (#ffffff light / #151a26 dark), not the defaults:
 *
 *  - SERIES (created vs completed): categorical slots 1-2. All checks pass in
 *    both modes; worst adjacent CVD dE 24.7 light / 26.8 dark.
 *  - PRIORITY: a single-hue *ordinal* blue ramp - priority is ordered, so it
 *    must not be a categorical rainbow. Monotone lightness, all gaps >= 0.06,
 *    light end clears the surface in both modes.
 *  - STATUS: the reserved status palette, kept because these exact colours
 *    already identify status on every badge in the app. Yellow sits below 3:1
 *    on the light surface by design, so every status chart here ships visible
 *    labels and counts (the relief rule) - colour never carries it alone.
 */
export const CHART_COLORS = {
  light: {
    series: ["#2a78d6", "#eb6834"],
    priority: ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"],
    status: { pending: "#d03b3b", progress: "#fab219", completed: "#0ca30c" },
    grid: "#e1e0d9",
    axis: "#898781",
    surface: "#ffffff",
  },
  dark: {
    series: ["#3987e5", "#d95926"],
    priority: ["#b7d3f6", "#86b6ef", "#5598e7", "#2a78d6", "#1c5cab"],
    status: { pending: "#d03b3b", progress: "#fab219", completed: "#0ca30c" },
    grid: "#2c2c2a",
    axis: "#898781",
    surface: "#151a26",
  },
};

/**
 * Reads a semantic token off <html> as a CSS colour.
 *
 * The chart *chrome* has to follow the user's theme - a grid line drawn in a
 * stale grey floats on a tinted surface - but the data colours above must not,
 * so only grid/axis/surface are resolved this way.
 */
function readToken(name: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return value ? `rgb(${value})` : "";
}

export function useChartColors() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [chrome, setChrome] = React.useState<{ grid: string; axis: string; surface: string } | null>(null);

  React.useEffect(() => setMounted(true), []);

  // next-themes swaps a class and the theme picker swaps data-theme; either one
  // changes what the tokens resolve to, so both have to force a re-read. The
  // values live in state because the DOM is not something React can track.
  React.useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setChrome({
        grid: readToken("border"),
        axis: readToken("fg-subtle"),
        surface: readToken("surface"),
      });

    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Before hydration the theme is unknown; light is the safe first paint.
  const base = mounted && resolvedTheme === "dark" ? CHART_COLORS.dark : CHART_COLORS.light;

  return React.useMemo(
    () => ({
      ...base,
      grid: chrome?.grid || base.grid,
      axis: chrome?.axis || base.axis,
      surface: chrome?.surface || base.surface,
    }),
    [base, chrome]
  );
}

/** Shared tooltip shell so every chart reads the same. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: any }>;
  label?: string;
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 shadow-lg">
      {label && <p className="mb-1.5 text-xs font-semibold text-fg">{label}</p>}
      <ul className="space-y-1">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color }} />
            <span className="text-fg-muted">{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-fg">
              {formatter ? formatter(entry.value || 0, entry.name || "") : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Legend doubling as the value table: identity is carried by the label, not by
 * colour, which is what lets the sub-3:1 status yellow ship at all.
 */
export function ChartLegend({
  items,
}: {
  items: Array<{ label: string; value: number; color: string }>;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item.color }} />
          <span className="text-fg-muted">{item.label}</span>
          <span className="ml-auto font-semibold tabular-nums text-fg">{item.value}</span>
          <span className="w-10 text-right text-xs tabular-nums text-fg-subtle">
            {total ? Math.round((item.value / total) * 100) : 0}%
          </span>
        </li>
      ))}
    </ul>
  );
}
