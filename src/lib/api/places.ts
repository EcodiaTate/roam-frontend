// src/lib/api/places.ts
import { api } from "./client";
import type {
  PlacesRequest,
  PlacesPack,
  CorridorPlacesRequest,
  PlacesSuggestRequest,
  PlacesSuggestResponse,
} from "@/lib/types/places";

export const placesApi = {
  // POST /places/search -> PlacesPack
  search: (req: PlacesRequest) => api.post<PlacesPack>("/places/search", req),

  // POST /places/corridor -> PlacesPack
  corridor: (req: CorridorPlacesRequest) => api.post<PlacesPack>("/places/corridor", req),

  // POST /places/suggest -> PlacesSuggestResponse
  suggest: (req: PlacesSuggestRequest) => api.post<PlacesSuggestResponse>("/places/suggest", req),
};
