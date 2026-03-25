// src/lib/hooks/useUIMode.ts

import { useSyncExternalStore, useCallback } from "react";

/* ── Types ────────────────────────────────────────────────────────────── */

export type UIMode = "full" | "simple";

/* ── localStorage-backed store ────────────────────────────────────────── */

const STORAGE_KEY = "roam:ui_mode";
const listeners = new Set<() => void>();

function getSnapshot(): UIMode {
  if (typeof window === "undefined") return "full";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "simple" ? "simple" : "full";
}

function getServerSnapshot(): UIMode {
  return "full";
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);

  // Listen for cross-tab changes
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function setMode(mode: UIMode) {
  localStorage.setItem(STORAGE_KEY, mode);
  // Notify all subscribers in this tab
  listeners.forEach((cb) => cb());
}

/* ── Hook ─────────────────────────────────────────────────────────────── */

export function useUIMode() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    setMode(mode === "full" ? "simple" : "full");
  }, [mode]);

  const setUIMode = useCallback((m: UIMode) => {
    setMode(m);
  }, []);

  return { mode, isSimple: mode === "simple", toggle, setUIMode } as const;
}
