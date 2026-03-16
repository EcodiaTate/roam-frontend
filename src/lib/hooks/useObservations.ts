// src/lib/hooks/useObservations.ts
"use client";

import { toErrorMessage } from "@/lib/utils/errors";

/**
 * useObservations
 *
 * Hook for submitting and querying crowd-sourced road observations.
 * Observations are stored server-side and aggregated by type + proximity.
 * Also caches submitted observations locally in IDB for offline access.
 *
 * - Request deduplication: concurrent callers share a single inflight fetch.
 * - IDB cache-first: if cached data exists and is < STALE_MS old, return it
 *   immediately while refreshing in the background.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { observationsApi } from "@/lib/api/observations";
import { networkMonitor } from "@/lib/offline/networkMonitor";
import { idbGet, idbPut } from "@/lib/offline/idb";
import type {
  AggregatedObservation,
  ObservationType,
  ObservationSubmitRequest,
} from "@/lib/types/peer";

const IDB_OBS_CACHE_KEY = "peer:observations_cache";
const IDB_OBS_TS_KEY = "peer:observations_cache_ts";

/** Cache is considered fresh for 5 minutes. */
const STALE_MS = 5 * 60 * 1000;

/* ── Inflight request deduplication ────────────────────────────────── */

const inflight = new Map<string, Promise<AggregatedObservation[]>>();

function dedupeKey(lat: number, lng: number, radiusKm: number, types?: ObservationType[] | null): string {
  const t = types ? types.slice().sort().join(",") : "*";
  // Round coords to ~100m to coalesce nearby requests
  return `${lat.toFixed(3)},${lng.toFixed(3)},${radiusKm},${t}`;
}

/* ── Hook ──────────────────────────────────────────────────────────── */

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
  const autoFetch = opts?.autoFetch ?? true;

  // Stabilise `types` so callers can pass inline arrays without causing re-fetches
  const typesRef = useRef(opts?.types);
  const typesKey = opts?.types?.join(",") ?? "";
  if (typesRef.current?.join(",") !== typesKey) {
    typesRef.current = opts?.types;
  }
  const types = typesRef.current;

  const [state, setState] = useState<ObservationsState>({
    observations: [],
    loading: false,
    submitting: false,
    error: null,
  });

  // Track whether we've already attempted IDB cache load this mount
  const cacheChecked = useRef(false);

  /** Shared network fetch (or join inflight). Returns observations. */
  const networkFetch = useCallback(
    async (lat: number, lng: number): Promise<AggregatedObservation[]> => {
      const key = dedupeKey(lat, lng, radiusKm, types ?? null);

      let promise = inflight.get(key);
      if (!promise) {
        promise = observationsApi
          .nearby({ lat, lng, radius_km: radiusKm, types: types ?? null })
          .then((res) => res.observations);
        inflight.set(key, promise);
        promise.finally(() => inflight.delete(key));
      }
      return promise;
    },
    [radiusKm, types],
  );

  const fetchObs = useCallback(async () => {
    if (lat == null || lng == null) return;

    // ── IDB cache-first: serve cached data immediately if fresh ────
    if (!cacheChecked.current) {
      cacheChecked.current = true;
      try {
        const [cached, ts] = await Promise.all([
          idbGet<AggregatedObservation[]>("meta", IDB_OBS_CACHE_KEY),
          idbGet<number>("meta", IDB_OBS_TS_KEY),
        ]);
        if (cached && ts && Date.now() - ts < STALE_MS) {
          // Serve cache immediately — no loading spinner
          setState({ observations: cached, loading: false, submitting: false, error: null });
          // Silent background refresh
          if (networkMonitor.online) {
            networkFetch(lat, lng)
              .then(async (obs) => {
                await Promise.all([
                  idbPut("meta", obs, IDB_OBS_CACHE_KEY),
                  idbPut("meta", Date.now(), IDB_OBS_TS_KEY),
                ]);
                setState((s) => ({ ...s, observations: obs }));
              })
              .catch(() => { /* silent background refresh failure */ });
          }
          return;
        }
      } catch { /* ignore cache errors, fall through to network */ }
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      if (networkMonitor.online) {
        const observations = await networkFetch(lat, lng);

        // Update IDB cache + timestamp
        await Promise.all([
          idbPut("meta", observations, IDB_OBS_CACHE_KEY),
          idbPut("meta", Date.now(), IDB_OBS_TS_KEY),
        ]);

        setState({ observations, loading: false, submitting: false, error: null });
      } else {
        // Offline — load from cache
        const cached = await idbGet<AggregatedObservation[]>("meta", IDB_OBS_CACHE_KEY);
        setState({ observations: cached ?? [], loading: false, submitting: false, error: null });
      }
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: toErrorMessage(e, "Failed to fetch observations"),
      }));
    }
  }, [lat, lng, networkFetch]);

  const submit = useCallback(
    async (req: ObservationSubmitRequest) => {
      setState((s) => ({ ...s, submitting: true, error: null }));

      try {
        const res = await observationsApi.submit(req);
        // Refresh nearby observations after submission
        void fetchObs();
        return res;
      } catch (e) {
        setState((s) => ({
          ...s,
          submitting: false,
          error: toErrorMessage(e, "Failed to submit observation"),
        }));
        return null;
      }
    },
    [fetchObs],
  );

  // Auto-fetch on mount and when position changes
  useEffect(() => {
    if (autoFetch && lat != null && lng != null) {
      void fetchObs();
    }
  }, [autoFetch, lat, lng, fetchObs]);

  return {
    ...state,
    fetch: fetchObs,
    submit,
  };
}
