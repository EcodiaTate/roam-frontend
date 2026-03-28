// src/components/ui/Card.tsx
// Core card component with Terra Nomad design tokens.
// Light mode: solid fills with heavy warm shadows.
// Dark mode: subtle backdrop-blur glass-morphism (via .roam-card-glass CSS class).
// 4px border-radius as specified.

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Render as a pressable card (adds scale-down on active) */
  pressable?: boolean;
  /** Optional header content rendered above children */
  header?: ReactNode;
  /** Remove default padding */
  noPadding?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ pressable, header, noPadding, children, style, className = "", ...props }, ref) => {
    const classes = [
      "roam-card-glass",
      pressable ? "trip-interactive" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        ref={ref}
        className={classes}
        style={{
          background: "var(--roam-surface)",
          borderRadius: "var(--r-card)",
          padding: noPadding ? 0 : "var(--space-lg)",
          boxShadow: "var(--shadow-heavy)",
          overflow: "hidden",
          ...style,
        }}
        {...props}
      >
        {header && (
          <div
            style={{
              padding: noPadding ? "var(--space-lg) var(--space-lg) 0" : 0,
              marginBottom: "var(--space-md)",
            }}
          >
            {header}
          </div>
        )}
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";
