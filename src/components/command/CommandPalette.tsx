"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  BarChart3,
  CheckSquare,
  Clock,
  FileText,
  Moon,
  Plus,
  Settings,
  Sun,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useUiStore } from "@/store/state";
import { useTodos } from "@/hooks/useTodos";
import { useVariant } from "@/hooks/useVariant";
import { useDebounced } from "@/hooks/useFilters";
import { useRecents } from "@/hooks/useProductivity";
import { STATUS_DOT } from "@/lib/utils";

/**
 * Cmd+K palette: jump to a page, run an action, or open any todo by title.
 * Todo search hits the API (debounced) so it finds items beyond the current page.
 */
export function CommandPalette() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { commandOpen, setCommandOpen } = useUiStore();
  const [search, setSearch] = React.useState("");
  const debounced = useDebounced(search, 250);

  const { data } = useTodos({ q: debounced || undefined, limit: 6, page: 1 });
  const todos = debounced ? data?.data ?? [] : [];
  const { recents } = useRecents();
  const { t } = useVariant();

  // Clear the query each time the palette closes.
  React.useEffect(() => {
    if (!commandOpen) setSearch("");
  }, [commandOpen]);

  const run = React.useCallback(
    (action: () => void) => {
      action();
      setCommandOpen(false);
    },
    [setCommandOpen]
  );

  const pages = [
    { icon: CheckSquare, label: t("todo", "many"), action: () => router.push("/dashboard") },
    { icon: BarChart3, label: "Analytics", action: () => router.push("/dashboard/analytics") },
    { icon: Archive, label: "Archive", action: () => router.push("/dashboard/archive") },
    { icon: Trash2, label: "Trash", action: () => router.push("/dashboard/trash") },
    { icon: Settings, label: "Settings", action: () => router.push("/dashboard/settings") },
  ];

  return (
    <AnimatePresence>
      {commandOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCommandOpen(false)}
            className="fixed inset-0 z-[80] bg-slate-950/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            // Horizontally centred by the inset box, not by a translate class:
            // Motion writes its own inline `transform` here and would override
            // one. See the note in ui/Modal.tsx.
            className="fixed inset-x-4 top-[15vh] z-[90] mx-auto max-w-xl"
          >
            <Command
              loop
              shouldFilter={false}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCommandOpen(false);
                }
              }}
              className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-xl"
            >
              <div className="flex items-center gap-3 border-b border-border px-4">
                <Command.Input
                  autoFocus
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search todos or jump to a page…"
                  className="h-14 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
                />
                <kbd className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                  Esc
                </kbd>
              </div>

              <Command.List className="max-h-[320px] overflow-y-auto scrollbar-thin p-2">
                <Command.Empty className="py-8 text-center text-sm text-fg-muted">
                  No results for &ldquo;{search}&rdquo;
                </Command.Empty>

                {todos.length > 0 && (
                  <Command.Group heading={t("todo", "many")} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle">
                    {todos.map((todo) => (
                      <Command.Item
                        key={todo._id}
                        value={`todo-${todo._id}`}
                        onSelect={() => run(() => router.push(`/dashboard/todo/${todo._id}`))}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-fg data-[selected=true]:bg-surface-sunken"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[todo.status || "pending"]}`} />
                        <span className="min-w-0 flex-1 truncate">{todo.title}</span>
                        <FileText className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {!debounced && recents.length > 0 && (
                  <Command.Group heading="Recently viewed" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle">
                    {recents.map((recent) => (
                      <Command.Item
                        key={recent.id}
                        value={`recent-${recent.id}`}
                        onSelect={() => run(() => router.push(`/dashboard/todo/${recent.id}`))}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-fg data-[selected=true]:bg-surface-sunken"
                      >
                        <Clock className="h-4 w-4 shrink-0 text-fg-subtle" />
                        <span className="min-w-0 flex-1 truncate">{recent.title}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle">
                  <Command.Item
                    value="new todo create"
                    onSelect={() => run(() => router.push("/dashboard/create-todo"))}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-fg data-[selected=true]:bg-surface-sunken"
                  >
                    <Plus className="h-4 w-4 text-fg-subtle" />
                    Create a new todo
                  </Command.Item>
                  <Command.Item
                    value="theme light"
                    onSelect={() => run(() => setTheme("light"))}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-fg data-[selected=true]:bg-surface-sunken"
                  >
                    <Sun className="h-4 w-4 text-fg-subtle" />
                    Switch to light theme
                  </Command.Item>
                  <Command.Item
                    value="theme dark"
                    onSelect={() => run(() => setTheme("dark"))}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-fg data-[selected=true]:bg-surface-sunken"
                  >
                    <Moon className="h-4 w-4 text-fg-subtle" />
                    Switch to dark theme
                  </Command.Item>
                </Command.Group>

                <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle">
                  {pages.map(({ icon: Icon, label, action }) => (
                    <Command.Item
                      key={label}
                      value={`goto ${label}`}
                      onSelect={() => run(action)}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-fg data-[selected=true]:bg-surface-sunken"
                    >
                      <Icon className="h-4 w-4 text-fg-subtle" />
                      {label}
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
