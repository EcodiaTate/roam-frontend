// src/components/share/TripShareCard.tsx
"use client";

import { useMemo } from "react";
import { decodePolyline6 } from "@/lib/nav/polyline6";
import type { TripStop } from "@/lib/types/trip";

export const CARD_W = 390;
export const CARD_H = 693;

// Route occupies the full card, stat strip floats at the bottom
const ROUTE_PAD = 80;    // inset so the route never kisses the edge
const STAT_H = 80;            // stat strip height
const STAT_FROM_BOTTOM = 170; // bottom of stats this far from card bottom
const BRAND_GAP = 6;          // gap between stats bottom and branding row

export type ShareCardData = {
  stops: TripStop[];
  geometry: string; // polyline6
  distance_m: number;
  duration_s: number;
  label?: string | null;
};

function fmtKm(m: number) {
  const km = m / 1000;
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}
function fmtDur(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function thinCoords(
  coords: Array<{ lat: number; lng: number }>,
  max = 350,
): Array<{ lat: number; lng: number }> {
  if (coords.length <= max) return coords;
  const step = coords.length / max;
  const out: typeof coords = [];
  for (let i = 0; i < max; i++) out.push(coords[Math.floor(i * step)]);
  out.push(coords[coords.length - 1]);
  return out;
}

/**
 * Project lat/lng → SVG space, fitting within [padX, padY] insets.
 * All coords share the same transform so stops overlay correctly.
 */
function project(
  coords: Array<{ lat: number; lng: number }>,
  padX = ROUTE_PAD,
  padY = ROUTE_PAD,
): { x: number; y: number }[] {
  if (!coords.length) return [];
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const c of coords) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
  }
  const latSpan = maxLat - minLat || 1e-4;
  const lngSpan = maxLng - minLng || 1e-4;

  // Keep bottom zone clear for stats + branding + breathing room
  const usableH = CARD_H - STAT_FROM_BOTTOM - padY - 40;
  const usableW = CARD_W - padX * 2;

  const scale = Math.min(usableW / lngSpan, usableH / latSpan);
  const offX = padX + (usableW - lngSpan * scale) / 2;
  const offY = padY + (usableH - latSpan * scale) / 2;

  return coords.map((c) => ({
    x: offX + (c.lng - minLng) * scale,
    y: offY + (maxLat - c.lat) * scale,
  }));
}

function toPath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

type Props = {
  data: ShareCardData;
  mode?: "card" | "overlay";
  svgRef?: React.RefObject<SVGSVGElement | null>;
  hasMap?: boolean;
  iconDataUrl?: string | null;
};

