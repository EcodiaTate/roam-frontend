// src/lib/hooks/useSavedPlaces.ts
//
// React hook for saved places — reads from IndexedDB, syncs with Supabase
// when the user is authenticated.
"use client";

import { useState, useEffect, useCallback } from "react";
import type { PlaceCategory, PlaceItem } from "@/lib/types/places";
import {
  listSavedPlaces,
  savePlace,
  unsavePlace,
  updateSavedPlaceNote,
  mergeSavedPlacesFromCloud,
  type SavedPlace,
} from "@/lib/offline/savedPlacesStore";
import { supabase } from "@/lib/supabase/client";
import {
  cloudListSavedPlaces,
  cloudUpsertSavedPlace,
  cloudDeleteSavedPlace,
} from "@/lib/supabase/savedPlacesCloud";

// ── Hook ──────────────────────────────────────────────────────────────────

export type UseSavedPlacesResult = {
  places: SavedPlace[];
  savedIds: Set<string>;
  isLoading: boolean;
  toggleSave: (place: PlaceItem) => Promise<void>;
  removeSaved: (placeId: string) => Promise<void>;
  updateNote: (placeId: string, note: string | null) => Promise<void>;
  isSaved: (placeId: string) => boolean;
  reload: () => Promise<void>;
};

export function useSavedPlaces(): UseSavedPlacesResult {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    const all = await listSavedPlaces();
    setPlaces(all);
    setIsLoading(false);
  }, []);

  // Initial load + cloud sync
  useEffect(() => {
    let cancelled = false;

    async function init() {
      await reload();

      // Sync with Supabase if authenticated
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const remote = await cloudListSavedPlaces();
        if (cancelled) return;

        await mergeSavedPlacesFromCloud(remote);
        if (!cancelled) await reload();
      } catch {
        // Cloud sync is best-effort; offline works fine without it
      }
    }

    init();
    return () => { cancelled = true; };
  }, [reload]);

  const savedIds = new Set(places.map((p) => p.place_id));

  const isSaved = useCallback(
    (placeId: string) => savedIds.has(placeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places],
  );

  const toggleSave = useCallback(
    async (place: PlaceItem) => {
      if (savedIds.has(place.id)) {
        // Unsave
        await unsavePlace(place.id);
        setPlaces((prev) => prev.filter((p) => p.place_id !== place.id));

        // Cloud delete (best-effort)
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await cloudDeleteSavedPlace(place.id);
        } catch {}
      } else {
        // Save
        const entry = await savePlace({
          place_id: place.id,
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          category: place.category,
        });
        setPlaces((prev) => [entry, ...prev]);

        // Cloud upsert (best-effort)
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await cloudUpsertSavedPlace(entry);
        } catch {}
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places, savedIds],
  );

  const removeSaved = useCallback(async (placeId: string) => {
    await unsavePlace(placeId);
    setPlaces((prev) => prev.filter((p) => p.place_id !== placeId));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await cloudDeleteSavedPlace(placeId);
    } catch {}
  }, []);

  const updateNote = useCallback(async (placeId: string, note: string | null) => {
    await updateSavedPlaceNote(placeId, note);
    setPlaces((prev) =>
      prev.map((p) => (p.place_id === placeId ? { ...p, note } : p)),
    );

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const updated = places.find((p) => p.place_id === placeId);
        if (updated) await cloudUpsertSavedPlace({ ...updated, note });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  return { places, savedIds, isLoading, toggleSave, removeSaved, updateNote, isSaved, reload };
}
