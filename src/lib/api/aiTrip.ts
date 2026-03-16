// src/lib/api/aiTrip.ts
//
// Calls the backend POST /ai/trip endpoint, which proxies to DeepSeek.
// The API key stays server-side.

import { api } from "./client";

export type AiTripStop = {
  name: string;
  lat: number;
  lng: number;
  reason: string;
};

export type AiTripSuggestion = {
  title: string;
  stops: AiTripStop[];
};

export async function generateAiTrip(
  vibe: string,
  signal?: AbortSignal,
): Promise<AiTripSuggestion> {
  return api.post<AiTripSuggestion>("/ai/trip", { vibe }, { signal, timeoutMs: 60_000 });
}
