import {
  differenceInCalendarDays,
  endOfDay,
  endOfWeek,
  format,
  formatDistanceToNowStrict,
  isValid,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";

export const toDate = (value?: string | Date | null) => {
  if (!value) return null;
  const date = typeof value === "string" ? parseISO(value) : value;
  return isValid(date) ? date : null;
};

export const formatDate = (value?: string | Date | null, pattern = "d MMM yyyy") => {
  const date = toDate(value);
  return date ? format(date, pattern) : "";
};

export const formatDateTime = (value?: string | Date | null) => formatDate(value, "d MMM yyyy, HH:mm");

export const relativeTime = (value?: string | Date | null) => {
  const date = toDate(value);
  return date ? `${formatDistanceToNowStrict(date)} ago` : "";
};

/** For <input type="date"> round-tripping. */
export const toDateInput = (value?: string | Date | null) => formatDate(value, "yyyy-MM-dd");

export const fromDateInput = (value: string) => {
  if (!value) return null;
  const date = parseISO(value);
  return isValid(date) ? endOfDay(date).toISOString() : null;
};

export type DueState = "none" | "overdue" | "today" | "soon" | "later" | "done";

/** Classifies a todo's due date for badge colouring and smart filters. */
export function dueState(todo: Todo): DueState {
  if (todo.status === "completed") return "done";
  const date = toDate(todo.dueDate);
  if (!date) return "none";
  const days = differenceInCalendarDays(date, new Date());
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 3) return "soon";
  return "later";
}

export function dueLabel(todo: Todo) {
  const date = toDate(todo.dueDate);
  if (!date) return "";
  const days = differenceInCalendarDays(date, new Date());
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days <= 6) return `Due in ${days} days`;
  return `Due ${format(date, "d MMM")}`;
}

export const dayBounds = (date: Date) => ({ start: startOfDay(date), end: endOfDay(date) });
export const weekBounds = (date: Date) => ({
  start: startOfWeek(date, { weekStartsOn: 1 }),
  end: endOfWeek(date, { weekStartsOn: 1 }),
});
