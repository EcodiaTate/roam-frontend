// src/components/ui/BentoGrid.tsx
// CSS Grid bento layout with semantic featured/sidebar slots.
// Composes with Card, HeroCard, and SideCard via col-span props.

import { type CSSProperties, type ReactNode, forwardRef } from "react";

/* ── Slot helpers ─────────────────────────────────────────────── */

type ColSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

interface BentoItemProps {
  /** Explicit col-span (1–12). Overrides semantic slot. */
  span?: ColSpan;
  /** Semantic slot shortcut */
  slot?: "featured" | "sidebar";
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

const SLOT_SPAN: Record<string, ColSpan> = {
  featured: 8,
  sidebar: 4,
};

export const BentoItem = forwardRef<HTMLDivElement, BentoItemProps>(
  function BentoItem({ span, slot, children, style, className = "" }, ref) {
    const resolved = span ?? (slot ? SLOT_SPAN[slot] : 12);

    return (
      <div
        ref={ref}
        className={className}
        style={{
          gridColumn: `span ${resolved}`,
          minWidth: 0,
          ...style,
        }}
      >
        {children}
      </div>
    );
  },
);

/* ── Grid wrapper ─────────────────────────────────────────────── */

interface BentoGridProps {
  children: ReactNode;
  /** Extra gap override - defaults to var(--space-lg) */
  gap?: string;
  style?: CSSProperties;
  className?: string;
}

export const BentoGrid = forwardRef<HTMLDivElement, BentoGridProps>(
  function BentoGrid({ children, gap, style, className = "" }, ref) {
    return (
      <div
        ref={ref}
        className={className}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: gap ?? "var(--space-lg)",
          ...style,
        }}
      >
        {children}
      </div>
    );
  },
);
