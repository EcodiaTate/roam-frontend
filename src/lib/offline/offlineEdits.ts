// src/lib/offline/offlineEdits.ts
"use client";

import { idbStores, idbWithTx } from "@/lib/offline/idb";

import type { OfflinePlanRecord, OfflinePlanPreview } from "@/lib/offline/plansStore";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { TripStop } from "@/lib/types/trip";
import type { NavPack, CorridorGraphPack } from "@/lib/types/navigation";

import { rebuildNavpackOffline } from "@/lib/offline/rebuildNavpack";

type PackKind = "manifest" | "navpack" | "corridor";

type StoredPack =
  | { k: string; plan_id: string; kind: "manifest"; saved_at: number; payload: OfflineBundleManifest }
  | { k: string; plan_id: string; kind: "navpack"; saved_at: number; payload: NavPack }
  | { k: string; plan_id: string; kind: "corridor"; saved_at: number; payload: CorridorGraphPack };

function packKey(planId: string, kind: PackKind) {
  return `${planId}:${kind}`;
}

function osGet<T>(os: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = os.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("IDB get failed"));
  });
}

function osPut(os: IDBObjectStore, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = os.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IDB put failed"));
  });
}

function makePackRow(planId: string, kind: PackKind, payload: any): StoredPack {
  return {
    k: packKey(planId, kind),
    plan_id: planId,
    kind: kind as any,
    saved_at: Date.now(),
    payload: payload as any,
  } as any;
}

/**
 * Local-only route key for offline edits.
 * Must be stable and change when stops/profile change.
 * (Does not need to match backend route_key exactly.)
 */
export function computeOfflineRouteKey(profile: string, stops: TripStop[]): string {
  const raw =
    profile +
    "|" +
    stops
      .map((s) => {
        const id = s.id ?? "";
        const lat = Math.round(s.lat * 1e6);
        const lng = Math.round(s.lng * 1e6);
        return `${id}:${lat},${lng}:${s.type ?? "poi"}`;
      })
      .join("|");

  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function applyOfflineStopsEdit(args: {
  planId: string;
  profile: string;
  stops: TripStop[];
  max_snap_m?: number;
}): Promise<{
  route_key: string;
  navpack: NavPack;
  preview: OfflinePlanPreview;
  plan: OfflinePlanRecord;
  manifest: OfflineBundleManifest;
}> {
  const { planId, profile, stops, max_snap_m } = args;

  return await idbWithTx([idbStores.plans, idbStores.packs], async (osMap) => {
    const plansOS = osMap.get(idbStores.plans);
    const packsOS = osMap.get(idbStores.packs);
    if (!plansOS || !packsOS) throw new Error("Missing plans/packs stores in tx");

    const plan = await osGet<OfflinePlanRecord>(plansOS, planId);
    if (!plan) throw new Error(`Offline plan not found: ${planId}`);

    const manifestRow = await osGet<StoredPack>(packsOS, packKey(planId, "manifest"));
    const navRow = await osGet<StoredPack>(packsOS, packKey(planId, "navpack"));
    const corRow = await osGet<StoredPack>(packsOS, packKey(planId, "corridor"));

    const manifest = manifestRow?.payload as OfflineBundleManifest | undefined;
    const prevNavpack = navRow?.payload as NavPack | undefined;
    const corridor = corRow?.payload as CorridorGraphPack | undefined;

    if (!manifest) throw new Error("Missing offline manifest pack");
    if (!prevNavpack) throw new Error("Missing offline navpack pack");
    if (!corridor) throw new Error("Missing offline corridor pack");

    // ✅ compute new route key for edited stops
    const route_key = computeOfflineRouteKey(profile, stops);

    // ✅ rebuild navpack using corridor only
    const navpack = rebuildNavpackOffline({
      prevNavpack,
      corridor,
      stops,
      route_key,
      max_snap_m,
    });

    // ✅ preview used by /trip to render instantly
    const preview: OfflinePlanPreview = {
      stops,
      geometry: navpack.primary.geometry,
      bbox: navpack.primary.bbox,
      distance_m: navpack.primary.distance_m,
      duration_s: navpack.primary.duration_s,
      profile,
    };

    // ✅ write updated navpack pack
    await osPut(packsOS, makePackRow(planId, "navpack", navpack));

    // ✅ write updated manifest pack (route_key is canonical for "bundle identity")
    const nextManifest: OfflineBundleManifest = {
      ...manifest,
      route_key,
      // optional: mark that local edits happened (harmless extra field if you don't want it)
      // @ts-expect-error - local-only extension
      edited_offline_at: new Date().toISOString(),
    };
    await osPut(packsOS, makePackRow(planId, "manifest", nextManifest));

    // ✅ write updated plan record (preview + route_key)
    const nextPlan: OfflinePlanRecord = {
      ...plan,
      route_key,
      preview,
      saved_at: new Date().toISOString(),
    };
    await osPut(plansOS, nextPlan);

    return { route_key, navpack, preview, plan: nextPlan, manifest: nextManifest };
  });
}
