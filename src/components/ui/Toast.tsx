"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
  action?: { label: string; onClick: () => void };
};

type ToastInput = Partial<Omit<Toast, "id">> & { title: string };

type ToastContextValue = {
  toast: (input: ToastInput) => string;
  success: (title: string, input?: Omit<ToastInput, "title">) => string;
  error: (title: string, input?: Omit<ToastInput, "title">) => string;
  info: (title: string, input?: Omit<ToastInput, "title">) => string;
  dismiss: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TONE_ICON: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-success" />,
  error: <XCircle className="h-5 w-5 text-danger" />,
  warning: <AlertTriangle className="h-5 w-5 text-warning" />,
  info: <Info className="h-5 w-5 text-info" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback(
    (input: ToastInput) => {
      const id = Math.random().toString(36).slice(2);
      const entry: Toast = {
        id,
        tone: "info",
        duration: 4500,
        ...input,
      };
      setToasts((current) => [...current.slice(-3), entry]);
      if (entry.duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), entry.duration));
      }
      return id;
    },
    [dismiss]
  );

  React.useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, input) => toast({ ...input, title, tone: "success" }),
      error: (title, input) => toast({ ...input, title, tone: "error" }),
      info: (title, input) => toast({ ...input, title, tone: "info" }),
    }),
    [toast, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((entry) => (
            <motion.div
              key={entry.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface-raised p-3.5 shadow-lg"
              )}
              role="status"
            >
              <span className="mt-0.5 shrink-0">{TONE_ICON[entry.tone]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">{entry.title}</p>
                {entry.description && <p className="mt-0.5 text-xs text-fg-muted">{entry.description}</p>}
                {entry.action && (
                  <button
                    type="button"
                    onClick={() => {
                      entry.action?.onClick();
                      dismiss(entry.id);
                    }}
                    className="mt-2 rounded-md bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:brightness-95 dark:hover:brightness-125"
                  >
                    {entry.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(entry.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
