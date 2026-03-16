// src/lib/api/places.ts
import { api } from "./client";
import type {
  PlacesRequest,
  PlacesPack,
  CorridorPlacesRequest,
  PlacesSuggestRequest,
  PlacesSuggestResponse,
  StopSuggestionsRequest,
  StopSuggestionsResponse,
} from "@/lib/types/places";

export const placesApi = {
  // POST /places/search -> PlacesPack
  search: (req: PlacesRequest) => api.post<PlacesPack>("/places/search", req),

  // POST /places/corridor -> PlacesPack
  // This endpoint is heavy: Overpass queries + Supa bulk upserts.
  // 30s default timeout is not enough - use 120s.
  corridor: (req: CorridorPlacesRequest) =>
    api.post<PlacesPack>("/places/corridor", req, { timeoutMs: 120_000 }),

  // POST /places/suggest -> PlacesSuggestResponse
  // Also heavy: multiple search rounds along the route.
  suggest: (req: PlacesSuggestRequest) =>
    api.post<PlacesSuggestResponse>("/places/suggest", req, { timeoutMs: 120_000 }),

  // POST /places/stop-suggestions -> StopSuggestionsResponse
  // Lightweight bbox query; 30s should be sufficient for most routes.
  stopSuggestions: (req: StopSuggestionsRequest) =>
    api.post<StopSuggestionsResponse>("/places/stop-suggestions", req, { timeoutMs: 30_000 }),
};