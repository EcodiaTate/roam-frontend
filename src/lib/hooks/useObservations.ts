// src/lib/hooks/useObservations.ts
"use client";

/**
 * useObservations
 *
 * Hook for submitting and querying crowd-sourced road observations.
 * Observations are stored server-side and aggregated by type + proximity.
 * Also caches submitted observations locally in IDB for offline access.
 */

import { useCallback, useEffect, useState } from "react";
import { observationsApi } from "@/lib/api/observations";
import { networkMonitor } from "@/lib/offline/networkMonitor";
import { idbGet, idbPut } from "@/lib/offline/idb";
import type {
  AggregatedObservation,
  ObservationType,
  ObservationSeverity,
  ObservationSubmitRequest,
} from "@/lib/types/peer";

const IDB_OBS_CACHE_KEY = "peer:observations_cache";

type ObservationsState = {
  observations: AggregatedObservation[];
  loading: boolean;
  submitting: boolean;
  error: string | null;
};

export function useObservations(opts?: {
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
  types?: ObservationType[];
  autoFetch?: boolean;
}) {
  const lat = opts?.lat ?? null;
  const lng = opts?.lng ?? null;
  const radiusKm = opts?.radiusKm ?? 50;
  const types = opts?.types;
  const autoFetch = opts?.autoFetch ?? true;

  const [state, setState] = useState<ObservationsState>({
    observations: [],
    loading: false,
    submitting: false,
    error: null,
  });

  const fetch = useCallback(async () => {
    if (lat == null || lng == null) return;

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      if (networkMonitor.online) {
        const res = await observationsApi.nearby({
          lat,
          lng,
          radius_km: radiusKm,
          types: types ?? null,
        });

        // Cache in IDB for offline
        await idbPut("meta", res.observations, IDB_OBS_CACHE_KEY);

        setState({
          observations: res.observations,
          loading: false,
          submitting: false,
          error: null,
        });
      } else {
        // Offline — load from cache
        const cached = await idbGet<AggregatedObservation[]>("meta", IDB_OBS_CACHE_KEY);
        setState({
          observations: cached ?? [],
          loading: false,
          submitting: false,
          error: null,
        });
      }
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to fetch observations",
      }));
    }
  }, [lat, lng, radiusKm, types]);

  const submit = useCallback(
    async (req: ObservationSubmitRequest) => {
      setState((s) => ({ ...s, submitting: true, error: null }));

      try {
        const res = await observationsApi.submit(req);
        // Refresh nearby observations after submission
        void fetch();
        return res;
      } catch (e) {
        setState((s) => ({
          ...s,
          submitting: false,
          error: e instanceof Error ? e.message : "Failed to submit observation",
        }));
        return null;
      }
    },
    [fetch],
  );

  // Auto-fetch on mount and when position changes
  useEffect(() => {
    if (autoFetch && lat != null && lng != null) {
      void fetch();
    }
  }, [autoFetch, lat, lng, fetch]);

  return {
    ...state,
    fetch,
    submit,
  };
}

/** Observation type metadata for UI rendering */
const OBSERVATION_TYPES: {
  type: ObservationType;
  label: string;
  icon: string; // Lucide icon name
  defaultSeverity: ObservationSeverity;
}[] = [
  { type: "road_condition", label: "Road Condition", icon: "construction", defaultSeverity: "caution" },
  { type: "road_closure", label: "Road Closed", icon: "circle-slash", defaultSeverity: "danger" },
  { type: "hazard", label: "Hazard", icon: "alert-triangle", defaultSeverity: "warning" },
  { type: "fuel_price", label: "Fuel Price", icon: "fuel", defaultSeverity: "info" },
  { type: "speed_trap", label: "Speed Check", icon: "camera", defaultSeverity: "caution" },
  { type: "weather", label: "Weather", icon: "cloud-rain", defaultSeverity: "caution" },
  { type: "campsite", label: "Campsite Update", icon: "tent", defaultSeverity: "info" },
  { type: "general", label: "General", icon: "message-circle", defaultSeverity: "info" },
];
