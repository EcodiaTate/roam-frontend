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

  corridor_key?: string | null;
  places_key?: string | null;
  traffic_key?: string | null;
  hazards_key?: string | null;

  bytes_total?: number;
  created_at: string;
};
