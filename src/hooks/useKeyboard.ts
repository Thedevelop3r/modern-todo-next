"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/store/state";
import { useToast } from "@/components/ui";

/** True when focus is in a field, where single-key shortcuts must not fire. */
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export const SHORTCUTS = [
  { keys: ["/"], description: "Focus search" },
  { keys: ["n"], description: "New todo" },
  { keys: ["Ctrl", "K"], description: "Open command palette" },
  { keys: ["g", "d"], description: "Go to dashboard" },
  { keys: ["g", "a"], description: "Go to analytics" },
  { keys: ["g", "t"], description: "Go to trash" },
  { keys: ["g", "s"], description: "Go to settings" },
  { keys: ["j"], description: "Next todo in the list" },
  { keys: ["k"], description: "Previous todo in the list" },
  { keys: ["x"], description: "Select the todo under the cursor" },
  { keys: ["Space"], description: "Quick look at the todo" },
  { keys: ["Enter"], description: "Open the todo" },
  { keys: ["Ctrl", "Z"], description: "Undo the last action" },
  { keys: ["?"], description: "Show this help" },
  { keys: ["Esc"], description: "Close dialogs / clear selection" },
];

/**
 * Global shortcuts. `g` starts a two-key sequence (g then d, a, t, s) which
 * expires after a second so a stray g does not swallow the next keypress.
 */
export function useKeyboardShortcuts() {
  const router = useRouter();
  const toast = useToast();
  const { setCommandOpen, setShortcutsOpen, clearSelection, popUndo } = useUiStore();
  const pendingG = React.useRef(false);
  const gTimer = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const cmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (cmdK) {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }

      // Ctrl/Cmd+Z walks back through the undo stack - but text fields keep
      // their own native undo, so a field with focus wins.
      const undoCombo =
        (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z";
      if (undoCombo) {
        if (isTyping(event.target)) return;
        event.preventDefault();
        const entry = popUndo();
        if (!entry) {
          toast.info("Nothing left to undo");
          return;
        }
        Promise.resolve(entry.undo())
          .then(() => toast.success("Undone", { description: entry.label }))
          .catch((error: Error) => toast.error("Could not undo", { description: error.message }));
        return;
      }

      if (event.key === "Escape") {
        clearSelection();
        return;
      }

      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

      if (pendingG.current) {
        const destinations: Record<string, string> = {
          d: "/dashboard",
          a: "/dashboard/analytics",
          t: "/dashboard/trash",
          s: "/dashboard/settings",
          r: "/dashboard/archive",
        };
        const target = destinations[event.key.toLowerCase()];
        pendingG.current = false;
        if (target) {
          event.preventDefault();
          router.push(target);
        }
        return;
      }

      switch (event.key) {
        case "g":
          pendingG.current = true;
          clearTimeout(gTimer.current);
          gTimer.current = setTimeout(() => (pendingG.current = false), 1000);
          break;
        case "n":
          event.preventDefault();
          router.push("/dashboard/create-todo");
          break;
        case "/":
          event.preventDefault();
          document.getElementById("todo-search")?.focus();
          break;
        case "?":
          event.preventDefault();
          setShortcutsOpen(true);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(gTimer.current);
    };
  }, [router, setCommandOpen, setShortcutsOpen, clearSelection, popUndo, toast]);
}
