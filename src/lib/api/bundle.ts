// src/lib/api/bundle.ts
import { api } from "./client";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { RouteIntelligenceScore } from "@/lib/types/overlays";
import type { TripPreferences } from "@/lib/types/trip";

type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

export type ScoreRefreshRequest = {
  route_key: string;
  bbox: BBox;
};

export type BundleBuildRequest = {
  plan_id: string;
  route_key: string;
  geometry: string; // polyline6
  profile?: string; // default "drive"
  buffer_m?: number | null;
  max_edges?: number | null;
  styles?: string[]; // default []
  departure_iso?: string | null;
  trip_prefs?: TripPreferences | null;
};

export const bundleApi = {
  // POST /bundle/build -> OfflineBundleManifest
  // Heavy endpoint: two-tier Overpass queries + corridor + traffic/hazards.
  // Allow up to 10 min — Overpass can be slow for long routes.
  build: (req: BundleBuildRequest) =>
    api.post<OfflineBundleManifest>("/bundle/build", req, { timeoutMs: 600_000 }),

  // GET /bundle/{plan_id} -> OfflineBundleManifest
  get: (plan_id: string) => api.get<OfflineBundleManifest>(`/bundle/${encodeURIComponent(plan_id)}`),

  // POST /bundle/score/refresh -> RouteIntelligenceScore
  // Re-fetches traffic & hazards for the bbox and recomputes the score.
  scoreRefresh: (req: ScoreRefreshRequest) =>
    api.post<RouteIntelligenceScore>("/bundle/score/refresh", req),

  // GET /bundle/{plan_id}/download -> zip
  // NOTE: client.ts is JSON oriented, so for binary we use fetch directly.
  downloadUrl: (plan_id: string) => {
    const base = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");
    const path = `/bundle/${encodeURIComponent(plan_id)}/download`;
    return base ? `${base}${path}` : path;
  },
};
