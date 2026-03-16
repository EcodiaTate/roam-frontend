// src/lib/types/discover.ts
// Types for the public trip sharing / Discover feed system.

import type { TripStop } from "./trip";

export type PublicTripRow = {
  id: string;
  owner_id: string;
  title: string;
  stops: TripStop[];
  distance_m: number;
  duration_s: number;
  bbox_west: number | null;
  bbox_south: number | null;
  bbox_east: number | null;
  bbox_north: number | null;
  geometry: string | null; // polyline6
  profile: string;
  is_private: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined from public_trip_clone_counts view
  clone_count?: number;
};

/** Minimal shape sent when publishing a local plan */
export type PublishTripPayload = {
  /** UUID — passed in from the local plan or generated fresh */
  id?: string;
  title: string;
  stops: TripStop[];
  distance_m: number;
  duration_s: number;
  bbox_west?: number | null;
  bbox_south?: number | null;
  bbox_east?: number | null;
  bbox_north?: number | null;
  geometry?: string | null;
  profile?: string;
};

/** Options for fetching the Discover feed */
export type DiscoverFeedOptions = {
  /** User location for proximity sort — optional */
  userLat?: number;
  userLng?: number;
  /** Maximum radius in km for proximity filtering (default: none) */
  radiusKm?: number;
  limit?: number;
  offset?: number;
};

/* ── Clone trip seed (sessionStorage → /new page) ──────────────────── */

/** SessionStorage key used to pass cloned trip data to /new */
export const CLONE_TRIP_SEED_KEY = "roam_clone_trip_seed";

/** Shape written to sessionStorage by the Discover clone flow */
export type CloneTripSeed = {
  title: string;
  stops: TripStop[];
};
