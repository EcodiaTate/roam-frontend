// src/lib/offline/packsStore.ts
"use client";

import { idbDel, idbGet, idbPut, idbStores, idbWithTx } from "./idb";

import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay, ElevationResponse } from "@/lib/types/navigation";
import type { PlacesPack } from "@/lib/types/places";
import type { FuelAnalysis } from "@/lib/types/fuel";
import type {
  WeatherOverlay,
  FuelOverlay,
  FloodOverlay,
  CoverageOverlay,
  WildlifeOverlay,
  RestAreaOverlay,
  RouteIntelligenceScore,
  EmergencyServicesOverlay,
  HeritageOverlay,
  AirQualityOverlay,
  BushfireOverlay,
  SpeedCamerasOverlay,
  ToiletsOverlay,
  SchoolZonesOverlay,
  RoadkillOverlay,
} from "@/lib/types/overlays";

export type PackKind =
  | "manifest"
  | "navpack"
  | "corridor"
  | "places"
  | "traffic"
  | "hazards"
  | "fuel_analysis"
  | "elevation"
  | "weather"
  | "fuel"
  | "flood"
  | "coverage"
  | "wildlife"
  | "rest_areas"
  | "route_score"
  | "emergency"
  | "heritage"
  | "air_quality"
  | "bushfire"
  | "speed_cameras"
  | "toilets"
  | "school_zones"
  | "roadkill";

export type StoredPack =
  | { k: string; plan_id: string; kind: "manifest"; saved_at: number; payload: OfflineBundleManifest }
  | { k: string; plan_id: string; kind: "navpack"; saved_at: number; payload: NavPack }
  | { k: string; plan_id: string; kind: "corridor"; saved_at: number; payload: CorridorGraphPack }
  | { k: string; plan_id: string; kind: "places"; saved_at: number; payload: PlacesPack }
  | { k: string; plan_id: string; kind: "traffic"; saved_at: number; payload: TrafficOverlay }
  | { k: string; plan_id: string; kind: "hazards"; saved_at: number; payload: HazardOverlay }
  | { k: string; plan_id: string; kind: "fuel_analysis"; saved_at: number; payload: FuelAnalysis }
  | { k: string; plan_id: string; kind: "elevation"; saved_at: number; payload: ElevationResponse }
  | { k: string; plan_id: string; kind: "weather"; saved_at: number; payload: WeatherOverlay }
  | { k: string; plan_id: string; kind: "fuel"; saved_at: number; payload: FuelOverlay }
  | { k: string; plan_id: string; kind: "flood"; saved_at: number; payload: FloodOverlay }
  | { k: string; plan_id: string; kind: "coverage"; saved_at: number; payload: CoverageOverlay }
  | { k: string; plan_id: string; kind: "wildlife"; saved_at: number; payload: WildlifeOverlay }
  | { k: string; plan_id: string; kind: "rest_areas"; saved_at: number; payload: RestAreaOverlay }
  | { k: string; plan_id: string; kind: "route_score"; saved_at: number; payload: RouteIntelligenceScore }
  | { k: string; plan_id: string; kind: "emergency"; saved_at: number; payload: EmergencyServicesOverlay }
  | { k: string; plan_id: string; kind: "heritage"; saved_at: number; payload: HeritageOverlay }
  | { k: string; plan_id: string; kind: "air_quality"; saved_at: number; payload: AirQualityOverlay }
  | { k: string; plan_id: string; kind: "bushfire"; saved_at: number; payload: BushfireOverlay }
  | { k: string; plan_id: string; kind: "speed_cameras"; saved_at: number; payload: SpeedCamerasOverlay }
  | { k: string; plan_id: string; kind: "toilets"; saved_at: number; payload: ToiletsOverlay }
  | { k: string; plan_id: string; kind: "school_zones"; saved_at: number; payload: SchoolZonesOverlay }
  | { k: string; plan_id: string; kind: "roadkill"; saved_at: number; payload: RoadkillOverlay };

function k(planId: string, kind: PackKind) {
  return `${planId}:${kind}`;
}

function makeRow(planId: string, kind: PackKind, payload: StoredPack["payload"]): StoredPack {
  return {
    k: k(planId, kind),
    plan_id: planId,
    kind,
    saved_at: Date.now(),
    payload,
  } as StoredPack;
}

function osPut(os: IDBObjectStore, value: StoredPack): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = os.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IDB put failed"));
  });
}

