"use client";

import { Modal } from "@/components/ui";
import { useUiStore } from "@/store/state";
import { SHORTCUTS } from "@/hooks/useKeyboard";

export function ShortcutsModal() {
  const { shortcutsOpen, setShortcutsOpen } = useUiStore();

  return (
    <Modal
      open={shortcutsOpen}
      onOpenChange={setShortcutsOpen}
      title="Keyboard shortcuts"
      description="Work faster without reaching for the mouse."
      size="sm"
    >
      <ul className="divide-y divide-border">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.description} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-sm text-fg-muted">{shortcut.description}</span>
            <span className="flex shrink-0 items-center gap-1">
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] font-medium text-fg"
                >
                  {key}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
