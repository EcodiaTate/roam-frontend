// src/lib/ui/colorHelpers.ts
//
// Shared colour mapping helpers for score/severity-based UI.
// Centralises the duplicated scoreColor / overallBg / severityColor / legColor
// functions that previously lived in RouteScoreCard and FuelSummaryCard.

// ── Route score colours (0–10 scale) ────────────────────────────────────

/** Solid accent colour for a 0–10 route score. */
export function scoreColor(score: number): string {
  if (score >= 8) return "var(--roam-success)";
  if (score >= 6) return "var(--roam-info)";
  if (score >= 4) return "var(--roam-warn)";
  if (score >= 2) return "var(--severity-moderate)";
  return "var(--roam-danger)";
}

/** 12%-alpha background tint matching scoreColor. */
export function scoreBg(score: number): string {
  if (score >= 8) return "var(--accent-tint)";
  if (score >= 6) return "var(--info-tint)";
  if (score >= 4) return "var(--severity-minor-tint)";
  if (score >= 2) return "var(--severity-moderate-tint)";
  return "var(--danger-tint)";
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
      return { bg: "var(--bg-warn)", text: "var(--text-warn)", icon: "var(--roam-warn)" };
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
  if (leg.gap_exceeds_warn) return "var(--roam-warn)";
  return "var(--roam-success)";
}
