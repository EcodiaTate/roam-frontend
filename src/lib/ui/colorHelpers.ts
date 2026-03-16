// src/lib/ui/colorHelpers.ts
//
// Shared colour mapping helpers for score/severity-based UI.
// Centralises the duplicated scoreColor / overallBg / severityColor / legColor
// functions that previously lived in RouteScoreCard and FuelSummaryCard.

// ── Route score colours (0–10 scale) ────────────────────────────────────

/** Solid accent colour for a 0–10 route score. */
export function scoreColor(score: number): string {
  if (score >= 8) return "#22c55e";
  if (score >= 6) return "#3b82f6";
  if (score >= 4) return "#f59e0b";
  if (score >= 2) return "#f97316";
  return "#ef4444";
}

/** 12%-alpha background tint matching scoreColor. */
export function scoreBg(score: number): string {
  if (score >= 8) return "rgba(34,197,94,0.12)";
  if (score >= 6) return "rgba(59,130,246,0.12)";
  if (score >= 4) return "rgba(245,158,11,0.12)";
  if (score >= 2) return "rgba(249,115,22,0.12)";
  return "rgba(239,68,68,0.12)";
}

// ── Fuel warning severity ────────────────────────────────────────────────

/** Background, text and icon colours for a fuel warning severity level. */
export function severityColor(severity: string): { bg: string; text: string; icon: string } {
  switch (severity) {
    case "critical":
      return {
        bg: "var(--bg-error, rgba(239,68,68,0.1))",
        text: "var(--text-error, #ef4444)",
        icon: "var(--text-error, #ef4444)",
      };
    case "warn":
      return { bg: "rgba(245,158,11,0.1)", text: "#b45309", icon: "#f59e0b" };
    default:
      return {
        bg: "var(--roam-surface-hover)",
        text: "var(--roam-text)",
        icon: "var(--roam-info, #3b82f6)",
      };
  }
}

// ── Fuel leg colours ─────────────────────────────────────────────────────

/** Colour for a fuel leg bar segment based on range flags. */
export function legColor(leg: {
  gap_exceeds_range: boolean;
  gap_exceeds_warn: boolean;
}): string {
  if (leg.gap_exceeds_range) return "var(--bg-error, #ef4444)";
  if (leg.gap_exceeds_warn) return "#f59e0b";
  return "#22c55e";
}
