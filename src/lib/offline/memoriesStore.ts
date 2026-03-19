// src/lib/offline/memoriesStore.ts
"use client";

import type { StopMemory, StopPhoto } from "@/lib/types/memories";
import { idbGet, idbGetAll, idbPut, idbDel, idbStores } from "./idb";
import { supabase } from "@/lib/supabase/client";

const MAX_PHOTOS = 5;

/* ── IDB helpers ─────────────────────────────────────────────────────── */

/**
 * Get all memories for a plan, sorted by stop_index.
 */
export async function getMemoriesForPlan(planId: string): Promise<StopMemory[]> {
  const all = await idbGetAll<StopMemory>(idbStores.memories);
  return all
    .filter((m) => m.plan_id === planId)
    .sort((a, b) => a.stop_index - b.stop_index);
}

/**
 * Get a single memory by its ID.
 */
export async function getMemory(id: string): Promise<StopMemory | undefined> {
  return idbGet<StopMemory>(idbStores.memories, id);
}

/**
 * Get the memory for a specific stop in a plan (if it exists).
 */
export async function getMemoryForStop(
  planId: string,
  stopId: string,
): Promise<StopMemory | undefined> {
  const all = await getMemoriesForPlan(planId);
  return all.find((m) => m.stop_id === stopId);
}

/**
 * Upsert a stop memory (offline-first: writes to IDB immediately).
 * Marks as dirty so sync can push to cloud later.
 */
export async function saveMemory(memory: StopMemory): Promise<StopMemory> {
  const now = new Date().toISOString();
  const rec: StopMemory = {
    ...memory,
    updated_at: now,
    dirty: true,
  };
  await idbPut(idbStores.memories, rec);
  return rec;
}

/**
 * Delete a memory from IDB.
 */
export async function deleteMemory(id: string): Promise<void> {
  await idbDel(idbStores.memories, id);
}

/**
 * Detach memories from a deleted plan. Memories with actual content
 * (notes or photos) are preserved with `plan_deleted: true` and blobs
 * stripped to save space. Empty memories (no note, no photos) are deleted
 * outright to prevent bloat.
 *
 * @param planId - The plan being deleted
 * @param planLabel - Snapshot of the plan label so journal can still display it
 * @returns Number of memories preserved (detached)
 */
export async function detachMemoriesForPlan(
  planId: string,
  planLabel: string | null,
): Promise<number> {
  const all = await getMemoriesForPlan(planId);
  if (!all.length) return 0;

  let preserved = 0;
  for (const mem of all) {
    const hasContent = !!mem.note || mem.photos.length > 0;

    if (!hasContent) {
      // No content - delete to save space
      await idbDel(idbStores.memories, mem.id);
      continue;
    }

    // Strip blobs from photos to reclaim storage (URLs/paths are kept for cloud fetch)
    const strippedPhotos: StopPhoto[] = mem.photos.map((p) => ({
      path: p.path,
      url: p.url,
      localUrl: p.localUrl,
      // blob intentionally omitted - reclaims the large binary data
    }));

    const detached: StopMemory = {
      ...mem,
      photos: strippedPhotos,
      plan_deleted: true,
      plan_label: planLabel,
      updated_at: new Date().toISOString(),
    };
    await idbPut(idbStores.memories, detached);
    preserved++;
  }

  return preserved;
}

/**
 * Hard-delete all memories for a plan (no preservation).
 * Use when the user explicitly wants to purge everything.
 */
export async function deleteMemoriesForPlan(planId: string): Promise<number> {
  const all = await getMemoriesForPlan(planId);
  for (const mem of all) {
    await idbDel(idbStores.memories, mem.id);
  }
  return all.length;
}

/**
 * Get all detached (orphaned) memories grouped by plan_id.
 * These are memories whose parent plan was deleted but the memory
 * had content worth preserving.
 */
export async function getDetachedMemories(): Promise<
  Map<string, { label: string | null; memories: StopMemory[] }>
> {
  const all = await idbGetAll<StopMemory>(idbStores.memories);
  const grouped = new Map<string, { label: string | null; memories: StopMemory[] }>();

  for (const mem of all) {
    if (!mem.plan_deleted) continue;

    let group = grouped.get(mem.plan_id);
    if (!group) {
      group = { label: mem.plan_label ?? null, memories: [] };
      grouped.set(mem.plan_id, group);
    }
    group.memories.push(mem);
  }

  // Sort memories within each group by stop_index
  for (const group of grouped.values()) {
    group.memories.sort((a, b) => a.stop_index - b.stop_index);
  }

  return grouped;
}

/**
 * Permanently purge all detached memories for a specific former plan.
 * Called when user dismisses past-trip memories from journal.
 */
export async function purgeDetachedMemories(planId: string): Promise<number> {
  const all = await idbGetAll<StopMemory>(idbStores.memories);
  const targets = all.filter((m) => m.plan_id === planId && m.plan_deleted);
  for (const mem of targets) {
    await idbDel(idbStores.memories, mem.id);
  }
  return targets.length;
}

/**
 * Record arrival at a stop - creates or updates the memory with arrived_at.
 */
