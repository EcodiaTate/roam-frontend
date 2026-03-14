// src/lib/api/bundle.ts
import { api } from "./client";
import type { OfflineBundleManifest } from "@/lib/types/bundle";

export type BundleBuildRequest = {
  plan_id: string;
  route_key: string;
  geometry: string; // polyline6
  profile?: string; // default "drive"
  buffer_m?: number | null;
  max_edges?: number | null;
  styles?: string[]; // default []
};

export const bundleApi = {
  // POST /bundle/build -> OfflineBundleManifest
  // Heavy endpoint: two-tier Overpass queries + corridor + traffic/hazards.
  // Allow up to 10 min — Overpass can be slow for long routes.
  build: (req: BundleBuildRequest) =>
    api.post<OfflineBundleManifest>("/bundle/build", req, { timeoutMs: 600_000 }),

  // GET /bundle/{plan_id} -> OfflineBundleManifest
  get: (plan_id: string) => api.get<OfflineBundleManifest>(`/bundle/${encodeURIComponent(plan_id)}`),

  // GET /bundle/{plan_id}/download -> zip
  // NOTE: client.ts is JSON oriented, so for binary we use fetch directly.
  downloadUrl: (plan_id: string) => {
    const base = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");
    const path = `/bundle/${encodeURIComponent(plan_id)}/download`;
    return base ? `${base}${path}` : path;
  },
};
