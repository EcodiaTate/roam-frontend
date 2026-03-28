// src/components/ui/PageShell.tsx
//
// Top-level layout primitive for all app pages.
//  - Global header with page title + optional actions
//  - "OFFLINE MODE" banner when device is offline
//  - Hierarchical content layout via <CriticalData> / <ContentSection>

import { type CSSProperties, type ReactNode, memo } from "react";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";

/* ────────────────────────────────────────────────────────────────────
   OfflineBanner — shown when network is unavailable
   ──────────────────────────────────────────────────────────────────── */

const bannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "8px 16px",
  background: "var(--brand-amber)",
  color: "var(--terra-charcoal)",
  fontFamily: 'var(--ff-display)',
  fontWeight: 700,
  fontSize: "var(--font-xxs)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  lineHeight: 1,
  textAlign: "center",
};

const bannerDot: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--roam-text)",
  opacity: 0.6,
  animation: "offlinePulse 2s ease-in-out infinite",
};

const OfflineBanner = memo(function OfflineBanner() {
  return (
    <div role="status" aria-live="polite" style={bannerStyle}>
      <span style={bannerDot} aria-hidden="true" />
      <span>Offline Mode</span>
    </div>
  );
});

/* ────────────────────────────────────────────────────────────────────
   PageHeader — title bar with optional trailing actions
   ──────────────────────────────────────────────────────────────────── */

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--space-lg) var(--space-lg) var(--space-sm)",
  minHeight: 48,
};

const titleStyle: CSSProperties = {
  fontFamily: 'var(--ff-display)',
  fontWeight: 700,
  fontSize: "var(--font-h1)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  lineHeight: 1.15,
  color: "var(--roam-text)",
  margin: 0,
};

/* ────────────────────────────────────────────────────────────────────
   CriticalData — large, prominent data display
   Prioritises speed / range / heading through size and weight.
   ──────────────────────────────────────────────────────────────────── */

export type CriticalDataProps = {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
};

const criticalStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "center",
  gap: "var(--space-xl)",
  padding: "var(--space-lg) var(--space-lg) var(--space-md)",
};

export const CriticalData = memo(function CriticalData({ children, style, className }: CriticalDataProps) {
  return (
    <div className={className} style={{ ...criticalStyle, ...style }} role="region" aria-label="Key metrics">
      {children}
    </div>
  );
});

/* ────────────────────────────────────────────────────────────────────
   CriticalMetric — single metric cell inside CriticalData
   ──────────────────────────────────────────────────────────────────── */

export type CriticalMetricProps = {
  /** The numeric value */
  value: string | number;
  /** Unit or description label (e.g. "km/h", "km", "°") */
  unit: string;
  /** Optional colour override for the value */
  color?: string;
  /** Scale: "xl" for primary metric, "lg" for secondary. Default "xl" */
  scale?: "xl" | "lg";
  style?: CSSProperties;
};

export const CriticalMetric = memo(function CriticalMetric({
  value,
  unit,
  color,
  scale = "xl",
  style,
}: CriticalMetricProps) {
  const isXl = scale === "xl";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--ff-display)',
          fontWeight: 700,
          fontSize: isXl ? "var(--font-display-lg)" : "var(--font-display-sm)",
          lineHeight: 1,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          color: color ?? "var(--roam-text)",
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: 'var(--ff-display)',
          fontWeight: 600,
          fontSize: "var(--font-xxs)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          lineHeight: 1,
          color: "var(--roam-text-muted)",
        }}
      >
        {unit}
      </span>
    </div>
  );
});

/* ────────────────────────────────────────────────────────────────────
   ContentSection — grouped content area below critical data
   ──────────────────────────────────────────────────────────────────── */

export type ContentSectionProps = {
  /** Optional section heading */
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
};

const sectionStyle: CSSProperties = {
  padding: "0 var(--space-lg) var(--space-lg)",
};

const sectionTitleStyle: CSSProperties = {
  fontFamily: 'var(--ff-display)',
  fontWeight: 700,
  fontSize: "var(--font-sm)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--roam-text-muted)",
  margin: 0,
  marginBottom: "var(--space-sm)",
};

export const ContentSection = memo(function ContentSection({
  title,
  children,
  style,
  className,
}: ContentSectionProps) {
  return (
    <section className={className} style={{ ...sectionStyle, ...style }}>
      {title && <h3 style={sectionTitleStyle}>{title}</h3>}
      {children}
    </section>
  );
});

/* ────────────────────────────────────────────────────────────────────
   PageShell — the main layout wrapper
   ──────────────────────────────────────────────────────────────────── */

export type PageShellProps = {
  /** Page title displayed in the header */
  title?: string;
  /** Trailing header actions (e.g. settings icon) */
  headerActions?: ReactNode;
  /** Content */
  children: ReactNode;
  /** Extra styles on the scroll container */
  style?: CSSProperties;
  className?: string;
};

const shellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  width: "100%",
  overflow: "hidden",
  background: "var(--roam-bg)",
};

const scrollStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
};

export const PageShell = memo(function PageShell({
  title,
  headerActions,
  children,
  style,
  className,
}: PageShellProps) {
  const { online } = useNetworkStatus();

  return (
    <div className={className} style={shellStyle}>
      {/* Offline banner — sits above header, pushes content down */}
      {!online && <OfflineBanner />}

      {/* Global page header */}
      {title && (
        <header style={headerStyle}>
          <h1 style={titleStyle}>{title}</h1>
          {headerActions && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
              {headerActions}
            </div>
          )}
        </header>
      )}

      {/* Scrollable content area */}
      <div style={{ ...scrollStyle, ...style }}>
        {children}
      </div>
    </div>
  );
});

export default PageShell;
