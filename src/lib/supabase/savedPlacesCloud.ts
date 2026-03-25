// src/lib/supabase/savedPlacesCloud.ts
// Supabase sync layer for saved places.

import { supabase } from "@/lib/supabase/client";
import type { SavedPlace } from "@/lib/offline/savedPlacesStore";

const TABLE = "saved_places";

export async function cloudListSavedPlaces(): Promise<SavedPlace[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, place_id, name, lat, lng, category, note, saved_at, extra")
    .order("saved_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as SavedPlace[];
}

export async function cloudUpsertSavedPlace(p: SavedPlace): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert(
    {
      id: p.id,
      place_id: p.place_id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      category: p.category,
      note: p.note ?? null,
      saved_at: p.saved_at,
      extra: p.extra ?? null,
    },
    { onConflict: "user_id,place_id" },
  );
  if (error) throw new Error(error.message);
}

export async function cloudDeleteSavedPlace(placeId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("place_id", placeId);
  if (error) throw new Error(error.message);
}
