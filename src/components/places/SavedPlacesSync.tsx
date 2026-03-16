// src/components/places/SavedPlacesSync.tsx
//
// Headless component mounted once in the app layout.
// Connects useSavedPlaces to PlaceDetailContext so PlaceDetailSheet
// can read and toggle bookmark state without prop-drilling.
"use client";

import { useEffect } from "react";
import { usePlaceDetail } from "@/lib/context/PlaceDetailContext";
import { useSavedPlaces } from "@/lib/hooks/useSavedPlaces";
import {
  savePlace,
  unsavePlace,
} from "@/lib/offline/savedPlacesStore";
import { supabase } from "@/lib/supabase/client";
import {
  cloudUpsertSavedPlace,
  cloudDeleteSavedPlace,
} from "@/lib/supabase/savedPlacesCloud";

export function SavedPlacesSync() {
  const { registerSaveHandler, setSavedIds, place } = usePlaceDetail();
  const { places, reload } = useSavedPlaces();

  // Keep context savedIds current
  useEffect(() => {
    setSavedIds(new Set(places.map((p) => p.place_id)));
  }, [places, setSavedIds]);

  // Register the save handler.
  // The handler is called by PlaceDetailSheet with the current place.id.
  // We reconstruct the full entry from the `place` in context (same object).
  useEffect(() => {
    registerSaveHandler(async (placeId: string) => {
      if (!place || place.id !== placeId) return;

      const isSaved = places.some((p) => p.place_id === placeId);

      if (isSaved) {
        await unsavePlace(placeId);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await cloudDeleteSavedPlace(placeId);
        } catch {}
      } else {
        const entry = await savePlace({
          place_id: place.id,
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          category: place.category,
        });
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await cloudUpsertSavedPlace(entry);
        } catch {}
      }

      await reload();
    });

    return () => registerSaveHandler(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSaveHandler, place, places, reload]);

  return null;
}
