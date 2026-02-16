"use client";

import { idbGetAll, idbPut, idbDel, idbGet, idbStores } from "./idb";
import type { EmergencyContact, EmergencyContactLocal } from "@/lib/types/emergency";

function nowIso() {
  return new Date().toISOString();
}

function normalizePhone(raw: string) {
  // Keep it simple: trim, collapse spaces.
  // (If you later want E.164 normalization, do it here.)
  return (raw ?? "").trim().replace(/\s+/g, " ");
}

export async function listEmergencyContacts(): Promise<EmergencyContactLocal[]> {
  const items = await idbGetAll<EmergencyContactLocal>(idbStores.emergency);
  // newest first by local updated
  return (items ?? []).sort((a, b) => (b._local_updated_at || "").localeCompare(a._local_updated_at || ""));
}

export async function getEmergencyContact(id: string): Promise<EmergencyContactLocal | undefined> {
  return await idbGet<EmergencyContactLocal>(idbStores.emergency, id);
}

export async function upsertEmergencyContact(input: EmergencyContact): Promise<EmergencyContactLocal> {
  const created = input.created_at ?? nowIso();
  const updated = input.updated_at ?? nowIso();

  const next: EmergencyContactLocal = {
    id: input.id,
    name: (input.name ?? "").trim(),
    phone: normalizePhone(input.phone ?? ""),
    relationship: input.relationship ?? null,
    notes: input.notes ?? null,
    created_at: created,
    updated_at: updated,
    _local_updated_at: nowIso(),
  };

  if (!next.id) throw new Error("Emergency contact missing id");
  if (!next.name) throw new Error("Name is required");
  if (!next.phone) throw new Error("Phone is required");

  await idbPut(idbStores.emergency, next);
  return next;
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  await idbDel(idbStores.emergency, id);
}

// Merge from cloud into local (local-first with updated_at comparison)
export async function mergeEmergencyFromCloud(remote: EmergencyContact[]): Promise<void> {
  const local = await idbGetAll<EmergencyContactLocal>(idbStores.emergency);
  const localMap = new Map(local.map((x) => [x.id, x]));

  for (const r of remote) {
    const existing = localMap.get(r.id);
    const rUpdated = r.updated_at ?? r.created_at ?? "";
    const lUpdated = existing?.updated_at ?? existing?.created_at ?? existing?._local_updated_at ?? "";

    // If we don't have it, or remote looks newer, take remote.
    if (!existing || (rUpdated && (!lUpdated || rUpdated > lUpdated))) {
      await idbPut(idbStores.emergency, {
        ...existing,
        ...r,
        relationship: r.relationship ?? null,
        notes: r.notes ?? null,
        _local_updated_at: nowIso(),
      } satisfies EmergencyContactLocal);
    }
  }
}
