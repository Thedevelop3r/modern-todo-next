"use client";

import * as React from "react";
import { Timer } from "lucide-react";
import { ApiError } from "@/lib/api";

/**
 * Shown when the API answers 429. Only `/user/login` and `/user/register` are
 * rate limited, so this lives on those two forms - it counts the `Retry-After`
 * down rather than leaving the user guessing when to try again.
 */
export function RateLimitNotice({ error }: { error: unknown }) {
  const limited = error instanceof ApiError && error.isRateLimited ? error : null;
  const [secondsLeft, setSecondsLeft] = React.useState(0);

  React.useEffect(() => {
    if (!limited) return;
    setSecondsLeft(Math.max(0, Math.ceil(limited.retryAfter || 0)));

    const timer = setInterval(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [limited]);

  if (!limited) return null;

  const clock =
    secondsLeft >= 60
      ? `${Math.floor(secondsLeft / 60)}m ${String(secondsLeft % 60).padStart(2, "0")}s`
      : `${secondsLeft}s`;

  return (
    <div role="status" className="rounded-lg border border-warning/40 bg-warning-soft p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-fg">
        <Timer className="h-4 w-4 shrink-0 text-warning" />
        {limited.message}
      </p>
      {secondsLeft > 0 && (
        <p className="mt-1 pl-6 text-xs text-fg-muted">
          You can try again in <span className="font-semibold tabular-nums text-fg">{clock}</span>.
        </p>
      )}
    </div>
  );
}
