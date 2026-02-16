// src/lib/api/guide.ts
import { api } from "./client";
import type { GuideTurnRequest, GuideTurnResponse } from "@/lib/types/guide";

export const guideApi = {
  // POST /guide/turn -> GuideTurnResponse
  turn: (req: GuideTurnRequest) => api.post<GuideTurnResponse>("/guide/turn", req),
};
