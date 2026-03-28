// src/components/ui/Typography.tsx
//
// Typography component system built on Space Grotesk (display) and
// Plus Jakarta Sans (body). Variants are tuned for legibility in
// bright sunlight and low-light cabin conditions.

import { type CSSProperties, type ElementType, type ReactNode, forwardRef } from "react";

/* ────────────────────────────────────────────────────────────────────
   Variant definitions
   ──────────────────────────────────────────────────────────────────── */

type Variant = "headline" | "datapoint" | "label" | "body";

interface VariantSpec {
  tag: ElementType;
  style: CSSProperties;
}

const VARIANTS: Record<Variant, VariantSpec> = {
  /**
   * Headline — bold, uppercase, tracked. For page titles and section headers.
   * Space Grotesk bold gives geometric clarity at any size.
   */
  headline: {
    tag: "h2",
    style: {
      fontFamily: 'var(--ff-display)',
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      lineHeight: 1.15,
      fontSize: "var(--font-h2)",
      color: "var(--roam-text)",
      margin: 0,
    },
  },

  /**
   * DataPoint — semi-bold, large scale for immediate recognition.
   * Designed for speed, range, heading — the numbers a driver scans first.
   * Tabular nums keep columns stable as digits change.
   */
  datapoint: {
    tag: "span",
    style: {
      fontFamily: 'var(--ff-display)',
      fontWeight: 700,
      fontSize: "var(--terra-value-size)",
      lineHeight: 1,
      letterSpacing: "-0.02em",
      fontVariantNumeric: "tabular-nums",
      color: "var(--roam-text)",
    },
  },

  /**
   * Label — small, uppercase, high-contrast.
   * For field labels, units, metadata captions.
   */
  label: {
    tag: "span",
    style: {
      fontFamily: 'var(--ff-display)',
      fontWeight: 600,
      fontSize: "var(--font-xxs)",
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      lineHeight: 1.3,
      color: "var(--roam-text-muted)",
    },
  },

  /**
   * Body — readable at any size, optimised for longer text.
   * Uses the app's primary font (Plus Jakarta Sans / system).
   */
  body: {
    tag: "p",
    style: {
      fontFamily: 'var(--ff-body)',
      fontWeight: 500,
      fontSize: "var(--font-body)",
      lineHeight: 1.5,
      color: "var(--roam-text)",
      margin: 0,
    },
  },
};

/* ────────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────────── */

export type TypographyProps = {
  /** Visual variant. Default: "body" */
  variant?: Variant;
  /** Override the rendered HTML element */
  as?: ElementType;
  /** Additional inline styles merged after the variant defaults */
  style?: CSSProperties;
  /** Additional CSS class names */
  className?: string;
  children?: ReactNode;
  /** Pass-through for aria / data attributes */
  [key: `data-${string}` | `aria-${string}`]: string | number | boolean | undefined;
};

export const Typography = forwardRef<HTMLElement, TypographyProps>(function Typography(
  { variant = "body", as, style, className, children, ...rest },
  ref,
) {
  const spec = VARIANTS[variant];
  const Tag = as ?? spec.tag;

  return (
    <Tag
      ref={ref}
      className={className}
      style={{ ...spec.style, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
});

/* ────────────────────────────────────────────────────────────────────
   Convenience aliases — keep imports concise:
     import { Headline, DataPoint, Label, Body } from "@/components/ui/Typography";
   ──────────────────────────────────────────────────────────────────── */

type AliasProps = Omit<TypographyProps, "variant">;

export const Headline = forwardRef<HTMLElement, AliasProps>(function Headline(props, ref) {
  return <Typography ref={ref} variant="headline" {...props} />;
});

export const DataPoint = forwardRef<HTMLElement, AliasProps>(function DataPoint(props, ref) {
  return <Typography ref={ref} variant="datapoint" {...props} />;
});

export const Label = forwardRef<HTMLElement, AliasProps>(function Label(props, ref) {
  return <Typography ref={ref} variant="label" {...props} />;
});

export const Body = forwardRef<HTMLElement, AliasProps>(function Body(props, ref) {
  return <Typography ref={ref} variant="body" {...props} />;
});
