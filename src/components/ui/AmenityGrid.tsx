// src/components/ui/AmenityGrid.tsx
// Inline 2-column grid showing place amenities with Material Symbols icons.

import { useState } from "react";
import { haptic } from "@/lib/native/haptics";

export interface AmenityItem {
  /** Material Symbols Outlined icon name */
  icon: string;
  label: string;
}

interface AmenityGridProps {
  items: AmenityItem[];
  /** Maximum items to show before truncating (default 4) */
  maxItems?: number;
  /** Compact variant: single column, smaller gaps */
  variant?: "default" | "compact";
}

export function AmenityGrid({ items, maxItems = 4, variant = "default" }: AmenityGridProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const isCompact = variant === "compact";
  const visibleItems = expanded ? items : items.slice(0, maxItems);
  const hiddenCount = items.length - maxItems;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr",
        gap: isCompact ? "var(--space-sm)" : "var(--space-md) 0",
      }}
    >
      {visibleItems.map((item, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: isCompact ? 8 : 12,
            minHeight: 28,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 20,
              lineHeight: 1,
              color: "var(--roam-text-muted)",
              flexShrink: 0,
            }}
          >
            {item.icon}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--roam-text-muted)",
              lineHeight: 1.2,
            }}
          >
            {item.label}
          </span>
        </div>
      ))}

      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => {
            haptic.selection();
            setExpanded(true);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: "var(--r-pill)",
            border: "none",
            background: "var(--roam-surface-hover)",
            color: "var(--roam-text-muted)",
            fontSize: 10,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            cursor: "pointer",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            justifySelf: "start",
            minHeight: 28,
          }}
        >
          +{hiddenCount} more
        </button>
      )}
    </div>
  );
}
