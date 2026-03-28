// src/components/ui/IconToggleGrid.tsx
// Grid of large toggle buttons for binary on/off states.
// Each item renders as a pressable card with icon + label.

"use client";

import type { ReactNode } from "react";
import { haptic } from "@/lib/native/haptics";

type ToggleColor = "primary" | "tertiary" | "info" | "danger";

const colorMap: Record<ToggleColor, string> = {
  primary: "var(--roam-accent)",
  tertiary: "var(--brand-eucalypt)",
  info: "var(--roam-info)",
  danger: "var(--roam-danger)",
};

export interface IconToggleItem {
  /** Lucide icon or any ReactNode */
  icon: ReactNode;
  label: string;
  active: boolean;
  color?: ToggleColor;
}

interface IconToggleGridProps {
  items: IconToggleItem[];
  onChange: (index: number, active: boolean) => void;
}

export function IconToggleGrid({ items, onChange }: IconToggleGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 16,
      }}
    >
      {items.map((item, i) => (
        <ToggleCard
          key={i}
          item={item}
          onToggle={() => {
            haptic.selection();
            onChange(i, !item.active);
          }}
        />
      ))}
    </div>
  );
}

function ToggleCard({ item, onToggle }: { item: IconToggleItem; onToggle: () => void }) {
  const { icon, label, active, color = "primary" } = item;
  const cssColor = colorMap[color];

  return (
    <button
      type="button"
      onClick={onToggle}
      className="roam-btn-press"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 24,
        minHeight: 44,
        background: active
          ? "var(--roam-surface-hover)"
          : "var(--roam-surface)",
        borderRadius: "var(--r-card)",
        border: "none",
        borderBottom: active
          ? `4px solid ${cssColor}`
          : "4px solid transparent",
        cursor: "pointer",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
        transition: "background 200ms var(--ease-out), border-color 200ms var(--ease-out), transform 200ms var(--ease-out)",
        outline: "none",
      }}
    >
      {/* Icon */}
      <span
        style={{
          fontSize: 0,
          lineHeight: 0,
          color: active ? cssColor : "var(--roam-text-muted)",
          transition: "color 200ms var(--ease-out)",
        }}
      >
        {icon}
      </span>

      {/* Label */}
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: active ? cssColor : "var(--roam-text-muted)",
          opacity: active ? 1 : 0.4,
          transition: "color 200ms var(--ease-out), opacity 200ms var(--ease-out)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>

      {/* ON/OFF indicator */}
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.1em",
          color: active ? cssColor : "var(--roam-text-muted)",
          opacity: active ? 1 : 0.4,
          transition: "color 200ms var(--ease-out), opacity 200ms var(--ease-out)",
        }}
      >
        {active ? "ON" : "OFF"}
      </span>
    </button>
  );
}
