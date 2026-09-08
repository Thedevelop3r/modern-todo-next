"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/utils";

/** A titled block on a settings page. Every settings card uses this shell. */
export function Section({
  icon,
  title,
  description,
  danger,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** Destructive sections are tinted so they read differently at a glance. */
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(danger && "border-danger/40")}>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              danger ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"
            )}
          >
            {icon}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-fg">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

const TABS = [
  { href: "/dashboard/settings", label: "Profile" },
  { href: "/dashboard/settings/data", label: "Data" },
  { href: "/dashboard/settings/security", label: "Security" },
];

/** Sub-navigation shared by the three settings pages. */
export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 rounded-xl border border-border bg-surface p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors",
              active ? "bg-primary-soft text-primary" : "text-fg-muted hover:bg-surface-sunken hover:text-fg"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
