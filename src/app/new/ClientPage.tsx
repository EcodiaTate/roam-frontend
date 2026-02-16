"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { NavPack, CorridorGraphMeta } from "@/lib/types/navigation";
import type { OfflineBundleManifest } from "@/lib/types/bundle";

import { navApi } from "@/lib/api/nav";
import { placesApi } from "@/lib/api/places";
import { bundleApi } from "@/lib/api/bundle";

import { saveOfflinePlan } from "@/lib/offline/plansStore";
import { haptic } from "@/lib/native/haptics";

import { useNewTripDraft } from "@/components/trips/new/useNewTripDraft";
import { NewTripMap } from "@/components/trips/new/NewTripMap";
import { StopsEditor } from "@/components/trips/new/StopsEditor";
import { PlaceSearchModal } from "@/components/trips/new/PlaceSearchModal";
import { MapStyleSwitcher, type MapBaseMode, type VectorTheme } from "@/components/trips/new/MapStyleSwitcher";

type OfflineBuildPhase =
  | "idle"
  | "routing"
  | "corridor_ensure"
  | "corridor_get"
  | "places_corridor"
  | "traffic_poll"
  | "hazards_poll"
  | "bundle_build"
  | "ready"
  | "error";

function genPlanId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  return `plan_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function uiStatus(phase: OfflineBuildPhase, saved: boolean, err: string | null) {
  if (err) return err;
  if (saved) return "Saved. Offline ready.";
  switch (phase) {
    case "idle":
      return "Ready";
    case "routing":
      return "Building route…";
    case "corridor_ensure":
    case "corridor_get":
      return "Preparing offline corridor…";
    case "places_corridor":
      return "Caching places…";
    case "traffic_poll":
      return "Fetching traffic…";
    case "hazards_poll":
      return "Fetching warnings…";
    case "bundle_build":
      return "Packaging offline bundle…";
    case "ready":
      return "Offline ready.";
    case "error":
      return err ?? "Something went wrong";
  }
}

export default function NewTripClientPage() {
  const router = useRouter();
  const draft = useNewTripDraft();

  const [navPack, setNavPack] = useState<NavPack | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTargetStopId, setSearchTargetStopId] = useState<string | null>(null);

  const [baseMode, setBaseMode] = useState<MapBaseMode>("vector");
  const [vectorTheme, setVectorTheme] = useState<VectorTheme>("bright");

  const styleId = useMemo(() => {
    if (baseMode === "hybrid") return "roam-basemap-hybrid";
    return vectorTheme === "dark" ? "roam-basemap-vector-dark" : "roam-basemap-vector-bright";
  }, [baseMode, vectorTheme]);

  const canRoute = useMemo(() => {
    const s = draft.stops;
    return s.length >= 2 && s.some((x) => x.type === "start") && s.some((x) => x.type === "end");
  }, [draft.stops]);

  const requestRoute = useCallback(async () => {
    if (!canRoute) return;
    setRouteError(null);
    setRouting(true);
    try {
      const pack = await navApi.route({
        profile: draft.profile,
        prefs: draft.prefs,
        avoid: draft.avoid,
        stops: draft.stops,
        depart_at: draft.depart_at ?? null,
      });
      setNavPack(pack);
    } catch (e: any) {
      setNavPack(null);
      setRouteError(e?.message ?? "Failed to build route");
    } finally {
      setRouting(false);
    }
  }, [canRoute, draft]);

  const openSearchForStop = useCallback((stopId: string) => {
    setSearchTargetStopId(stopId);
    setSearchOpen(true);
  }, []);

  const [buildPhase, setBuildPhase] = useState<OfflineBuildPhase>("idle");
  const [buildError, setBuildError] = useState<string | null>(null);

  const [corridorMeta, setCorridorMeta] = useState<CorridorGraphMeta | null>(null);
  const [manifest, setManifest] = useState<OfflineBundleManifest | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const planIdRef = useRef<string | null>(null);

  const resetArtifacts = useCallback(() => {
    setBuildPhase("idle");
    setBuildError(null);
    setCorridorMeta(null);
    setManifest(null);
    setSaving(false);
    setSaved(false);
    planIdRef.current = null;
  }, []);

  const onPickPlace = useCallback(
    (args: { stopId: string; name: string; lat: number; lng: number }) => {
      draft.updateStop(args.stopId, { name: args.name, lat: args.lat, lng: args.lng });
      setSearchOpen(false);
      setSearchTargetStopId(null);
      setNavPack(null);
      setRouteError(null);
      resetArtifacts();
    },
    [draft, resetArtifacts],
  );

  const ensureNavPack = useCallback(async (): Promise<NavPack> => {
    if (navPack?.primary?.geometry) return navPack;

    setBuildPhase("routing");
    const pack = await navApi.route({
      profile: draft.profile,
      prefs: draft.prefs,
      avoid: draft.avoid,
      stops: draft.stops,
      depart_at: draft.depart_at ?? null,
    });
    setNavPack(pack);
    return pack;
  }, [navPack, draft]);

  const saveTripOfflineReady = useCallback(async () => {
    if (!canRoute) return;

    haptic.medium();
    setBuildError(null);
    setSaved(false);
    setSaving(true);

    const plan_id: string = planIdRef.current ?? genPlanId();
    planIdRef.current = plan_id;

    try {
      // 1) Ensure route
      setBuildPhase("routing");
      const pack = await ensureNavPack();
      const route_key = pack.primary.route_key;
      const geometry = pack.primary.geometry;
      const bbox = pack.primary.bbox;

      // 2) Offline pipeline
      setBuildPhase("corridor_ensure");
      const meta = await navApi.corridorEnsure({
        route_key,
        geometry,
        profile: pack.primary.profile ?? draft.profile,
        buffer_m: 15000,
        max_edges: 350000,
      });
      setCorridorMeta(meta);

      setBuildPhase("corridor_get");
      await navApi.corridorGet(meta.corridor_key);

      // Places corridor — send route geometry so the backend searches
      // along the actual road shape, not just a start-to-end rectangle
      setBuildPhase("places_corridor");
      await placesApi.corridor({
        corridor_key: meta.corridor_key,
        geometry,
        buffer_km: 15,
        limit: 8000,
      });

      setBuildPhase("traffic_poll");
      await navApi.trafficPoll({ bbox, cache_seconds: 60, timeout_s: 10 });

      setBuildPhase("hazards_poll");
      await navApi.hazardsPoll({ bbox, sources: [], cache_seconds: 60, timeout_s: 10 });

      setBuildPhase("bundle_build");
      const m = await bundleApi.build({
        plan_id,
        route_key,
        geometry,
        profile: pack.primary.profile ?? draft.profile,
        buffer_m: 15000,
        max_edges: 350000,
        styles: [styleId],
      });
      setManifest(m);

      // 3) Download zip & save locally
      const url = bundleApi.downloadUrl(m.plan_id);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Zip download failed (${res.status})`);

      const blob = await res.blob();
      const mime = res.headers.get("content-type") || blob.type || "application/zip";
      const bytes = Number(res.headers.get("content-length") || blob.size || 0);

      await saveOfflinePlan({
        manifest: m,
        zipBlob: blob,
        zipBytes: bytes,
        zipMime: mime,
        preview: {
          stops: draft.stops,
          geometry: pack.primary.geometry,
          bbox: pack.primary.bbox,
          distance_m: pack.primary.distance_m,
          duration_s: pack.primary.duration_s,
          profile: pack.primary.profile ?? draft.profile,
        },
      });

      setBuildPhase("ready");
      setSaved(true);
      haptic.success();

      // 4) Jump into the trip
      router.replace(`/trip?plan_id=${encodeURIComponent(plan_id)}`);
    } catch (e: any) {
      setBuildPhase("error");
      setBuildError(e?.message ?? "Failed to save trip");
      setSaved(false);
      haptic.error();
    } finally {
      setSaving(false);
    }
  }, [canRoute, ensureNavPack, draft.profile, draft.stops, styleId, router]);

  const statusText = uiStatus(buildPhase, saved, buildError);

  return (
    <div className="trip-app-container">
      <NewTripMap
        stops={draft.stops}
        navPack={navPack}
        styleId={styleId}
        onMapCenterChanged={draft.setMapCenter}
      />

      <MapStyleSwitcher
        mode={baseMode}
        vectorTheme={vectorTheme}
        onChange={(next) => {
          setBaseMode(next.mode);
          setVectorTheme(next.vectorTheme);
          resetArtifacts();
        }}
      />

      <StopsEditor
        profile={draft.profile}
        onProfileChange={(p) => {
          draft.setProfile(p);
          setNavPack(null);
          setRouteError(null);
          resetArtifacts();
        }}
        stops={draft.stops}
        onAddStop={(t) => {
          draft.addStop(t as any);
          setNavPack(null);
          setRouteError(null);
          resetArtifacts();
        }}
        onRemoveStop={(id) => {
          draft.removeStop(id);
          setNavPack(null);
          setRouteError(null);
          resetArtifacts();
        }}
        onReorderStop={(a, b) => {
          draft.reorderStop(a, b);
          setNavPack(null);
          setRouteError(null);
          resetArtifacts();
        }}
        onEditStop={(id, patch) => {
          draft.updateStop(id, patch);
          setNavPack(null);
          setRouteError(null);
          resetArtifacts();
        }}
        onUseMyLocation={() => {
          draft.useMyLocationForStart();
          setNavPack(null);
          setRouteError(null);
          resetArtifacts();
        }}
        onSearchStop={openSearchForStop}
        onBuildRoute={requestRoute}
        canBuildRoute={canRoute}
        routing={routing}
        error={routeError}
        // new simplified save action (one button)
        onBuildOffline={saveTripOfflineReady}
        onDownloadOffline={() => {}}
        onSaveOffline={() => {}}
        onResetOffline={resetArtifacts}
        offlinePhase={buildPhase as any}
        offlineError={buildError}
        offlineManifest={manifest}
        canDownloadOffline={false}
        savingOffline={saving}
        savedOffline={saved}
      />

      {/* Simple status overlay */}
      {(saving || buildPhase !== "idle") && (
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: "100%",
              borderRadius: 14,
              padding: "12px 14px",
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(10px)",
              color: "white",
              fontSize: 13,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span style={{ opacity: 0.95 }}>{statusText}</span>
            <span style={{ opacity: 0.75, fontWeight: 800 }}>
              {saving ? "…" : buildPhase === "ready" ? "✓" : ""}
            </span>
          </div>
        </div>
      )}

      <PlaceSearchModal
        open={searchOpen}
        stopId={searchTargetStopId}
        onClose={() => {
          setSearchOpen(false);
          setSearchTargetStopId(null);
        }}
        mapCenter={draft.mapCenter}
        onPick={onPickPlace}
      />
    </div>
  );
}