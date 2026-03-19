// src/lib/offline/savedPlacesStore.ts
//
// Offline-first saved places (bookmarks).
// IndexedDB is the source of truth locally; Supabase syncs when authed.
"use client";

import { idbPut, idbGet, idbStores } from "./idb";
import type { PlaceCategory, PlaceExtra } from "@/lib/types/places";

// ── Types ─────────────────────────────────────────────────────────────────

export type SavedPlace = {
  /** Local IDB key - also used as Supabase row id */
  id: string;
  /** PlaceItem.id from OSM / geocoder */
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  /** Optional personal note */
  note: string | null;
  saved_at: string; // ISO-8601
  /** Enriched place metadata (phone, website, hours, facilities, etc.) */
  extra?: (PlaceExtra & Record<string, unknown>) | null;
};

// ── IDB store key ──────────────────────────────────────────────────────────
// Reusing the "meta" store with a single serialised blob is the lightest
// option that keeps the IDB version intact (no schema migration needed for
// the frontend-only path).  We store the whole array under one meta key.

const META_KEY = "saved_places_v1";

// ── Helpers ────────────────────────────────────────────────────────────────

async function readAll(): Promise<SavedPlace[]> {
  const raw = await idbGet<SavedPlace[]>(idbStores.meta, META_KEY);
  return Array.isArray(raw) ? raw : [];
}

async function writeAll(places: SavedPlace[]): Promise<void> {
  await idbPut(idbStores.meta, places, META_KEY);
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function listSavedPlaces(): Promise<SavedPlace[]> {
  const items = await readAll();
  return items.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}

export async function getSavedPlace(placeId: string): Promise<SavedPlace | undefined> {
  const items = await readAll();
  return items.find((p) => p.place_id === placeId);
}

export async function isPlaceSaved(placeId: string): Promise<boolean> {
  const items = await readAll();
  return items.some((p) => p.place_id === placeId);
}

export async function savePlace(input: {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  note?: string | null;
  extra?: (PlaceExtra & Record<string, unknown>) | null;
}): Promise<SavedPlace> {
  const items = await readAll();
  const existing = items.find((p) => p.place_id === input.place_id);
  if (existing) return existing; // idempotent

  const entry: SavedPlace = {
    id: crypto.randomUUID(),
    place_id: input.place_id,
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    category: input.category,
    note: input.note ?? null,
    saved_at: new Date().toISOString(),
    extra: input.extra ?? null,
  };

  await writeAll([...items, entry]);
  return entry;
}

export async function unsavePlace(placeId: string): Promise<void> {
  const items = await readAll();
  await writeAll(items.filter((p) => p.place_id !== placeId));
}

export async function updateSavedPlaceNote(placeId: string, note: string | null): Promise<void> {
  const items = await readAll();
  const updated = items.map((p) =>
    p.place_id === placeId ? { ...p, note } : p,
  );
  await writeAll(updated);
}

// ── Supabase cloud sync ────────────────────────────────────────────────────

export async function mergeSavedPlacesFromCloud(remote: SavedPlace[]): Promise<void> {
  const local = await readAll();
  const localMap = new Map(local.map((p) => [p.place_id, p]));

  for (const r of remote) {
    if (!localMap.has(r.place_id)) {
      localMap.set(r.place_id, r);
    }
    // Local is always at least as fresh - no overwrite needed
  }

  await writeAll(Array.from(localMap.values()));
}
