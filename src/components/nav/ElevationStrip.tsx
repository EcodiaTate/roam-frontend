// src/components/nav/ElevationStrip.tsx
"use client";

import { memo, useMemo, useCallback, useRef, useState, useEffect } from "react";
import type { ElevationProfile, GradeSegment, ElevationSample } from "@/lib/types/navigation";
import { formatDistance } from "@/lib/nav/instructions";
import { ChevronDown, ChevronUp, Mountain } from "lucide-react";

/* ── Types ────────────────────────────────────────────────────────── */

type Props = {
  profile: ElevationProfile;
  gradeSegments?: GradeSegment[];
  /** Current km along route (position marker during active nav) */
  currentKm?: number | null;
  /** Visible km range from the map viewport [startKm, endKm] */
  viewportKmRange?: [number, number] | null;
  /** Called when user taps a point on the chart — receives {lat, lng} to fly to */
  onTapLocation?: (loc: { lat: number; lng: number; km: number }) => void;
  /** Collapsed state (externally controlled) */
  collapsed?: boolean;
  /** Toggle collapsed */
  onToggleCollapse?: () => void;
};

/* ── Grade → colour ───────────────────────────────────────────────── */

function gradeColor(gradePct: number): string {
  const abs = Math.abs(gradePct);
  if (abs < 2) return "#4ade80"; // flat - green
  if (abs < 5) return "#fbbf24"; // moderate - amber
  return "#ef4444";              // steep - red
}

/* ── Helpers ───────────────────────────────────────────────────────── */

/** Interpolate elevation at a given km along the samples */
function elevAtKm(samples: ElevationSample[], km: number): number {
  if (km <= samples[0].km_along) return samples[0].elevation_m;
  if (km >= samples[samples.length - 1].km_along) return samples[samples.length - 1].elevation_m;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].km_along >= km) {
      const prev = samples[i - 1];
      const curr = samples[i];
      const span = curr.km_along - prev.km_along;
      const frac = span > 0 ? (km - prev.km_along) / span : 0;
      return prev.elevation_m + (curr.elevation_m - prev.elevation_m) * frac;
    }
  }
  return samples[samples.length - 1].elevation_m;
}

/** Find lat/lng at a given km by interpolating between samples */
function locAtKm(samples: ElevationSample[], km: number): { lat: number; lng: number } {
  if (km <= samples[0].km_along) return { lat: samples[0].lat, lng: samples[0].lng };
  if (km >= samples[samples.length - 1].km_along) {
    const last = samples[samples.length - 1];
    return { lat: last.lat, lng: last.lng };
  }
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].km_along >= km) {
      const prev = samples[i - 1];
      const curr = samples[i];
      const span = curr.km_along - prev.km_along;
      const frac = span > 0 ? (km - prev.km_along) / span : 0;
      return {
        lat: prev.lat + (curr.lat - prev.lat) * frac,
        lng: prev.lng + (curr.lng - prev.lng) * frac,
      };
    }
  }
  const last = samples[samples.length - 1];
  return { lat: last.lat, lng: last.lng };
}

/* ── Constants ─────────────────────────────────────────────────────── */

const CHART_H = 64;
const CHART_PAD = 6;
const VB_W = 1000; // SVG viewBox width for precision

/* ── Component ─────────────────────────────────────────────────────── */

