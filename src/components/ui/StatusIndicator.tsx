// src/components/ui/StatusIndicator.tsx
// Status indicator for nominal / warning / critical states.
// Colors: Potable Green (eucalypt), Solar Amber (amber), Emergency Red (ochre).
// Renders as a dot + optional label, or as a filled pill badge.

import type { ReactNode } from "react";

type StatusLevel = "nominal" | "warning" | "critical";
type StatusDisplay = "dot" | "pill";

interface StatusIndicatorProps {
  status: StatusLevel;
  /** Text label shown beside the dot or inside the pill */
  label?: string;
  /** Icon rendered before label */
  icon?: ReactNode;
  /** "dot" = small dot + text, "pill" = filled pill badge */
  display?: StatusDisplay;
  /** Pulse animation for active/live states */
  pulse?: boolean;
}

const statusColors: Record<StatusLevel, { solid: string; tint: string }> = {
  nominal: {
    solid: "var(--roam-success)",   // Potable Green (eucalypt)
    tint: "var(--accent-tint)",
  },
  warning: {
    solid: "var(--roam-warn)",      // Solar Amber
    tint: "var(--severity-minor-tint)",
  },
  critical: {
    solid: "var(--roam-danger)",    // Emergency Red (ochre)
    tint: "var(--danger-tint)",
  },
};

export function StatusIndicator({
  status,
  label,
  icon,
  display = "dot",
  pulse,
}: StatusIndicatorProps) {
  const { solid, tint } = statusColors[status];

  if (display === "pill") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 44,
          padding: "0 16px",
          borderRadius: "var(--r-pill)",
          background: tint,
          border: `1.5px solid ${solid}`,
          color: solid,
          fontSize: "var(--font-sm)",
          fontWeight: 800,
          letterSpacing: "0.3px",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: solid,
            flexShrink: 0,
            ...(pulse
              ? { animation: "statusPulse 1.5s ease-in-out infinite" }
              : {}),
          }}
        />
        {icon}
        {label}
      </span>
    );
  }

  // Dot display (compact)
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        minHeight: 32,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: solid,
          flexShrink: 0,
          boxShadow: `0 0 0 3px ${tint}`,
          ...(pulse
            ? { animation: "statusPulse 1.5s ease-in-out infinite" }
            : {}),
        }}
      />
      {icon}
      {label && (
        <span
          style={{
            fontSize: "var(--font-sm)",
            fontWeight: 700,
            color: solid,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
