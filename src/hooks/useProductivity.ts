"use client";

import * as React from "react";

/**
 * Small client-side productivity primitives. These are deliberately
 * browser-local: a pomodoro timer and a "recently viewed" list are per-device
 * conveniences, not account data worth a round trip.
 */

/** localStorage that never throws (private mode, blocked storage, SSR). */
export function readStore<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStore(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked - the feature degrades, nothing breaks */
  }
}

// ---------------------------------------------------------- recents ----

const RECENTS_KEY = "modern-todo:recents";
const RECENTS_MAX = 8;

export type RecentEntry = { id: string; title: string; at: number };

export function useRecents() {
  const [recents, setRecents] = React.useState<RecentEntry[]>([]);

  React.useEffect(() => setRecents(readStore<RecentEntry[]>(RECENTS_KEY, [])), []);

  const push = React.useCallback((entry: { id: string; title: string }) => {
    setRecents((current) => {
      const next = [
        { ...entry, at: Date.now() },
        ...current.filter((r) => r.id !== entry.id),
      ].slice(0, RECENTS_MAX);
      writeStore(RECENTS_KEY, next);
      return next;
    });
  }, []);

  const clear = React.useCallback(() => {
    writeStore(RECENTS_KEY, []);
    setRecents([]);
  }, []);

  return { recents, push, clear };
}

/** Records a visit once per todo id. */
export function useTrackRecent(todo?: Todo) {
  const { push } = useRecents();
  const seen = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!todo?._id || !todo.title) return;
    if (seen.current === todo._id) return;
    seen.current = todo._id;
    push({ id: todo._id, title: todo.title });
  }, [todo?._id, todo?.title, push]);
}

// --------------------------------------------------------- pomodoro ----

export type PomodoroPhase = "focus" | "break";

const POMODORO_KEY = "modern-todo:pomodoro";
export const POMODORO_DURATIONS: Record<PomodoroPhase, number> = {
  focus: 25 * 60,
  break: 5 * 60,
};

type PomodoroState = {
  phase: PomodoroPhase;
  /** Epoch ms when the current run ends; null while paused or idle. */
  endsAt: number | null;
  /** Seconds left, held while paused. */
  remaining: number;
  completed: number;
};

const initialPomodoro: PomodoroState = {
  phase: "focus",
  endsAt: null,
  remaining: POMODORO_DURATIONS.focus,
  completed: 0,
};

/**
 * Pomodoro timer. The deadline is stored as an absolute timestamp rather than a
 * decrementing counter, so it stays correct when the tab is backgrounded and
 * `setInterval` is throttled.
 */
export function usePomodoro(onPhaseEnd?: (phase: PomodoroPhase) => void) {
  const [state, setState] = React.useState<PomodoroState>(initialPomodoro);
  const [, tick] = React.useState(0);
  const endHandler = React.useRef(onPhaseEnd);
  endHandler.current = onPhaseEnd;

  React.useEffect(() => setState(readStore<PomodoroState>(POMODORO_KEY, initialPomodoro)), []);

  const persist = (next: PomodoroState) => {
    writeStore(POMODORO_KEY, next);
    setState(next);
  };

  const running = state.endsAt !== null;

  const secondsLeft = running
    ? Math.max(0, Math.round((state.endsAt! - Date.now()) / 1000))
    : state.remaining;

  // One re-render per second only while a timer is actually running.
  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  // Roll over to the next phase when the deadline passes.
  React.useEffect(() => {
    if (!running || secondsLeft > 0) return;

    const finished = state.phase;
    const nextPhase: PomodoroPhase = finished === "focus" ? "break" : "focus";

    persist({
      phase: nextPhase,
      endsAt: null,
      remaining: POMODORO_DURATIONS[nextPhase],
      completed: state.completed + (finished === "focus" ? 1 : 0),
    });

    endHandler.current?.(finished);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, secondsLeft]);

  const start = () => persist({ ...state, endsAt: Date.now() + state.remaining * 1000 });
  const pause = () => persist({ ...state, endsAt: null, remaining: secondsLeft });
  const reset = () =>
    persist({ ...state, endsAt: null, remaining: POMODORO_DURATIONS[state.phase] });

  const switchPhase = (phase: PomodoroPhase) =>
    persist({ ...state, phase, endsAt: null, remaining: POMODORO_DURATIONS[phase] });

  const total = POMODORO_DURATIONS[state.phase];
  const progress = total ? Math.round(((total - secondsLeft) / total) * 100) : 0;

  return {
    phase: state.phase,
    completed: state.completed,
    running,
    secondsLeft,
    progress,
    start,
    pause,
    reset,
    switchPhase,
  };
}

export const formatClock = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
};

// ---------------------------------------------- browser notifications ----

export function useNotifications() {
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">("default");

  React.useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const request = React.useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported" as const;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const notify = React.useCallback(
    (title: string, options?: NotificationOptions) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      try {
        new Notification(title, { badge: "/icon.svg", icon: "/icon.svg", ...options });
      } catch {
        /* some browsers refuse constructed notifications; ignore */
      }
    },
    []
  );

  return { permission, request, notify };
}

// -------------------------------------------------------- id memory ----

/**
 * A capped set of ids remembered across reloads - used to keep a reminder
 * dismissed, and to make sure a browser notification fires only once.
 */
export function usePersistedIds(key: string, max = 200) {
  const [ids, setIds] = React.useState<string[]>([]);
  const known = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const stored = readStore<string[]>(key, []);
    known.current = new Set(stored);
    setIds(stored);
  }, [key]);

  /** Adds ids and reports which of them were genuinely new. */
  const add = React.useCallback(
    (...incoming: string[]) => {
      const fresh = incoming.filter((id) => !known.current.has(id));
      if (!fresh.length) return [];
      fresh.forEach((id) => known.current.add(id));
      setIds((current) => {
        const next = [...fresh, ...current].slice(0, max);
        writeStore(key, next);
        // The cap can evict ids; keep the mirror in step so they can fire again.
        known.current = new Set(next);
        return next;
      });
      return fresh;
    },
    [key, max]
  );

  const clear = React.useCallback(() => {
    known.current = new Set();
    writeStore(key, []);
    setIds([]);
  }, [key]);

  const has = React.useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, add, has, clear };
}