export const ElevationStrip = memo(function ElevationStrip({
  profile,
  gradeSegments,
  currentKm,
  viewportKmRange,
  onTapLocation,
  collapsed,
  onToggleCollapse,
}: Props) {
  const samples = profile.samples;
  const totalKm = samples?.length >= 2 ? samples[samples.length - 1].km_along : 0;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverKm, setHoverKm] = useState<number | null>(null);

  // Build SVG path data
  const { fillPath, linePath, minElev, maxElev } = useMemo(() => {
    if (!samples || samples.length < 2) return { fillPath: "", linePath: "", minElev: 0, maxElev: 0 };
    const elevs = samples.map((s) => s.elevation_m);
    const min = Math.min(...elevs);
    const max = Math.max(...elevs);
    const range = max - min || 1;

    const points = samples.map((s) => {
      const x = totalKm > 0 ? (s.km_along / totalKm) * VB_W : 0;
      const y = CHART_H - CHART_PAD - ((s.elevation_m - min) / range) * (CHART_H - CHART_PAD * 2);
      return { x, y };
    });

    const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const fillD = lineD + ` L${VB_W},${CHART_H} L0,${CHART_H} Z`;

    return { fillPath: fillD, linePath: lineD, minElev: min, maxElev: max };
  }, [samples, totalKm]);

  // Grade-colored segments
  const gradeFills = useMemo(() => {
    if (!gradeSegments || gradeSegments.length === 0) return null;
    return gradeSegments.map((seg) => {
      const x1 = totalKm > 0 ? (seg.from_km / totalKm) * VB_W : 0;
      const x2 = totalKm > 0 ? (seg.to_km / totalKm) * VB_W : 0;
      return {
        x: x1,
        width: x2 - x1,
        color: gradeColor(seg.avg_grade_pct),
        opacity: Math.abs(seg.avg_grade_pct) > 5 ? 0.25 : 0.12,
      };
    });
  }, [gradeSegments, totalKm]);

  // Viewport highlight range in SVG coords
  const vpHighlight = useMemo(() => {
    if (!viewportKmRange || totalKm <= 0) return null;
    const [startKm, endKm] = viewportKmRange;
    const x1 = Math.max(0, (startKm / totalKm) * VB_W);
    const x2 = Math.min(VB_W, (endKm / totalKm) * VB_W);
    if (x2 - x1 < 1) return null;
    return { x: x1, width: x2 - x1 };
  }, [viewportKmRange, totalKm]);

  // Current position X in SVG coords
  const posX = currentKm != null && totalKm > 0
    ? (currentKm / totalKm) * VB_W
    : null;

  // Hover/tap handling — convert pointer X to km, then call onTapLocation
  const kmFromPointerEvent = useCallback((e: React.PointerEvent | React.MouseEvent): number | null => {
    const svg = svgRef.current;
    if (!svg || !samples || samples.length < 2 || totalKm <= 0) return null;
    const rect = svg.getBoundingClientRect();
    const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return xRatio * totalKm;
  }, [samples, totalKm]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const km = kmFromPointerEvent(e);
    setHoverKm(km);
  }, [kmFromPointerEvent]);

  const handlePointerLeave = useCallback(() => {
    setHoverKm(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onTapLocation || !samples || samples.length < 2) return;
    const km = kmFromPointerEvent(e);
    if (km == null) return;
    const loc = locAtKm(samples, km);
    onTapLocation({ lat: loc.lat, lng: loc.lng, km });
  }, [onTapLocation, samples, kmFromPointerEvent]);

  // Hover tooltip data
  const hoverData = useMemo(() => {
    if (hoverKm == null || !samples || samples.length < 2) return null;
    const elev = elevAtKm(samples, hoverKm);
    const x = totalKm > 0 ? (hoverKm / totalKm) * VB_W : 0;
    const range = maxElev - minElev || 1;
    const y = CHART_H - CHART_PAD - ((elev - minElev) / range) * (CHART_H - CHART_PAD * 2);
    return { x, y, elev, km: hoverKm };
  }, [hoverKm, samples, totalKm, minElev, maxElev]);

  // Position marker Y (for currentKm)
  const posY = useMemo(() => {
    if (posX == null || !samples || samples.length < 2) return null;
    const elev = elevAtKm(samples, currentKm!);
    const range = maxElev - minElev || 1;
    return CHART_H - CHART_PAD - ((elev - minElev) / range) * (CHART_H - CHART_PAD * 2);
  }, [posX, samples, currentKm, minElev, maxElev]);

  if (!samples || samples.length < 2) return null;

  const isCollapsed = collapsed ?? false;

  return (
    <div
      className="elev-strip"
      style={{
        background: "rgba(15, 15, 15, 0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
        transition: "height 0.25s cubic-bezier(0.4,0,0.2,1)",
        height: isCollapsed ? 36 : CHART_H + 36,
        willChange: "height",
      }}
    >
      {/* ── Header bar (always visible) ── */}
      <button
        type="button"
        onClick={onToggleCollapse}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          height: 44,
          padding: "0 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "rgba(239,233,224,0.8)",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Mountain size={16} strokeWidth={2.2} style={{ opacity: 0.6 }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.03em" }}>
            ELEVATION
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(239,233,224,0.45)" }}>
            {Math.round(minElev)}m – {Math.round(maxElev)}m
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#4ade80" }}>
            ↑{Math.round(profile.total_ascent_m)}m
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>
            ↓{Math.round(profile.total_descent_m)}m
          </span>
          {isCollapsed
            ? <ChevronUp size={16} strokeWidth={2.5} style={{ opacity: 0.5 }} />
            : <ChevronDown size={16} strokeWidth={2.5} style={{ opacity: 0.5 }} />}
        </div>
      </button>

      {/* ── Chart area ── */}
      <div
        style={{
          height: CHART_H,
          position: "relative",
          cursor: onTapLocation ? "crosshair" : "default",
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${CHART_H}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: CHART_H, display: "block" }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
        >
          {/* Viewport highlight — the visible section of the route */}
          {vpHighlight && (
            <rect
              x={vpHighlight.x}
              y={0}
              width={vpHighlight.width}
              height={CHART_H}
              fill="rgba(77, 184, 240, 0.10)"
              stroke="rgba(77, 184, 240, 0.25)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Grade-colored background strips */}
          {gradeFills?.map((seg, i) => (
            <rect
              key={i}
              x={seg.x}
              y={0}
              width={Math.max(seg.width, 0.5)}
              height={CHART_H}
              fill={seg.color}
              opacity={seg.opacity}
            />
          ))}

          {/* Elevation fill */}
          <path
            d={fillPath}
            fill="rgba(66,177,89,0.15)"
            stroke="none"
          />

          {/* Elevation line */}
          <path
            d={linePath}
            fill="none"
            stroke="rgba(66,177,89,0.55)"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />

          {/* Dimmed regions outside viewport */}
          {vpHighlight && (
            <>
              {vpHighlight.x > 0 && (
                <rect
                  x={0}
                  y={0}
                  width={vpHighlight.x}
                  height={CHART_H}
                  fill="rgba(0,0,0,0.35)"
                />
              )}
              {vpHighlight.x + vpHighlight.width < VB_W && (
                <rect
                  x={vpHighlight.x + vpHighlight.width}
                  y={0}
                  width={VB_W - vpHighlight.x - vpHighlight.width}
                  height={CHART_H}
                  fill="rgba(0,0,0,0.35)"
                />
              )}
            </>
          )}

          {/* Current position marker */}
          {posX != null && posY != null && (
            <>
              <line
                x1={posX}
                y1={0}
                x2={posX}
                y2={CHART_H}
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                strokeDasharray="3,3"
              />
              <circle
                cx={posX}
                cy={posY}
                r={3.5}
                fill="white"
                stroke="rgba(66,177,89,0.9)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {/* Hover crosshair + dot */}
          {hoverData && (
            <>
              <line
                x1={hoverData.x}
                y1={0}
                x2={hoverData.x}
                y2={CHART_H}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={hoverData.x}
                cy={hoverData.y}
                r={3}
                fill="rgba(77,184,240,0.9)"
                stroke="white"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {/* Hover tooltip */}
        {hoverData && (
          <div
            style={{
              position: "absolute",
              top: 4,
              left: `clamp(4px, calc(${(hoverData.x / VB_W) * 100}% - 36px), calc(100% - 76px))`,
              background: "rgba(26,26,26,0.95)",
              borderRadius: 6,
              padding: "3px 7px",
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(239,233,224,0.9)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              border: "1px solid rgba(255,255,255,0.1)",
              zIndex: 2,
            }}
          >
            {Math.round(hoverData.elev)}m · {formatDistance(hoverData.km * 1000)}
          </div>
        )}

        {/* Distance labels at edges */}
        <div
          style={{
            position: "absolute",
            bottom: 2,
            left: 6,
            fontSize: 9,
            fontWeight: 700,
            color: "rgba(239,233,224,0.3)",
            pointerEvents: "none",
          }}
        >
          0
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 2,
            right: 6,
            fontSize: 9,
            fontWeight: 700,
            color: "rgba(239,233,224,0.3)",
            pointerEvents: "none",
          }}
        >
          {formatDistance(totalKm * 1000)}
        </div>
      </div>
    </div>
  );
});
