// src/components/ui/StarRating.tsx
// Compact inline rating display: filled star + bold number + optional count.

import { Star } from "lucide-react";

interface StarRatingProps {
  value: number;
  /** Optional review count, shown as "(123)" */
  count?: number;
}

export function StarRating({ value, count }: StarRatingProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "var(--roam-surface-hover)",
        padding: "4px 8px",
        borderRadius: "var(--r-card)",
        lineHeight: 1,
      }}
      aria-label={`${value} out of 5 stars${count != null ? `, ${count} reviews` : ""}`}
    >
      <Star
        size={14}
        strokeWidth={0}
        fill="var(--roam-accent)"
        style={{ display: "block", flexShrink: 0 }}
        aria-hidden="true"
      />
      <span
        style={{
          fontSize: "var(--font-sm)",
          fontWeight: 800,
          color: "var(--roam-text)",
        }}
      >
        {value}
      </span>
      {count != null && (
        <span
          style={{
            fontSize: "var(--font-xs)",
            fontWeight: 600,
            color: "var(--roam-text-muted)",
          }}
        >
          ({count})
        </span>
      )}
    </span>
  );
}
