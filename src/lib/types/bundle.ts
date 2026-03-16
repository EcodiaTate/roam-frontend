// src/lib/types/bundle.ts
export type AssetStatus = "missing" | "ready" | "error";

export type OfflineBundleManifest = {
  plan_id: string;
  route_key: string;

  tiles_id?: string; // default "australia"
  styles?: string[];

  navpack_status?: AssetStatus;
  corridor_status?: AssetStatus;
  places_status?: AssetStatus;
  traffic_status?: AssetStatus;
  hazards_status?: AssetStatus;
  weather_status?: AssetStatus;
  flood_status?: AssetStatus;
  fuel_status?: AssetStatus;
  coverage_status?: AssetStatus;
  wildlife_status?: AssetStatus;
  rest_status?: AssetStatus;
  score_status?: AssetStatus;
  emergency_status?: AssetStatus;
  heritage_status?: AssetStatus;
  aqi_status?: AssetStatus;
  bushfire_status?: AssetStatus;
  cameras_status?: AssetStatus;
  toilets_status?: AssetStatus;
  school_zones_status?: AssetStatus;
  roadkill_status?: AssetStatus;

  corridor_key?: string | null;
  places_key?: string | null;
  traffic_key?: string | null;
  hazards_key?: string | null;
  weather_key?: string | null;
  flood_key?: string | null;
  fuel_key?: string | null;
  coverage_key?: string | null;
  wildlife_key?: string | null;
  rest_key?: string | null;
  score_key?: string | null;
  emergency_key?: string | null;
  heritage_key?: string | null;
  aqi_key?: string | null;
  bushfire_key?: string | null;
  cameras_key?: string | null;
  toilets_key?: string | null;
  school_zones_key?: string | null;
  roadkill_key?: string | null;

  bytes_total?: number;
  created_at: string;
};
