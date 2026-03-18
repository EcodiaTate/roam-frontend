// src/lib/offline/backgroundEnrich.ts
"use client";

import type { NavPack } from "@/lib/types/navigation";
import type { PackKind } from "./packsStore";
import { putPack } from "./packsStore";
import { navApi } from "@/lib/api/nav";
import { placesApi } from "@/lib/api/places";

/* ── Types ────────────────────────────────────────────────────────────── */

export type EnrichPhase = "idle" | "corridor" | "overlays" | "done" | "error" | "cancelled";

export type EnrichProgress = {
  phase: EnrichPhase;
  completed: number;
  total: number;
  corridorReady: boolean;
};

export type EnrichCallbacks = {
  /** Called when a pack is fetched and saved to IDB. */
  onPack: (kind: PackKind, data: unknown) => void;
  /** Called on every progress change. */
  onProgress: (p: EnrichProgress) => void;
  /** Called when all enrichment is complete. */
  onDone: () => void;
};

/* ── Constants ────────────────────────────────────────────────────────── */

/** Total overlay count: corridor + 17 overlays + route_score = 19 */
const TOTAL_ENRICHMENT_ITEMS = 19;

/* ── Helpers ──────────────────────────────────────────────────────────── */

async function safeFetch<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const t0 = performance.now();
  try {
    const result = await fn();
    console.info(`[enrich] ${label} done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    return result;
  } catch (e) {
    console.warn(`[enrich] ${label} failed after ${((performance.now() - t0) / 1000).toFixed(1)}s:`, e);
    return null;
  }
}

async function savePack(
  planId: string,
  kind: PackKind,
  data: unknown,
  callbacks: EnrichCallbacks,
): Promise<void> {
  await putPack(planId, kind, data as Parameters<typeof putPack>[2]);
  callbacks.onPack(kind, data);
}

/* ── Main ─────────────────────────────────────────────────────────────── */

export function startEnrichment(args: {
  planId: string;
  navPack: NavPack;
  departAt?: string | null;
  callbacks: EnrichCallbacks;
}): { cancel: () => void } {
  const { planId, navPack, departAt, callbacks } = args;
  const geometry = navPack.primary.geometry;
  const bbox = navPack.primary.bbox;
  const routeKey = navPack.primary.route_key;
  const profile = navPack.primary.profile ?? "drive";

  let cancelled = false;
  let completed = 0;
  let corridorReady = false;

  function emit(phase: EnrichPhase) {
    if (cancelled) return;
    lastEmittedPhase = phase;
    callbacks.onProgress({
      phase,
      completed,
      total: TOTAL_ENRICHMENT_ITEMS,
      corridorReady,
    });
  }

  let lastEmittedPhase: EnrichPhase = "idle";

  /** Fetch + tick a single overlay item. */
  function overlay(kind: PackKind, fn: () => Promise<unknown>): Promise<void> {
    return safeFetch(kind, fn).then(async (v) => {
      if (cancelled) return;
      if (v) await savePack(planId, kind, v, callbacks);
      completed++;
      console.info(`[enrich] step ${completed}/${TOTAL_ENRICHMENT_ITEMS}: ${kind}`);
      if (cancelled) return;
      callbacks.onProgress({
        phase: lastEmittedPhase,
        completed,
        total: TOTAL_ENRICHMENT_ITEMS,
        corridorReady,
      });
    });
  }

  async function run() {
    const runStart = performance.now();
    // ── 1. Places FIRST — we need stop coordinates for the corridor ──
    // The corridor graph must include road coverage around every
    // suggested stop. Fetch places using routeKey (no corridor key
    // needed), then pass their coords to corridorEnsure.
    emit("corridor"); // UI phase — covers places + corridor together

    let placesData: { items?: { lat: number; lng: number }[] } | null = null;
    try {
      placesData = await safeFetch("places", () =>
        placesApi.corridor({
          corridor_key: routeKey,
          geometry,
        }),
      ) as { items?: { lat: number; lng: number }[] } | null;
      if (cancelled) return;
      if (placesData) await savePack(planId, "places", placesData, callbacks);
    } catch (e) {
      console.warn("[enrich] places error:", e);
    }
    completed++;
    console.info(`[enrich] step ${completed}/${TOTAL_ENRICHMENT_ITEMS}: places`);
    callbacks.onProgress({ phase: lastEmittedPhase, completed, total: TOTAL_ENRICHMENT_ITEMS, corridorReady });

    // Extract stop coordinates for corridor building
    const stopCoords: number[][] = [];
    if (placesData?.items) {
      for (const item of placesData.items) {
        if (item.lat && item.lng) stopCoords.push([item.lat, item.lng]);
      }
    }
    console.info("[enrich] passing %d stop coords to corridor", stopCoords.length);

    // ── 2. Corridor (with stop coordinates) ──────────────────────────
    const corridorWork = (async () => {
      const t0 = performance.now();
      try {
        const meta = await safeFetch("corridor_ensure", () =>
          navApi.corridorEnsure({
            route_key: routeKey,
            geometry,
            profile,
            stop_coords: stopCoords.length > 0 ? stopCoords : undefined,
          }),
        );
        if (cancelled) return;

        if (meta?.corridor_key) {
          const corridorPack = await safeFetch("corridor_get", () =>
            navApi.corridorGet(meta.corridor_key),
          );
          if (cancelled) return;

          if (corridorPack) {
            const idbStart = performance.now();
            await savePack(planId, "corridor", corridorPack, callbacks);
            console.info(`[enrich] corridor IDB save: ${((performance.now() - idbStart) / 1000).toFixed(1)}s`);
            corridorReady = true;
          }
        }
      } catch (e) {
        console.warn("[enrich] corridor error:", e);
      }
      console.info(`[enrich] corridor total (ensure+get+save): ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      completed++;
      console.info(`[enrich] step ${completed}/${TOTAL_ENRICHMENT_ITEMS}: corridor`);
      callbacks.onProgress({ phase: lastEmittedPhase, completed, total: TOTAL_ENRICHMENT_ITEMS, corridorReady });
    })();

    // ── 3. Fire ALL non-corridor-dependent overlays immediately ──────
    // These only need geometry/bbox, so they run in parallel with the
    // corridor fetch. The counter starts climbing right away.
    emit("overlays");

    const overlayWork = Promise.allSettled([
      // Safety-critical (Phase 2)
      overlay("traffic", () => navApi.trafficPoll({ bbox })),
      overlay("hazards", () => navApi.hazardsPoll({ bbox })),
      overlay("bushfire", () => navApi.bushfireAlongRoute({ geometry })),

      // Environmental (Phase 4)
      overlay("flood", () => navApi.floodPoll({ bbox })),
      overlay("fuel", () => navApi.fuelAlongRoute({ polyline6: geometry })),
      overlay("air_quality", () => navApi.airQualityAlongRoute({ geometry })),
      departAt
        ? overlay("weather", () => navApi.weatherForecast({ polyline6: geometry, departure_iso: departAt }))
        : Promise.resolve().then(() => {
            completed++;
            console.info(`[enrich] step ${completed}/${TOTAL_ENRICHMENT_ITEMS}: weather (skipped, no departAt)`);
            callbacks.onProgress({ phase: lastEmittedPhase, completed, total: TOTAL_ENRICHMENT_ITEMS, corridorReady });
          }),

      // Info/POI (Phase 5)
      overlay("rest_areas", () => navApi.restAreasAlongRoute({ geometry })),
      overlay("emergency", () => navApi.emergencyAlongRoute({ geometry })),
      overlay("heritage", () => navApi.heritageAlongRoute({ geometry })),
      overlay("speed_cameras", () => navApi.speedCamerasAlongRoute({ geometry })),
      overlay("toilets", () => navApi.toiletsAlongRoute({ geometry })),
      overlay("school_zones", () => navApi.schoolZonesAlongRoute({ geometry })),
      overlay("roadkill", () => navApi.roadkillAlongRoute({ geometry })),
      overlay("coverage", () => navApi.coverageAlongRoute({ geometry })),
      overlay("wildlife", () => navApi.wildlifeAlongRoute({ polyline6: geometry })),
    ]);

    // Wait for corridor + overlays
    await Promise.allSettled([corridorWork, overlayWork]);
    console.info(`[enrich] all overlays + corridor done in ${((performance.now() - runStart) / 1000).toFixed(1)}s`);
    if (cancelled) return;

    // ── Route score (last — benefits from overlays being saved) ─────
    try {
      if (departAt) {
        const score = await safeFetch("route_score", () =>
          navApi.routeScore({ polyline6: geometry, bbox, departure_iso: departAt }),
        );
        if (!cancelled && score) {
          await savePack(planId, "route_score", score, callbacks);
        }
      }
    } catch (e) {
      console.warn("[enrich] route_score error:", e);
    }
    completed++;
    console.info(`[enrich] step ${completed}/${TOTAL_ENRICHMENT_ITEMS}: route_score`);
    callbacks.onProgress({ phase: lastEmittedPhase, completed, total: TOTAL_ENRICHMENT_ITEMS, corridorReady });

    if (cancelled) return;

    // ── Done ─────────────────────────────────────────────────────────
    console.info(`[enrich] TOTAL enrichment: ${((performance.now() - runStart) / 1000).toFixed(1)}s`);
    emit("done");
    callbacks.onDone();
  }

  run().catch((e) => {
    if (!cancelled) {
      console.error("[enrich] fatal error:", e);
      emit("error");
    }
  });

  return {
    cancel: () => {
      cancelled = true;
    },
  };
}
