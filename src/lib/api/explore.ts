// src/lib/api/explore.ts
import { api } from "./client";
import type { ExploreTurnRequest, ExploreTurnResponse } from "@/lib/types/explore";

export const exploreApi = {
  // POST /explore/turn -> ExploreTurnResponse
  turn: (req: ExploreTurnRequest) => api.post<ExploreTurnResponse>("/explore/turn", req),
};
