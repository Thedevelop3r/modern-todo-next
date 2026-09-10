"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Command, Keyboard, Menu, Search } from "lucide-react";
import { useUiStore } from "@/store/state";
import { IconButton, ThemeToggle, Tooltip } from "@/components/ui";
import { NotificationCentre } from "./NotificationCentre";

const TITLES: Record<string, string> = {
  "/dashboard": "Todos",
  "/dashboard/analytics": "Analytics",
  "/dashboard/archive": "Archive",
  "/dashboard/trash": "Trash",
  "/dashboard/settings": "Settings",
  "/dashboard/settings/appearance": "Appearance",
  "/dashboard/settings/data": "Data & export",
  "/dashboard/settings/security": "Security",
  "/dashboard/templates": "Templates",
  "/dashboard/templates/new": "New template",
  "/dashboard/tags": "Tags",
  "/dashboard/today": "Today",
  "/dashboard/upcoming": "Upcoming",
  "/dashboard/review": "Weekly review",
  "/dashboard/create-todo": "New todo",
};

function useTitle() {
  const pathname = usePathname();
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith("/dashboard/edit-todo")) return "Edit todo";
  if (pathname.startsWith("/dashboard/todo")) return "Todo";
  if (pathname.startsWith("/dashboard/projects")) return "Project";
  return "Dashboard";
}

export function Topbar() {
  const title = useTitle();
  const { setMobileNavOpen, setCommandOpen, setShortcutsOpen } = useUiStore();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-md sm:px-6">
      <IconButton label="Open navigation" className="md:hidden" onClick={() => setMobileNavOpen(true)}>
        <Menu className="h-5 w-5" />
      </IconButton>

      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {/* Doubles as the discoverability hint for Cmd+K. */}
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted sm:flex"
        >
          <Search className="h-4 w-4" />
          <span className="pr-6">Search…</span>
          <kbd className="flex items-center gap-0.5 rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        <IconButton label="Search" className="sm:hidden" onClick={() => setCommandOpen(true)}>
          <Search className="h-5 w-5" />
        </IconButton>

        <NotificationCentre />

        <Tooltip content="Keyboard shortcuts (?)">
          <IconButton label="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)} className="hidden sm:inline-flex">
            <Keyboard className="h-5 w-5" />
          </IconButton>
        </Tooltip>

        <ThemeToggle />
      </div>
    </header>
  );
}
