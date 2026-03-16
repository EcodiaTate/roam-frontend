// src/lib/supabase/publicTrips.ts
// CRUD and feed operations for the public trips sharing system.

import { supabase } from "./client";
import type { PublicTripRow, PublishTripPayload, DiscoverFeedOptions } from "@/lib/types/discover";
import type { TripStop } from "@/lib/types/trip";
import type { OfflinePlanPreview } from "@/lib/offline/plansStore";

/* ── Title generation ─────────────────────────────────────────────── */

/**
 * Generate a human-readable title from a stop list.
 * "Brisbane → Cairns" or "Brisbane → Townsville → Cairns"
 */
export function generateTripTitle(stops: TripStop[]): string {
  if (!stops.length) return "Unnamed trip";

  const start = stops.find((s) => s.type === "start") ?? stops[0];
  const end = stops.find((s) => s.type === "end") ?? stops[stops.length - 1];
  const vias = stops.filter((s) => s.type === "via" || s.type === "poi");

  const startName = start.name?.replace(/^My location$/i, "Current location") || "Start";
  const endName = end.name || "End";

  if (vias.length === 0) {
    return `${startName} → ${endName}`;
  }
  if (vias.length === 1) {
    return `${startName} → ${vias[0].name || "Via"} → ${endName}`;
  }
  return `${startName} → ${vias[0].name || "Via"} (+${vias.length - 1}) → ${endName}`;
}

/* ── Publish ──────────────────────────────────────────────────────── */

/**
 * Publish a trip to the public feed (or update if already published).
 * Returns the full row.
 */
export async function publishTrip(
  userId: string,
  payload: PublishTripPayload,
): Promise<PublicTripRow> {
  const row = {
    owner_id: userId,
    title: payload.title,
    stops: payload.stops,
    distance_m: payload.distance_m,
    duration_s: payload.duration_s,
    bbox_west: payload.bbox_west ?? null,
    bbox_south: payload.bbox_south ?? null,
    bbox_east: payload.bbox_east ?? null,
    bbox_north: payload.bbox_north ?? null,
    geometry: payload.geometry ?? null,
    profile: payload.profile ?? "drive",
    is_private: false,
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(payload.id ? { id: payload.id } : {}),
  };

  const { data, error } = await supabase
    .from("public_trips")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) throw new Error(`Failed to publish trip: ${error.message}`);
  return data as PublicTripRow;
}

/**
 * Unpublish (make private) a trip the user owns.
 */
export async function unpublishTrip(tripId: string): Promise<void> {
  const { error } = await supabase
    .from("public_trips")
    .update({ is_private: true, updated_at: new Date().toISOString() })
    .eq("id", tripId);

  if (error) throw new Error(`Failed to unpublish trip: ${error.message}`);
}

/**
 * Get the public trip record for a local plan (by owner + matching stop geometry).
 * Returns null if no published record exists.
 * We match on owner_id + title (best proxy without storing plan_id on the public row).
 */
export async function getPublishedTrip(
  userId: string,
  title: string,
): Promise<PublicTripRow | null> {
  const { data, error } = await supabase
    .from("public_trips")
    .select("*")
    .eq("owner_id", userId)
    .eq("title", title)
    .maybeSingle();

  if (error) return null;
  return data as PublicTripRow | null;
}

/**
 * Get a specific public trip by ID (for preview sheet).
 */
export async function getPublicTrip(tripId: string): Promise<PublicTripRow | null> {
  const { data, error } = await supabase
    .from("public_trips")
    .select("*")
    .eq("id", tripId)
    .eq("is_private", false)
    .maybeSingle();

  if (error) return null;
  return data as PublicTripRow | null;
}

/* ── Feed ─────────────────────────────────────────────────────────── */

/**
 * Fetch the Discover feed of public trips.
 * Optionally filtered by proximity to userLat/userLng within radiusKm.
 * Results are sorted by proximity (if location provided) then newest-first.
 */
