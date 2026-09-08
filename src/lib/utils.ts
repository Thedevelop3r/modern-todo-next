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
