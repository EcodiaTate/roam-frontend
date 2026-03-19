// src/lib/offline/refreshPriority.ts
//
// Smart data refresh prioritization on signal return.
//
// When the app regains connectivity after an offline period,
// not all overlays are equally stale or equally important.
// Traffic from 8 hours ago is useless; fuel stations from 3 days ago
// are probably fine. This module determines what to refresh first.

import type { OfflineBundleManifest } from "@/lib/types/bundle";

// ──────────────────────────────────────────────────────────────
// Overlay refresh config: TTL and priority
// ──────────────────────────────────────────────────────────────

type OverlayRefreshConfig = {
  /** Human-readable name */
  name: string;
  /** Key field in the manifest (used to check if overlay exists) */
  manifestKey: keyof OfflineBundleManifest;
  /** Acceptable max age in seconds before considered stale */
  ttl_s: number;
  /** Base priority (higher = refresh first) */
  priority: number;
};

const OVERLAY_CONFIGS: OverlayRefreshConfig[] = [
  // Safety-critical, changes fast → refresh first
  { name: "traffic",      manifestKey: "traffic_key",      ttl_s: 3600,    priority: 100 },
  { name: "hazards",      manifestKey: "hazards_key",      ttl_s: 7200,    priority: 95 },
  { name: "bushfire",     manifestKey: "bushfire_key",     ttl_s: 900,     priority: 90 },
  { name: "weather",      manifestKey: "weather_key",      ttl_s: 3600,    priority: 85 },
  { name: "flood",        manifestKey: "flood_key",        ttl_s: 1800,    priority: 80 },

  // Important but changes slower
  { name: "fuel",         manifestKey: "fuel_key",         ttl_s: 86400,   priority: 60 },
  { name: "air_quality",  manifestKey: "aqi_key",          ttl_s: 3600,    priority: 55 },

  // Semi-static data → refresh last
  { name: "rest_areas",   manifestKey: "rest_key",         ttl_s: 604800,  priority: 20 },
  { name: "coverage",     manifestKey: "coverage_key",     ttl_s: 604800,  priority: 15 },
  { name: "wildlife",     manifestKey: "wildlife_key",     ttl_s: 604800,  priority: 10 },
  { name: "cameras",      manifestKey: "cameras_key",      ttl_s: 604800,  priority: 5 },
  { name: "heritage",     manifestKey: "heritage_key",     ttl_s: 604800,  priority: 3 },
  { name: "toilets",      manifestKey: "toilets_key",      ttl_s: 604800,  priority: 2 },
  { name: "school_zones", manifestKey: "school_zones_key", ttl_s: 604800,  priority: 1 },
];

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type RefreshItem = {
  overlay: string;
  /** How stale the data is (seconds since creation) */
  age_s: number;
  /** Staleness ratio: age / ttl (> 1.0 means past due) */
  staleness: number;
  /** Combined score: higher = more urgent to refresh */
  urgency: number;
};

// ──────────────────────────────────────────────────────────────
// Core function
// ──────────────────────────────────────────────────────────────

/**
 * Given a bundle manifest created_at timestamp, compute which overlays
 * should be refreshed and in what order.
 *
 * Returns a prioritized list - caller should refresh in order,
 * stopping when bandwidth or time runs out.
 *
 * @param bundleCreatedAt  ISO timestamp of when the bundle was built
 * @param maxItems         Max items to return (default: all stale)
 */
export function computeRefreshPriority(
  bundleCreatedAt: string,
  maxItems: number = 10,
): RefreshItem[] {
  let bundleAge_s: number;
  try {
    const dt = new Date(bundleCreatedAt);
    bundleAge_s = Math.max(0, (Date.now() - dt.getTime()) / 1000);
  } catch {
    bundleAge_s = 86400; // assume 1 day old on parse failure
  }

  const items: RefreshItem[] = [];

  for (const cfg of OVERLAY_CONFIGS) {
    const staleness = bundleAge_s / cfg.ttl_s;

    // Only include if stale (past 50% of TTL) or past TTL entirely
    if (staleness < 0.5) continue;

    // Urgency = base priority * staleness ratio
    // A stale high-priority overlay ranks higher than a very-stale low-priority one
    const urgency = cfg.priority * Math.min(staleness, 5.0);

    items.push({
      overlay: cfg.name,
      age_s: Math.round(bundleAge_s),
      staleness: Math.round(staleness * 100) / 100,
      urgency: Math.round(urgency * 10) / 10,
    });
  }

  // Sort by urgency descending (most urgent first)
  items.sort((a, b) => b.urgency - a.urgency);

  return items.slice(0, maxItems);
}

/**
 * Human-readable age string for UI badges.
 * "2m" | "45m" | "3h" | "2d"
 */
export function formatAge(age_s: number): string {
  if (age_s < 60) return "<1m";
  if (age_s < 3600) return `${Math.round(age_s / 60)}m`;
  if (age_s < 86400) return `${Math.round(age_s / 3600)}h`;
  return `${Math.round(age_s / 86400)}d`;
}

/**
 * Check if an overlay's data is too old to be trustworthy for alerts.
 * Used to suppress alerts from stale data (e.g. don't show a traffic
 * incident from 12 hours ago as if it's current).
 */
export function isOverlayStale(overlayName: string, createdAt: string): boolean {
  const cfg = OVERLAY_CONFIGS.find((c) => c.name === overlayName);
  if (!cfg) return false;

  try {
    const dt = new Date(createdAt);
    const age_s = Math.max(0, (Date.now() - dt.getTime()) / 1000);
    return age_s > cfg.ttl_s * 1.5; // stale after 1.5x TTL
  } catch {
    return true;
  }
}
