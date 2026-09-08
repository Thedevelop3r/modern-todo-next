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
};

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
}));
