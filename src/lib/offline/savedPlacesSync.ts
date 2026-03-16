// src/lib/offline/savedPlacesSync.ts
//
// Pushes locally-saved places to Supabase when online.
// Unlike plans (which use a FIFO queue), saved places are small enough
// to diff-and-push in a single pass.
"use client";

import { supabase } from "@/lib/supabase/client";
import { listSavedPlaces } from "./savedPlacesStore";
import {
  cloudListSavedPlaces,
  cloudUpsertSavedPlace,
  cloudDeleteSavedPlace,
} from "@/lib/supabase/savedPlacesCloud";
import { mergeSavedPlacesFromCloud } from "./savedPlacesStore";

/**
 * Full bidirectional sync for saved places:
 *   1. Pull remote → merge into local (adds cloud-only places locally)
 *   2. Push local → upsert to cloud (adds local-only places to cloud)
 *
 * Safe to call frequently — idempotent and best-effort.
 * Returns the number of places pushed to cloud.
 */
export async function syncSavedPlacesToCloud(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  try {
    // 1. Pull remote → merge locally
    const remote = await cloudListSavedPlaces();
    await mergeSavedPlacesFromCloud(remote);

    // 2. Push local-only places to cloud
    const local = await listSavedPlaces();
    const remoteIds = new Set(remote.map((r) => r.place_id));

    let pushed = 0;
    for (const place of local) {
      if (!remoteIds.has(place.place_id)) {
        try {
          await cloudUpsertSavedPlace(place);
          pushed++;
        } catch {
          // Best-effort per place — continue with others
        }
      }
    }

    return pushed;
  } catch {
    // Cloud sync is best-effort
    return 0;
  }
}
