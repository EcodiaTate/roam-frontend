// src/components/ui/RoutePreview.tsx
// Static SVG route preview — lightweight alternative to full MapLibre
// for card thumbnails and list items. Normalizes lat/lng points into
// an 800×400 viewBox with dashed route path, start/end markers, and
// optional current-position pulse.

import { useMemo } from "react";

/* ── Types ────────────────────────────────────────────────────── */

interface RoutePreviewProps {
  /** Route points as [lat, lng] tuples */
  points: [number, number][];
  /** Index of the current position along the route (optional) */
  currentIndex?: number;
  /** Container height in px (default 200) */
  height?: number;
  /** Additional className on the outer div */
  className?: string;
}

/* ── Helpers ───────────────────────────────────────────────────── */

const VB_W = 800;
const VB_H = 400;
const PAD = 40; // px padding inside the viewBox

/** Downsample to at most `max` points using Ramer-Douglas-Peucker-like stride. */
function simplify(pts: [number, number][], max: number): [number, number][] {
  if (pts.length <= max) return pts;
  // Always keep first and last; evenly stride the rest
  const step = (pts.length - 1) / (max - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) {
    out.push(pts[Math.round(i * step)]);
  }
  return out;
}

/** Normalize [lat, lng] points into viewBox pixel coords. */
function normalize(pts: [number, number][]): { x: number; y: number }[] {
  if (pts.length === 0) return [];
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of pts) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const dLat = maxLat - minLat || 1;
  const dLng = maxLng - minLng || 1;
  const w = VB_W - PAD * 2;
  const h = VB_H - PAD * 2;
  // Scale uniformly so the route isn't stretched
  const scale = Math.min(w / dLng, h / dLat);
  const offX = PAD + (w - dLng * scale) / 2;
  const offY = PAD + (h - dLat * scale) / 2;
  return pts.map(([lat, lng]) => ({
    x: offX + (lng - minLng) * scale,
    // Flip Y — higher lat = higher on screen
    y: offY + (maxLat - lat) * scale,
  }));
}

/* ── Component ─────────────────────────────────────────────────── */

export function RoutePreview({
  points: rawPoints,
  currentIndex,
  height = 200,
  className = "",
}: RoutePreviewProps) {
  const { path, pixels, currentPx } = useMemo(() => {
    const simplified = simplify(rawPoints, 20);
    const px = normalize(simplified);
    if (px.length === 0) return { path: "", pixels: px, currentPx: null };

    const d = px.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    // Map currentIndex from raw → simplified space
    let cur: { x: number; y: number } | null = null;
    if (currentIndex != null && currentIndex >= 0 && currentIndex < rawPoints.length && px.length > 0) {
      const ratio = rawPoints.length <= 1 ? 0 : currentIndex / (rawPoints.length - 1);
      const si = Math.round(ratio * (px.length - 1));
      cur = px[si] ?? null;
    }

    return { path: d, pixels: px, currentPx: cur };
  }, [rawPoints, currentIndex]);

  if (pixels.length < 2) return null;

  const first = pixels[0];
  const last = pixels[pixels.length - 1];

  return (
    <div
      className={`terra-grid ${className}`}
      style={{
        position: "relative",
        height,
        overflow: "hidden",
        borderRadius: "var(--r-card)",
      }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        {/* Route path */}
        <path
          d={path}
          fill="none"
          stroke="var(--roam-accent)"
          strokeWidth={2}
          strokeDasharray="8,8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.3}
        />

        {/* Start marker */}
        <circle cx={first.x} cy={first.y} r={4} fill="var(--roam-text-muted)" opacity={0.4} />

        {/* End marker (diamond) */}
        <polygon
          points={`${last.x},${last.y - 5} ${last.x + 5},${last.y} ${last.x},${last.y + 5} ${last.x - 5},${last.y}`}
          fill="var(--roam-accent)"
          opacity={0.6}
        />

        {/* Current position pulse */}
        {currentPx && (
          <>
            <circle
              cx={currentPx.x}
              cy={currentPx.y}
              r={10}
              fill="var(--roam-accent)"
              opacity={0.15}
              className="terra-route-pulse"
            />
            <circle
              cx={currentPx.x}
              cy={currentPx.y}
              r={6}
              fill="var(--roam-accent)"
            />
          </>
        )}
      </svg>
    </div>
  );
}