export async function putPack(planId: string, kind: PackKind, payload: StoredPack["payload"]): Promise<void> {
  const row = makeRow(planId, kind, payload);
  await idbPut(idbStores.packs, row);
}

export async function getPack<T>(planId: string, kind: PackKind): Promise<T | undefined> {
  const row = await idbGet<StoredPack>(idbStores.packs, k(planId, kind));
  return row?.payload as T | undefined;
}

export async function hasNavpack(planId: string): Promise<boolean> {
  const n = await getPack<NavPack>(planId, "navpack");
  return !!n;
}

export async function hasCorePacks(planId: string): Promise<boolean> {
  const [m, n, c] = await Promise.all([
    getPack<OfflineBundleManifest>(planId, "manifest"),
    getPack<NavPack>(planId, "navpack"),
    getPack<CorridorGraphPack>(planId, "corridor"),
  ]);
  if (!m || !n || !c) return false;
  // If the manifest predates the new overlay fields, treat as stale so the
  // bundle is re-downloaded and the new overlay packs are populated.
  if (m.weather_status === undefined && m.flood_status === undefined) return false;
  return true;
}

export async function getAllPacks(planId: string) {
  const [
    manifest, navpack, corridor, places, traffic, hazards, fuel_analysis, elevation,
    weather, fuel, flood, coverage, wildlife, rest_areas, route_score,
    emergency, heritage, air_quality, bushfire, speed_cameras, toilets, school_zones, roadkill,
  ] = await Promise.all([
    getPack<OfflineBundleManifest>(planId, "manifest"),
    getPack<NavPack>(planId, "navpack"),
    getPack<CorridorGraphPack>(planId, "corridor"),
    getPack<PlacesPack>(planId, "places"),
    getPack<TrafficOverlay>(planId, "traffic"),
    getPack<HazardOverlay>(planId, "hazards"),
    getPack<FuelAnalysis>(planId, "fuel_analysis"),
    getPack<ElevationResponse>(planId, "elevation"),
    getPack<WeatherOverlay>(planId, "weather"),
    getPack<FuelOverlay>(planId, "fuel"),
    getPack<FloodOverlay>(planId, "flood"),
    getPack<CoverageOverlay>(planId, "coverage"),
    getPack<WildlifeOverlay>(planId, "wildlife"),
    getPack<RestAreaOverlay>(planId, "rest_areas"),
    getPack<RouteIntelligenceScore>(planId, "route_score"),
    getPack<EmergencyServicesOverlay>(planId, "emergency"),
    getPack<HeritageOverlay>(planId, "heritage"),
    getPack<AirQualityOverlay>(planId, "air_quality"),
    getPack<BushfireOverlay>(planId, "bushfire"),
    getPack<SpeedCamerasOverlay>(planId, "speed_cameras"),
    getPack<ToiletsOverlay>(planId, "toilets"),
    getPack<SchoolZonesOverlay>(planId, "school_zones"),
    getPack<RoadkillOverlay>(planId, "roadkill"),
  ]);
  return {
    manifest, navpack, corridor, places, traffic, hazards, fuel_analysis, elevation,
    weather, fuel, flood, coverage, wildlife, rest_areas, route_score,
    emergency, heritage, air_quality, bushfire, speed_cameras, toilets, school_zones, roadkill,
  };
}

async function deleteAllPacks(planId: string): Promise<void> {
  const kinds: PackKind[] = [
    "manifest", "navpack", "corridor", "places", "traffic", "hazards", "fuel_analysis", "elevation",
    "weather", "fuel", "flood", "coverage", "wildlife", "rest_areas", "route_score",
    "emergency", "heritage", "air_quality", "bushfire", "speed_cameras", "toilets", "school_zones", "roadkill",
  ];
  await Promise.all(kinds.map((kind) => idbDel(idbStores.packs, k(planId, kind))));
}

/**
 *  Atomic: put multiple packs in the same transaction.
 * Used for offline edits where plan + navpack + manifest must stay consistent.
 */
export async function putPacksAtomic(args: {
  planId: string;
  updates: Partial<Record<PackKind, StoredPack["payload"] | object>>;
}): Promise<void> {
  const { planId, updates } = args;

  await idbWithTx([idbStores.packs], async (osMap) => {
    const os = osMap.get(idbStores.packs);
    if (!os) throw new Error("packs store missing in tx");

    const entries = Object.entries(updates) as [PackKind, StoredPack["payload"]][];
    for (const [kind, payload] of entries) {
      if (payload === undefined) continue;
      await osPut(os, makeRow(planId, kind, payload));
    }
  });
}
