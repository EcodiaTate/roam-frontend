// src/lib/offline/unpackBundle.ts
"use client";

import { unzipSync, strFromU8 } from "fflate";

import type { OfflinePlanRecord } from "@/lib/offline/plansStore";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack } from "@/lib/types/places";

import { putPack } from "@/lib/offline/packsStore";

function parseJson<T>(bytes: Uint8Array, name: string): T {
  const txt = strFromU8(bytes);
  try {
    return JSON.parse(txt) as T;
  } catch (e: any) {
    throw new Error(`Failed to parse ${name}: ${e?.message ?? "invalid json"}`);
  }
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

  const places = files["places.json"] ? parseJson<PlacesPack>(files["places.json"], "places.json") : undefined;
  const traffic = files["traffic.json"] ? parseJson<TrafficOverlay>(files["traffic.json"], "traffic.json") : undefined;
  const hazards = files["hazards.json"] ? parseJson<HazardOverlay>(files["hazards.json"], "hazards.json") : undefined;

  await putPack(plan.plan_id, "manifest", manifest);
  await putPack(plan.plan_id, "navpack", navpack);
  await putPack(plan.plan_id, "corridor", corridor);
  if (places) await putPack(plan.plan_id, "places", places);
  if (traffic) await putPack(plan.plan_id, "traffic", traffic);
  if (hazards) await putPack(plan.plan_id, "hazards", hazards);

  return { manifest, navpack, corridor, places, traffic, hazards };
}
