"use client";

import * as React from "react";
import { useTodos } from "@/hooks/useTodos";
import { useNotifications, usePersistedIds } from "@/hooks/useProductivity";

export type Reminder = {
  id: string;
  todoId: string;
  title: string;
  kind: "overdue" | "today";
  dueDate?: string | null;
};

const DISMISSED_KEY = "modern-todo:reminders-dismissed";
const NOTIFIED_KEY = "modern-todo:reminders-notified";

/** At most this many browser notifications at once; the rest become a summary. */
const NOTIFY_BURST = 3;

const dayOf = (value?: string | null) => (value ? String(value).slice(0, 10) : "none");

/**
 * Reminders are derived, not stored: anything overdue or due today that is not
 * finished. The id carries the due day, so a todo pushed to tomorrow reminds
 * again rather than staying dismissed forever.
 */
export function useReminders() {
  const overdue = useTodos({ due: "overdue", limit: 20, sort: "dueDate", order: "asc" });
  const today = useTodos({ due: "today", limit: 20 });

  const dismissed = usePersistedIds(DISMISSED_KEY);
  const { add: markNotified } = usePersistedIds(NOTIFIED_KEY);
  const { permission, request, notify } = useNotifications();

  const all = React.useMemo<Reminder[]>(() => {
    const build = (todos: Todos | undefined, kind: Reminder["kind"]) =>
      (todos || [])
        .filter((todo) => todo.status !== "completed" && !todo.archived)
        .map((todo) => ({
          id: `${kind}:${todo._id}:${dayOf(todo.dueDate)}`,
          todoId: todo._id as string,
          title: todo.title || "Untitled",
          kind,
          dueDate: todo.dueDate,
        }));

    return [...build(overdue.data?.data, "overdue"), ...build(today.data?.data, "today")];
  }, [overdue.data, today.data]);

  const visible = React.useMemo(
    () => all.filter((reminder) => !dismissed.ids.includes(reminder.id)),
    [all, dismissed.ids]
  );

  // Fire a browser notification once per reminder, never on a repeat render.
  React.useEffect(() => {
    if (permission !== "granted" || !visible.length) return;

    const fresh = markNotified(...visible.map((reminder) => reminder.id));
    if (!fresh.length) return;

    const items = fresh
      .map((id) => visible.find((reminder) => reminder.id === id))
      .filter(Boolean) as Reminder[];

    if (items.length > NOTIFY_BURST) {
      notify(`${items.length} todos need attention`, {
        body: items
          .slice(0, NOTIFY_BURST)
          .map((item) => item.title)
          .join(", "),
        tag: "modern-todo-reminders",
      });
      return;
    }

    items.forEach((item) =>
      notify(item.kind === "overdue" ? "Overdue" : "Due today", { body: item.title, tag: item.id })
    );
  }, [visible, permission, notify, markNotified]);

  return {
    reminders: visible,
    loading: overdue.isLoading || today.isLoading,
    dismiss: (id: string) => dismissed.add(id),
    dismissAll: () => dismissed.add(...visible.map((reminder) => reminder.id)),
    permission,
    requestPermission: request,
  };
}