export function TripShareCard({ data, mode = "card", svgRef, hasMap = false, iconDataUrl }: Props) {
  const { stops, geometry, distance_m, duration_s } = data;
  const isOverlay = mode === "overlay";

  const routeCoords = useMemo(() => (geometry ? thinCoords(decodePolyline6(geometry)) : []), [geometry]);

  // Project route + stops under the same transform
  const combined = useMemo(
    () => routeCoords.concat(stops.map((s) => ({ lat: s.lat, lng: s.lng }))),
    [routeCoords, stops],
  );
  const projected = useMemo(() => project(combined), [combined]);
  const routePts = projected.slice(0, routeCoords.length);
  const stopPts  = projected.slice(routeCoords.length);
  const routePath = useMemo(() => toPath(routePts), [routePts]);

  const poiCount = stops.filter((s) => s.type !== "start" && s.type !== "end").length;
  const stats = [
    { v: fmtKm(distance_m),  l: "km"    },
    { v: fmtDur(duration_s), l: "drive" },
    { v: String(poiCount || stops.length), l: "stops" },
  ];

  const STAT_Y = CARD_H - STAT_FROM_BOTTOM;   // stats fixed position
  const BRAND_Y = STAT_Y + STAT_H + BRAND_GAP; // branding just below stats

  return (
    <svg
      ref={svgRef as React.RefObject<SVGSVGElement>}
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <defs>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&family=Syne:wght@700&display=swap');`}</style>
        <clipPath id="sc-card"><rect width={CARD_W} height={CARD_H} rx="28" /></clipPath>
        <clipPath id="sc-map"><rect width={CARD_W} height={CARD_H - STAT_H} /></clipPath>

        {/* Route glow */}
        <filter id="sc-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        {/* Frosted stat strip background */}
        <filter id="sc-blur" x="0" y="0" width="1" height="1">
          <feGaussianBlur stdDeviation="18" />
        </filter>

        {/* Bottom fade to pull the stat bar out of the photo */}
        <linearGradient id="sc-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#000" stopOpacity="0" />
          <stop offset="60%"  stopColor="#000" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.9" />
        </linearGradient>

        {/* Fallback bg for no-map mode */}
        <linearGradient id="sc-fallback" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%"   stopColor="#0e1f14" />
          <stop offset="100%" stopColor="#060d08" />
        </linearGradient>

        {/* Route gradient */}
        <linearGradient id="sc-route" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#6ee7ff" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>
      </defs>

      <g clipPath="url(#sc-card)">

        {/* ── BACKGROUND: fallback gradient only when no real map exists ── */}
        {!isOverlay && !hasMap && (
          <rect width={CARD_W} height={CARD_H} fill="url(#sc-fallback)" />
        )}

        {/* ── BOTTOM FADE SCRIM ───────────────────────────────────────── */}
        {!isOverlay && (
          <rect y={STAT_Y - 80} width={CARD_W} height={CARD_H - (STAT_Y - 80)} fill="url(#sc-fade)" />
        )}

        {/* ── ROUTE ──────────────────────────────────────────────────── */}
        {routePath && (
          <g clipPath="url(#sc-map)">
            {/* Glow */}
            <path d={routePath} fill="none" stroke="#6ee7ff" strokeWidth="14"
              strokeLinecap="round" strokeLinejoin="round"
              opacity="0.22" filter="url(#sc-glow)" />
            {/* Casing */}
            <path d={routePath} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="7"
              strokeLinecap="round" strokeLinejoin="round" />
            {/* Line */}
            <path d={routePath} fill="none" stroke="url(#sc-route)" strokeWidth="4.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}

        {/* ── STOP MARKERS ───────────────────────────────────────────── */}
        {stopPts.map((pt, i) => {
          const stop = stops[i];
          const isEnd = stop.type === "start" || stop.type === "end";
          const name = (stop.name?.trim() || (stop.type === "start" ? "Start" : stop.type === "end" ? "Finish" : `Stop ${i}`));
          const label = name.length > 18 ? name.slice(0, 17) + "…" : name;

          const cx = Math.max(8, Math.min(CARD_W - 8, pt.x));
          const cy = Math.max(8, Math.min(STAT_Y - 16, pt.y));

          const accent = stop.type === "start" ? "#4ade80" : stop.type === "end" ? "#fb923c" : "#fff";

          // Alternate above / below to avoid overlap
          const above = i % 2 === 0;
          const labelW = Math.max(52, label.length * 6.4 + 20);
          const labelH = 20;
          const lx = Math.max(6, Math.min(CARD_W - labelW - 6, cx - labelW / 2));
          const ly = above ? cy - labelH - 10 : cy + 10;

          return (
            <g key={stop.id ?? i}>
              {/* Dot */}
              <g clipPath="url(#sc-map)">
                {isEnd && <circle cx={cx} cy={cy} r="12" fill={accent} opacity="0.2" />}
                <circle cx={cx} cy={cy} r={isEnd ? 7 : 5} fill="#fff" stroke={accent} strokeWidth="2.5" />
                {isEnd && <circle cx={cx} cy={cy} r="3" fill={accent} />}
              </g>
              {/* Connector */}
              <line
                x1={cx} y1={above ? cy - 8 : cy + 8}
                x2={lx + labelW / 2} y2={above ? ly + labelH : ly}
                stroke="rgba(255,255,255,0.25)" strokeWidth="1"
              />
              {/* Pill */}
              <rect x={lx} y={ly} width={labelW} height={labelH} rx={labelH / 2}
                fill="rgba(0,0,0,0.65)" stroke={accent} strokeWidth="1" />
              <text x={lx + labelW / 2} y={ly + 13.5} textAnchor="middle"
                fontSize="9" fontWeight="600" fill="#fff"
                fontFamily="'Plus Jakarta Sans', sans-serif"
                letterSpacing="0.01em">
                {label}
              </text>
            </g>
          );
        })}

        {/* ── STAT STRIP ─────────────────────────────────────────────── */}
        {!isOverlay && stats.map((s, i) => {
          const colW = CARD_W / 3;
          const cx = colW * i + colW / 2;
          const midY = STAT_Y + STAT_H / 2;
          return (
            <g key={s.l}>
              <text x={cx} y={midY - 4} textAnchor="middle"
                fontSize="28" fontWeight="700" fill="#fff"
                fontFamily="'Plus Jakarta Sans', sans-serif"
                letterSpacing="-0.03em">
                {s.v}
              </text>
              <text x={cx} y={midY + 17} textAnchor="middle"
                fontSize="10" fontWeight="500" fill="rgba(255,255,255,0.45)"
                fontFamily="'Plus Jakarta Sans', sans-serif"
                letterSpacing="0.1em">
                {s.l.toUpperCase()}
              </text>
              {i < stats.length - 1 && (
                <line x1={colW * (i + 1)} y1={STAT_Y + 22} x2={colW * (i + 1)} y2={STAT_Y + STAT_H - 22}
                  stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              )}
            </g>
          );
        })}

        {/* Overlay stats — single pill */}
        {isOverlay && (() => {
          const pillW = 300;
          const pillH = 56;
          const pillX = (CARD_W - pillW) / 2;
          const pillY = CARD_H - STAT_FROM_BOTTOM - pillH;
          const colW = pillW / 3;
          return (
            <g>
              {/* Pill bg */}
              <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={pillH / 2}
                fill="rgba(0,0,0,0.52)" />
              {/* Dividers */}
              {[1, 2].map((d) => (
                <line key={d}
                  x1={pillX + colW * d} y1={pillY + 12}
                  x2={pillX + colW * d} y2={pillY + pillH - 12}
                  stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              ))}
              {/* Stat values */}
              {stats.map((s, i) => {
                const cx = pillX + colW * i + colW / 2;
                return (
                  <g key={s.l}>
                    <text x={cx} y={pillY + 24} textAnchor="middle"
                      fontSize="18" fontWeight="700" fill="#fff"
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                      letterSpacing="-0.02em">
                      {s.v}
                    </text>
                    <text x={cx} y={pillY + 40} textAnchor="middle"
                      fontSize="9" fontWeight="500" fill="rgba(255,255,255,0.5)"
                      fontFamily="'Plus Jakarta Sans', sans-serif"
                      letterSpacing="0.08em">
                      {s.l.toUpperCase()}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* ── BRANDING: icon + ROAM in Syne, centered below stats ─────── */}
        {!isOverlay && (() => {
          const iconSize = 24;
          const gap = 7;
          // Approximate text width for "ROAM" at fontSize 15 + letterSpacing 0.22em
          const textW = 42;
          const rowW = iconDataUrl ? iconSize + gap + textW : textW;
          const startX = CARD_W / 2 - rowW / 2;
          const midY = BRAND_Y + 22; // vertical center of branding row
          return (
            <g>
              {iconDataUrl && (
                <image
                  href={iconDataUrl}
                  x={startX}
                  y={midY - iconSize / 2}
                  width={iconSize}
                  height={iconSize}
                />
              )}
              <text
                x={iconDataUrl ? startX + iconSize + gap : CARD_W / 2}
                y={midY + 5}
                textAnchor="start"
                fontSize="15" fontWeight="700"
                fill="rgba(255,255,255,0.9)"
                fontFamily="'Syne', sans-serif"
                letterSpacing="0.22em">
                ROAM
              </text>
            </g>
          );
        })()}
        {isOverlay && (() => {
          const iconSize = 22;
          const iconY = 14;
          const cx = CARD_W / 2;
          return (
            <g>
              {iconDataUrl && (
                <image href={iconDataUrl} x={cx - iconSize / 2 - 24} y={iconY} width={iconSize} height={iconSize} />
              )}
              <text
                x={cx + (iconDataUrl ? 4 : 0)}
                y={iconY + iconSize / 2 + 5}
                textAnchor={iconDataUrl ? "start" : "middle"}
                fontSize="12" fontWeight="700"
                fill="rgba(255,255,255,0.7)"
                fontFamily="'Syne', sans-serif"
                letterSpacing="0.2em">
                ROAM
              </text>
            </g>
          );
        })()}

      </g>
    </svg>
  );
}
