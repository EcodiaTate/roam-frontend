// src/lib/api/health.ts
import { api } from "./client";

export type HealthResponse = { ok: boolean };

export const healthApi = {
  get: () => api.get<HealthResponse>("/health"),
};
