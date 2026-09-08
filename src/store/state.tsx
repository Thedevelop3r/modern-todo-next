import { create } from "zustand";

/**
 * UI-only state. Server data lives in the TanStack Query cache (src/hooks/*) -
 * keeping todos in two places is what made the old store drift out of sync.
 */
type UiState = {
  view: TodoView;
  setView: (view: TodoView) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;

  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;

  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  /** Ids selected for bulk actions on the dashboard. */
  selection: string[];
  toggleSelected: (id: string) => void;
  selectMany: (ids: string[]) => void;
  clearSelection: () => void;

  /**
   * Reversible actions, newest first. Entries hold a closure, so the stack is
   * memory-only - a reload clears it, which is the honest behaviour.
   */
  undoStack: UndoEntry[];
  pushUndo: (entry: Omit<UndoEntry, "id" | "at">) => void;
  popUndo: () => UndoEntry | undefined;
  removeUndo: (id: string) => void;
  clearUndo: () => void;
};

export type UndoEntry = {
  id: string;
  label: string;
  at: number;
  undo: () => void | Promise<void>;
};

const UNDO_MAX = 10;

export const useUiStore = create<UiState>((set, get) => ({
  view: "list",
  setView: (view) => set({ view }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  mobileNavOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),

  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),

  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),

  selection: [],
  toggleSelected: (id) =>
    set((s) => ({
      selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
    })),
  selectMany: (ids) => set({ selection: ids }),
  clearSelection: () => set({ selection: [] }),

  undoStack: [],
  pushUndo: (entry) =>
    set((s) => ({
      undoStack: [
        { ...entry, id: Math.random().toString(36).slice(2), at: Date.now() },
        ...s.undoStack,
      ].slice(0, UNDO_MAX),
    })),
  popUndo: () => {
    const [top, ...rest] = get().undoStack;
    if (!top) return undefined;
    set({ undoStack: rest });
    return top;
  },
  removeUndo: (id) => set((s) => ({ undoStack: s.undoStack.filter((e) => e.id !== id) })),
  clearUndo: () => set({ undoStack: [] }),
}));