export async function fetchDiscoverFeed(
  opts: DiscoverFeedOptions = {},
): Promise<PublicTripRow[]> {
  const { userLat, userLng, radiusKm, limit = 40, offset = 0 } = opts;

  let query = supabase
    .from("public_trips")
    .select("*")
    .eq("is_private", false)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Proximity filter using bbox_center approximation:
  // Keep trips whose bounding box center is within ~radiusKm of user.
  // We use a rough degree-to-km conversion (1° ≈ 111 km) for a client-side
  // filter since we don't have PostGIS.
  if (userLat !== undefined && userLng !== undefined && radiusKm) {
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos((userLat * Math.PI) / 180));

    query = query
      .gte("bbox_north", userLat - latDelta)
      .lte("bbox_south", userLat + latDelta)
      .gte("bbox_east", userLng - lngDelta)
      .lte("bbox_west", userLng + lngDelta);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch discover feed: ${error.message}`);

  let rows = (data ?? []) as PublicTripRow[];

  // Client-side proximity sort when location provided
  if (userLat !== undefined && userLng !== undefined) {
    rows = rows.sort((a, b) => {
      const distA = tripCenterDist(a, userLat, userLng);
      const distB = tripCenterDist(b, userLat, userLng);
      return distA - distB;
    });
  }

  return rows;
}

/** Approximate distance (km) from user to bbox center of a trip. */
function tripCenterDist(trip: PublicTripRow, lat: number, lng: number): number {
  if (
    trip.bbox_west == null ||
    trip.bbox_east == null ||
    trip.bbox_south == null ||
    trip.bbox_north == null
  ) {
    return Infinity;
  }
  const cx = (trip.bbox_west + trip.bbox_east) / 2;
  const cy = (trip.bbox_south + trip.bbox_north) / 2;
  const dlat = cy - lat;
  const dlng = cx - lng;
  return Math.sqrt(dlat * dlat + dlng * dlng) * 111;
}

/* ── Clone ────────────────────────────────────────────────────────── */

/**
 * Clone a public trip's stop list onto the current user's account.
 * Records the clone event and returns the stops array for local plan creation.
 */
export async function clonePublicTrip(
  userId: string,
  tripId: string,
): Promise<{ stops: TripStop[]; title: string; preview: Partial<OfflinePlanPreview> }> {
  // Fetch the source trip
  const { data: trip, error } = await supabase
    .from("public_trips")
    .select("*")
    .eq("id", tripId)
    .eq("is_private", false)
    .single();

  if (error || !trip) throw new Error("Trip not found or no longer public");

  const row = trip as PublicTripRow;

  // Record the clone (upsert so re-clones are idempotent)
  await supabase
    .from("public_trip_clones")
    .upsert({ trip_id: tripId, cloner_id: userId }, { onConflict: "trip_id,cloner_id" });

  // Build a preview shape for the caller to create a local IDB draft
  const preview: Partial<OfflinePlanPreview> = {
    stops: row.stops,
    distance_m: row.distance_m,
    duration_s: row.duration_s,
    geometry: row.geometry ?? undefined,
    profile: row.profile,
  };

  return {
    stops: row.stops,
    title: row.title,
    preview,
  };
}

/**
 * Check if the current user has already cloned a trip.
 */
export async function hasClonedTrip(userId: string, tripId: string): Promise<boolean> {
  const { data } = await supabase
    .from("public_trip_clones")
    .select("id")
    .eq("trip_id", tripId)
    .eq("cloner_id", userId)
    .maybeSingle();

  return !!data;
}

/**
 * Get all public trips the user has published.
 */
export async function getMyPublishedTrips(userId: string): Promise<PublicTripRow[]> {
  const { data, error } = await supabase
    .from("public_trips")
    .select("*")
    .eq("owner_id", userId)
    .eq("is_private", false)
    .order("published_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as PublicTripRow[];
}

/* ── Preview payload builder ──────────────────────────────────────── */

/**
 * Build a PublishTripPayload from a local OfflinePlanPreview + BBox.
 */
export function buildPublishPayload(
  preview: OfflinePlanPreview,
): PublishTripPayload {
  const bbox = preview.bbox;
  return {
    title: generateTripTitle(preview.stops),
    stops: preview.stops,
    distance_m: preview.distance_m,
    duration_s: preview.duration_s,
    bbox_west: bbox?.minLng ?? null,
    bbox_south: bbox?.minLat ?? null,
    bbox_east: bbox?.maxLng ?? null,
    bbox_north: bbox?.maxLat ?? null,
    geometry: preview.geometry ?? null,
    profile: preview.profile ?? "drive",
  };
}
