// src/lib/types/navigation.ts
import type { BBox4 } from "./geo";
import type { TripStop } from "./trip";

/** Matches backend: NavRequest.profile is string (e.g. "drive") */
export type NavRequest = {
  profile?: string; // default "drive"
  prefs?: Record<string, any>; // default {}
  stops: TripStop[];
  avoid?: string[]; // default []
  depart_at?: string | null; // ISO8601 UTC recommended
};

// ──────────────────────────────────────────────────────────────
// Turn-by-turn maneuver + step types
// ──────────────────────────────────────────────────────────────

export type ManeuverType =
  | "turn" | "depart" | "arrive"
  | "merge" | "fork" | "on ramp" | "off ramp"
  | "roundabout" | "rotary" | "exit roundabout"
  | "new name" | "continue" | "end of road"
  | "notification";

export type ManeuverModifier =
  | "left" | "right"
  | "slight left" | "slight right"
  | "sharp left" | "sharp right"
  | "straight" | "uturn";

export type NavManeuver = {
  type: ManeuverType;
  modifier?: ManeuverModifier | null;
  location: [number, number];       // [lng, lat] — OSRM convention
  bearing_before: number;
  bearing_after: number;
  exit?: number | null;              // roundabout exit number
};

export type NavStep = {
  maneuver: NavManeuver;
  name: string;                      // road name ("Bruce Highway", "")
  ref?: string | null;               // route reference ("M1", "A1")
  distance_m: number;
  duration_s: number;
  geometry: string;                  // polyline6 for this step's segment
  mode: string;
  pronunciation?: string | null;     // phonetic road name for TTS
};

// ──────────────────────────────────────────────────────────────
// Core route models
// ──────────────────────────────────────────────────────────────

export type NavLeg = {
  idx: number;
  from_stop_id?: string | null;
  to_stop_id?: string | null;
  distance_m: number;
  duration_s: number;
  geometry: string;                  // polyline6 (this leg only)
  steps: NavStep[];                  // ← NEW — turn-by-turn steps
};

export type NavRoute = {
  route_key: string;
  profile: string;
  distance_m: number;
  duration_s: number;
  geometry: string; // polyline6 full
  bbox: BBox4;
  legs: NavLeg[];
  provider: string; // "osrm"
  created_at: string; // ISO8601 UTC
  algo_version: string;
};

export type RouteAlternates = {
  alternates: NavRoute[];
};

export type NavPack = {
  req: NavRequest;
  primary: NavRoute;
  alternates: RouteAlternates;
};

// ──────────────────────────────────────────────────────────────
// Elevation types
// ──────────────────────────────────────────────────────────────

export type ElevationRequest = {
  geometry: string;                  // polyline6
  sample_interval_m?: number;        // default 500
  route_key?: string | null;
};

export type ElevationSample = {
  km_along: number;
  elevation_m: number;
  lat: number;
  lng: number;
};

export type ElevationProfile = {
  route_key?: string | null;
  samples: ElevationSample[];
  min_elevation_m: number;
  max_elevation_m: number;
  total_ascent_m: number;
  total_descent_m: number;
  created_at: string;
};

export type GradeSegment = {
  from_km: number;
  to_km: number;
  avg_grade_pct: number;
  elevation_change_m: number;
  fuel_penalty_factor: number;
};

export type ElevationResponse = {
  profile: ElevationProfile;
  grade_segments: GradeSegment[];
};

// ──────────────────────────────────────────────────────────────
// Corridor graphs
// ──────────────────────────────────────────────────────────────

export type CorridorGraphMeta = {
  corridor_key: string;
  route_key: string;
  profile: string;
  buffer_m: number;
  max_edges: number;
  algo_version: string;
  created_at: string;
  bytes: number;
};

export type CorridorNode = {
  id: number;
  lat: number;
  lng: number;
};

export type CorridorEdge = {
  a: number;
  b: number;
  distance_m: number;
  duration_s: number;
  flags?: number; // default 0
};

export type CorridorGraphPack = {
  corridor_key: string;
  route_key: string;
  profile: string;
  algo_version: string;
  bbox: BBox4;
  nodes: CorridorNode[];
  edges: CorridorEdge[];
};

// ──────────────────────────────────────────────────────────────
// Overlays
// ──────────────────────────────────────────────────────────────

export type TrafficSeverity = "info" | "minor" | "moderate" | "major" | "unknown";
export type TrafficType =
  | "hazard"
  | "closure"
  | "congestion"
  | "roadworks"
  | "flooding"
  | "incident"
  | "unknown";

export type HazardSeverity = "low" | "medium" | "high" | "unknown";
export type HazardKind =
  | "flood"
  | "cyclone"
  | "storm"
  | "fire"
  | "wind"
  | "heat"
  | "marine"
  | "weather_warning"
  | "unknown";

export type TrafficEvent = {
  id: string;
  source: string;
  feed: string;
  type?: TrafficType; // default "unknown"
  severity?: TrafficSeverity; // default "unknown"
  headline: string;
  description?: string | null;
  url?: string | null;
  last_updated?: string | null;
  geometry?: Record<string, any> | null;
  bbox?: number[] | null; // [minLng,minLat,maxLng,maxLat]
  raw?: Record<string, any>;
};

export type TrafficOverlay = {
  traffic_key: string;
  bbox: BBox4;
  provider: string;
  algo_version: string;
  created_at: string;
  items: TrafficEvent[];
  warnings: string[];
};

export type HazardEvent = {
  id: string;
  source: string;
  kind?: HazardKind; // default "unknown"
  severity?: HazardSeverity; // default "unknown"
  title: string;
  description?: string | null;
  url?: string | null;
  issued_at?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  geometry?: Record<string, any> | null;
  bbox?: number[] | null;
  raw?: Record<string, any>;
};

export type HazardOverlay = {
  hazards_key: string;
  bbox: BBox4;
  provider: string;
  algo_version: string;
  created_at: string;
  items: HazardEvent[];
  warnings: string[];
};