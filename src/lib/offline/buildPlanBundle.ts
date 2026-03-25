// src/lib/offline/buildPlanBundle.ts
//
// Extracted bundle-build pipeline. Used by:
//   1. /new page - fresh plan creation
//   2. Invite redemption - building bundle for a shared plan stub
//   3. /trip page - rebuilding stale/missing bundles
//

import type { NavPack } from "@/lib/types/navigation";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { TripStop, TripPreferences } from "@/lib/types/trip";

import { navApi } from "@/lib/api/nav";
import { bundleApi } from "@/lib/api/bundle";
import { saveOfflinePlan, type OfflinePlanPreview } from "./plansStore";
import { putPack } from "./packsStore";
import { getVehicleFuelProfile } from "./fuelProfileStore";
import { analyzeFuel } from "@/lib/nav/fuelAnalysis";

/* ── Types ────────────────────────────────────────────────────────────── */

export type BuildPhase =
  | "idle"
  | "routing"
  | "corridor_ensure"
  | "corridor_get"
  | "places_corridor"
  | "traffic_poll"
  | "hazards_poll"
  | "fuel_analysis"
  | "bundle_build"
  | "downloading"
  | "saving"
  | "ready"
  | "error";

export type BuildPlanBundleArgs = {
  /** Plan ID (caller generates or reuses existing) */
  plan_id: string;
  /** Ordered stops - must have ≥2 with start + end */
  stops: TripStop[];
  /** Routing profile (drive / walk / cycle) */
  profile: string;
  /** Routing preferences */
  prefs?: Record<string, unknown>;
  /** Avoidances */
  avoid?: string[];
  /** Departure time ISO string or null */
  depart_at?: string | null;
  /** Map style ID for tile bundling */
  styleId?: string;
  /** Optional: pre-fetched NavPack (skips routing step if provided) */
  existingNavPack?: NavPack | null;
  /** Corridor buffer in metres */
  buffer_m?: number;
  /** Max corridor graph edges */
  max_edges?: number;
  /** Progress callback - called on every phase change */
  onPhase?: (phase: BuildPhase) => void;
  /** Trip preferences - stop density + category toggles */
  tripPrefs?: TripPreferences | null;
};

export type BuildPlanBundleResult = {
  plan_id: string;
  navPack: NavPack;
  manifest: OfflineBundleManifest;
  preview: OfflinePlanPreview;
};

/* ── Human-readable phase labels ─────────────────────────────────────── */

export function phaseLabel(phase: BuildPhase, error?: string | null): string {
  if (error) return error;
  switch (phase) {
    case "idle":             return "Ready";
    case "routing":          return "Building route…";
    case "corridor_ensure":
    case "corridor_get":     return "Preparing offline corridor…";
    case "places_corridor":  return "Finding stops along the way…";
    case "traffic_poll":     return "Checking live traffic…";
    case "hazards_poll":     return "Checking road hazards…";
    case "fuel_analysis":    return "Analysing fuel coverage…";
    case "bundle_build":     return "Packaging offline bundle…";
    case "downloading":      return "Downloading bundle…";
    case "saving":           return "Saving to device…";
    case "ready":            return "Offline ready.";
    case "error":            return error ?? "Something went wrong";
    default:                 return "Working…";
  }
}

/* ── Pipeline ────────────────────────────────────────────────────────── */

/**
 * Run the full offline bundle pipeline:
 *   route → corridor ensure → corridor get → places corridor →
 *   fuel analysis → traffic poll → hazards poll → bundle build →
 *   download zip → save to IDB
 *
 * Returns the NavPack + manifest + preview on success.
 * Throws on any failure (caller handles error UI).
 */
export async function buildPlanBundle(args: BuildPlanBundleArgs): Promise<BuildPlanBundleResult> {
  const {
    plan_id,
    stops,
    profile,
    prefs = {},
    avoid = [],
    depart_at = null,
    styleId = "roam-basemap-vector-bright",
    existingNavPack = null,
    buffer_m = 15000,
    max_edges = 350000,
    onPhase,
    tripPrefs = null,
  } = args;

  const emit = (phase: BuildPhase) => onPhase?.(phase);

  // ─── 1. Route ────────────────────────────────────────────────────────
  emit("routing");
  let pack: NavPack;

  if (existingNavPack?.primary?.geometry) {
    pack = existingNavPack;
  } else {
    pack = await navApi.route({
      profile,
      prefs,
      avoid,
      stops,
      depart_at,
    });
  }

  const route_key = pack.primary.route_key;
  const geometry = pack.primary.geometry;
  const routeProfile = pack.primary.profile ?? profile;

  // ─── 2. Corridor ─────────────────────────────────────────────────────
  // The corridor is built inside bundle/build which has access to the
  // places pack (stop coordinates). Building it here without stops would
  // cache a stopless corridor that bundle/build then returns from cache,
  // missing all the stop-circle road coverage.
  emit("corridor_ensure");
  emit("corridor_get");

  // ─── Places / traffic / hazards (bundled inside bundle/build) ────────
  // These phases are emitted for UI progress only; the actual work happens
  // concurrently inside the bundle/build endpoint.
  emit("places_corridor");
  emit("traffic_poll");
  emit("hazards_poll");

  // ─── 4. Fuel analysis (client-side, no network) ─────────────────────
  // Places are fetched inside bundle/build - run fuel analysis optimistically
  // with no places so it doesn't block. Fuel stops in the bundle will be
  // used by the trip page once the bundle is loaded offline.
  emit("fuel_analysis");
  try {
    const fuelProfile = await getVehicleFuelProfile();
    const fuelResult = analyzeFuel(
      geometry,
      [],
      fuelProfile,
      route_key,
    );
    // Fire-and-forget save to IDB - will be available when trip boots
    putPack(plan_id, "fuel_analysis", fuelResult).catch((e) => {
      console.warn("[buildPlanBundle] Failed to save fuel analysis:", e);
    });
  } catch (e) {
    // Fuel analysis failure is non-fatal - don't block the bundle
    console.warn("[buildPlanBundle] Fuel analysis failed:", e);
  }

  // ─── 5. Bundle build ─────────────────────────────────────────────────
  // Traffic + hazards are fetched concurrently inside bundle/build -
  // no need to poll them separately first.
  emit("bundle_build");

  // Derive departure_iso from the first stop's depart_at if available
  const departureIso = depart_at
    ?? stops.find((s) => s.type === "start")?.depart_at
    ?? null;

  const manifest = await bundleApi.build({
    plan_id,
    route_key,
    geometry,
    profile: routeProfile,
    buffer_m,
    max_edges,
    styles: [styleId],
    departure_iso: departureIso,
    trip_prefs: tripPrefs,
  });

  // ─── 8. Download zip ─────────────────────────────────────────────────
  emit("downloading");
  const url = bundleApi.downloadUrl(manifest.plan_id);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Zip download failed (${res.status})`);

  const blob = await res.blob();
  const mime = res.headers.get("content-type") || blob.type || "application/zip";
  const bytes = Number(res.headers.get("content-length") || blob.size || 0);

  // ─── 9. Save to IDB ─────────────────────────────────────────────────
  emit("saving");
  const preview: OfflinePlanPreview = {
    stops,
    geometry: pack.primary.geometry,
    bbox: pack.primary.bbox,
    distance_m: pack.primary.distance_m,
    duration_s: pack.primary.duration_s,
    profile: routeProfile,
  };

  await saveOfflinePlan({
    manifest,
    zipBlob: blob,
    zipBytes: bytes,
    zipMime: mime,
    preview,
  });

  emit("ready");

  return { plan_id, navPack: pack, manifest, preview };
}