export async function recordArrival(args: {
  planId: string;
  stopId: string;
  stopName: string | null;
  stopIndex: number;
  lat: number;
  lng: number;
}): Promise<StopMemory> {
  const existing = await getMemoryForStop(args.planId, args.stopId);
  if (existing) {
    // Don't overwrite an existing arrival
    if (existing.arrived_at) return existing;
    return saveMemory({ ...existing, arrived_at: Date.now() });
  }

  const now = new Date().toISOString();
  const mem: StopMemory = {
    id: crypto.randomUUID(),
    plan_id: args.planId,
    stop_id: args.stopId,
    stop_name: args.stopName,
    stop_index: args.stopIndex,
    note: null,
    photos: [],
    arrived_at: Date.now(),
    lat: args.lat,
    lng: args.lng,
    created_at: now,
    updated_at: now,
    dirty: true,
  };
  return saveMemory(mem);
}

/* ── Photo management ────────────────────────────────────────────────── */

/**
 * Add a photo to a memory. Stores the blob in IDB for offline.
 * Returns the updated memory. Enforces MAX_PHOTOS limit.
 */
export async function addPhoto(
  memoryId: string,
  file: File | Blob,
): Promise<StopMemory> {
  const mem = await getMemory(memoryId);
  if (!mem) throw new Error(`Memory not found: ${memoryId}`);
  if (mem.photos.length >= MAX_PHOTOS) {
    throw new Error(`Maximum ${MAX_PHOTOS} photos per stop`);
  }

  const ext = file instanceof File ? (file.name.split(".").pop() ?? "jpg") : "jpg";
  const idx = mem.photos.length + 1;
  const path = `${mem.plan_id}/${mem.stop_id}/${idx}.${ext}`;
  const localUrl = URL.createObjectURL(file);

  const photo: StopPhoto = {
    path,
    localUrl,
    blob: file,
  };

  const updated: StopMemory = {
    ...mem,
    photos: [...mem.photos, photo],
    dirty: true,
  };
  return saveMemory(updated);
}

/**
 * Remove a photo from a memory by index.
 */
export async function removePhoto(
  memoryId: string,
  photoIndex: number,
): Promise<StopMemory> {
  const mem = await getMemory(memoryId);
  if (!mem) throw new Error(`Memory not found: ${memoryId}`);

  const updated: StopMemory = {
    ...mem,
    photos: mem.photos.filter((_, i) => i !== photoIndex),
    dirty: true,
  };
  return saveMemory(updated);
}

/* ── Cloud sync ──────────────────────────────────────────────────────── */

/**
 * Upload all dirty memories to Supabase (photos to Storage, metadata to table).
 * Call periodically or when connectivity is restored.
 */
export async function syncMemoriesToCloud(): Promise<number> {
  const all = await idbGetAll<StopMemory>(idbStores.memories);
  const dirty = all.filter((m) => m.dirty);
  if (!dirty.length) return 0;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  let synced = 0;

  for (const mem of dirty) {
    try {
      // 1. Upload photos that have blobs (not yet uploaded)
      const uploadedPaths: string[] = [];
      for (const photo of mem.photos) {
        if (photo.blob) {
          const storagePath = `${user.id}/${photo.path}`;
          const { error } = await supabase.storage
            .from("memories")
            .upload(storagePath, photo.blob, {
              upsert: true,
              contentType: photo.blob.type || "image/jpeg",
            });
          if (error) {
            console.warn("[Memories] photo upload failed:", error.message);
            continue;
          }
          uploadedPaths.push(storagePath);
        } else {
          // Already uploaded
          uploadedPaths.push(photo.path.startsWith(user.id) ? photo.path : `${user.id}/${photo.path}`);
        }
      }

      // 2. Upsert memory row
      const { error: dbError } = await supabase.from("stop_memories").upsert(
        {
          id: mem.id,
          owner_id: user.id,
          plan_id: mem.plan_id,
          stop_id: mem.stop_id,
          stop_name: mem.stop_name,
          stop_index: mem.stop_index,
          note: mem.note,
          photo_paths: uploadedPaths,
          arrived_at: mem.arrived_at ? new Date(mem.arrived_at).toISOString() : null,
          lat: mem.lat,
          lng: mem.lng,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,plan_id,stop_id" },
      );

      if (dbError) {
        console.warn("[Memories] DB upsert failed:", dbError.message);
        continue;
      }

      // 3. Mark as clean in IDB (strip blobs to save space)
      const cleanPhotos: StopPhoto[] = mem.photos.map((p, i) => ({
        path: uploadedPaths[i] ?? p.path,
        localUrl: p.localUrl,
        // blob removed after successful upload
      }));

      await idbPut(idbStores.memories, {
        ...mem,
        photos: cleanPhotos,
        dirty: false,
      } satisfies StopMemory);

      synced++;
    } catch (e) {
      console.warn("[Memories] sync error for memory", mem.id, e);
    }
  }

  return synced;
}

/**
 * Get a signed URL for a photo stored in Supabase Storage.
 */
export async function getPhotoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("memories")
    .createSignedUrl(storagePath, 3600); // 1 hour
  if (error) {
    console.warn("[Memories] signed URL failed:", error.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Resolve display URLs for all photos in a memory.
 * Prefers localUrl (offline blob) over signed cloud URL.
 */
export async function resolvePhotoUrls(memory: StopMemory): Promise<string[]> {
  const urls: string[] = [];
  for (const photo of memory.photos) {
    if (photo.localUrl) {
      urls.push(photo.localUrl);
    } else if (photo.path) {
      const url = await getPhotoUrl(photo.path);
      if (url) urls.push(url);
    }
  }
  return urls;
}
