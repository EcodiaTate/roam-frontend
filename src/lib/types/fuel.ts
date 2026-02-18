// src/lib/types/fuel.ts
// ──────────────────────────────────────────────────────────────
// Fuel Range Intelligence — Type Definitions
// Client-side only. No backend changes.
// ──────────────────────────────────────────────────────────────

/** User-configurable vehicle fuel parameters. Stored once in IDB meta. */
export interface VehicleFuelProfile {
  tank_range_km: number;        // default 600
  reserve_warn_km: number;      // default 100
  reserve_critical_km: number;  // default 50
  fuel_type: FuelType;
}

export type FuelType = "unleaded" | "diesel" | "lpg" | "ev";

/** Default vehicle profile — sensible for a standard Australian car */
export const DEFAULT_FUEL_PROFILE: VehicleFuelProfile = {
  tank_range_km: 600,
  reserve_warn_km: 100,
  reserve_critical_km: 50,
  fuel_type: "unleaded",
};

/** A fuel station snapped to the route */
export interface FuelStation {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  category: "fuel" | "ev_charging";
  km_along_route: number;       // distance from route start
  snap_distance_m: number;      // perpendicular distance to route
  side: "left" | "right" | "on_route";
  brand?: string;
  hours?: string;
  has_diesel?: boolean;
  has_unleaded?: boolean;
}

/** A segment between two consecutive fuel stations (or route start/end) */
export interface FuelLeg {
  idx: number;
  from_station: FuelStation | null;  // null = route start
  to_station: FuelStation | null;    // null = route end
  distance_km: number;
  gap_exceeds_range: boolean;        // true = DANGER — can't make it
  gap_exceeds_warn: boolean;         // true = tight but possible
}

/** Warning generated from fuel analysis */
export interface FuelWarning {
  type: "gap" | "last_chance" | "long_stretch" | "no_fuel_on_route";
  severity: "info" | "warn" | "critical";
  message: string;
  at_km: number;                     // where on the route this applies
  station?: FuelStation;             // relevant station (e.g. "last chance")
  gap_km?: number;                   // the problematic distance
}

/** Full analysis result — stored in IDB per plan */
export interface FuelAnalysis {
  profile: VehicleFuelProfile;
  stations: FuelStation[];           // ordered by km_along_route
  legs: FuelLeg[];
  warnings: FuelWarning[];
  max_gap_km: number;
  total_fuel_stops: number;
  has_critical_gaps: boolean;        // any leg > tank_range_km
  computed_at: string;               // ISO timestamp
  route_key: string;                 // which route this analysis is for
}

/** Live tracking state during navigation */
export interface FuelTrackingState {
  last_passed_station: FuelStation | null;
  km_since_last_fuel: number;
  km_to_next_fuel: number | null;
  fuel_pressure: number;             // 0.0 – 1.0
  next_station: FuelStation | null;
  is_warn: boolean;
  is_critical: boolean;
  active_warning: FuelWarning | null;
}