// src/components/ui/HeroCard.tsx
// Cinematic full-bleed hero card for the bento featured slot.
// Background image (or map) with gradient overlay, glassmorphic badge,
// bottom content zone with headline + body + optional CTA.

import {
  type CSSProperties,
  type ReactNode,
  forwardRef,
} from "react";
import { haptic } from "@/lib/native/haptics";

/* ── Types ────────────────────────────────────────────────────── */

interface HeroCardProps {
  /** Background image URL (or rendered via children in the bg slot) */
  imageUrl?: string;
  /** Alt text for background image */
  imageAlt?: string;
  /** Render a custom background element (e.g. map preview) instead of <img> */
  backgroundSlot?: ReactNode;
  /** Top-right glassmorphic status badge */
  badge?: ReactNode;
  /** Title — rendered with Headline typography */
  title: string;
  /** Subtitle — rendered with Body typography */
  subtitle?: string;
  /** Optional CTA button content */
  cta?: ReactNode;
  /** Click handler — enables pressable mode */
  onPress?: () => void;
  style?: CSSProperties;
  className?: string;
}

export const HeroCard = forwardRef<HTMLDivElement, HeroCardProps>(
  function HeroCard(
    {
      imageUrl,
      imageAlt,
      backgroundSlot,
      badge,
      title,
      subtitle,
      cta,
      onPress,
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
        className={`hero-card ${pressable ? "hero-card--pressable" : ""} ${className}`}
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "var(--r-card)",
          minHeight: 280,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          cursor: pressable ? "pointer" : undefined,
          background: "var(--roam-surface)",
          boxShadow: "var(--shadow-heavy)",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
          willChange: "transform",
          transition:
            "transform 300ms var(--ease-out), box-shadow 300ms var(--ease-out)",
          ...style,
        }}
      >
        {/* ── Background layer ───────────────────────────────── */}
        {backgroundSlot ? (
          <div
            className="hero-card__bg"
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
            }}
          >
            {backgroundSlot}
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={imageAlt ?? ""}
            className="hero-card__img terra-img-reveal"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}

        {/* ── Gradient overlay ───────────────────────────────── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, var(--roam-bg) 0%, transparent 60%, transparent 100%)",
            pointerEvents: "none",
          }}
        />

        {/* ── Badge (top-right) ──────────────────────────────── */}
        {badge && (
          <div
            style={{
              position: "absolute",
              top: "var(--space-md)",
              right: "var(--space-md)",
              zIndex: 2,
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              background: "color-mix(in srgb, var(--roam-surface) 20%, transparent)",
              border: "1px solid color-mix(in srgb, var(--roam-border) 30%, transparent)",
              borderRadius: "var(--r-pill)",
              padding: "var(--space-xs) var(--space-md)",
              fontSize: "var(--font-xxs)",
              fontFamily: "var(--ff-display)",
              fontWeight: 700,
              color: "var(--roam-text)",
              letterSpacing: "0.04em",
              textTransform: "uppercase" as const,
            }}
          >
            {badge}
          </div>
        )}

        {/* ── Bottom content zone ────────────────────────────── */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: "var(--space-xl)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--ff-display)",
              fontWeight: 700,
              textTransform: "uppercase" as const,
              letterSpacing: "0.05em",
              lineHeight: 1.15,
              fontSize: "var(--font-h2)",
              color: "var(--roam-text)",
              margin: 0,
            }}
          >
            {title}
          </h3>

          {subtitle && (
            <p
              style={{
                fontFamily: "var(--ff-body)",
                fontWeight: 500,
                fontSize: "var(--font-body)",
                lineHeight: 1.5,
                color: "var(--roam-text-muted)",
                margin: 0,
              }}
            >
              {subtitle}
            </p>
          )}

          {cta && <div style={{ marginTop: "var(--space-sm)" }}>{cta}</div>}
        </div>
      </div>
    );
  },
);
