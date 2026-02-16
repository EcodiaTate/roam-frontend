// src/lib/guide/addToTrip.ts
"use client";

import type { OfflinePlanRecord } from "@/lib/offline/plansStore";
import { updateOfflinePlanAtomic } from "@/lib/offline/plansStore";

import type { TripStop } from "@/lib/types/trip";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";

import { putPack } from "@/lib/offline/packsStore";
import { rebuildNavpackOffline } from "@/lib/offline/rebuildNavpack";

import { healthApi } from "@/lib/api/health";
import { navApi } from "@/lib/api/nav";
import { placesApi } from "@/lib/api/places";

import { planSync } from "@/lib/offline/planSync";

export type RebuildMode = "auto" | "online" | "offline";

function ensureStopIds(stops: TripStop[]): TripStop[] {
  return (stops ?? []).map((s, i) =>
    s.id ? s : { ...s, id: `${Date.now()}_${i}_${Math.random().toString(16).slice(2)}` },
  );
}

function insertStopBeforeEnd(stops: TripStop[], next: TripStop): TripStop[] {
  const out = [...stops];
  const endIdx = out.findIndex((s) => (s.type ?? "poi") === "end");
  if (endIdx >= 0) out.splice(endIdx, 0, next);
  else out.push(next);
  return out;
}

async function backendHealthOk(): Promise<boolean> {
  try {
    const res = await healthApi.get();
    return !!res?.ok;
  } catch {
    return false;
  }
}

async function onlineRebuild(args: {
  plan: OfflinePlanRecord;
  stopsRaw: TripStop[];
  profile: string;
}) {
  const { plan, stopsRaw, profile } = args;

  const stops = ensureStopIds(stopsRaw);

  const nextNav = await navApi.route({ stops, profile, prefs: {}, avoid: [], depart_at: null });
  const geom = nextNav?.primary?.geometry;
  if (!geom) throw new Error("Backend returned navpack without primary.geometry");

  const meta = await navApi.corridorEnsure({
    route_key: nextNav.primary.route_key,
    geometry: geom,
    profile,
    buffer_m: null,
    max_edges: null,
  });
  const corridorKey = meta?.corridor_key;
  if (!corridorKey) throw new Error("corridorEnsure returned no corridor_key");

  const nextCorr = await navApi.corridorGet(corridorKey);

  // Pass route geometry so the backend searches along the actual road
  // shape instead of a start-to-end bounding box
  let nextPlaces: PlacesPack | null = null;
  try {
    nextPlaces = await placesApi.corridor({
      corridor_key: corridorKey,
      geometry: geom,
      buffer_km: 15,
      limit: 8000,
    });
  } catch {
    nextPlaces = null;
  }

  let nextTraffic: TrafficOverlay | null = null;
  let nextHazards: HazardOverlay | null = null;
  const bbox = nextNav?.primary?.bbox;
  if (bbox) {
    try { nextTraffic = await navApi.trafficPoll({ bbox }); } catch { nextTraffic = null; }
    try { nextHazards = await navApi.hazardsPoll({ bbox, sources: [] }); } catch { nextHazards = null; }
  }

  await Promise.all([
    putPack(plan.plan_id, "navpack", nextNav),
    putPack(plan.plan_id, "corridor", nextCorr),
    nextPlaces ? putPack(plan.plan_id, "places", nextPlaces) : Promise.resolve(),
    nextTraffic ? putPack(plan.plan_id, "traffic", nextTraffic) : Promise.resolve(),
    nextHazards ? putPack(plan.plan_id, "hazards", nextHazards) : Promise.resolve(),
  ]);

  await updateOfflinePlanAtomic(plan.plan_id, {
    route_key: nextNav.primary.route_key,
    corridor_key: corridorKey,
    places_key: nextPlaces?.places_key ?? null,
    traffic_key: (nextTraffic as any)?.traffic_key ?? null,
    hazards_key: (nextHazards as any)?.hazards_key ?? null,
    preview: {
      stops,
      geometry: nextNav.primary.geometry,
      bbox: nextNav.primary.bbox,
      distance_m: nextNav.primary.distance_m,
      duration_s: nextNav.primary.duration_s,
      profile: nextNav.primary.profile,
    },
  });

  await planSync.enqueuePlanUpsert(plan.plan_id);

  return {
    navpack: nextNav as NavPack,
    corridor: nextCorr as CorridorGraphPack,
    places: nextPlaces as PlacesPack | null,
    traffic: nextTraffic,
    hazards: nextHazards,
  };
}

