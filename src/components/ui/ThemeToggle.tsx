// src/components/ui/ThemeToggle.tsx

import { useTheme } from "@/lib/context/ThemeContext";
import { haptic } from "@/lib/native/haptics";
import type { CSSProperties } from "react";

/* ── Day/Night toggle ────────────────────────────────────────────────
   Compact pill that floats in the app shell.
   Instant switch (no transition on mode change - per spec).
   Icons: Sun (☀) for Day, Moon (☽) for Tactical Night.
   ──────────────────────────────────────────────────────────────────── */

const PILL: CSSProperties = {
  position: "fixed",
  top: "calc(var(--roam-safe-top, 0px) + 8px)",
  left: "calc(var(--roam-safe-left, 0px) + 12px)",
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  borderRadius: "var(--r-card)",
  border: "1px solid var(--roam-border-strong)",
  background: "color-mix(in srgb, var(--roam-surface) 80%, transparent)",
  backdropFilter: "blur(16px) saturate(140%)",
  WebkitBackdropFilter: "blur(16px) saturate(140%)",
  boxShadow: "var(--shadow-soft)",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
  touchAction: "manipulation",
  color: "var(--roam-text)",
};

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to Day mode" : "Switch to Tactical Night mode"}
      style={PILL}
      onClick={() => {
        haptic.selection();
        toggle();
      }}
    >
      {isDark ? (
        /* Moon icon - Tactical Night active */
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        /* Sun icon - Day mode active */
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
}
