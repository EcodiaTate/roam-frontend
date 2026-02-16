// src/lib/offline/plansStore.ts
"use client";

import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { TripStop } from "@/lib/types/trip";
import type { BBox4 } from "@/lib/types/geo";
import { idbDel, idbGet, idbGetAll, idbPut, idbStores, idbWithTx } from "./idb";
import { emitPlanEvent } from "./planEvents";

/* ── Types ────────────────────────────────────────────────────────────── */

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

  // Offline preview (so /trip can render without unpacking zip)
  preview?: OfflinePlanPreview;

  // Sync metadata (set by planSync when cloud mirror exists)
  sync_version?: number;
  share_code?: string | null;
  is_shared?: boolean;
};

const META_CURRENT_PLAN_ID = "current_plan_id";

/**
 * All pack kinds stored per plan in the packs store.
 * Keys are "${planId}:${kind}".
 */
const PACK_KINDS = [
  "manifest",
  "navpack",
  "corridor",
  "places",
  "traffic",
  "hazards",
] as const;

/* ── IDB helpers ──────────────────────────────────────────────────────── */

function osPut(os: IDBObjectStore, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = os.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IDB put failed"));
  });
}

function osDel(os: IDBObjectStore, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = os.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IDB delete failed"));
  });
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Save a new offline plan from a freshly-built bundle.
 * Emits plan:saved so planSync can enqueue a cloud upsert.
 */
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

  // Fire-and-forget: notify planSync to push this to Supabase
  emitPlanEvent("plan:saved", { planId: rec.plan_id });

  return rec;
}

/**
 * List all offline plans, sorted newest-first.
 */
export async function listOfflinePlans(): Promise<OfflinePlanRecord[]> {
  const all = await idbGetAll<OfflinePlanRecord>(idbStores.plans);
  return all.sort((a, b) => (b.saved_at ?? "").localeCompare(a.saved_at ?? ""));
}

/**
 * Get a single plan record by ID.
 */
export async function getOfflinePlan(planId: string): Promise<OfflinePlanRecord | undefined> {
  return await idbGet<OfflinePlanRecord>(idbStores.plans, planId);
}

/**
 * CASCADING DELETE: removes the plan record AND all associated packs
 * (navpack, corridor, places, traffic, hazards, manifest) from IDB.
 *
 * Also clears the current-plan pointer if it matches, and removes
 * any guide packs keyed to this plan.
 *
 * Emits plan:deleted so planSync can enqueue a cloud delete.
 */
export async function deleteOfflinePlan(planId: string): Promise<void> {
  // Clear current-plan pointer if it's this plan
  const current = await getCurrentPlanId();
  if (current === planId) {
    await setCurrentPlanId(null);
  }

  // Atomic delete: plan record + all packs in one transaction
  await idbWithTx([idbStores.plans, idbStores.packs], async (osMap) => {
    const plansOs = osMap.get(idbStores.plans);
    const packsOs = osMap.get(idbStores.packs);

    if (!plansOs || !packsOs) {
      throw new Error("Missing IDB stores in delete transaction");
    }

    // Delete the plan record itself
    await osDel(plansOs, planId);

    // Delete all packs for this plan: ${planId}:manifest, ${planId}:navpack, etc.
    for (const kind of PACK_KINDS) {
      const packKey = `${planId}:${kind}`;
      try {
        await osDel(packsOs, packKey);
      } catch {
        // Ignore missing keys — the pack may not have been saved
      }
    }
  });

  // Best-effort: clean up guide packs (stored separately, non-critical)
  try {
    await _deleteGuidePacks(planId);
  } catch {
    // Guide packs are non-critical — don't fail the delete
  }

  // Notify planSync
  emitPlanEvent("plan:deleted", { planId });
}

/**
 * Delete guide packs for a plan. Guide packs are stored in the packs
 * store with keys like "${planId}:guide:${guideKey}".
 * We use a cursor scan since guide keys are dynamic.
 */
async function _deleteGuidePacks(planId: string): Promise<void> {
  const prefix = `${planId}:guide:`;
  const allPacks = await idbGetAll<{ k: string }>(idbStores.packs);
  const guideKeys = allPacks
    .filter((p) => typeof p?.k === "string" && p.k.startsWith(prefix))
    .map((p) => p.k);

  for (const key of guideKeys) {
    try {
      await idbDel(idbStores.packs, key);
    } catch {
      // best-effort
    }
  }
}

/**
 * Get the "currently active" plan ID from meta store.
 */
export async function getCurrentPlanId(): Promise<string | null> {
  const v = await idbGet<string | null>(idbStores.meta, META_CURRENT_PLAN_ID);
  return typeof v === "string" && v.length ? v : null;
}

/**
 * Set the "currently active" plan ID.
 */
export async function setCurrentPlanId(planId: string | null): Promise<void> {
  await idbPut(idbStores.meta, planId, META_CURRENT_PLAN_ID);
}

/**
 * Rename a plan. This is a lightweight update that only touches the
 * label field. Emits plan:labeled for sync (label-only cloud push).
 */
export async function renameOfflinePlan(
  planId: string,
  label: string,
): Promise<OfflinePlanRecord> {
  const cur = await getOfflinePlan(planId);
  if (!cur) throw new Error(`Offline plan not found: ${planId}`);

  const trimmed = label.trim().slice(0, 100) || null;
  const next: OfflinePlanRecord = {
    ...cur,
    label: trimmed,
    saved_at: new Date().toISOString(),
  };

  await idbPut(idbStores.plans, next);

  emitPlanEvent("plan:labeled", {
    planId: next.plan_id,
    label: next.label,
  });

  return next;
}

/**
 * Update an existing plan record (non-atomic, single-store).
 * Emits plan:saved so planSync can push changes.
 */
export async function updateOfflinePlan(
  planId: string,
  patch: Partial<OfflinePlanRecord>,
): Promise<OfflinePlanRecord> {
  const cur = await getOfflinePlan(planId);
  if (!cur) throw new Error(`Offline plan not found: ${planId}`);

  const next: OfflinePlanRecord = {
    ...cur,
    ...patch,
    plan_id: cur.plan_id,
    saved_at: new Date().toISOString(),
  };

  await idbPut(idbStores.plans, next);

  // Determine event type
  const isLabelOnly =
    patch.label !== undefined &&
    Object.keys(patch).every((k) => k === "label");

  emitPlanEvent(isLabelOnly ? "plan:labeled" : "plan:saved", {
    planId: next.plan_id,
    label: next.label,
  });

  return next;
}

/**
 * Atomic variant used by offline route edits.
 * Emits plan:saved for sync.
 */
export async function updateOfflinePlanAtomic(
  planId: string,
  patch: Partial<OfflinePlanRecord>,
): Promise<OfflinePlanRecord> {
  const result = await idbWithTx([idbStores.plans], async (osMap) => {
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

  // Emit after transaction commits
  emitPlanEvent("plan:saved", { planId: result.plan_id });

  return result;
}

/**
 * Write a plan record directly to IDB without emitting sync events.
 * Used by planSync itself when merging remote changes to avoid infinite loops.
 */
export async function _putPlanRecordRaw(rec: OfflinePlanRecord): Promise<void> {
  await idbPut(idbStores.plans, rec);
}