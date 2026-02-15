// src/lib/types/places.ts
import type { BBox4, NavCoord } from "./geo";
export type PlaceCategory =
  | "fuel"
  | "camp"
  | "water"
  | "toilet"
  | "town"
  | "grocery"
  | "mechanic"
  | "hospital"
  | "pharmacy"
  | "viewpoint"
  | "cafe"
  | "restaurant"
  | "fast_food"
  | "pub"
  | "bar"
  | "hotel"
  | "motel"
  | "hostel"
  | "attraction"
  | "park"
  | "beach"
  // Mapbox geocoding categories
  | "address"
  | "place"
  | "region";
  
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
  req: PlacesRequest;
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
