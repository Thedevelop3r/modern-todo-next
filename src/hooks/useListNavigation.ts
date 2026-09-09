"use client";

import * as React from "react";
import { isTyping } from "@/hooks/useKeyboard";

/** Space and Enter belong to whatever button or link has focus. */
function isInteractive(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest?.("button, a, [role='button'], summary"));
}

/**
 * Vim-style navigation over a list of todo ids: `j`/`k` (or the arrows) move,
 * `x` selects, `Enter` opens, `Space` previews.
 *
 * The active row is tracked by id rather than index so it survives the list
 * re-sorting under it. Cards mark themselves with `data-todo-id`, which is how
 * the active one is scrolled into view.
 */
export function useListNavigation({
  ids,
  enabled = true,
  previewOpen = false,
  onToggleSelect,
  onOpen,
  onPreview,
}: {
  ids: string[];
  enabled?: boolean;
  previewOpen?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
  onPreview?: (id: string) => void;
}) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // Drop the cursor when the row it pointed at is gone.
  React.useEffect(() => {
    if (activeId && !ids.includes(activeId)) setActiveId(null);
  }, [ids, activeId]);

  React.useEffect(() => {
    if (!activeId) return;
    document
      .querySelector(`[data-todo-id="${activeId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  React.useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

      // While the preview is up, only the keys that dismiss it are live.
      if (previewOpen && event.key !== " " && event.key !== "Escape") return;

      const move = (delta: number) => {
        if (!ids.length) return;
        event.preventDefault();
        const index = activeId ? ids.indexOf(activeId) : -1;
        if (index < 0) {
          setActiveId(delta > 0 ? ids[0] : ids[ids.length - 1]);
          return;
        }
        setActiveId(ids[Math.min(ids.length - 1, Math.max(0, index + delta))]);
      };

      switch (event.key) {
        case "j":
        case "ArrowDown":
          move(1);
          break;
        case "k":
        case "ArrowUp":
          move(-1);
          break;
        case "x":
          if (!activeId) return;
          event.preventDefault();
          onToggleSelect?.(activeId);
          break;
        case "Enter":
          if (!activeId || isInteractive(event.target)) return;
          event.preventDefault();
          onOpen?.(activeId);
          break;
        case " ":
          if (!activeId || (!previewOpen && isInteractive(event.target))) return;
          event.preventDefault();
          onPreview?.(activeId);
          break;
        case "Escape":
          setActiveId(null);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, previewOpen, ids, activeId, onToggleSelect, onOpen, onPreview]);

  return { activeId, setActiveId };
}
