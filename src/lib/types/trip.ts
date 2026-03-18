// src/lib/types/trip.ts

export type TripStopType = "start" | "poi" | "via" | "end";

export type TripStop = {
  id?: string | null;
  type?: TripStopType; // backend default "poi"
  name?: string | null;
  lat: number;
  lng: number;
  /** Planned arrival time — ISO8601 local (e.g. "2026-03-20T09:00") */
  arrive_at?: string | null;
  /** Planned departure time — ISO8601 local (e.g. "2026-03-20T10:30") */
  depart_at?: string | null;
};

// ──────────────────────────────────────────────────────────────
// Trip preferences — controls enrichment density & categories
// ──────────────────────────────────────────────────────────────

/**
 * High-level category groups for the trip preferences toggles.
 * Each group maps to multiple PlaceCategory values on the backend.
 */
export type CategoryGroup =
  | "essentials"    // fuel, ev_charging, rest_area, toilet, water, mechanic, hospital, pharmacy
  | "food"          // bakery, cafe, restaurant, fast_food, pub, bar
  | "accommodation" // camp, hotel, motel, hostel
  | "nature"        // viewpoint, waterfall, swimming_hole, beach, national_park, hiking, picnic, hot_spring, cave, fishing, surf
  | "culture"       // visitor_info, museum, gallery, heritage, winery, brewery, attraction, market, library, showground
  | "family"        // playground, pool, zoo, theme_park, dog_park, golf, cinema
  | "supplies";     // grocery, town, atm, laundromat, dump_point

/**
 * User-facing trip preferences.
 *
 * - `stop_density` (1–5): How many enrichment stops to include.
 *     1 = bare minimum (fuel + rest stops only)
 *     3 = balanced (default — good mix)
 *     5 = everything we've got
 *
 * - `categories`: Which high-level category groups to include.
 *     All enabled by default. User can toggle groups off.
 *
 * - Per-stop schedules live on TripStop.arrive_at / depart_at.
 */
export type TripPreferences = {
  stop_density: number; // 1–5, default 3
  categories: Record<CategoryGroup, boolean>;
};

/** Sensible defaults — balanced density, all categories on. */
export const DEFAULT_TRIP_PREFS: TripPreferences = {
  stop_density: 3,
  categories: {
    essentials: true,
    food: true,
    accommodation: true,
    nature: true,
    culture: true,
    family: true,
    supplies: true,
  },
};
