// src/lib/types/peer.ts
// Frontend type mirrors for presence, observations, and peer sync.
// Shapes match the backend contracts.py exactly.

// ──────────────────────────────────────────────────────────────
// Presence (dead-reckoning proximity awareness)
// ──────────────────────────────────────────────────────────────

export type PresencePingRequest = {
  lat: number;
  lng: number;
  speed_kmh: number;
  heading_deg: number;
};

export type PresencePingResponse = {
  ok: boolean;
};

export type NearbyRoamer = {
  user_id: string;
  predicted_lat: number;
  predicted_lng: number;
  speed_kmh: number;
  heading_deg: number;
  last_pinged_at: string;
  predicted_at: string;
  distance_km: number;
  confidence: "high" | "medium" | "low";
};

export type NearbyQuery = {
  lat: number;
  lng: number;
  radius_km?: number;
};

export type NearbyResponse = {
  roamers: NearbyRoamer[];
};

// ──────────────────────────────────────────────────────────────
// User Observations (crowd-sourced road intelligence)
// ──────────────────────────────────────────────────────────────

export type ObservationType =
  | "road_condition"
  | "road_closure"
  | "hazard"
  | "fuel_price"
  | "speed_trap"
  | "weather"
  | "campsite"
  | "general";

export type ObservationSeverity = "info" | "caution" | "warning" | "danger";

export type ObservationSubmitRequest = {
  type: ObservationType;
  severity?: ObservationSeverity;
  lat: number;
  lng: number;
  heading_deg?: number | null;
  message?: string | null;
  value?: string | null;
};

export type ObservationSubmitResponse = {
  id: string;
  ok: boolean;
};

export type NearbyObservationsQuery = {
  lat: number;
  lng: number;
  radius_km?: number;
  types?: ObservationType[] | null;
  since_iso?: string | null;
};

export type AggregatedObservation = {
  type: ObservationType;
  severity: ObservationSeverity;
  lat: number;
  lng: number;
  message?: string | null;
  value?: string | null;
  report_count: number;
  first_reported_at: string;
  last_reported_at: string;
  reporters: number;
};

export type NearbyObservationsResponse = {
  observations: AggregatedObservation[];
};

// ──────────────────────────────────────────────────────────────
// Peer Sync (overlay delta exchange between roamers)
// ──────────────────────────────────────────────────────────────

export type PeerSyncRequest = {
  lat: number;
  lng: number;
  radius_km?: number;
  overlay_timestamps: Record<string, string>;
};

/** Fuel station as returned by peer sync delta (matches backend FuelStation model) */
export type PeerFuelStation = {
  id: string;
  source: string;
  name: string;
  brand?: string | null;
  lat: number;
  lng: number;
  address?: string | null;
  fuel_types?: import("./overlays").FuelPrice[];
  is_open?: boolean | null;
  open_hours?: string | null;
  distance_km?: number | null;
  extra?: Record<string, unknown>;
};

export type PeerSyncDelta = {
  observations: AggregatedObservation[];
  traffic_events: TrafficEvent[];
  hazard_events: HazardEvent[];
  fuel_updates: PeerFuelStation[];
  generated_at: string;
};

// Traffic/Hazard event types re-exported for peer sync
// (these don't exist as standalone types in overlays.ts yet, adding them)
export type TrafficEvent = {
  id: string;
  source: string;
  feed: string;
  type: string;
  severity: string;
  headline: string;
  description?: string | null;
  url?: string | null;
  last_updated?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  geometry?: Record<string, unknown> | null;
  bbox?: number[] | null;
  region?: string | null;
  raw?: Record<string, unknown>;
};

export type HazardEvent = {
  id: string;
  source: string;
  kind: string;
  severity: string;
  urgency: string;
  certainty: string;
  effective_priority: number;
  title: string;
  description?: string | null;
  url?: string | null;
  issued_at?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  geometry?: Record<string, unknown> | null;
  bbox?: number[] | null;
  region?: string | null;
  raw?: Record<string, unknown>;
};
