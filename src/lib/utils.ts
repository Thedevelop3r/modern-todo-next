import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const capitalizeEachWord = (str: string) =>
  str.replace(/\w\S*/g, (w) => w.replace(/^\w/, (c) => c.toUpperCase()));

export const capitalizeFirstLetter = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const initials = (name?: string) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

/**
 * Stable colour for a tag: the same label always lands on the same swatch, so
 * tags stay recognisable across pages without storing a colour per tag.
 */
const TAG_COLORS = [
  "bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-rose-500/25",
  "bg-orange-500/15 text-orange-600 dark:text-orange-300 ring-orange-500/25",
  "bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-amber-500/25",
  "bg-lime-500/15 text-lime-700 dark:text-lime-300 ring-lime-500/25",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
  "bg-teal-500/15 text-teal-600 dark:text-teal-300 ring-teal-500/25",
  "bg-sky-500/15 text-sky-600 dark:text-sky-300 ring-sky-500/25",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 ring-indigo-500/25",
  "bg-violet-500/15 text-violet-600 dark:text-violet-300 ring-violet-500/25",
  "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300 ring-fuchsia-500/25",
];

export function tagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export const STATUS_LABEL: Record<TodoStatus, string> = {
  pending: "Pending",
  progress: "In progress",
  completed: "Completed",
};

export const STATUS_DOT: Record<TodoStatus, string> = {
  pending: "bg-status-pending",
  progress: "bg-status-progress",
  completed: "bg-status-completed",
};

export const PRIORITY_LABEL: Record<TodoPriority, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_RANK: Record<TodoPriority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

export const STATUSES: TodoStatus[] = ["pending", "progress", "completed"];
export const PRIORITIES: TodoPriority[] = ["none", "low", "medium", "high", "urgent"];

export const subtaskProgress = (subtasks?: Subtask[]) => {
  if (!subtasks || subtasks.length === 0) return null;
  const done = subtasks.filter((s) => s.done).length;
  return { done, total: subtasks.length, percent: Math.round((done / subtasks.length) * 100) };
};

/** Highlight every case-insensitive occurrence of `query` inside `text`. */
export function splitHighlight(text: string, query?: string) {
  if (!query || !query.trim()) return [{ text, match: false }];
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  return parts
    .filter((part) => part !== "")
    .map((part) => ({ text: part, match: part.toLowerCase() === query.trim().toLowerCase() }));
}

/**
 * Project swatches. Static class strings - Tailwind cannot see a class name
 * built at runtime, so these must stay spelled out.
 */
export const PROJECT_COLORS: Record<ProjectColor, { dot: string; chip: string; bar: string }> = {
  slate: { dot: "bg-slate-500", chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300", bar: "bg-slate-500" },
  red: { dot: "bg-red-500", chip: "bg-red-500/15 text-red-600 dark:text-red-300", bar: "bg-red-500" },
  orange: { dot: "bg-orange-500", chip: "bg-orange-500/15 text-orange-600 dark:text-orange-300", bar: "bg-orange-500" },
  amber: { dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300", bar: "bg-amber-500" },
  green: { dot: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", bar: "bg-emerald-500" },
  teal: { dot: "bg-teal-500", chip: "bg-teal-500/15 text-teal-600 dark:text-teal-300", bar: "bg-teal-500" },
  sky: { dot: "bg-sky-500", chip: "bg-sky-500/15 text-sky-600 dark:text-sky-300", bar: "bg-sky-500" },
  indigo: { dot: "bg-indigo-500", chip: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300", bar: "bg-indigo-500" },
  violet: { dot: "bg-violet-500", chip: "bg-violet-500/15 text-violet-600 dark:text-violet-300", bar: "bg-violet-500" },
  pink: { dot: "bg-pink-500", chip: "bg-pink-500/15 text-pink-600 dark:text-pink-300", bar: "bg-pink-500" },
};

export const PROJECT_COLOR_NAMES = Object.keys(PROJECT_COLORS) as ProjectColor[];

/** Minutes as a compact duration: 0m, 45m, 2h 05m. */
export function formatDuration(minutes?: number) {
  const total = Math.max(0, Math.round(minutes || 0));
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${hours}h`;
}

/** Live elapsed minutes for a running timer, added to what is already banked. */
export function liveMinutes(todo: Todo) {
  const banked = todo.timeSpent || 0;
  if (!todo.timerStartedAt) return banked;
  const started = new Date(todo.timerStartedAt).getTime();
  if (Number.isNaN(started)) return banked;
  return banked + Math.max(0, Math.floor((Date.now() - started) / 60000));
}
