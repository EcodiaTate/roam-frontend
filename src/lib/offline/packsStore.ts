// src/lib/offline/packsStore.ts
"use client";

import { idbDel, idbGet, idbPut, idbStores, idbWithTx } from "./idb";

import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack } from "@/lib/types/places";

export type PackKind = "manifest" | "navpack" | "corridor" | "places" | "traffic" | "hazards";

export type StoredPack =
  | { k: string; plan_id: string; kind: "manifest"; saved_at: number; payload: OfflineBundleManifest }
  | { k: string; plan_id: string; kind: "navpack"; saved_at: number; payload: NavPack }
  | { k: string; plan_id: string; kind: "corridor"; saved_at: number; payload: CorridorGraphPack }
  | { k: string; plan_id: string; kind: "places"; saved_at: number; payload: PlacesPack }
  | { k: string; plan_id: string; kind: "traffic"; saved_at: number; payload: TrafficOverlay }
  | { k: string; plan_id: string; kind: "hazards"; saved_at: number; payload: HazardOverlay };

function k(planId: string, kind: PackKind) {
  return `${planId}:${kind}`;
}

function makeRow(planId: string, kind: PackKind, payload: any): StoredPack {
  return {
    k: k(planId, kind),
    plan_id: planId,
    kind: kind as any,
    saved_at: Date.now(),
    payload: payload as any,
  } as any;
}

function osPut(os: IDBObjectStore, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = os.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IDB put failed"));
  });
}

export async function putPack<T>(planId: string, kind: PackKind, payload: T): Promise<void> {
  const row = makeRow(planId, kind, payload);
  await idbPut(idbStores.packs, row);
}

export async function getPack<T>(planId: string, kind: PackKind): Promise<T | undefined> {
  const row = await idbGet<StoredPack>(idbStores.packs, k(planId, kind));
  return row?.payload as T | undefined;
}

export async function hasCorePacks(planId: string): Promise<boolean> {
  const [m, n, c] = await Promise.all([
    getPack<OfflineBundleManifest>(planId, "manifest"),
    getPack<NavPack>(planId, "navpack"),
    getPack<CorridorGraphPack>(planId, "corridor"),
  ]);
  return !!(m && n && c);
}

export async function getAllPacks(planId: string) {
  const [manifest, navpack, corridor, places, traffic, hazards] = await Promise.all([
    getPack<OfflineBundleManifest>(planId, "manifest"),
    getPack<NavPack>(planId, "navpack"),
    getPack<CorridorGraphPack>(planId, "corridor"),
    getPack<PlacesPack>(planId, "places"),
    getPack<TrafficOverlay>(planId, "traffic"),
    getPack<HazardOverlay>(planId, "hazards"),
  ]);
  return { manifest, navpack, corridor, places, traffic, hazards };
}

export async function deleteAllPacks(planId: string): Promise<void> {
  const kinds: PackKind[] = ["manifest", "navpack", "corridor", "places", "traffic", "hazards"];
  await Promise.all(kinds.map((kind) => idbDel(idbStores.packs, k(planId, kind))));
}

/**
 * ✅ Atomic: put multiple packs in the same transaction.
 * Used for offline edits where plan + navpack + manifest must stay consistent.
 */
export async function putPacksAtomic(args: {
  planId: string;
  updates: Partial<Record<PackKind, any>>;
}): Promise<void> {
  const { planId, updates } = args;

  await idbWithTx([idbStores.packs], async (osMap) => {
    const os = osMap.get(idbStores.packs);
    if (!os) throw new Error("packs store missing in tx");

    const entries = Object.entries(updates) as [PackKind, any][];
    for (const [kind, payload] of entries) {
      if (payload === undefined) continue;
      await osPut(os, makeRow(planId, kind, payload));
    }
  });
}
