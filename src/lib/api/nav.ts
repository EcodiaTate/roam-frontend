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
import type {
  CoverageOverlay,
  WildlifeOverlay,
  WeatherOverlay,
  FloodOverlay,
  FuelOverlay,
  RestAreaOverlay,
  EmergencyServicesOverlay,
  HeritageOverlay,
  AirQualityOverlay,
  BushfireOverlay,
  SpeedCamerasOverlay,
  ToiletsOverlay,
  SchoolZonesOverlay,
  RoadkillOverlay,
  RouteIntelligenceScore,
} from "@/lib/types/overlays";

export type CorridorEnsureRequest = {
  route_key: string;
  geometry: string; // polyline6
  profile?: string; // default "drive"
  buffer_m?: number | null;
  max_edges?: number | null;
  stop_coords?: number[][] | null; // [[lat, lng], ...]
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
  // Corridor build: OSRM spine + tree routes to stops (~18s on GCR)
  corridorEnsure: (req: CorridorEnsureRequest) =>
    api.post<CorridorGraphMeta>("/nav/corridor/ensure", req, { timeoutMs: 120_000 }),

  // GET /nav/corridor/{corridor_key} -> CorridorGraphPack
  // Graph download can be several MB
  corridorGet: (corridor_key: string) =>
    api.get<CorridorGraphPack>(`/nav/corridor/${encodeURIComponent(corridor_key)}`, { timeoutMs: 60_000 }),

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

  // POST /nav/weather/forecast -> WeatherOverlay
  weatherForecast: (req: { polyline6: string; departure_iso: string; avg_speed_kmh?: number }) =>
    api.post<WeatherOverlay>("/nav/weather/forecast", req),

  // POST /nav/flood/poll -> FloodOverlay
  floodPoll: (req: { bbox: BBox4 }) =>
    api.post<FloodOverlay>("/nav/flood/poll", req),

  // POST /nav/fuel/along-route -> FuelOverlay
  fuelAlongRoute: (req: { polyline6: string; buffer_km?: number }) =>
    api.post<FuelOverlay>("/nav/fuel/along-route", req),

  // POST /nav/rest-areas/along-route -> RestAreaOverlay
  restAreasAlongRoute: (req: { geometry: string }) =>
    api.post<RestAreaOverlay>("/nav/rest-areas/along-route", req),

  // POST /nav/emergency/along-route -> EmergencyServicesOverlay
  emergencyAlongRoute: (req: { geometry: string }) =>
    api.post<EmergencyServicesOverlay>("/nav/emergency/along-route", req),

  // POST /nav/heritage/along-route -> HeritageOverlay
  heritageAlongRoute: (req: { geometry: string }) =>
    api.post<HeritageOverlay>("/nav/heritage/along-route", req),

  // POST /nav/air-quality/along-route -> AirQualityOverlay
  airQualityAlongRoute: (req: { geometry: string }) =>
    api.post<AirQualityOverlay>("/nav/air-quality/along-route", req),

  // POST /nav/bushfire/along-route -> BushfireOverlay
  bushfireAlongRoute: (req: { geometry: string }) =>
    api.post<BushfireOverlay>("/nav/bushfire/along-route", req),

  // POST /nav/speed-cameras/along-route -> SpeedCamerasOverlay
  speedCamerasAlongRoute: (req: { geometry: string }) =>
    api.post<SpeedCamerasOverlay>("/nav/speed-cameras/along-route", req),

  // POST /nav/toilets/along-route -> ToiletsOverlay
  toiletsAlongRoute: (req: { geometry: string }) =>
    api.post<ToiletsOverlay>("/nav/toilets/along-route", req),

  // POST /nav/school-zones/along-route -> SchoolZonesOverlay
  schoolZonesAlongRoute: (req: { geometry: string }) =>
    api.post<SchoolZonesOverlay>("/nav/school-zones/along-route", req),

  // POST /nav/roadkill/along-route -> RoadkillOverlay
  roadkillAlongRoute: (req: { geometry: string }) =>
    api.post<RoadkillOverlay>("/nav/roadkill/along-route", req),

  // POST /nav/route-score -> RouteIntelligenceScore
  routeScore: (req: { polyline6: string; bbox: BBox4; departure_iso: string; avg_speed_kmh?: number }) =>
    api.post<RouteIntelligenceScore>("/nav/route-score", req),
};