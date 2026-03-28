// src/components/ui/SegmentedBar.tsx
// Discrete-level indicator showing progress/capacity as filled vs empty segments.
// Colors map to CSS variables. Animates fill on mount with staggered reveal.

"use client";

import { useEffect, useState } from "react";

type SegmentedBarColor = "primary" | "tertiary" | "danger" | "info";

const colorMap: Record<SegmentedBarColor, string> = {
  primary: "var(--roam-accent)",
  tertiary: "var(--brand-eucalypt)",
  danger: "var(--roam-danger)",
  info: "var(--roam-info)",
};

interface SegmentedBarBaseProps {
  color?: SegmentedBarColor;
  /** CSS class for the outer container */
  className?: string;
}

interface SegmentedBarValueProps extends SegmentedBarBaseProps {
  /** Number of filled segments */
  value: number;
  /** Total segments */
  max: number;
  percent?: never;
  segments?: never;
}

interface SegmentedBarPercentProps extends SegmentedBarBaseProps {
  /** Fill percentage 0-100 */
  percent: number;
  /** Number of segments to render (default 5) */
  segments?: number;
  value?: never;
  max?: never;
}

export type SegmentedBarProps = SegmentedBarValueProps | SegmentedBarPercentProps;

export function SegmentedBar(props: SegmentedBarProps) {
  const { color = "tertiary", className } = props;

  let totalSegments: number;
  let filledCount: number;

  if (props.percent != null) {
    totalSegments = props.segments ?? 5;
    filledCount = Math.round((props.percent / 100) * totalSegments);
  } else {
    totalSegments = props.max;
    filledCount = props.value;
  }

  // Clamp
  filledCount = Math.max(0, Math.min(filledCount, totalSegments));

  const cssColor = colorMap[color];

  // Staggered mount animation
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    let frame: number;
    let current = 0;

    const step = () => {
      if (current < filledCount) {
        current++;
        setVisibleCount(current);
        frame = window.setTimeout(step, 80) as unknown as number;
      }
    };

    // Start after a brief delay so the bar is visible first
    frame = window.setTimeout(step, 60) as unknown as number;

    return () => clearTimeout(frame);
  }, [filledCount]);

  return (
    <div
      className={className}
      style={{
        display: "flex",
        gap: 4,
        alignItems: "center",
      }}
      role="meter"
      aria-valuenow={filledCount}
      aria-valuemin={0}
      aria-valuemax={totalSegments}
      aria-label={`${filledCount} of ${totalSegments}`}
    >
      {Array.from({ length: totalSegments }, (_, i) => {
        const filled = i < visibleCount;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: 12,
              borderRadius: 2,
              background: cssColor,
              opacity: filled ? 1 : 0.2,
              transition: "opacity 200ms var(--ease-out)",
            }}
          />
        );
      })}
    </div>
  );
}
