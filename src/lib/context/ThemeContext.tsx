import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/* ──────────────────────────────────────────────────────────────────────────
   Terra Nomad — Theme Provider
   Two modes:
     "day"            → Flat & Shadowed (light)
     "tactical-night" → Glass & Steel  (dark)
   Persisted to localStorage. Falls back to system preference on first visit.
   ────────────────────────────────────────────────────────────────────────── */

export type ThemeMode = "day" | "tactical-night";

interface ThemeContextValue {
  /** Current active theme */
  mode: ThemeMode;
  /** Is the current mode dark? */
  isDark: boolean;
  /** Toggle between day ↔ tactical-night */
  toggle: () => void;
  /** Set a specific mode */
  setMode: (m: ThemeMode) => void;
}

const STORAGE_KEY = "roam-theme-mode";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialMode(): ThemeMode {
  if (typeof window === "undefined") return "day";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "day" || stored === "tactical-night") return stored;
  // Fall back to OS preference
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "tactical-night"
    : "day";
}

function applyMode(mode: ThemeMode) {
  const root = document.documentElement;
  root.setAttribute("data-theme", mode);
  // Set color-scheme for native browser elements (scrollbars, form controls)
  root.style.colorScheme = mode === "tactical-night" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);

  // Apply on mount + whenever mode changes (instant — no transition)
  useEffect(() => {
    applyMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  // Listen for system preference changes (only affects users who haven't explicitly chosen)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setModeState(e.matches ? "tactical-night" : "day");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = useCallback(
    () =>
      setModeState((prev) =>
        prev === "day" ? "tactical-night" : "day",
      ),
    [],
  );

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, isDark: mode === "tactical-night", toggle, setMode }),
    [mode, toggle, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
