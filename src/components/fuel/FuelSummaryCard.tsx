// src/components/fuel/FuelSummaryCard.tsx
"use client";

import { Fuel, AlertTriangle, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { haptic } from "@/lib/native/haptics";

import type { FuelAnalysis } from "@/lib/types/fuel";
import { cardBase, cardTitle, cardSubtitle, pillBase, btnReset } from "@/components/ui/cardStyles";
import { severityColor, legColor } from "@/lib/ui/colorHelpers";
import { useToggle } from "@/lib/hooks/useToggle";

/* ── Styles ────────────────────────────────────────────────────────────── */

const settingsBtn: React.CSSProperties = {
  ...btnReset,
  color: "var(--roam-text-muted)",
  fontSize: 0,
  fontWeight: 700,
  transition: "color 0.2s",
};

const warningBox: React.CSSProperties = {
  marginTop: 8,
  padding: "8px 10px",
  borderRadius: 10,
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
};

const warningText: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  lineHeight: "1.35",
};

const expandBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: "4px 0 0",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11,
  fontWeight: 700,
  color: "var(--roam-text-muted)",
  cursor: "pointer",
};

const fuelStripBar: React.CSSProperties = {
  display: "flex",
  height: 6,
  borderRadius: 3,
  overflow: "hidden",
  background: "rgba(0,0,0,0.1)",
};

const stationDot: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: "50%",
  border: "1.5px solid var(--roam-surface)",
  position: "absolute" as const,
  top: 0.5,
  transform: "translateX(-2.5px)",
  background: "var(--roam-text)",
};

/* ── Color helpers ────────────────────────────────────────────────────── */

function rangeStatusColor(analysis: FuelAnalysis): string {
  if (analysis.has_critical_gaps) return "var(--text-error, #ef4444)";
  if (analysis.warnings.some((w) => w.severity === "warn")) return "#f59e0b";
  return "#22c55e";
}

function rangeStatusLabel(analysis: FuelAnalysis): string {
  if (analysis.has_critical_gaps) return "Critical Gap";
  if (analysis.warnings.some((w) => w.severity === "warn")) return "Tight Margins";
  return "Coverage OK";
}

/* ── Component ────────────────────────────────────────────────────────── */

