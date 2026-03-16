// src/lib/api/nav.ts
import { api } from "./client";
import type { BBox4 } from "@/lib/types/geo";
import type {
  NavPack,
  NavRequest,
  CorridorGraphMeta,
  CorridorGraphPack,
  TrafficOverlay,
  HazardOverlay,
  ElevationRequest,
  ElevationResponse,
} from "@/lib/types/navigation";
import type { CoverageOverlay, WildlifeOverlay } from "@/lib/types/overlays";

export type CorridorEnsureRequest = {
  route_key: string;
  geometry: string; // polyline6
  profile?: string; // default "drive"
  buffer_m?: number | null;
  max_edges?: number | null;
};

export type OverlayPollRequest = {
  bbox: BBox4;
  cache_seconds?: number | null;
  timeout_s?: number | null;
};

export type HazardsPollRequest = {
  bbox: BBox4;
  sources?: string[]; // default []
  cache_seconds?: number | null;
  timeout_s?: number | null;
};

export const navApi = {
  // POST /nav/route -> NavPack
  route: (req: NavRequest) => api.post<NavPack>("/nav/route", req),

  // POST /nav/corridor/ensure -> CorridorGraphMeta
  corridorEnsure: (req: CorridorEnsureRequest) =>
    api.post<CorridorGraphMeta>("/nav/corridor/ensure", req),

  // GET /nav/corridor/{corridor_key} -> CorridorGraphPack
  corridorGet: (corridor_key: string) =>
    api.get<CorridorGraphPack>(`/nav/corridor/${encodeURIComponent(corridor_key)}`),

  // POST /nav/elevation -> ElevationResponse
  elevation: (req: ElevationRequest) =>
    api.post<ElevationResponse>("/nav/elevation", req),

  // POST /nav/traffic/poll -> TrafficOverlay
  trafficPoll: (req: OverlayPollRequest) => api.post<TrafficOverlay>("/nav/traffic/poll", req),

  // POST /nav/hazards/poll -> HazardOverlay
  hazardsPoll: (req: HazardsPollRequest) => api.post<HazardOverlay>("/nav/hazards/poll", req),

  // POST /nav/coverage/along-route -> CoverageOverlay
  coverageAlongRoute: (req: { geometry: string }) =>
    api.post<CoverageOverlay>("/nav/coverage/along-route", req),

  // POST /nav/wildlife/along-route -> WildlifeOverlay
  wildlifeAlongRoute: (req: { polyline6: string; buffer_km?: number }) =>
    api.post<WildlifeOverlay>("/nav/wildlife/along-route", req),
};