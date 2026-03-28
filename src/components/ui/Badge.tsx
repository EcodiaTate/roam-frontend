// src/components/ui/Badge.tsx
// Pill-shaped badge/chip component — h-11 (44px), no labels pattern.
// Used for filters, tags, and status chips across the app.
// Follows the unified search/filter design: pill shapes, h-11, no labels.

import type { ReactNode } from "react";
import { haptic } from "@/lib/native/haptics";

type BadgeVariant = "default" | "accent" | "info" | "warn" | "danger" | "muted";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  /** Icon rendered before text */
  icon?: ReactNode;
  /** If provided, badge becomes pressable */
  onPress?: () => void;
  /** Active/selected state (tinted background + colored border) */
  active?: boolean;
}

const variantColors: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  default: {
    bg: "var(--roam-surface-hover)",
    color: "var(--roam-text)",
    border: "var(--roam-border-strong)",
  },
  accent: {
    bg: "var(--accent-tint)",
    color: "var(--roam-accent)",
    border: "var(--roam-accent)",
  },
  info: {
    bg: "var(--info-tint)",
    color: "var(--roam-info)",
    border: "var(--roam-info)",
  },
  warn: {
    bg: "var(--severity-minor-tint)",
    color: "var(--roam-warn)",
    border: "var(--roam-warn)",
  },
  danger: {
    bg: "var(--danger-tint)",
    color: "var(--roam-danger)",
    border: "var(--roam-danger)",
  },
  muted: {
    bg: "var(--roam-surface-hover)",
    color: "var(--roam-text-muted)",
    border: "var(--roam-border)",
  },
};

export function Badge({ children, variant = "default", icon, onPress, active }: BadgeProps) {
  const colors = variantColors[variant];
  const isButton = !!onPress;

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 44,
    padding: "0 16px",
    borderRadius: "var(--r-pill)",
    border: `1.5px solid ${active ? colors.border : "var(--roam-border-strong)"}`,
    background: active ? colors.bg : "var(--roam-surface-hover)",
    color: active ? colors.color : "var(--roam-text)",
    fontSize: "var(--font-sm)",
    fontWeight: 700,
    whiteSpace: "nowrap",
    flexShrink: 0,
    lineHeight: 1,
    cursor: isButton ? "pointer" : "default",
    userSelect: "none",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    transition: "background 200ms var(--ease-out), color 200ms var(--ease-out), border-color 200ms var(--ease-out), transform 200ms var(--ease-out)",
  };

  if (isButton) {
    return (
      <button
        type="button"
        onClick={() => {
          haptic.selection();
          onPress();
        }}
        className="roam-btn-press"
        style={{ ...style, outline: "none" }}
      >
        {icon}
        {children}
      </button>
    );
  }

  return (
    <span style={style}>
      {icon}
      {children}
    </span>
  );
}
