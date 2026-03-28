// src/components/ui/SideCard.tsx
// Compact card for bento sidebar slots.
// Optional thumbnail with grayscale→color reveal, numbered label,
// accent border-right, and arrow indicator with hover translate.

import {
  type CSSProperties,
  type ReactNode,
  forwardRef,
} from "react";
import { ChevronRight } from "lucide-react";
import { haptic } from "@/lib/native/haptics";

/* ── Types ────────────────────────────────────────────────────── */

interface SideCardProps {
  /** Card title */
  title: string;
  /** Optional subtitle / meta line */
  subtitle?: string;
  /** Optional small thumbnail URL (64×64) */
  thumbnailUrl?: string;
  /** Custom thumbnail slot (e.g. map mini-preview) */
  thumbnailSlot?: ReactNode;
  /** Numbered label displayed top-right (e.g. "02") */
  number?: string;
  /** Click handler */
  onPress?: () => void;
  /** Additional content below title/subtitle */
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export const SideCard = forwardRef<HTMLDivElement, SideCardProps>(
  function SideCard(
    {
      title,
      subtitle,
      thumbnailUrl,
      thumbnailSlot,
      number,
      onPress,
      children,
      style,
      className = "",
    },
    ref,
  ) {
    const pressable = !!onPress;

    const handleClick = () => {
      if (!onPress) return;
      haptic.light();
      onPress();
    };

    return (
      <div
        ref={ref}
        role={pressable ? "button" : undefined}
        tabIndex={pressable ? 0 : undefined}
        onClick={handleClick}
        onKeyDown={
          pressable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClick();
                }
              }
            : undefined
        }
        className={`side-card ${className}`}
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "var(--r-card)",
          background: "var(--roam-surface)",
          boxShadow: "var(--shadow-soft)",
          cursor: pressable ? "pointer" : undefined,
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
          willChange: "transform",
          transition:
            "transform 200ms var(--ease-out), background 200ms var(--ease-out)",
          display: "flex",
          flexDirection: "column",
          ...style,
        }}
      >
        {/* ── Number label (top-right) ───────────────────────── */}
        {number && (
          <span
            style={{
              position: "absolute",
              top: "var(--space-md)",
              right: "var(--space-md)",
              fontFamily: "var(--ff-display)",
              fontWeight: 800,
              fontSize: "var(--font-h2)",
              lineHeight: 1,
              color: "var(--roam-accent)",
              opacity: 0.25,
              letterSpacing: "-0.02em",
              pointerEvents: "none",
            }}
          >
            {number}
          </span>
        )}

        {/* ── Main content area ──────────────────────────────── */}
        <div
          style={{
            flex: 1,
            padding: "var(--space-lg)",
            display: "flex",
            gap: "var(--space-md)",
            alignItems: "flex-start",
          }}
        >
          {/* Thumbnail */}
          {(thumbnailUrl || thumbnailSlot) && (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                flexShrink: 0,
                background: "var(--roam-surface-hover)",
              }}
            >
              {thumbnailSlot ?? (
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="side-card__thumb terra-img-reveal"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              )}
            </div>
          )}

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontFamily: "var(--ff-display)",
                fontWeight: 700,
                fontSize: "var(--font-body)",
                lineHeight: 1.3,
                color: "var(--roam-text)",
                margin: 0,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {title}
            </p>
            {subtitle && (
              <p
                style={{
                  fontFamily: "var(--ff-body)",
                  fontWeight: 500,
                  fontSize: "var(--font-sm)",
                  lineHeight: 1.4,
                  color: "var(--roam-text-muted)",
                  margin: "var(--space-xs) 0 0",
                }}
              >
                {subtitle}
              </p>
            )}
            {children}
          </div>
        </div>

        {/* ── Bottom accent bar + arrow ──────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "var(--space-sm) var(--space-lg)",
            borderRight: "4px solid color-mix(in srgb, var(--roam-accent) 20%, transparent)",
          }}
        >
          {pressable && (
            <ChevronRight
              size={16}
              className="side-card__arrow"
              style={{
                color: "var(--roam-text-muted)",
                opacity: 0.5,
              }}
            />
          )}
        </div>
      </div>
    );
  },
);
