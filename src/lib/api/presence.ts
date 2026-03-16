// src/lib/api/presence.ts
import { api } from "./client";
import type {
  PresencePingRequest,
  PresencePingResponse,
  NearbyQuery,
  NearbyResponse,
} from "@/lib/types/peer";

export const presenceApi = {
  /** POST /presence/ping — upsert ephemeral position snapshot */
  ping: (req: PresencePingRequest) =>
    api.post<PresencePingResponse>("/presence/ping", req),

  /** POST /presence/nearby — query dead-reckoned nearby roamers */
  nearby: (req: NearbyQuery) =>
    api.post<NearbyResponse>("/presence/nearby", req),
};
