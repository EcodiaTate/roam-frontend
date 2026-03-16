// src/components/trip/NearbyRoamersIndicator.tsx
"use client";

/**
 * NearbyRoamersIndicator
 *
 * Small pill overlay on the trip map showing how many roamers
 * are predicted to be nearby. Tapping expands details.
 */

import { useState } from "react";
import type { NearbyRoamer } from "@/lib/types/peer";

type Props = {
  roamers: NearbyRoamer[];
};

function cardinalDir(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function confidenceColor(c: string): string {
  if (c === "high") return "var(--brand-eucalypt)";
  if (c === "medium") return "var(--brand-amber)";
  return "var(--text-muted)";
}

export function NearbyRoamersIndicator({ roamers }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (roamers.length === 0) return null;

  return (
    <div style={styles.wrapper}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={styles.pill}
        aria-label={`${roamers.length} roamer${roamers.length > 1 ? "s" : ""} nearby`}
      >
        <span style={styles.dot} />
        <span style={styles.pillText}>
          {roamers.length} roamer{roamers.length > 1 ? "s" : ""} nearby
        </span>
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
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: "absolute",
    top: "calc(env(safe-area-inset-top, 0px) + 60px)",
    right: "12px",
    zIndex: 20,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "4px",
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    borderRadius: "var(--r-pill)",
    background: "var(--surface-card)",
    border: "1.5px solid var(--brand-eucalypt)",
    boxShadow: "var(--shadow-medium)",
    cursor: "pointer",
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "var(--brand-eucalypt)",
    animation: "pulse 2s ease-in-out infinite",
  },
  pillText: {
    fontSize: "var(--font-xs)",
    fontWeight: 700,
    color: "var(--text-main)",
  },
  dropdown: {
    background: "var(--surface-card)",
    borderRadius: "var(--r-btn)",
    boxShadow: "var(--shadow-heavy)",
    padding: "8px",
    minWidth: "220px",
  },
  roamerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 8px",
    borderBottom: "1px solid var(--roam-border)",
  },
  roamerInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  distText: {
    fontSize: "var(--font-sm)",
    fontWeight: 700,
    color: "var(--text-main)",
  },
  dirText: {
    fontSize: "var(--font-xxs)",
    color: "var(--text-muted)",
  },
  confidenceDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  hint: {
    fontSize: "var(--font-xxs)",
    color: "var(--text-muted)",
    textAlign: "center" as const,
    marginTop: "6px",
    padding: "4px 0",
  },
};
