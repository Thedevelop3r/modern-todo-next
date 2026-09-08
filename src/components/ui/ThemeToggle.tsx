"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Theme is unknown until hydration; render a stable placeholder to avoid a
  // server/client mismatch.
  React.useEffect(() => setMounted(true), []);

  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-sunken p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            className="relative rounded-md px-2 py-1.5 text-fg-muted transition-colors hover:text-fg"
          >
            {active && (
              <motion.span
                layoutId="theme-toggle-active"
                className="absolute inset-0 rounded-md bg-surface shadow-sm"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Icon className={cn("relative h-4 w-4", active && "text-fg")} />
          </button>
        );
      })}
    </div>
  );
}
