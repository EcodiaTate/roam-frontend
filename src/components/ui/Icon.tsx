// src/components/ui/Icon.tsx
//
// Minimalist geometric icon system with mandatory text labels.
// Every icon renders with a visible label for zero-learning-curve usability.
// Consistent 1.5px stroke weight across all sizes.

import { type CSSProperties, type ReactNode, memo } from "react";

/* ────────────────────────────────────────────────────────────────────
   Built-in geometric icon paths (24×24 viewBox, 1.5px stroke)
   ──────────────────────────────────────────────────────────────────── */

const ICON_PATHS: Record<string, string> = {
  // Navigation
  speed:     "M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20ZM12 8v4l2.5 2.5",
  range:     "M3 12h2m14 0h2M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M5.6 18.4l1.4-1.4m10-10 1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  heading:   "M12 2l3 6h-6l3-6ZM12 8v14M5 19l7 3 7-3",
  compass:   "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2.5 7.5 5-2 2 5-5 2-2-5Z",
  navigation:"M3 11l19-9-9 19-2-8-8-2Z",
  route:     "M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 16.2l6.8-8.4",

  // Status
  fuel:      "M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17M3 10h10M13 13l3 2v-4a2 2 0 0 1 4 0v6a3 3 0 0 1-3 3h-4",
  signal:    "M2 20h2v-4h-2v4ZM7 20h2v-8h-2v8ZM12 20h2v-12h-2v12ZM17 20h2v-16h-2v16Z",
  battery:   "M6 7h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM22 11v2M7 10v4M10 10v4",
  offline:   "M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M12 20h0M5 12.5a12 12 0 0 1 3-2.5M19 12.5a12 12 0 0 0-2-1.8M2 8.8a16 16 0 0 1 4-2.5M22 8.8a16 16 0 0 0-5-3",
  wifi:      "M12 20h0M8.5 16.5a5 5 0 0 1 7 0M5 12.5a12 12 0 0 1 14 0M2 8.8a16 16 0 0 1 20 0",

  // Actions
  location:  "M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  alert:     "M12 2L2 22h20L12 2ZM12 9v5M12 17h0",
  info:      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 11v5M12 8h0",
  check:     "M20 6L9 17l-5-5",
  close:     "M18 6L6 18M6 6l12 12",
  settings:  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 5 15.1 1.6 1.6 0 0 0 3.4 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6V3a2 2 0 1 1 4 0v.1c0 .6.3 1.1.9 1.4a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1.1H21a2 2 0 1 1 0 4h-.1c-.6 0-1.1.3-1.5.9Z",

  // Travel
  camp:      "M12 2L2 22h20L12 2ZM12 10v6M8 18h8",
  water:     "M12 2s-6 8-6 12a6 6 0 0 0 12 0c0-4-6-12-6-12Z",
  mountain:  "M2 20l5-14 5 8 4-6 6 12H2Z",
  sun:       "M12 4V2M12 22v-2M4 12H2M22 12h-2M6.3 6.3L4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
};

/* ────────────────────────────────────────────────────────────────────
   Layout variants
   ──────────────────────────────────────────────────────────────────── */

type Layout = "inline" | "stacked";

const layoutStyles: Record<Layout, CSSProperties> = {
  /** Icon and label side by side — for buttons, list rows, chips */
  inline: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  /** Icon above label — for dashboard cells, tab items */
  stacked: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
};

/* ────────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────────── */

export type IconProps = {
  /** Icon name from the built-in set, OR a custom SVG path string */
  name: string;
  /** Mandatory text label — always rendered visually (zero-learning-curve) */
  label: string;
  /** Size in px (default 20) */
  size?: number;
  /** Icon colour (default: currentColor) */
  color?: string;
  /** Layout: "inline" (side-by-side) or "stacked" (icon above label). Default: "inline" */
  layout?: Layout;
  /** Additional inline styles on the wrapper */
  style?: CSSProperties;
  /** Additional CSS classes on the wrapper */
  className?: string;
  /** Custom SVG content — use instead of `name` when you need a non-standard icon */
  children?: ReactNode;
};

export const Icon = memo(function Icon({
  name,
  label,
  size = 20,
  color,
  layout = "inline",
  style,
  className,
  children,
}: IconProps) {
  const pathD = ICON_PATHS[name];

  // Label style: small, uppercase, high-contrast — matches the Label typography variant
  const labelStyle: CSSProperties = {
    fontFamily: 'var(--ff-display)',
    fontWeight: 600,
    fontSize: layout === "stacked" ? "var(--font-xxs)" : "var(--font-xs)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    lineHeight: 1.2,
    color: color ?? "currentColor",
    whiteSpace: "nowrap",
  };

  return (
    <span
      className={className}
      style={{ ...layoutStyles[layout], ...style }}
      role="img"
      aria-label={label}
    >
      {children ? (
        children
      ) : pathD ? (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color ?? "currentColor"}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0, display: "block" }}
        >
          <path d={pathD} />
        </svg>
      ) : null}
      <span style={labelStyle}>{label}</span>
    </span>
  );
});

/** Get path data for a named icon (useful for custom SVG rendering) */
export function getIconPath(name: string): string | undefined {
  return ICON_PATHS[name];
}

/** All available built-in icon names */
export const ICON_NAMES = Object.keys(ICON_PATHS) as ReadonlyArray<string>;
