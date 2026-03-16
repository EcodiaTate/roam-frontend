// src/lib/offline/peerSync.ts
"use client";

/**
 * PeerSync
 *
 * Handles delta exchange of overlay data between roamers.
 * When the app detects a nearby roamer (via BLE or presence API),
 * it can request a delta of overlay data that the other roamer
 * has that is newer than our own cached data.
 *
 * The delta is merged into the local IDB overlay cache,
 * enriching the user's trip data with fresher intel.
 */

import { peerSyncApi } from "@/lib/api/peerSync";
import { idbGet, idbPut } from "@/lib/offline/idb";
import { networkMonitor } from "@/lib/offline/networkMonitor";
import type { PeerSyncDelta } from "@/lib/types/peer";

const IDB_PEER_OBS_KEY = "peer:received_observations";
const IDB_PEER_TRAFFIC_KEY = "peer:received_traffic";
const IDB_PEER_HAZARDS_KEY = "peer:received_hazards";
const IDB_PEER_FUEL_KEY = "peer:received_fuel";
const IDB_PEER_TIMESTAMPS_KEY = "peer:sync_timestamps";

type SyncTimestamps = Record<string, string>;

/**
 * Request a delta from the server and merge it into local IDB.
 * Call this when:
 * 1. A nearby roamer is detected (via BLE handshake → both hit server)
 * 2. The app regains connectivity (to pull latest crowd data)
 */
export async function syncPeerDelta(lat: number, lng: number, radiusKm = 200): Promise<PeerSyncDelta | null> {
  if (!networkMonitor.online) return null;

  try {
    // Get our last-known timestamps
    const timestamps = (await idbGet<SyncTimestamps>("meta", IDB_PEER_TIMESTAMPS_KEY)) ?? {};

    const delta = await peerSyncApi.sync({
      lat,
      lng,
      radius_km: radiusKm,
      overlay_timestamps: timestamps,
    });

    // Merge into local stores
    await _mergeObservations(delta);
    await _mergeTraffic(delta);
    await _mergeHazards(delta);
    await _mergeFuel(delta);

    // Update our timestamps
    const newTimestamps: SyncTimestamps = { ...timestamps };
    if (delta.observations.length > 0) {
      newTimestamps.observations = delta.generated_at;
    }
    if (delta.traffic_events.length > 0) {
      newTimestamps.traffic = delta.generated_at;
    }
    if (delta.hazard_events.length > 0) {
      newTimestamps.hazards = delta.generated_at;
    }
    if (delta.fuel_updates.length > 0) {
      newTimestamps.fuel = delta.generated_at;
    }
    await idbPut("meta", newTimestamps, IDB_PEER_TIMESTAMPS_KEY);

    return delta;
  } catch (e) {
    console.warn("[PeerSync] delta sync failed:", e);
    return null;
  }
}

/**
 * Get all peer-received data from local IDB (for offline rendering).
 */
async function getPeerData() {
  const [observations, traffic, hazards, fuel] = await Promise.all([
    idbGet("meta", IDB_PEER_OBS_KEY),
    idbGet("meta", IDB_PEER_TRAFFIC_KEY),
    idbGet("meta", IDB_PEER_HAZARDS_KEY),
    idbGet("meta", IDB_PEER_FUEL_KEY),
  ]);

  return {
    observations: (observations ?? []) as PeerSyncDelta["observations"],
    traffic_events: (traffic ?? []) as PeerSyncDelta["traffic_events"],
    hazard_events: (hazards ?? []) as PeerSyncDelta["hazard_events"],
    fuel_updates: (fuel ?? []) as PeerSyncDelta["fuel_updates"],
  };
}

/* ── Merge helpers ─────────────────────────────────────────────── */

async function _mergeObservations(delta: PeerSyncDelta) {
  if (delta.observations.length === 0) return;
  const existing = ((await idbGet("meta", IDB_PEER_OBS_KEY)) ?? []) as PeerSyncDelta["observations"];
  // Deduplicate by type+lat+lng (within 0.001° ≈ 111m)
  const key = (o: { type: string; lat: number; lng: number }) =>
    `${o.type}:${o.lat.toFixed(3)}:${o.lng.toFixed(3)}`;
  const seen = new Set(existing.map(key));
  const merged = [...existing];
  for (const obs of delta.observations) {
    const k = key(obs);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(obs);
    }
  }
  // Keep only most recent 500
  merged.sort((a, b) => b.last_reported_at.localeCompare(a.last_reported_at));
  await idbPut("meta", merged.slice(0, 500), IDB_PEER_OBS_KEY);
}

async function _mergeTraffic(delta: PeerSyncDelta) {
  if (delta.traffic_events.length === 0) return;
  const existing = ((await idbGet("meta", IDB_PEER_TRAFFIC_KEY)) ?? []) as PeerSyncDelta["traffic_events"];
  const seenIds = new Set(existing.map((e) => e.id));
  const merged = [...existing];
  for (const ev of delta.traffic_events) {
    if (!seenIds.has(ev.id)) {
      seenIds.add(ev.id);
      merged.push(ev);
    }
  }
  // Keep most recent entries
  merged.sort((a, b) => (b.last_updated ?? "").localeCompare(a.last_updated ?? ""));
  await idbPut("meta", merged.slice(0, 300), IDB_PEER_TRAFFIC_KEY);
}

async function _mergeHazards(delta: PeerSyncDelta) {
  if (delta.hazard_events.length === 0) return;
  const existing = ((await idbGet("meta", IDB_PEER_HAZARDS_KEY)) ?? []) as PeerSyncDelta["hazard_events"];
  const seenIds = new Set(existing.map((e) => e.id));
  const merged = [...existing];
  for (const ev of delta.hazard_events) {
    if (!seenIds.has(ev.id)) {
      seenIds.add(ev.id);
      merged.push(ev);
    }
  }
  // Keep most recent entries
  merged.sort((a, b) => (b.issued_at ?? "").localeCompare(a.issued_at ?? ""));
  await idbPut("meta", merged.slice(0, 300), IDB_PEER_HAZARDS_KEY);
}

async function _mergeFuel(delta: PeerSyncDelta) {
  if (delta.fuel_updates.length === 0) return;
  const existing = ((await idbGet("meta", IDB_PEER_FUEL_KEY)) ?? []) as PeerSyncDelta["fuel_updates"];
  const seenIds = new Set(existing.map((s) => s.id ?? s.name));
  const merged = [...existing];
  for (const s of delta.fuel_updates) {
    const k = s.id ?? s.name;
    if (!seenIds.has(k)) {
      seenIds.add(k);
      merged.push(s);
    }
  }
  // Keep entries with most recent fuel prices first
  merged.sort((a, b) => a.name.localeCompare(b.name));
  await idbPut("meta", merged.slice(0, 500), IDB_PEER_FUEL_KEY);
}
