// src/components/trip/NearbyRoamersIndicator.tsx
"use client";

/**
 * NearbyRoamersIndicator
 *
 * Compact dark-glass pill on the trip map showing how many roamers
 * are predicted to be nearby. Tapping expands details.
 * Styled to match the map control buttons (layer toggle, FABs).
 */

import { memo, useState } from "react";
import type { NearbyRoamer } from "@/lib/types/peer";
import { cardinalDir } from "@/lib/nav/geo";
import { haptic } from "@/lib/native/haptics";

type Props = {
  roamers: NearbyRoamer[];
};

function confidenceColor(c: string): string {
  if (c === "high") return "var(--brand-eucalypt)";
  if (c === "medium") return "var(--brand-amber)";
  return "var(--text-muted)";
}

export const NearbyRoamersIndicator = memo(function NearbyRoamersIndicator({ roamers }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (roamers.length === 0) return null;

  return (
    <div style={styles.wrapper}>
      <button
        type="button"
        onClick={() => { haptic.selection(); setExpanded(!expanded); }}
        style={styles.pill}
        aria-label={`${roamers.length} roamer${roamers.length > 1 ? "s" : ""} nearby`}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.95)"; }}
        onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
        onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
      >
        <span style={styles.dot} />
        <span style={styles.pillText}>
          {roamers.length} roamer{roamers.length > 1 ? "s" : ""} nearby
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: 0.5, transition: "transform 0.2s ease", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div style={styles.dropdown}>
          {roamers.map((r) => (
            <div key={r.user_id} style={styles.roamerRow}>
              <div style={styles.roamerInfo}>
                <span style={styles.distText}>~{r.distance_km}km</span>
                <span style={styles.dirText}>
                  heading {cardinalDir(r.heading_deg)} at {Math.round(r.speed_kmh)}km/h
                </span>
              </div>
              <span
                style={{
                  ...styles.confidenceDot,
                  background: confidenceColor(r.confidence),
                }}
                title={`Confidence: ${r.confidence}`}
              />
            </div>
          ))}
          <p style={styles.hint}>
            Pull over nearby to auto-exchange road intel via BLE
          </p>
        </div>
      )}
    </div>
  );
});

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 44,
    padding: "0 14px",
    borderRadius: 14,
    background: "linear-gradient(160deg, rgba(45,110,64,0.92) 0%, rgba(31,82,54,0.96) 100%)",
    border: "1px solid rgba(45,110,64,0.35)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow: "0 4px 16px rgba(45,110,64,0.25), 0 1px 4px rgba(0,0,0,0.2)",
    cursor: "pointer",
    color: "var(--on-color)",
    transition: "transform 0.1s ease, box-shadow 0.2s ease",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.9)",
    boxShadow: "0 0 6px rgba(255,255,255,0.4)",
    animation: "pulse 2s ease-in-out infinite",
    flexShrink: 0,
  },
  pillText: {
    fontSize: 13,
    fontWeight: 700,
    color: "white",
    whiteSpace: "nowrap" as const,
  },
  dropdown: {
    background: "linear-gradient(160deg, rgba(26,21,16,0.97) 0%, rgba(16,13,10,0.99) 100%)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.07)",
    boxShadow: "0 12px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05)",
    padding: 8,
    minWidth: 220,
    marginTop: 4,
    animation: "roam-fadeIn 200ms ease-out, roam-slideUp 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
    transformOrigin: "top right",
  },
  roamerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  roamerInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  distText: {
    fontSize: 13,
    fontWeight: 700,
    color: "white",
  },
  dirText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
  },
  confidenceDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  hint: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center" as const,
    marginTop: 6,
    padding: "4px 0 2px",
  },
};
