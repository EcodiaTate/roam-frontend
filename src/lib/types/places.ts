// src/lib/types/places.ts
import type { BBox4, NavCoord } from "./geo";
// ──────────────────────────────────────────────────────────────
// PlaceCategory — replace the existing PlaceCategory type in
// src/lib/types/places.ts with this one.
// Must match backend contracts.py exactly.
// ──────────────────────────────────────────────────────────────

export type PlaceCategory =
  // Essentials & safety
  | "fuel" | "ev_charging" | "rest_area" | "toilet" | "water"
  | "dump_point" | "mechanic" | "hospital" | "pharmacy"
  // Supplies
  | "grocery" | "town" | "atm" | "laundromat"
  // Food & drink
  | "bakery" | "cafe" | "restaurant" | "fast_food" | "pub" | "bar"
  // Accommodation
  | "camp" | "hotel" | "motel" | "hostel"
  // Nature & outdoors
  | "viewpoint" | "waterfall" | "swimming_hole" | "beach"
  | "national_park" | "hiking" | "picnic" | "hot_spring"
  // Family & recreation
  | "playground" | "pool" | "zoo" | "theme_park"
  // Culture & sightseeing
  | "visitor_info" | "museum" | "gallery" | "heritage"
  | "winery" | "brewery" | "attraction" | "market" | "park"
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

export type PlaceItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  extra?: Record<string, any>;
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
  limit?: number; // default 8000
  /** Polyline6 of the route — enables true corridor search along the road shape */
  geometry?: string;
  /** Corridor buffer radius in km (default 15) */
  buffer_km?: number;
};

// /places/suggest
export type PlacesSuggestRequest = {
  geometry: string; // polyline6
  interval_km?: number; // default 50
  radius_m?: number; // default 15000
  categories?: PlaceCategory[];
  limit_per_sample?: number; // default 150
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