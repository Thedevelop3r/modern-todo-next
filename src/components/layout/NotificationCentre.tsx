"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Bell, BellRing, CalendarClock, Check, Undo2, X } from "lucide-react";
import {
  Button,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  useToast,
} from "@/components/ui";
import { useReminders } from "@/hooks/useReminders";
import { useUiStore } from "@/store/state";
import { relativeTime } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * The in-app notification centre: what needs attention (derived reminders) and
 * what can still be taken back (the undo stack). Browser notifications are
 * opt-in from here - the app never asks for the permission unprompted.
 */
export function NotificationCentre() {
  const toast = useToast();
  const { reminders, dismiss, dismissAll, permission, requestPermission } = useReminders();
  const undoStack = useUiStore((s) => s.undoStack);
  const removeUndo = useUiStore((s) => s.removeUndo);
  const clearUndo = useUiStore((s) => s.clearUndo);

  const count = reminders.length;

  const runUndo = async (id: string) => {
    const entry = undoStack.find((item) => item.id === id);
    if (!entry) return;
    removeUndo(id);
    try {
      await entry.undo();
      toast.success("Undone", { description: entry.label });
    } catch (error) {
      toast.error("Could not undo", { description: (error as Error).message });
    }
  };

  const askForPermission = async () => {
    const result = await requestPermission();
    if (result === "granted") toast.success("Browser notifications enabled");
    else if (result === "denied") toast.error("Notifications blocked by the browser");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={count ? `Notifications, ${count} waiting` : "Notifications"}
          className="relative rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
        >
          {count ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold tabular-nums text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[320px] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold text-fg">Notifications</span>
          {count > 0 && (
            <button
              type="button"
              onClick={dismissAll}
              className="text-xs font-medium text-primary hover:underline"
            >
              Dismiss all
            </button>
          )}
        </div>

        <div className="max-h-[320px] overflow-y-auto scrollbar-thin p-2">
          {count === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-fg-muted">
              Nothing needs you right now.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {reminders.map((reminder) => (
                <li key={reminder.id} className="group flex items-start gap-2 rounded-lg p-2 hover:bg-surface-sunken">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0",
                      reminder.kind === "overdue" ? "text-danger" : "text-warning"
                    )}
                  >
                    {reminder.kind === "overdue" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <CalendarClock className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/todo/${reminder.todoId}`}
                      className="block truncate text-sm font-medium text-fg hover:text-primary"
                    >
                      {reminder.title}
                    </Link>
                    <p className="text-xs text-fg-subtle">
                      {reminder.kind === "overdue" ? "Overdue" : "Due today"}
                      {reminder.dueDate ? ` · ${relativeTime(reminder.dueDate)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Dismiss reminder for ${reminder.title}`}
                    onClick={() => dismiss(reminder.id)}
                    className="rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:text-fg focus:opacity-100 group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {undoStack.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <div className="flex items-center justify-between gap-2 px-2 pb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Recent actions
                </span>
                <button
                  type="button"
                  onClick={clearUndo}
                  className="text-xs font-medium text-fg-subtle hover:text-fg"
                >
                  Clear
                </button>
              </div>
              <ul className="flex flex-col gap-1">
                {undoStack.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-surface-sunken">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">{entry.label}</p>
                      <p className="text-xs text-fg-subtle">{relativeTime(new Date(entry.at))}</p>
                    </div>
                    <Tooltip content="Undo">
                      <IconButton label={`Undo ${entry.label}`} size="sm" onClick={() => runUndo(entry.id)}>
                        <Undo2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {permission === "default" && (
          <div className="border-t border-border px-3 py-2.5">
            <Button size="sm" variant="secondary" block onClick={askForPermission}>
              <Bell className="h-3.5 w-3.5" />
              Enable browser notifications
            </Button>
          </div>
        )}
        {permission === "denied" && (
          <p className="border-t border-border px-3 py-2 text-xs text-fg-subtle">
            Browser notifications are blocked in your browser settings.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
