// src/components/ui/TogglePill.tsx
// Reusable pill-shaped toggle button for filter UIs.

import type { ReactNode } from "react";
import { haptic } from "@/lib/native/haptics";

export function TogglePill({
  active,
  onToggle,
  label,
  icon,
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => { haptic.selection(); onToggle(); }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        borderRadius: 999,
        border: active
          ? "1.5px solid var(--roam-accent)"
          : "1.5px solid var(--roam-border-strong)",
        padding: "8px 14px",
        minHeight: 44,
        fontSize: 13,
        fontWeight: 700,
        background: active ? "var(--accent-tint)" : "transparent",
        color: active ? "var(--roam-accent)" : "var(--roam-text-muted)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        transition: "background 100ms ease, color 100ms ease, border-color 100ms ease, transform 80ms ease",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
