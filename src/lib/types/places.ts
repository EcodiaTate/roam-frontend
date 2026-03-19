// src/lib/types/places.ts
import type { BBox4, NavCoord } from "./geo";

export type { BBox4, NavCoord };
// ──────────────────────────────────────────────────────────────
// PlaceCategory - replace the existing PlaceCategory type in
// src/lib/types/places.ts with this one.
// Must match backend contracts.py exactly.
// ──────────────────────────────────────────────────────────────

export type PlaceCategory =
  // Essentials & safety
  | "fuel" | "ev_charging" | "rest_area" | "toilet" | "water"
  | "dump_point" | "shower" | "mechanic" | "hospital" | "pharmacy"
  // Supplies
  | "grocery" | "town" | "atm" | "laundromat"
  // Food & drink
  | "bakery" | "cafe" | "restaurant" | "fast_food" | "pub" | "bar"
  // Accommodation
  | "camp" | "hotel" | "motel" | "hostel"
  // Nature & outdoors
  | "viewpoint" | "waterfall" | "swimming_hole" | "beach"
  | "national_park" | "hiking" | "picnic" | "hot_spring"
  | "cave" | "fishing" | "surf"
  // Family & recreation
  | "playground" | "pool" | "zoo" | "theme_park"
  | "dog_park" | "golf" | "cinema"
  // Culture & sightseeing
  | "visitor_info" | "museum" | "gallery" | "heritage"
  | "winery" | "brewery" | "attraction" | "market" | "park"
  | "library" | "showground"
  // Geocoding (Mapbox)
  | "address" | "place" | "region";

export type PlacesRequest = {
  bbox?: BBox4 | null;
  center?: NavCoord | null;
  radius_m?: number | null;
  categories?: PlaceCategory[];
  query?: string | null;
  limit?: number; // default 50
};

/** Typed subset of known extra fields on PlaceItem.  The `extra` bag may
 *  contain additional fields beyond these - use `Record<string, unknown>` for
 *  forward compat. */
export type PlaceExtra = {
  osm_type?: string;
  osm_id?: number;
  phone?: string;
  website?: string;
  opening_hours?: string;
  description?: string;
  brand?: string;
  operator?: string;
  address?: string;
  fee?: string;
  access?: string;
  capacity?: string;
  fuel_types?: string[];
  has_diesel?: boolean;
  has_unleaded?: boolean;
  has_lpg?: boolean;
  socket_types?: string[];
  free?: boolean;
  powered_sites?: boolean;
  has_water?: boolean;
  has_toilets?: boolean;

  // ── Camping: site types & configuration ───────────────────
  pets_allowed?: boolean | "on_lead";
  fires_allowed?: boolean | "seasonal";
  generators_allowed?: boolean | "hours_only";
  caravans?: boolean;
  motorhomes?: boolean;
  tents?: boolean;
  max_vehicle_length_m?: number;
  num_sites?: number;
  bookable?: boolean;

  // ── Camping: facilities ───────────────────────────────────
  has_showers?: boolean;
  has_dump_point?: boolean;
  has_bbq?: boolean;
  has_laundry?: boolean;
  has_kitchen?: boolean;
  has_wifi?: boolean;
  has_playground?: boolean;
  has_swimming?: boolean;
  has_phone_reception?: boolean;
  reception_carriers?: string[];

  // ── Camping: style ────────────────────────────────────────
  camp_type?: "free" | "low_cost" | "commercial" | "bush" | "rest_area" | "station_stay" | "farm_stay" | "showground";
  surface?: "grass" | "gravel" | "dirt" | "sand" | "concrete" | "mixed";
  shelter?: boolean;
  shade?: boolean;

  // ── Camping: stay rules ───────────────────────────────────
  max_stay_days?: number;
  check_in?: string;
  check_out?: string;
  quiet_hours?: string;

  // ── Camping: overnight legality (rest areas + some bush camps) ────────
  /** Whether overnight stays are permitted. "check" = rules unclear / state-dependent */
  overnight_allowed?: boolean | "check" | "prohibited";
  /** Max consecutive hours allowed (e.g. 20 for QLD rest areas) */
  overnight_max_hours?: number;
  /** Free-text note about restrictions, e.g. "QLD 20hr limit" */
  overnight_notes?: string;

  // ── Camping: cost ─────────────────────────────────────────
  price_per_night_aud?: number;
  price_notes?: string;

  synthetic_name?: boolean;
  wheelchair?: "yes" | "limited";
  stars?: number;
  /** Wikidata entity ID (e.g. "Q12345") */
  wikidata?: string;
  /** Wikipedia article reference (e.g. "en:Uluru") */
  wikipedia?: string;
  /** Thumbnail URL resolved from Wikimedia Commons / OSM image tag.
   *  ~400px wide - small enough for bundles, renders well in cards. */
  thumbnail_url?: string;

  // ── Dump point specifics ──────────────────────────────────
  dump_type?: "black_water" | "grey_water" | "both";
  dump_fee?: string;
  dump_access?: "public" | "customers_only" | "key_required";
  has_rinse?: boolean;
  has_potable_water_at_dump?: boolean;

  // ── Water point specifics ─────────────────────────────────
  water_type?: "potable" | "non_potable" | "bore" | "rainwater" | "river";
  water_flow?: "tap" | "tank" | "pump" | "bore";
  water_treated?: boolean;
  water_always_available?: boolean;

  // ── Toilet specifics ──────────────────────────────────────
  toilet_type?: "flush" | "pit" | "composting" | "long_drop" | "portable";
  toilet_count?: number;
  has_baby_change?: boolean;
  has_disabled_access?: boolean;
  has_hand_wash?: boolean;
  toilet_maintained?: boolean;

  // ── Shower specifics ──────────────────────────────────────
  shower_type?: "hot" | "cold" | "solar";
  shower_fee?: string;
  shower_token?: boolean;
  shower_count?: number;
};

export type PlaceItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  extra?: PlaceExtra & Record<string, unknown>;
};

export type PlacesPack = {
  places_key: string;
  req: PlacesRequest | null;
  items: PlaceItem[];
  provider: string;
  created_at: string;
  algo_version: string;
};

// /places/corridor
export type CorridorPlacesRequest = {
  corridor_key: string;
  categories?: PlaceCategory[];
  limit?: number; // dynamic based on route length
  /** Polyline6 of the route - enables true corridor search along the road shape */
  geometry?: string;
  /** Corridor buffer radius in km (default 35) */
  buffer_km?: number;
  /** Stop density 1-5 (1=bare minimum, 5=everything, default 3) */
  stop_density?: number;
};

// /places/suggest
export type PlacesSuggestRequest = {
  geometry: string; // polyline6
  interval_km?: number; // default 50
  radius_m?: number; // default 15000
  categories?: PlaceCategory[];
  limit_per_sample?: number; // default 150
  /** Stop density 1-5 (1=bare minimum, 5=everything, default 3) */
  stop_density?: number;
};

export type PlacesSuggestionCluster = {
  idx: number;
  lat: number;
  lng: number;
  km_from_start: number;
  places: PlacesPack;
};

export type PlacesSuggestResponse = {
  clusters: PlacesSuggestionCluster[];
};

// /places/stop-suggestions
export type StopSuggestionsRequest = {
  bbox: BBox4;
  midpoint: NavCoord;
  existing_categories?: PlaceCategory[];
  limit?: number;
};

export type StopSuggestionItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  score: number;
  extra?: Record<string, unknown>;
};

export type StopSuggestionsResponse = {
  suggestions: StopSuggestionItem[];
};;
