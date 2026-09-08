"use client";

import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, Card, CardContent } from "@/components/ui";

/**
 * Dashboard-level boundary: keeps the sidebar and topbar alive, so a failed
 * page does not cost the user their navigation.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardContent className="space-y-4 text-center">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-fg">This page could not load</h2>
            <p className="mt-1.5 text-sm text-fg-muted">
              {error.message || "Something went wrong fetching what belongs here."}
            </p>
            {error.digest && <p className="mt-2 font-mono text-xs text-fg-subtle">reference {error.digest}</p>}
          </div>
          <Button onClick={reset}>
            <RotateCw className="h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
