// src/lib/offline/unpackBundle.ts
"use client";

import { unzipSync, strFromU8 } from "fflate";

import type { OfflinePlanRecord } from "@/lib/offline/plansStore";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack } from "@/lib/types/places";
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

import { putPack } from "@/lib/offline/packsStore";

function parseJson<T>(bytes: Uint8Array, name: string): T {
  const txt = strFromU8(bytes);
  try {
    return JSON.parse(txt) as T;
  } catch (e: unknown) {
    throw new Error(`Failed to parse ${name}: ${e instanceof Error ? e.message : "invalid json"}`);
  }
}

function maybeJson<T>(files: Record<string, Uint8Array>, name: string): T | undefined {
  return files[name] ? parseJson<T>(files[name], name) : undefined;
}

export async function unpackAndStoreBundle(plan: OfflinePlanRecord) {
  if (!plan.zip_blob) throw new Error("Plan has no zip blob");

  const buf = new Uint8Array(await plan.zip_blob.arrayBuffer());
  const files = unzipSync(buf);

  const must = (name: string) => {
    const b = files[name];
    if (!b) throw new Error(`Bundle missing ${name}`);
    return b;
  };

  const manifest = parseJson<OfflineBundleManifest>(must("manifest.json"), "manifest.json");
  const navpack = parseJson<NavPack>(must("navpack.json"), "navpack.json");
  const corridor = parseJson<CorridorGraphPack>(must("corridor.json"), "corridor.json");

  const places    = maybeJson<PlacesPack>(files, "places.json");
  const traffic   = maybeJson<TrafficOverlay>(files, "traffic.json");
  const hazards   = maybeJson<HazardOverlay>(files, "hazards.json");
  const weather   = maybeJson<WeatherOverlay>(files, "weather.json");
  const fuel      = maybeJson<FuelOverlay>(files, "fuel.json");
  const flood     = maybeJson<FloodOverlay>(files, "flood.json");
  const coverage  = maybeJson<CoverageOverlay>(files, "coverage.json");
  const wildlife  = maybeJson<WildlifeOverlay>(files, "wildlife.json");
  const restAreas = maybeJson<RestAreaOverlay>(files, "rest_areas.json");
  const routeScore = maybeJson<RouteIntelligenceScore>(files, "route_score.json");
  const emergency = maybeJson<EmergencyServicesOverlay>(files, "emergency.json");
  const heritage = maybeJson<HeritageOverlay>(files, "heritage.json");
  const airQuality = maybeJson<AirQualityOverlay>(files, "air_quality.json");
  const bushfire = maybeJson<BushfireOverlay>(files, "bushfire.json");
  const speedCameras = maybeJson<SpeedCamerasOverlay>(files, "speed_cameras.json");
  const toilets = maybeJson<ToiletsOverlay>(files, "toilets.json");
  const schoolZones = maybeJson<SchoolZonesOverlay>(files, "school_zones.json");
  const roadkill = maybeJson<RoadkillOverlay>(files, "roadkill.json");

  await putPack(plan.plan_id, "manifest", manifest);
  await putPack(plan.plan_id, "navpack", navpack);
  await putPack(plan.plan_id, "corridor", corridor);
  if (places)    await putPack(plan.plan_id, "places", places);
  if (traffic)   await putPack(plan.plan_id, "traffic", traffic);
  if (hazards)   await putPack(plan.plan_id, "hazards", hazards);
  if (weather)   await putPack(plan.plan_id, "weather", weather);
  if (fuel)      await putPack(plan.plan_id, "fuel", fuel);
  if (flood)     await putPack(plan.plan_id, "flood", flood);
  if (coverage)  await putPack(plan.plan_id, "coverage", coverage);
  if (wildlife)  await putPack(plan.plan_id, "wildlife", wildlife);
  if (restAreas) await putPack(plan.plan_id, "rest_areas", restAreas);
  if (routeScore) await putPack(plan.plan_id, "route_score", routeScore);
  if (emergency) await putPack(plan.plan_id, "emergency", emergency);
  if (heritage)  await putPack(plan.plan_id, "heritage", heritage);
  if (airQuality) await putPack(plan.plan_id, "air_quality", airQuality);
  if (bushfire)  await putPack(plan.plan_id, "bushfire", bushfire);
  if (speedCameras) await putPack(plan.plan_id, "speed_cameras", speedCameras);
  if (toilets)   await putPack(plan.plan_id, "toilets", toilets);
  if (schoolZones) await putPack(plan.plan_id, "school_zones", schoolZones);
  if (roadkill)  await putPack(plan.plan_id, "roadkill", roadkill);

  return {
    manifest, navpack, corridor,
    places, traffic, hazards,
    weather, fuel, flood, coverage, wildlife, restAreas, routeScore,
    emergency, heritage, airQuality, bushfire, speedCameras, toilets, schoolZones, roadkill,
  };
}
