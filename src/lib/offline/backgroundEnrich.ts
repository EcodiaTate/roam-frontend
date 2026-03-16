// src/lib/offline/backgroundEnrich.ts
"use client";

import type { NavPack } from "@/lib/types/navigation";
import type { PackKind } from "./packsStore";
import { putPack } from "./packsStore";
import { navApi } from "@/lib/api/nav";
import { placesApi } from "@/lib/api/places";

/* ── Types ────────────────────────────────────────────────────────────── */

export type EnrichPhase = "idle" | "corridor" | "overlays" | "done" | "cancelled";

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
  try {
    return await fn();
  } catch (e) {
    console.warn(`[enrich] ${label} failed:`, e);
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

  function emit(phase: EnrichPhase, corridorReady: boolean) {
    if (cancelled) return;
    callbacks.onProgress({
      phase,
      completed,
      total: TOTAL_ENRICHMENT_ITEMS,
      corridorReady,
    });
  }

  function tick() {
    completed++;
  }

  async function run() {
    let corridorReady = false;
    let corridorKey: string | null = null;

    // ── Phase 1: Corridor (serial, highest priority) ──────────────
    emit("corridor", false);

    const meta = await safeFetch("corridor_ensure", () =>
      navApi.corridorEnsure({
        route_key: routeKey,
        geometry,
        profile,
      }),
    );

    if (cancelled) return;

    if (meta?.corridor_key) {
      corridorKey = meta.corridor_key;
      const corridorPack = await safeFetch("corridor_get", () =>
        navApi.corridorGet(meta.corridor_key),
      );
      if (cancelled) return;

      if (corridorPack) {
        await savePack(planId, "corridor", corridorPack, callbacks);
        corridorReady = true;
      }
    }
    tick();
    emit("overlays", corridorReady);

    if (cancelled) return;

    // ── Phase 2: Safety-critical batch (concurrent) ───────────────
    const [trafficRes, hazardsRes, bushfireRes] = await Promise.allSettled([
      safeFetch("traffic", () => navApi.trafficPoll({ bbox })),
      safeFetch("hazards", () => navApi.hazardsPoll({ bbox })),
      safeFetch("bushfire", () => navApi.bushfireAlongRoute({ geometry })),
    ]);

    if (cancelled) return;

    if (trafficRes.status === "fulfilled" && trafficRes.value) {
      await savePack(planId, "traffic", trafficRes.value, callbacks);
    }
    tick();

    if (hazardsRes.status === "fulfilled" && hazardsRes.value) {
      await savePack(planId, "hazards", hazardsRes.value, callbacks);
    }
    tick();

    if (bushfireRes.status === "fulfilled" && bushfireRes.value) {
      await savePack(planId, "bushfire", bushfireRes.value, callbacks);
    }
    tick();

    emit("overlays", corridorReady);
    if (cancelled) return;

    // ── Phase 3: Places (can be slow, 120s timeout) ──────────────
    const placesData = await safeFetch("places", () =>
      placesApi.corridor({
        corridor_key: corridorKey ?? routeKey,
        geometry,
      }),
    );
    if (cancelled) return;
    if (placesData) {
      await savePack(planId, "places", placesData, callbacks);
    }
    tick();
    emit("overlays", corridorReady);

    if (cancelled) return;

    // ── Phase 4: Environmental batch (concurrent) ────────────────
    const envPromises: Promise<unknown>[] = [
      safeFetch("flood", () => navApi.floodPoll({ bbox })),
      safeFetch("fuel", () => navApi.fuelAlongRoute({ polyline6: geometry })),
      safeFetch("air_quality", () => navApi.airQualityAlongRoute({ geometry })),
    ];

    // Weather requires departure_iso — skip if not provided
    if (departAt) {
      envPromises.push(
        safeFetch("weather", () =>
          navApi.weatherForecast({ polyline6: geometry, departure_iso: departAt }),
        ),
      );
    }

    const envResults = await Promise.allSettled(envPromises);
    if (cancelled) return;

    const envKinds: (PackKind | null)[] = ["flood", "fuel", "air_quality", departAt ? "weather" : null];
    for (let i = 0; i < envResults.length; i++) {
      const r = envResults[i];
      const kind = envKinds[i];
      if (r.status === "fulfilled" && r.value && kind) {
        await savePack(planId, kind, r.value, callbacks);
      }
      tick();
    }
    // If weather was skipped, still count it
    if (!departAt) tick();

    emit("overlays", corridorReady);
    if (cancelled) return;

    // ── Phase 5: Info batch (concurrent) ─────────────────────────
    const [
      restAreasRes, emergencyRes, heritageRes, speedCamerasRes,
      toiletsRes, schoolZonesRes, roadkillRes, coverageRes, wildlifeRes,
    ] = await Promise.allSettled([
      safeFetch("rest_areas", () => navApi.restAreasAlongRoute({ geometry })),
      safeFetch("emergency", () => navApi.emergencyAlongRoute({ geometry })),
      safeFetch("heritage", () => navApi.heritageAlongRoute({ geometry })),
      safeFetch("speed_cameras", () => navApi.speedCamerasAlongRoute({ geometry })),
      safeFetch("toilets", () => navApi.toiletsAlongRoute({ geometry })),
      safeFetch("school_zones", () => navApi.schoolZonesAlongRoute({ geometry })),
      safeFetch("roadkill", () => navApi.roadkillAlongRoute({ geometry })),
      safeFetch("coverage", () => navApi.coverageAlongRoute({ geometry })),
      safeFetch("wildlife", () => navApi.wildlifeAlongRoute({ polyline6: geometry })),
    ]);

    if (cancelled) return;

    const infoResults = [
      restAreasRes, emergencyRes, heritageRes, speedCamerasRes,
      toiletsRes, schoolZonesRes, roadkillRes, coverageRes, wildlifeRes,
    ];
    const infoKinds: PackKind[] = [
      "rest_areas", "emergency", "heritage", "speed_cameras",
      "toilets", "school_zones", "roadkill", "coverage", "wildlife",
    ];

    for (let i = 0; i < infoResults.length; i++) {
      const r = infoResults[i];
      if (r.status === "fulfilled" && r.value) {
        await savePack(planId, infoKinds[i], r.value, callbacks);
      }
      tick();
    }

    emit("overlays", corridorReady);
    if (cancelled) return;

    // ── Phase 6: Route score (last — benefits from overlays) ─────
    if (departAt) {
      const score = await safeFetch("route_score", () =>
        navApi.routeScore({
          polyline6: geometry,
          bbox,
          departure_iso: departAt,
        }),
      );
      if (!cancelled && score) {
        await savePack(planId, "route_score", score, callbacks);
      }
    }
    tick();

    if (cancelled) return;

    // ── Done ─────────────────────────────────────────────────────
    emit("done", corridorReady);
    callbacks.onDone();
  }

  run().catch((e) => {
    if (!cancelled) {
      console.error("[enrich] unexpected error:", e);
      emit("done", false);
      callbacks.onDone();
    }
  });

  return {
    cancel: () => {
      cancelled = true;
    },
  };
}