async function offlineRebuild(args: {
  plan: OfflinePlanRecord;
  prevNavpack: NavPack;
  corridor: CorridorGraphPack;
  stopsRaw: TripStop[];
}) {
  const { plan, prevNavpack, corridor, stopsRaw } = args;

  const stops = ensureStopIds(stopsRaw);
  const route_key = prevNavpack?.primary?.route_key ?? plan.route_key;

  const rebuilt = rebuildNavpackOffline({ prevNavpack, corridor, stops, route_key });

  await putPack(plan.plan_id, "navpack", rebuilt);
  await updateOfflinePlanAtomic(plan.plan_id, {
    route_key: rebuilt.primary.route_key,
    preview: {
      stops,
      geometry: rebuilt.primary.geometry,
      bbox: rebuilt.primary.bbox,
      distance_m: rebuilt.primary.distance_m,
      duration_s: rebuilt.primary.duration_s,
      profile: rebuilt.primary.profile,
    },
  });

  await planSync.enqueuePlanUpsert(plan.plan_id);

  return { navpack: rebuilt as NavPack };
}

async function rebuildFromStops(args: {
  plan: OfflinePlanRecord;
  mode: RebuildMode;
  profile: string;
  prevNavpack: NavPack | null;
  corridor: CorridorGraphPack | null;
  stops: TripStop[];
}) {
  const { plan, mode, profile, prevNavpack, corridor, stops } = args;

  if (mode === "offline") {
    if (!prevNavpack || !corridor) throw new Error("Missing packs for offline rebuild");
    return offlineRebuild({ plan, prevNavpack, corridor, stopsRaw: stops });
  }

  if (mode === "online") {
    const ok = await backendHealthOk();
    if (!ok) throw new Error("Backend not reachable. Switch to Offline or go online.");
    return onlineRebuild({ plan, stopsRaw: stops, profile });
  }

  // auto
  const ok = await backendHealthOk();
  if (ok) return onlineRebuild({ plan, stopsRaw: stops, profile });

  if (!prevNavpack || !corridor) throw new Error("Backend offline and missing packs for offline rebuild.");

  try {
    return offlineRebuild({ plan, prevNavpack, corridor, stopsRaw: stops });
  } catch (e: any) {
    throw new Error(
      (e?.message ?? "Offline rebuild failed") +
        "\n\nBackend is offline. If stops moved outside the stored corridor, you must go online to refresh the corridor.",
    );
  }
}

/**
 * Canonical "Add to Trip" entrypoint.
 * Inserts the place as a POI stop before the end stop and rebuilds.
 */
export async function addPlaceToTrip(args: {
  plan: OfflinePlanRecord;
  place: PlaceItem;

  navpack: NavPack; // required because we need current stops
  corridor: CorridorGraphPack | null; // only required for offline path

  profile: string;
  mode?: RebuildMode;
}) {
  const { plan, place, navpack, corridor, profile, mode = "auto" } = args;

  const baseStops = ensureStopIds(navpack.req.stops);

  const nextStop: TripStop = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: "poi",
    name: place.name,
    lat: place.lat,
    lng: place.lng,
  };

  const nextStops = insertStopBeforeEnd(baseStops, nextStop);

  return rebuildFromStops({
    plan,
    mode,
    profile,
    prevNavpack: navpack,
    corridor,
    stops: nextStops,
  });
}