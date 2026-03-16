// src/lib/api/observations.ts
import { api } from "./client";
import type {
  ObservationSubmitRequest,
  ObservationSubmitResponse,
  NearbyObservationsQuery,
  NearbyObservationsResponse,
} from "@/lib/types/peer";

export const observationsApi = {
  /** POST /observations/submit — submit a crowd-sourced road observation */
  submit: (req: ObservationSubmitRequest) =>
    api.post<ObservationSubmitResponse>("/observations/submit", req),

  /** POST /observations/nearby — query aggregated observations near a position */
  nearby: (req: NearbyObservationsQuery) =>
    api.post<NearbyObservationsResponse>("/observations/nearby", req),
};
