// src/components/ui/cardStyles.ts
//
// Shared card and typography styles used across RouteScoreCard, FuelSummaryCard,
// NavigationHUD, and other info cards.

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
