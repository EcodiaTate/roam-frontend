// src/components/ui/WatermarkCard.tsx
// Dark inverted card with a large semi-transparent Material Symbols icon as background watermark.
// Works in both light and dark themes.

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

interface WatermarkCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Material Symbols Outlined icon name (e.g. "terrain", "warning") */
  icon: string;
  title: string;
  subtitle?: string;
  /** Small uppercase accent label above the title */
  accentLabel?: string;
  /** Content rendered in a bottom section separated by a divider */
  footer?: ReactNode;
}

export const WatermarkCard = forwardRef<HTMLDivElement, WatermarkCardProps>(
  ({ icon, title, subtitle, accentLabel, footer, children, style, className = "", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={className}
        style={{
          position: "relative",
          borderRadius: "var(--r-card)",
          padding: "var(--space-xl)",
          display: "flex",
          flexDirection: "column",
          ...style,
        }}
        {...props}
      >
        {/* Dark background + watermark wrapper - overflow hidden here only */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <div
            className="watermark-card-bg"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
            }}
          />
          <span
            className="material-symbols-outlined"
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              fontSize: "10rem",
              lineHeight: 1,
              opacity: 0.08,
              color: "white",
              transform: "translate(2rem, -2rem)",
              userSelect: "none",
            }}
          >
            {icon}
          </span>
        </div>

        {/* Content */}
        <div style={{ position: "relative", zIndex: 10, flex: 1, display: "flex", flexDirection: "column" }}>
          {accentLabel && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.3em",
                color: "var(--brand-ochre)",
                marginBottom: "var(--space-sm)",
              }}
            >
              {accentLabel}
            </div>
          )}

          <h3
            style={{
              margin: 0,
              fontSize: "var(--font-h1)",
              fontWeight: 900,
              color: "white",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </h3>

          {subtitle && (
            <p
              style={{
                margin: "var(--space-sm) 0 0",
                fontSize: "var(--font-sm)",
                fontWeight: 600,
                color: "rgba(255, 255, 255, 0.7)",
                lineHeight: 1.4,
              }}
            >
              {subtitle}
            </p>
          )}

          {children && (
            <div style={{ marginTop: "var(--space-lg)", flex: 1 }}>
              {children}
            </div>
          )}
        </div>

        {/* Footer section with divider */}
        {footer && (
          <div
            style={{
              position: "relative",
              zIndex: 10,
              borderTop: "1px solid rgba(255, 255, 255, 0.10)",
              marginTop: "var(--space-lg)",
              paddingTop: "var(--space-md)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    );
  },
);

WatermarkCard.displayName = "WatermarkCard";
