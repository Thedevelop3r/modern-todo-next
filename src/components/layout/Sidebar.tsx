"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  BarChart3,
  CheckSquare,
  ChevronLeft,
  LogOut,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/state";
import { useLogout, useMe } from "@/hooks/useAuth";
import { useStats } from "@/hooks/useTodos";
import { Avatar, Button, Tooltip } from "@/components/ui";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

function useNavItems(): NavItem[] {
  const { data: stats } = useStats();
  return [
    { href: "/dashboard", label: "Todos", icon: CheckSquare, badge: stats?.summary.total },
    { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/dashboard/archive", label: "Archive", icon: Archive, badge: stats?.summary.archived },
    { href: "/dashboard/trash", label: "Trash", icon: Trash2, badge: stats?.summary.trashed },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];
}

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = useNavItems();

  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon, badge }) => {
        // /dashboard would otherwise match every child route.
        const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);

        return (
          <Tooltip key={href} content={collapsed ? label : null}>
            <Link
              href={href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "text-primary" : "text-fg-muted hover:bg-surface-sunken hover:text-fg",
                collapsed && "justify-center px-0"
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-primary-soft"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className="relative h-[18px] w-[18px] shrink-0" />
              {!collapsed && (
                <>
                  <span className="relative flex-1">{label}</span>
                  {badge ? (
                    <span className="relative rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-fg-muted">
                      {badge}
                    </span>
                  ) : null}
                </>
              )}
            </Link>
          </Tooltip>
        );
      })}
    </nav>
  );
}

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { data: user } = useMe();
  const logout = useLogout();

  return (
    <div className="flex h-full flex-col gap-6 p-3">
      <Link
        href="/"
        className={cn("flex items-center gap-2.5 px-2 pt-2", collapsed && "justify-center px-0")}
        onClick={onNavigate}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-sm">
          <CheckSquare className="h-4 w-4" />
        </span>
        {!collapsed && <span className="text-base font-semibold tracking-tight">Modern Todo</span>}
      </Link>

      <Link href="/dashboard/create-todo" onClick={onNavigate}>
        <Button block={!collapsed} size="sm" className={cn(collapsed && "w-full px-0")}>
          <Plus className="h-4 w-4" />
          {!collapsed && "New todo"}
        </Button>
      </Link>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <NavLinks collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      <div className={cn("border-t border-border pt-3", collapsed && "px-0")}>
        <Link
          href="/dashboard/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-surface-sunken",
            collapsed && "justify-center"
          )}
        >
          <Avatar name={user?.name} avatar={user?.avatar} size="sm" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{user?.name || "Account"}</p>
              <p className="truncate text-xs text-fg-muted">{user?.email}</p>
            </div>
          )}
        </Link>

        <Tooltip content={collapsed ? "Sign out" : null}>
          <button
            type="button"
            onClick={() => logout.mutate()}
            className={cn(
              "mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger",
              collapsed && "justify-center px-0"
            )}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && "Sign out"}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useUiStore();

  return (
    <>
      {/* Desktop rail */}
      <motion.aside
        animate={{ width: sidebarCollapsed ? 72 : 248 }}
        transition={{ type: "spring", stiffness: 300, damping: 32 }}
        className="relative hidden shrink-0 border-r border-border bg-surface md:block"
      >
        <SidebarBody collapsed={sidebarCollapsed} />
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-raised text-fg-muted shadow-sm transition-colors hover:text-fg"
        >
          <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform", sidebarCollapsed && "rotate-180")} />
        </button>
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm md:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed inset-y-0 left-0 z-50 w-[264px] border-r border-border bg-surface md:hidden"
            >
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                className="absolute right-3 top-3 rounded-lg p-1.5 text-fg-muted hover:bg-surface-sunken"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarBody collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
