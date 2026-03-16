// src/components/ui/cardStyles.ts
//
// Shared card, typography, and common style primitives.
// Used across RouteScoreCard, FuelSummaryCard, NavigationHUD, and other info cards.

/** Standard info card container */
export const cardBase: React.CSSProperties = {
  background: "var(--roam-surface-hover)",
  borderRadius: "var(--r-card, 14px)",
  padding: "14px",
  marginBottom: 0,
  border: "none",
};

/** Row with icon + text header */
export const cardHeaderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
};

/** Card title text */
export const cardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "var(--roam-text)",
  letterSpacing: "-0.1px",
};

/** Card subtitle text */
export const cardSubtitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--roam-text-muted)",
  marginTop: 1,
};

/** Icon container — small (28×28), used in category cells and stat rows */
export const iconBox28: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

/** Icon container — medium (36×36), used in list rows */
export const iconBox36: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  background: "var(--roam-surface-hover)",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

/** Icon container — large (40×40), used in card headers */
export const iconBox40: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

/** Pill/badge base — combine with color overrides */
export const pillBase: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 10px",
  borderRadius: 8,
  whiteSpace: "nowrap",
};

/** Text truncation */
export const textTruncate: React.CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

/** Ghost/icon button reset */
export const btnReset: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  padding: "6px",
  borderRadius: 8,
  flexShrink: 0,
};
