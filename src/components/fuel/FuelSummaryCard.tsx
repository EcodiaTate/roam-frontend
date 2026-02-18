// src/components/fuel/FuelSummaryCard.tsx
"use client";

import { useState, useCallback } from "react";
import { Fuel, AlertTriangle, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { haptic } from "@/lib/native/haptics";

import type { FuelAnalysis, FuelWarning } from "@/lib/types/fuel";

/* ── Styles ────────────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: "var(--roam-surface-hover)",
  borderRadius: "var(--r-card, 16px)",
  padding: "14px 16px",
  marginBottom: 10,
};

const headerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const titleGroup: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const titleText: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "var(--roam-text)",
  letterSpacing: "-0.2px",
};

const subtitleText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--roam-text-muted)",
  marginTop: 4,
};

const statsRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginTop: 10,
  flexWrap: "wrap",
};

const statPill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  padding: "3px 10px",
  borderRadius: 999,
  whiteSpace: "nowrap" as const,
};

const warningBox: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 12,
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
};

const warningText: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  lineHeight: "1.4",
};

const expandBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: "2px 6px",
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 11,
  fontWeight: 800,
  color: "var(--roam-text-muted)",
  cursor: "pointer",
};

const fuelStripContainer: React.CSSProperties = {
  marginTop: 10,
  padding: "6px 0",
};

const fuelStripBar: React.CSSProperties = {
  display: "flex",
  height: 8,
  borderRadius: 4,
  overflow: "hidden",
  background: "rgba(0,0,0,0.15)",
};

const stationDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 3,
  border: "1.5px solid rgba(255,255,255,0.8)",
  position: "absolute" as const,
  top: 1,
  transform: "translateX(-3px)",
};

const settingsBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 6,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: "var(--roam-text-muted)",
  flexShrink: 0,
};

/* ── Color helpers ────────────────────────────────────────────────────── */

function severityColor(severity: string): { bg: string; text: string; icon: string } {
  switch (severity) {
    case "critical":
      return { bg: "rgba(239,68,68,0.12)", text: "#ef4444", icon: "#ef4444" };
    case "warn":
      return { bg: "rgba(245,158,11,0.12)", text: "#d97706", icon: "#f59e0b" };
    default:
      return { bg: "rgba(59,130,246,0.1)", text: "#3b82f6", icon: "#3b82f6" };
  }
}

function legColor(leg: { gap_exceeds_range: boolean; gap_exceeds_warn: boolean }): string {
  if (leg.gap_exceeds_range) return "#ef4444";
  if (leg.gap_exceeds_warn) return "#f59e0b";
  return "#22c55e";
}

function rangeStatusColor(analysis: FuelAnalysis): string {
  if (analysis.has_critical_gaps) return "#ef4444";
  if (analysis.warnings.some((w) => w.severity === "warn")) return "#f59e0b";
  return "#22c55e";
}

function rangeStatusLabel(analysis: FuelAnalysis): string {
  if (analysis.has_critical_gaps) return "FUEL GAP";
  if (analysis.warnings.some((w) => w.severity === "warn")) return "Tight";
  return "Range OK";
}

/* ── Component ────────────────────────────────────────────────────────── */

export function FuelSummaryCard({
  analysis,
  onOpenSettings,
}: {
  analysis: FuelAnalysis | null;
  onOpenSettings?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    haptic.selection();
    setExpanded((v) => !v);
  }, []);

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
    <div style={card}>
      {/* Header */}
      <div style={headerRow}>
        <div style={titleGroup}>
          <Fuel size={16} strokeWidth={2.5} style={{ color: statusColor, flexShrink: 0 }} />
          <div>
            <div style={titleText}>Fuel Coverage</div>
            <div style={subtitleText}>
              {stations.length} station{stations.length !== 1 ? "s" : ""} along route
              {max_gap_km > 0 && ` · Longest gap ${Math.round(max_gap_km)}km`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {onOpenSettings && (
            <button
              type="button"
              style={settingsBtn}
              onClick={(e) => { e.stopPropagation(); haptic.selection(); onOpenSettings(); }}
              aria-label="Fuel settings"
            >
              <Settings2 size={15} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* Status pills */}
      <div style={statsRow}>
        <span style={{
          ...statPill,
          background: `${statusColor}18`,
          color: statusColor,
        }}>
          {statusLabel}
        </span>
        <span style={{
          ...statPill,
          background: "rgba(0,0,0,0.08)",
          color: "var(--roam-text-muted)",
        }}>
          Range {profile.tank_range_km}km
        </span>
        {profile.fuel_type !== "unleaded" && (
          <span style={{
            ...statPill,
            background: "rgba(0,0,0,0.08)",
            color: "var(--roam-text-muted)",
          }}>
            {profile.fuel_type.toUpperCase()}
          </span>
        )}
      </div>

      {/* Fuel strip visualization */}
      {legs.length > 0 && totalKm > 0 && (
        <div style={fuelStripContainer}>
          <div style={{ position: "relative" as const }}>
            <div style={fuelStripBar}>
              {legs.map((leg, i) => (
                <div
                  key={i}
                  style={{
                    flex: leg.distance_km / totalKm,
                    background: legColor(leg),
                    opacity: 0.7,
                    minWidth: 2,
                    borderRight: i < legs.length - 1 ? "1px solid rgba(255,255,255,0.3)" : undefined,
                  }}
                />
              ))}
            </div>
            {/* Station dots overlaid on the strip */}
            {stations.map((st) => {
              const pct = totalKm > 0 ? (st.km_along_route / totalKm) * 100 : 0;
              return (
                <div
                  key={st.place_id}
                  style={{
                    ...stationDot,
                    left: `${pct}%`,
                    background: "#fff",
                  }}
                  title={st.name}
                />
              );
            })}
          </div>
          {worstGap && max_gap_km > profile.reserve_warn_km && (
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--roam-text-muted)", marginTop: 4, textAlign: "center" as const }}>
              {worstGap.from} → {worstGap.to}: {Math.round(worstGap.km)}km
            </div>
          )}
        </div>
      )}

      {/* Top warnings */}
      {topWarnings.length > 0 && (
        <>
          {topWarnings.slice(0, expanded ? undefined : 2).map((w, i) => {
            const clr = severityColor(w.severity);
            return (
              <div key={i} style={{ ...warningBox, background: clr.bg }}>
                <AlertTriangle size={14} strokeWidth={2.5} style={{ color: clr.icon, flexShrink: 0, marginTop: 1 }} />
                <div style={{ ...warningText, color: clr.text }}>{w.message}</div>
              </div>
            );
          })}

          {topWarnings.length > 2 && (
            <button type="button" style={expandBtn} onClick={toggleExpanded}>
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? "Less" : `${topWarnings.length - 2} more`}
            </button>
          )}
        </>
      )}

      {/* Critical gap recommendation */}
      {has_critical_gaps && worstGap && (
        <div style={{
          marginTop: 8,
          padding: "8px 12px",
          borderRadius: 10,
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.15)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#ef4444", marginBottom: 2 }}>
            Recommendation
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--roam-text-muted)", lineHeight: "1.4" }}>
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