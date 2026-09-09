"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, RotateCw } from "lucide-react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Sits under the topbar while the connection is gone. It is a live region, so
 * a screen reader announces the state change rather than only showing it.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const fetching = useIsFetching();

  return (
    <div role="status" aria-live="polite" className="contents">
      <AnimatePresence>
        {!online && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-warning/40 bg-warning-soft"
          >
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-6">
              <CloudOff className="h-4 w-4 shrink-0 text-warning" />
              <p className="min-w-0 flex-1 text-fg">
                You appear to be offline. What is already loaded stays readable; changes will fail
                until the connection is back.
              </p>
              <button
                type="button"
                onClick={() => queryClient.refetchQueries()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-sunken"
              >
                <RotateCw className={fetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
