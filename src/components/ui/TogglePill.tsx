// src/components/ui/TogglePill.tsx
// Reusable pill-shaped toggle button for filter UIs.
"use client";

import type { ReactNode } from "react";

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
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        borderRadius: 999,
        border: active
          ? "1.5px solid var(--roam-accent)"
          : "1.5px solid var(--roam-border-strong)",
        padding: "5px 11px",
        fontSize: 12,
        fontWeight: 700,
        background: active ? "var(--accent-tint)" : "transparent",
        color: active ? "var(--roam-accent)" : "var(--roam-text-muted)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        transition: "background 100ms ease, color 100ms ease, border-color 100ms ease",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
