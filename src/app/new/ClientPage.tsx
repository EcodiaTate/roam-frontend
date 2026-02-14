// src/app/new/ClientPage.tsx
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { NavPack, CorridorGraphMeta } from "@/lib/types/navigation";
import type { OfflineBundleManifest } from "@/lib/types/bundle";

import { navApi } from "@/lib/api/nav";
import { placesApi } from "@/lib/api/places";
import { bundleApi } from "@/lib/api/bundle";

import { saveOfflinePlan } from "@/lib/offline/plansStore";

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

export function NewTripClientPage() {
  const draft = useNewTripDraft();

  const [navPack, setNavPack] = useState<NavPack | null>(null);
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTargetStopId, setSearchTargetStopId] = useState<string | null>(null);

  // Map style UI
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
    setError(null);
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
      setError(e?.message ?? "Failed to build route");
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

  const [savingOffline, setSavingOffline] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);

  const planIdRef = useRef<string | null>(null);

  const resetOfflineArtifacts = useCallback(() => {
    setBuildPhase("idle");
    setBuildError(null);
    setCorridorMeta(null);
    setManifest(null);
    setSavingOffline(false);
    setSavedOffline(false);
    planIdRef.current = null;
  }, []);

  const onPickPlace = useCallback(
    (args: { stopId: string; name: string; lat: number; lng: number }) => {
      draft.updateStop(args.stopId, { name: args.name, lat: args.lat, lng: args.lng });
      setSearchOpen(false);
      setSearchTargetStopId(null);
      setNavPack(null);
      setError(null);
      resetOfflineArtifacts();
    },
    [draft, resetOfflineArtifacts],
  );

  const ensureWeHaveNavPack = useCallback(async (): Promise<NavPack> => {
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

  const buildOffline = useCallback(async () => {
    if (!canRoute) return;

    setBuildError(null);
    setSavedOffline(false);
    setBuildPhase("routing");

    // ✅ TS2322-proof
    const plan_id: string = planIdRef.current ?? genPlanId();
    planIdRef.current = plan_id;

    try {
      const pack = await ensureWeHaveNavPack();
      const route_key = pack.primary.route_key;
      const geometry = pack.primary.geometry;
      const bbox = pack.primary.bbox;

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

      setBuildPhase("places_corridor");
      await placesApi.corridor({
        corridor_key: meta.corridor_key,
        categories: [],
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

      setBuildPhase("ready");
    } catch (e: any) {
      setBuildPhase("error");
      setBuildError(e?.message ?? "Offline build failed");
    }
  }, [canRoute, ensureWeHaveNavPack, draft.profile, styleId]);

  const canDownloadOffline = useMemo(
    () => buildPhase === "ready" && !!manifest?.plan_id,
    [buildPhase, manifest?.plan_id],
  );

  const downloadOffline = useCallback(() => {
    if (!manifest?.plan_id) return;
    window.location.href = bundleApi.downloadUrl(manifest.plan_id);
  }, [manifest?.plan_id]);

  const saveOffline = useCallback(async () => {
    if (!manifest?.plan_id) return;

    // Need a navPack to store preview info
    const pack = await ensureWeHaveNavPack();
    if (!pack?.primary?.geometry) {
      setBuildPhase("error");
      setBuildError("Missing nav geometry; rebuild route.");
      return;
    }

    setSavingOffline(true);
    setBuildError(null);

    try {
      const url = bundleApi.downloadUrl(manifest.plan_id);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Zip download failed (${res.status})`);

      const blob = await res.blob();
      const mime = res.headers.get("content-type") || blob.type || "application/zip";
      const bytes = Number(res.headers.get("content-length") || blob.size || 0);

      await saveOfflinePlan({
        manifest,
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

      setSavedOffline(true);
    } catch (e: any) {
      setSavedOffline(false);
      setBuildPhase("error");
      setBuildError(e?.message ?? "Failed to save offline");
    } finally {
      setSavingOffline(false);
    }
  }, [manifest, ensureWeHaveNavPack, draft.stops, draft.profile]);

  return (
    <div style={{ minHeight: "100vh" }}>
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
        }}
      />

      <StopsEditor
        profile={draft.profile}
        onProfileChange={(p) => {
          draft.setProfile(p);
          setNavPack(null);
          setError(null);
          resetOfflineArtifacts();
        }}
        stops={draft.stops}
        onAddStop={(t) => {
          draft.addStop(t as any);
          setNavPack(null);
          setError(null);
          resetOfflineArtifacts();
        }}
        onRemoveStop={(id) => {
          draft.removeStop(id);
          setNavPack(null);
          setError(null);
          resetOfflineArtifacts();
        }}
        onReorderStop={(a, b) => {
          draft.reorderStop(a, b);
          setNavPack(null);
          setError(null);
          resetOfflineArtifacts();
        }}
        onEditStop={(id, patch) => {
          draft.updateStop(id, patch);
          setNavPack(null);
          setError(null);
          resetOfflineArtifacts();
        }}
        onUseMyLocation={() => {
          draft.useMyLocationForStart();
          setNavPack(null);
          setError(null);
          resetOfflineArtifacts();
        }}
        onSearchStop={openSearchForStop}
        onBuildRoute={requestRoute}
        canBuildRoute={canRoute}
        routing={routing}
        error={error}
        onBuildOffline={buildOffline}
        onDownloadOffline={downloadOffline}
        onSaveOffline={saveOffline}
        onResetOffline={resetOfflineArtifacts}
        offlinePhase={buildPhase as any}
        offlineError={buildError}
        offlineManifest={manifest}
        canDownloadOffline={canDownloadOffline}
        savingOffline={savingOffline}
        savedOffline={savedOffline}
      />

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
