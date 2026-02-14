// src/lib/offline/plansStore.ts
"use client";

import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { TripStop } from "@/lib/types/trip";
import type { BBox4 } from "@/lib/types/geo";
import { idbDel, idbGet, idbGetAll, idbPut, idbStores, idbWithTx } from "./idb";

export type OfflinePlanPreview = {
  stops: TripStop[];
  geometry: string; // polyline6
  bbox: BBox4;
  distance_m: number;
  duration_s: number;
  profile: string;
};

export type OfflinePlanRecord = {
  plan_id: string;
  route_key: string;
  created_at: string;

  // Bundle status mirrors manifest (handy for UI)
  corridor_status?: string;
  places_status?: string;
  traffic_status?: string;
  hazards_status?: string;

  corridor_key?: string | null;
  places_key?: string | null;
  traffic_key?: string | null;
  hazards_key?: string | null;

  styles?: string[];
  tiles_id?: string;

  // Stored zip blob
  zip_bytes?: number;
  zip_mime?: string; // "application/zip"
  zip_blob?: Blob;

  // UX
  label?: string | null;
  saved_at: string; // local time ISO

  // ✅ Offline preview (so /trip can render without unpacking zip)
  preview?: OfflinePlanPreview;
};

const META_CURRENT_PLAN_ID = "current_plan_id";

function osPut(os: IDBObjectStore, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = os.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IDB put failed"));
  });
}

export async function saveOfflinePlan(args: {
  manifest: OfflineBundleManifest;
  zipBlob: Blob;
  zipBytes: number;
  zipMime: string;
  preview: OfflinePlanPreview;
}): Promise<OfflinePlanRecord> {
  const m = args.manifest;

  const rec: OfflinePlanRecord = {
    plan_id: m.plan_id,
    route_key: m.route_key,
    created_at: m.created_at,

    corridor_status: (m as any).corridor_status,
    places_status: (m as any).places_status,
    traffic_status: (m as any).traffic_status,
    hazards_status: (m as any).hazards_status,

    corridor_key: (m as any).corridor_key ?? null,
    places_key: (m as any).places_key ?? null,
    traffic_key: (m as any).traffic_key ?? null,
    hazards_key: (m as any).hazards_key ?? null,

    styles: (m as any).styles ?? [],
    tiles_id: (m as any).tiles_id ?? "australia",

    zip_bytes: args.zipBytes,
    zip_mime: args.zipMime,
    zip_blob: args.zipBlob,

    label: null,
    saved_at: new Date().toISOString(),

    preview: args.preview,
  };

  await idbPut(idbStores.plans, rec);
  return rec;
}

export async function listOfflinePlans(): Promise<OfflinePlanRecord[]> {
  const all = await idbGetAll<OfflinePlanRecord>(idbStores.plans);
  return all.sort((a, b) => (b.saved_at ?? "").localeCompare(a.saved_at ?? ""));
}

export async function getOfflinePlan(planId: string): Promise<OfflinePlanRecord | undefined> {
  return await idbGet<OfflinePlanRecord>(idbStores.plans, planId);
}

export async function deleteOfflinePlan(planId: string): Promise<void> {
  const current = await getCurrentPlanId();
  if (current === planId) {
    await setCurrentPlanId(null);
  }
  await idbDel(idbStores.plans, planId);
}

export async function getCurrentPlanId(): Promise<string | null> {
  const v = await idbGet<string | null>(idbStores.meta, META_CURRENT_PLAN_ID);
  return typeof v === "string" && v.length ? v : null;
}

export async function setCurrentPlanId(planId: string | null): Promise<void> {
  await idbPut(idbStores.meta, planId, META_CURRENT_PLAN_ID);
}

/**
 * ✅ Update an existing plan record (non-atomic, single-store)
 */
export async function updateOfflinePlan(planId: string, patch: Partial<OfflinePlanRecord>): Promise<OfflinePlanRecord> {
  const cur = await getOfflinePlan(planId);
  if (!cur) throw new Error(`Offline plan not found: ${planId}`);
  const next: OfflinePlanRecord = {
    ...cur,
    ...patch,
    plan_id: cur.plan_id,
    saved_at: new Date().toISOString(),
  };
  await idbPut(idbStores.plans, next);
  return next;
}

/**
 * ✅ Atomic variant used by offline route edits.
 */
export async function updateOfflinePlanAtomic(planId: string, patch: Partial<OfflinePlanRecord>): Promise<OfflinePlanRecord> {
  return await idbWithTx([idbStores.plans], async (osMap) => {
    const os = osMap.get(idbStores.plans);
    if (!os) throw new Error("plans store missing in tx");

    const cur = await getOfflinePlan(planId);
    if (!cur) throw new Error(`Offline plan not found: ${planId}`);

    const next: OfflinePlanRecord = {
      ...cur,
      ...patch,
      plan_id: cur.plan_id,
      saved_at: new Date().toISOString(),
    };

    await osPut(os, next);
    return next;
  });
}
