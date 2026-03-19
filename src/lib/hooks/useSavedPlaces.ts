// src/lib/hooks/useSavedPlaces.ts
//
// React hook for saved places - reads from IndexedDB, syncs with Supabase
// when the user is authenticated.
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { PlaceItem } from "@/lib/types/places";
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

  const savedIds = useMemo(() => new Set(places.map((p) => p.place_id)), [places]);

  const isSaved = useCallback(
    (placeId: string) => savedIds.has(placeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places],
  );

  const toggleSave = useCallback(
    async (place: PlaceItem) => {
      if (savedIds.has(place.id)) {
        // Unsave - optimistic removal first
        const snapshot = places;
        setPlaces((prev) => prev.filter((p) => p.place_id !== place.id));

        try {
          await unsavePlace(place.id);
          // Cloud delete (best-effort)
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await cloudDeleteSavedPlace(place.id);
        } catch {
          // Revert on failure
          setPlaces(snapshot);
        }
      } else {
        // Save - optimistic insertion first with a provisional entry
        const now = new Date().toISOString();
        const provisional: SavedPlace = {
          id: crypto.randomUUID(),
          place_id: place.id,
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          category: place.category,
          extra: place.extra ?? null,
          note: null,
          saved_at: now,
        };
        const snapshot = places;
        setPlaces((prev) => [provisional, ...prev]);

        try {
          const entry = await savePlace({
            place_id: place.id,
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            category: place.category,
            extra: place.extra ?? null,
          });
          // Replace provisional with real entry (has correct IDB id)
          setPlaces((prev) => prev.map((p) => p.id === provisional.id ? entry : p));
          // Cloud upsert (best-effort)
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await cloudUpsertSavedPlace(entry);
        } catch {
          // Revert on failure
          setPlaces(snapshot);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places, savedIds],
  );

  const removeSaved = useCallback(async (placeId: string) => {
    // Optimistic removal
    const snapshot = places;
    setPlaces((prev) => prev.filter((p) => p.place_id !== placeId));

    try {
      await unsavePlace(placeId);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await cloudDeleteSavedPlace(placeId);
    } catch {
      // Revert on failure
      setPlaces(snapshot);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  const updateNote = useCallback(async (placeId: string, note: string | null) => {
    // Optimistic note update
    const prevNote = places.find((p) => p.place_id === placeId)?.note ?? null;
    setPlaces((prev) =>
      prev.map((p) => (p.place_id === placeId ? { ...p, note } : p)),
    );

    try {
      await updateSavedPlaceNote(placeId, note);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const updated = places.find((p) => p.place_id === placeId);
        if (updated) await cloudUpsertSavedPlace({ ...updated, note });
      }
    } catch {
      // Revert on failure
      setPlaces((prev) =>
        prev.map((p) => (p.place_id === placeId ? { ...p, note: prevNote } : p)),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  return { places, savedIds, isLoading, toggleSave, removeSaved, updateNote, isSaved, reload };
}
