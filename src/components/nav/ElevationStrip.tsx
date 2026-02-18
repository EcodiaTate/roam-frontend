// src/components/nav/ElevationStrip.tsx
"use client";

import { useMemo } from "react";
import type { ElevationProfile, GradeSegment } from "@/lib/types/navigation";
import { formatDistance } from "@/lib/nav/instructions";

type Props = {
  profile: ElevationProfile;
  gradeSegments?: GradeSegment[];
  /** Current km along route (for position marker during active nav) */
  currentKm?: number | null;
  /** Compact mode for inline display */
  compact?: boolean;
};

/* ── Grade → colour mapping ──────────────────────────────────────── */

function gradeColor(gradePct: number): string {
  const abs = Math.abs(gradePct);
  if (abs < 2)  return "#4ade80"; // flat — green
  if (abs < 5)  return "#fbbf24"; // moderate — amber
  return "#ef4444";               // steep — red
}

/* ── Component ───────────────────────────────────────────────────── */

export function ElevationStrip({ profile, gradeSegments, currentKm, compact }: Props) {
  const samples = profile.samples;
  if (!samples || samples.length < 2) return null;

  const totalKm = samples[samples.length - 1].km_along;
  const height = compact ? 40 : 56;
  const width = 100; // percentage-based, rendered in SVG viewBox

  // Build SVG path for the elevation sparkline
  const { path, minElev, maxElev } = useMemo(() => {
    const elevs = samples.map((s) => s.elevation_m);
    const min = Math.min(...elevs);
    const max = Math.max(...elevs);
    const range = max - min || 1;
    const pad = 4; // px padding top/bottom

    const points = samples.map((s) => {
      const x = totalKm > 0 ? (s.km_along / totalKm) * width : 0;
      const y = height - pad - ((s.elevation_m - min) / range) * (height - pad * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    // Closed path for fill (goes to bottom-right, bottom-left, then back to start)
    const fillPath =
      `M${points[0]} ` +
      points.slice(1).map((p) => `L${p}`).join(" ") +
      ` L${width},${height} L0,${height} Z`;

    return { path: fillPath, minElev: min, maxElev: max };
  }, [samples, totalKm, height]);

  // Grade-colored segments for the fill
  const gradeFills = useMemo(() => {
    if (!gradeSegments || gradeSegments.length === 0) return null;

    return gradeSegments.map((seg) => {
      const x1 = totalKm > 0 ? (seg.from_km / totalKm) * width : 0;
      const x2 = totalKm > 0 ? (seg.to_km / totalKm) * width : 0;
      return {
        x: x1,
        width: x2 - x1,
        color: gradeColor(seg.avg_grade_pct),
        opacity: Math.abs(seg.avg_grade_pct) > 5 ? 0.35 : 0.2,
      };
    });
  }, [gradeSegments, totalKm]);

  // Current position marker
  const posX = currentKm != null && totalKm > 0
    ? (currentKm / totalKm) * width
    : null;

  return (
    <div
      style={{
        width: "100%",
        position: "relative",
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--roam-surface-hover)",
      }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
      >
        {/* Grade-colored background strips */}
        {gradeFills?.map((seg, i) => (
          <rect
            key={i}
            x={seg.x}
            y={0}
            width={Math.max(seg.width, 0.3)}
            height={height}
            fill={seg.color}
            opacity={seg.opacity}
          />
        ))}

        {/* Elevation fill — semi-transparent */}
        <path
          d={path}
          fill="rgba(74,108,83,0.25)"
          stroke="none"
        />

        {/* Elevation line — crisp outline */}
        <path
          d={path.replace(/ L\d+[\d.]*,\d+[\d.]* L0,\d+[\d.]* Z/, "")} // strip the close path
          fill="none"
          stroke="rgba(74,108,83,0.7)"
          strokeWidth={0.8}
          vectorEffect="non-scaling-stroke"
        />

        {/* Current position marker */}
        {posX != null && (
          <>
            <line
              x1={posX}
              y1={0}
              x2={posX}
              y2={height}
              stroke="white"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
              opacity={0.8}
            />
            <circle
              cx={posX}
              cy={(() => {
                // Find elevation at current position
                const range = maxElev - minElev || 1;
                const pad = 4;
                let elev = minElev;
                for (let i = 1; i < samples.length; i++) {
                  if (samples[i].km_along >= (currentKm ?? 0)) {
                    const prev = samples[i - 1];
                    const curr = samples[i];
                    const frac =
                      curr.km_along - prev.km_along > 0
                        ? ((currentKm ?? 0) - prev.km_along) / (curr.km_along - prev.km_along)
                        : 0;
                    elev = prev.elevation_m + (curr.elevation_m - prev.elevation_m) * frac;
                    break;
                  }
                }
                return height - pad - ((elev - minElev) / range) * (height - pad * 2);
              })()}
              r={2.5}
              fill="white"
              stroke="rgba(74,108,83,0.9)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {/* Stats overlay */}
      {!compact && (
        <div
          style={{
            position: "absolute",
            bottom: 4,
            left: 8,
            right: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--roam-text-muted)" }}>
            {formatDistance(totalKm * 1000)}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#4ade80" }}>
              ↑ {Math.round(profile.total_ascent_m)}m
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#f87171" }}>
              ↓ {Math.round(profile.total_descent_m)}m
            </span>
          </div>
        </div>
      )}
    </div>
  );
}