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
};