export function FuelSummaryCard({
  analysis,
  onOpenSettings,
}: {
  analysis: FuelAnalysis | null;
  onOpenSettings?: () => void;
}) {
  const [expanded, toggleExpanded] = useToggle();

  if (!analysis) return null;

  const { stations, legs, warnings, max_gap_km, has_critical_gaps, profile } = analysis;
  const statusColor = rangeStatusColor(analysis);
  const statusLabel = rangeStatusLabel(analysis);

  // Find the worst gap for display
  const worstGap = legs.reduce<{ from: string; to: string; km: number } | null>((best, leg) => {
    if (!best || leg.distance_km > best.km) {
      return {
        from: leg.from_station?.name ?? "Start",
        to: leg.to_station?.name ?? "End",
        km: leg.distance_km,
      };
    }
    return best;
  }, null);

  // Top warnings (critical + warn only)
  const topWarnings = warnings.filter((w) => w.severity === "critical" || w.severity === "warn");

  // Total route km from legs
  const totalKm = legs.reduce((sum, l) => sum + l.distance_km, 0);

  return (
    <div style={cardBase} role="region" aria-label={`Fuel coverage: ${statusLabel}, ${stations.length} stations on route, range ${profile.tank_range_km}km`}>
      {/* ── Row 1: 2-column header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Left: icon + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ background: `${statusColor}12`, padding: 6, borderRadius: 8, flexShrink: 0 }}>
            <Fuel size={14} strokeWidth={2.2} style={{ color: statusColor, display: "block" }} aria-hidden="true" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...cardTitle, fontSize: 13 }}>Fuel Coverage</div>
            <div style={{ ...cardSubtitle, fontSize: 11 }}>
              {stations.length} station{stations.length !== 1 ? "s" : ""} on route
            </div>
          </div>
        </div>

        {/* Right: pills + settings */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <span style={{ ...pillBase, background: `${statusColor}15`, color: statusColor, fontSize: 10, padding: "2px 7px" }}>
            {statusLabel}
          </span>
          <span style={{ ...pillBase, background: "rgba(0,0,0,0.06)", color: "var(--roam-text)", fontSize: 10, padding: "2px 7px" }}>
            {profile.tank_range_km}km
          </span>
          {profile.fuel_type !== "unleaded" && (
            <span style={{ ...pillBase, background: "rgba(0,0,0,0.06)", color: "var(--roam-text)", fontSize: 10, padding: "2px 7px" }}>
              {profile.fuel_type.toUpperCase()}
            </span>
          )}
          {onOpenSettings && (
            <button
              type="button"
              className="trip-interactive"
              style={{ ...settingsBtn, marginLeft: 2 }}
              onClick={(e) => { e.stopPropagation(); haptic.selection(); onOpenSettings(); }}
              aria-label="Edit Vehicle"
            >
              <Settings2 size={14} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      {/* ── Row 2: fuel strip (compact) ── */}
      {legs.length > 0 && totalKm > 0 && (
        <div style={{ marginTop: 10, marginBottom: 2 }}>
          <div style={{ position: "relative" as const }}>
            <div style={fuelStripBar}>
              {legs.map((leg, i) => (
                <div
                  key={i}
                  style={{
                    flex: leg.distance_km / totalKm,
                    background: legColor(leg),
                    opacity: 0.85,
                    minWidth: 2,
                    borderRight: i < legs.length - 1 ? "1px solid rgba(255,255,255,0.4)" : undefined,
                  }}
                />
              ))}
            </div>
            {stations.map((st) => {
              const pct = totalKm > 0 ? (st.km_along_route / totalKm) * 100 : 0;
              return (
                <div
                  key={st.place_id}
                  style={{ ...stationDot, left: `${pct}%` }}
                  title={st.name}
                />
              );
            })}
          </div>
          {worstGap && max_gap_km > profile.reserve_warn_km && (
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--roam-text-muted)", marginTop: 4, textAlign: "center" as const }}>
              Longest gap: {Math.round(worstGap.km)}km ({worstGap.from} → {worstGap.to})
            </div>
          )}
        </div>
      )}

      {/* ── Warnings (compact) ── */}
      {topWarnings.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {topWarnings.slice(0, expanded ? undefined : 1).map((w, i) => {
            const clr = severityColor(w.severity);
            return (
              <div key={i} style={{ ...warningBox, background: clr.bg }}>
                <AlertTriangle size={12} strokeWidth={2.2} style={{ color: clr.icon, flexShrink: 0, marginTop: 1 }} />
                <div style={{ ...warningText, color: clr.text }}>{w.message}</div>
              </div>
            );
          })}

          {topWarnings.length > 1 && (
            <div style={{ textAlign: "center" }}>
              <button type="button" style={expandBtn} onClick={toggleExpanded}>
                {expanded ? "Show Less" : `View ${topWarnings.length - 1} More`}
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Critical gap recommendation */}
      {has_critical_gaps && worstGap && expanded && (
        <div style={{
          marginTop: 8,
          padding: "8px 10px",
          borderRadius: 10,
          background: "var(--bg-error, rgba(239,68,68,0.1))",
          border: "1px dashed var(--text-error, #ef4444)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "var(--text-error, #ef4444)", marginBottom: 2 }}>
            Recommendation
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--roam-text)", lineHeight: "1.35" }}>
            Fill up and carry a 20L jerry can from {worstGap.from}. The {Math.round(worstGap.km)}km gap
            {worstGap.km > profile.tank_range_km
              ? ` exceeds your ${profile.tank_range_km}km range.`
              : ` leaves only ${Math.round(profile.tank_range_km - worstGap.km)}km margin.`}
          </div>
        </div>
      )}
    </div>
  );
}
