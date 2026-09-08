"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare } from "lucide-react";
import { Button, ThemeToggle } from "@/components/ui";
import { useMe } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/learn-more", label: "Features" },
];

/** Chrome for the signed-out marketing pages. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The dashboard link is only useful if the session cookie is still valid.
  const { data: user } = useMe({ enabled: true });

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-sm">
              <CheckSquare className="h-4 w-4" />
            </span>
            <span className="text-base font-semibold tracking-tight">Modern Todo</span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  pathname === href ? "text-fg" : "text-fg-muted hover:text-fg"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Link href="/dashboard">
                <Button size="sm">Open dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden sm:block">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-fg-muted sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Modern Todo · Built by @thedevelop3r</p>
          <nav className="flex items-center gap-4">
            <Link href="/learn-more" className="transition-colors hover:text-fg">
              Features
            </Link>
            <Link href="/login" className="transition-colors hover:text-fg">
              Sign in
            </Link>
            <a
              href="https://github.com/Thedevelop3r"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-fg"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
