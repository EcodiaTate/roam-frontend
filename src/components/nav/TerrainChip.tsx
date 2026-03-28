// src/components/nav/TerrainChip.tsx

import { memo } from "react";
import type { LucideIcon } from "lucide-react";

type Props = {
  /** Terrain or status type (e.g. "SEALED", "GRAVEL", "4WD TRACK") */
  type: string;
  /** Optional label override — defaults to "TERRAIN STATUS" */
  label?: string;
  /** Optional icon prefix for environmental data variants */
  icon?: LucideIcon;
};

export const TerrainChip = memo(function TerrainChip({ type, label, icon: Icon }: Props) {
  return (
    <div
      style={{
        background: "color-mix(in srgb, var(--roam-surface) 80%, transparent)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderLeft: "4px solid var(--roam-accent, #B3541E)",
        borderRadius: "var(--r-card, 6px)",
        padding: "8px 12px",
        minWidth: 0,
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--roam-text-muted, #999)",
          lineHeight: 1,
        }}
      >
        {label ?? "TERRAIN STATUS"}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 4,
        }}
      >
        {Icon && (
          <Icon
            size={14}
            strokeWidth={2.2}
            style={{ color: "var(--roam-accent, #B3541E)", flexShrink: 0 }}
          />
        )}
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: "var(--roam-text, #1a1613)",
            lineHeight: 1.2,
            letterSpacing: "-0.2px",
          }}
        >
          {type}
        </span>
      </div>
    </div>
  );
});
