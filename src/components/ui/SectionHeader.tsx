// src/components/ui/SectionHeader.tsx
//
// Editorial section header with accent line, uppercase label,
// optional large heading, and right-side slot. Part of the
// "Terra Nomad" design language.

import type { CSSProperties, ReactNode } from "react";

/* ── LiveDot ──────────────────────────────────────────────────────── */

export function LiveDot({
  label = "LIVE",
  style,
}: {
  label?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        ...style,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--roam-accent)",
          opacity: 0.6,
          animation: "roam-pulse 2s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "var(--ff-display)",
          fontSize: 10,
          fontWeight: 800,
          textTransform: "uppercase" as const,
          letterSpacing: "0.12em",
          color: "var(--roam-text-muted)",
        }}
      >
        {label}
      </span>
    </span>
  );
}

/* ── SectionHeader ────────────────────────────────────────────────── */

export type SectionHeaderProps = {
  /** Uppercase label text */
  label: string;
  /** Optional large heading below the label */
  heading?: string;
  /** Right-side slot: LiveDot, badges, action buttons */
  right?: ReactNode;
  /** "default" uses accent color, "muted" uses text-muted */
  variant?: "default" | "muted";
  /** Additional inline styles on the root container */
  style?: CSSProperties;
  /** Additional CSS class names */
  className?: string;
};

export function SectionHeader({
  label,
  heading,
  right,
  variant = "default",
  style,
  className,
}: SectionHeaderProps) {
  const accentColor =
    variant === "muted" ? "var(--roam-text-muted)" : "var(--roam-accent)";

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: heading ? 4 : 0,
        ...style,
      }}
    >
      {/* Label row: accent line + label + right slot */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 20,
        }}
      >
        {/* Accent line */}
        <span
          style={{
            width: 8,
            height: 1,
            background: accentColor,
            flexShrink: 0,
          }}
        />

        {/* Label */}
        <span
          style={{
            fontFamily: "var(--ff-display)",
            fontWeight: 700,
            fontSize: "var(--font-xs)",
            textTransform: "uppercase" as const,
            letterSpacing: "0.2em",
            color: accentColor,
            lineHeight: 1,
          }}
        >
          {label}
        </span>

        {/* Spacer */}
        {right && <span style={{ flex: 1 }} />}

        {/* Right slot */}
        {right}
      </div>

      {/* Optional large heading */}
      {heading && (
        <h2
          style={{
            fontFamily: "var(--ff-display)",
            fontWeight: 900,
            fontSize: "clamp(1.75rem, 5vw, 3rem)",
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            color: "var(--roam-text)",
            margin: 0,
          }}
        >
          {heading}
        </h2>
      )}
    </div>
  );
}
