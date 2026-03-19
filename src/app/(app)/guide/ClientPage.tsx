// src/app/guide/ClientPage.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { haptic } from "@/lib/native/haptics";
import { toErrorMessage } from "@/lib/utils/errors";
import { useGeolocation } from "@/lib/native/geolocation";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";
import { getCurrentPlanId, getOfflinePlan, type OfflinePlanRecord } from "@/lib/offline/plansStore";
import { getAllPacks, hasCorePacks } from "@/lib/offline/packsStore";
import { unpackAndStoreBundle } from "@/lib/offline/unpackBundle";

import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { GuidePack, GuideContext, TripProgress } from "@/lib/types/guide";
import type {
    WeatherOverlay,
    FloodOverlay,
    CoverageOverlay,
    WildlifeOverlay,
    RestAreaOverlay,
    RouteIntelligenceScore,
    FuelOverlay,
} from "@/lib/types/overlays";
import type { TripStop } from "@/lib/types/trip";

import { createGuidePack, guideSendMessage } from "@/lib/guide/guideEngine";
import { computeTripProgress } from "@/lib/guide/tripProgress";
import { addPlaceToTrip } from "@/lib/guide/addToTrip";
import { usePlaceDetail } from "@/lib/context/PlaceDetailContext";

import { GuideView, type GuideTabBarProps } from "@/components/trip/GuideView";

import { Sparkles, MapPin, Wifi, WifiOff, Satellite, AlertTriangle } from "lucide-react";
import { GuideSkeleton } from "./GuideSkeleton";

import type { GuideBootstrap } from "@/lib/guide/guideEngine";

// ──────────────────────────────────────────────────────────────
// Driver state builder
// ──────────────────────────────────────────────────────────────

/**
 * Build a driverState snapshot from available data for Guide AI context.
 * This gives the AI situational awareness: fuel, fatigue, speed, night, temperature.
 */
function buildDriverState(
  weather: WeatherOverlay | null,
  fuel: FuelOverlay | null,
  navpack: NavPack | null,
  progress: TripProgress | null,
): GuideBootstrap["driverState"] {
  if (!progress) return null;

  // Find weather at the user's current position
  let nearestWeather: WeatherOverlay["points"][number] | null = null;
  if (weather?.points?.length) {
    let bestDist = Infinity;
    for (const p of weather.points) {
      const d = Math.abs(p.km_along - progress.km_from_start);
      if (d < bestDist) { bestDist = d; nearestWeather = p; }
    }
  }

  // Estimate ETA
  const totalDist = navpack?.primary?.distance_m ?? 0;
  const totalDur = navpack?.primary?.duration_s ?? 0;
  const remainKm = progress.km_remaining;
  const plannedSpeed = totalDist > 0 ? totalDist / totalDur : 25; // m/s
  const remainSec = (remainKm * 1000) / (plannedSpeed || 25);
  const eta = new Date(Date.now() + remainSec * 1000);
  const etaIso = eta.toISOString();

  // Night arrival: does ETA fall outside daylight?
  let nightArrival = false;
  if (weather?.points?.length) {
    const lastPt = weather.points[weather.points.length - 1];
    if (lastPt.sunset_iso) {
      try { nightArrival = eta > new Date(lastPt.sunset_iso); } catch {}
    }
  }

  return {
    temperature_c: nearestWeather?.temperature_c,
    is_night: nearestWeather ? nearestWeather.is_daylight === false : undefined,
    eta_iso: etaIso,
    night_arrival: nightArrival,
    speed_ratio: undefined, // not available in guide page (no active nav)
    fatigue_level: undefined,
    hours_since_rest: undefined,
    fuel_pressure: undefined,
    km_to_next_fuel: undefined,
  };
}

// ──────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────

export default function GuideClientPage(props: {
  initialPlanId: string | null;
  initialFocusPlaceId: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const { online: isOnline } = useNetworkStatus();
  const { registerNavigateHandler } = usePlaceDetail();


  const planIdFromUrl = sp.get("plan_id");
  const focusFromUrl = sp.get("focus_place_id");
  const askAboutFromUrl = sp.get("ask_about");

  const desiredPlanId = useMemo(
    () => props.initialPlanId ?? planIdFromUrl ?? null,
    [props.initialPlanId, planIdFromUrl],
  );
  const desiredFocusPlaceId = useMemo(
    () => props.initialFocusPlaceId ?? focusFromUrl ?? null,
    [props.initialFocusPlaceId, focusFromUrl],
  );

  // ── Geolocation ──────────────────────────────────────────────
  const geo = useGeolocation({ autoStart: true, highAccuracy: true });

  // ── Data state ───────────────────────────────────────────────
  const [plan, setPlan] = useState<OfflinePlanRecord | null>(null);
  const [navpack, setNavpack] = useState<NavPack | null>(null);
  const [corridor, setCorridor] = useState<CorridorGraphPack | null>(null);
  const [places, setPlaces] = useState<PlacesPack | null>(null);
  const [_traffic, setTraffic] = useState<TrafficOverlay | null>(null);
  const [_hazards, setHazards] = useState<HazardOverlay | null>(null);
  const [_manifest, setManifest] = useState<OfflineBundleManifest | null>(null);
  const [weather, setWeather] = useState<WeatherOverlay | null>(null);
  const [flood, setFlood] = useState<FloodOverlay | null>(null);
  const [coverage, setCoverage] = useState<CoverageOverlay | null>(null);
  const [wildlife, setWildlife] = useState<WildlifeOverlay | null>(null);
  const [restAreas, setRestAreas] = useState<RestAreaOverlay | null>(null);
  const [routeScore, setRouteScore] = useState<RouteIntelligenceScore | null>(null);
  const [fuelOverlay, setFuelOverlay] = useState<FuelOverlay | null>(null);

  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(desiredFocusPlaceId);

  // ── Trip progress ────────────────────────────────────────────
  const [tripProgress, setTripProgress] = useState<TripProgress | null>(null);

  // ── Guide state ──────────────────────────────────────────────
  const [guideKey, setGuideKey] = useState<string | null>(null);
  const [guidePack, setGuidePack] = useState<GuidePack | null>(null);
  const [guideContext, setGuideContext] = useState<GuideContext | null>(null);

  const [busy, setBusy] = useState<null | "boot" | "chat" | "add">(null);
  const [err, setErr] = useState<string | null>(null);

  // Hoisted tab bar state from GuideView
  const [guideTabBar, setGuideTabBar] = useState<GuideTabBarProps | null>(null);
  const handleTabBarRender = useCallback((props: GuideTabBarProps) => {
    setGuideTabBar((prev) =>
      prev?.activeTab === props.activeTab && prev?.discoveredCount === props.discoveredCount
        ? prev
        : props
    );
  }, []);

  useEffect(() => setFocusedPlaceId(desiredFocusPlaceId), [desiredFocusPlaceId]);

  // ── Boot packs from IDB, create guide pack, and kick off greeting ──
  const didGreetRef = useRef(false);
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setBusy("boot");
      setErr(null);
      try {
        const id = desiredPlanId ?? (await getCurrentPlanId());
        if (cancelled) return;
        if (!id) {
          setErr("No trip selected. Go back and pick a plan first.");
          return;
        }

        const rec = await getOfflinePlan(id);
        if (cancelled) return;
        if (!rec) {
          setErr("Trip data not found. The plan may have been deleted.");
          return;
        }

        const has = await hasCorePacks(rec.plan_id);
        if (!has && rec.zip_blob) await unpackAndStoreBundle(rec);
        // Minimal plans (navpack-only, no zip) skip unpacking - packs are
        // populated progressively by backgroundEnrich on the trip page.

        const packs = await getAllPacks(rec.plan_id);
        if (cancelled) return;

        const navpackLoaded = packs.navpack ?? null;
        const corridorLoaded = packs.corridor ?? null;
        const placesLoaded = packs.places ?? null;
        const trafficLoaded = packs.traffic ?? null;
        const hazardsLoaded = packs.hazards ?? null;
        const manifestLoaded = packs.manifest ?? null;
        const weatherLoaded = packs.weather ?? null;
        const floodLoaded = packs.flood ?? null;
        const coverageLoaded = packs.coverage ?? null;
        const wildlifeLoaded = packs.wildlife ?? null;
        const restAreasLoaded = packs.rest_areas ?? null;
        const routeScoreLoaded = packs.route_score ?? null;
        const fuelOverlayLoaded = packs.fuel ?? null;

        setPlan(rec);
        setNavpack(navpackLoaded);
        setCorridor(corridorLoaded);
        setPlaces(placesLoaded);
        setTraffic(trafficLoaded);
        setHazards(hazardsLoaded);
        setManifest(manifestLoaded);
        setWeather(weatherLoaded);
        setFlood(floodLoaded);
        setCoverage(coverageLoaded);
        setWildlife(wildlifeLoaded);
        setRestAreas(restAreasLoaded);
        setRouteScore(routeScoreLoaded);
        setFuelOverlay(fuelOverlayLoaded);

        // ── Bootstrap guide pack immediately (no extra render cycle) ──
        const stops = (navpackLoaded?.req?.stops ?? rec.preview?.stops ?? []) as TripStop[];
        if (stops.length === 0) return;

        const { guideKey: gk, pack, context } = await createGuidePack({
          planId: rec.plan_id,
          label: rec.label ?? null,
          stops,
          navpack: navpackLoaded,
          corridor: corridorLoaded,
          places: placesLoaded,
          traffic: trafficLoaded,
          hazards: hazardsLoaded,
          manifest: manifestLoaded,
          weather: weatherLoaded,
          flood: floodLoaded,
          coverage: coverageLoaded,
          wildlife: wildlifeLoaded,
          rest_areas: restAreasLoaded,
          route_score: routeScoreLoaded,
          fuel: fuelOverlayLoaded,
          progress: null,
          driverState: buildDriverState(weatherLoaded, fuelOverlayLoaded, navpackLoaded, null),
          tripPrefs: rec.trip_prefs ?? null,
        });

        if (cancelled) return;

        setGuideKey(gk);
        setGuidePack(pack);
        setGuideContext(context);

        // ── Auto-greeting if thread is empty ──────────────────────
        if (pack.thread.length > 0 || didGreetRef.current) return;
        didGreetRef.current = true;

        const origin = stops[0]?.name ?? "your starting point";
        const dest = stops[stops.length - 1]?.name ?? "your destination";
        const totalKm = navpackLoaded?.primary?.distance_m
          ? Math.round(navpackLoaded.primary.distance_m / 1000)
          : null;

        const greetingPrompt = totalKm
          ? `[SYSTEM: The user just opened the guide for their trip from ${origin} to ${dest} (${totalKm}km). Give them a warm welcome - mention highlights or heads-ups you know about this route from your own knowledge. Then search for more interesting stops, current conditions, or anything useful. Reply immediately with what you know, and use tools to find more - you can do both at once.]`
          : `[SYSTEM: The user just opened the guide for their trip from ${origin} to ${dest}. Give them a warm welcome with what you know about this route, and search for interesting things along the way. Reply and search at the same time.]`;

        setBusy("chat");
        try {
          const corridorPlaces: PlaceItem[] = placesLoaded?.items ?? [];
          const res = await guideSendMessage({
            planId: rec.plan_id,
            guideKey: gk,
            pack,
            context,
            userText: greetingPrompt,
            preferredCategories: [],
            maxSteps: 2,
            progress: null,
            corridorPlaces,
            onPackUpdate: (p) => { if (!cancelled) setGuidePack(p); },
          });
          if (!cancelled) setGuidePack(res.pack);
        } catch {
          // Non-critical - guide still works without greeting
        } finally {
          if (!cancelled) setBusy(null);
        }
      } catch (e: unknown) {
        if (!cancelled) setErr(toErrorMessage(e));
      } finally {
        if (!cancelled) setBusy((b) => (b === "boot" ? null : b));
      }
    }

    boot();
    return () => {
      cancelled = true;
      didGreetRef.current = false;
    };
  }, [desiredPlanId]);

  // ── Compute trip progress when position updates ──────────────
  useEffect(() => {
    if (!geo.position || !plan) return;

    const stops = (navpack?.req?.stops ?? plan.preview?.stops ?? []) as TripStop[];
    if (stops.length === 0) return;

    const progress = computeTripProgress({
      position: geo.position,
      stops,
      navpack,
      prevProgress: tripProgress,
    });

    setTripProgress(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.position, plan, navpack]);

  // ── Handlers ─────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    async (text: string, preferredCategories: string[]) => {
      if (!guideKey || !guidePack || !guideContext) return;

      setBusy("chat");
      setErr(null);
      try {
        // Recompute progress right before sending for freshest position
        let latestProgress = tripProgress;
        if (geo.position && plan) {
          const stops = (navpack?.req?.stops ?? plan.preview?.stops ?? []) as TripStop[];
          if (stops.length > 0) {
            latestProgress = computeTripProgress({
              position: geo.position,
              stops,
              navpack,
              prevProgress: tripProgress,
            });
            setTripProgress(latestProgress);
          }
        }

        // Update context with latest progress + live driver state
        const freshContext: GuideContext = {
          ...guideContext,
          progress: latestProgress,
          driver_state: buildDriverState(weather, fuelOverlay, navpack, latestProgress),
        };

        // CRITICAL: Pass corridor places so the intent mapper can pre-filter them
        const corridorPlaces: PlaceItem[] = places?.items ?? [];

        const res = await guideSendMessage({
          planId: plan?.plan_id ?? null,
          guideKey,
          pack: guidePack,
          context: freshContext,
          userText: text,
          preferredCategories,
          maxSteps: 3,
          progress: latestProgress,
          corridorPlaces,
          onPackUpdate: (p) => setGuidePack(p),
        });

        setGuidePack(res.pack);
        setGuideContext(freshContext);
        return res.assistantText;
      } catch (e: unknown) {
        setErr(toErrorMessage(e));
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [guideKey, guidePack, guideContext, tripProgress, geo.position, plan, navpack, places],
  );

  const handleAddStop = useCallback(
    async (place: PlaceItem) => {
      if (!plan || !navpack) return;
      setBusy("add");
      setErr(null);
      try {
        haptic.medium();
        await addPlaceToTrip({
          plan,
          place,
          navpack,
          corridor,
          profile: navpack.req.profile ?? "drive",
          mode: "auto",
        });
        haptic.success();
        router.push(`/trip?plan_id=${encodeURIComponent(plan.plan_id)}`);
      } catch (e: unknown) {
        haptic.error();
        setErr(toErrorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [plan, navpack, corridor, router],
  );

  // Register "Add to trip" as the navigate handler for PlaceDetailSheet while on this page
  useEffect(() => {
    registerNavigateHandler((placeId, lat, lng, name) => {
      // Only id/lat/lng/name are used by addPlaceToTrip; category is not needed
      handleAddStop({ id: placeId, lat, lng, name, category: "attraction" } as PlaceItem);
    });
    return () => registerNavigateHandler(null);
  }, [handleAddStop, registerNavigateHandler]);

  const handleShowOnMap = useCallback(
    (placeId: string, lat: number, lng: number) => {
      haptic.medium();
      if (!plan) return;
      // Look up place name from places pack or guide discoveries for the popup fallback
      const placeFromPack = places?.items?.find((x) => x.id === placeId);
      const placeFromGuide = guidePack?.discovered_places?.find((x) => x.id === placeId);
      const placeName = placeFromPack?.name ?? placeFromGuide?.name ?? null;
      const nameParam = placeName ? `&focus_place_name=${encodeURIComponent(placeName)}` : "";
      router.replace(
        `/trip?plan_id=${encodeURIComponent(plan.plan_id)}&focus_place_id=${encodeURIComponent(placeId)}&focus_lat=${lat}&focus_lng=${lng}${nameParam}`,
      );
    },
    [plan, places, guidePack, router],
  );

  // ── Render ───────────────────────────────────────────────────

  const headerTitle = plan?.label ?? "Guide";

  if (!plan) {
    if (err) {
      return (
        <div
          style={{
            height: "100%",
            background: "var(--roam-bg)",
            color: "var(--roam-text)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            gap: 16,
            textAlign: "center",
          }}
        >
          <AlertTriangle size={32} style={{ color: "var(--text-warn)" }} />
          <p style={{ fontSize: 15, fontWeight: 600 }}>{err}</p>
          <button
            onClick={() => router.push("/trip")}
            style={{
              padding: "10px 24px",
              borderRadius: 999,
              background: "var(--roam-accent)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            Back to Trip
          </button>
        </div>
      );
    }
    return <GuideSkeleton />;
  }

  return (
    <div
      style={{
        height: "100%",
        background: "var(--roam-bg)",
        color: "var(--roam-text)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Sticky header ───────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          zIndex: 50,
          padding: "calc(env(safe-area-inset-top, 0px) + 20px) 16px 0",
          background: "var(--roam-bg)",
          borderBottom: "1px solid var(--roam-border)",
        }}
      >
        {/* Title row: title | tabs (centered) | status */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", height: 44 }}>
          <div style={{ minWidth: 0, justifySelf: "start" }}>
            <div
              className="trip-truncate"
              style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.025rem" }}
            >
              {headerTitle}
            </div>
          </div>

          {/* Underline tab switcher - centered */}
          {guideTabBar && (
            <div style={{ display: "flex", gap: 0, justifySelf: "center" }}>
              {([
                { key: "chat" as const, label: "Guide", Icon: Sparkles, badge: null },
                { key: "discoveries" as const, label: "Found", Icon: MapPin, badge: guideTabBar.discoveredCount > 0 ? guideTabBar.discoveredCount : null },
              ]).map((tab) => {
                const active = guideTabBar.activeTab === tab.key;
                const TIcon = tab.Icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => { haptic.selection(); guideTabBar.setActiveTab(tab.key); }}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      gap: 6, padding: "8px 14px", height: 44, border: "none",
                      borderBottom: active ? "3px solid var(--brand-eucalypt)" : "3px solid transparent",
                      marginBottom: "-1px",
                      background: "transparent",
                      color: active ? "var(--brand-eucalypt)" : "var(--roam-text-muted)",
                      fontSize: 13, fontWeight: active ? 800 : 600,
                      cursor: "pointer", WebkitTapHighlightColor: "transparent",
                      transition: "color 200ms, border-color 200ms",
                    }}
                  >
                    <TIcon size={13} strokeWidth={2.5} />
                    {tab.label}
                    {tab.badge != null && (
                      <span style={{
                        fontSize: 10, fontWeight: 800,
                        background: active ? "var(--brand-eucalypt)" : "var(--roam-surface-hover)",
                        color: active ? "white" : "var(--roam-text-muted)",
                        borderRadius: 999, padding: "1px 6px", minWidth: 18, textAlign: "center",
                      }}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Right: status pill */}
          <div style={{ justifySelf: "end" }}>
            <div
              style={{
                padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                background: isOnline ? "var(--accent-tint)" : "var(--bg-warn)",
                color: isOnline ? "var(--roam-success)" : "var(--text-warn)",
                whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
              {isOnline ? "Online" : "Offline"}
            </div>
          </div>
        </div>

        {/* ── Progress bar ────────────────────────────────────── */}
        {tripProgress && tripProgress.total_km > 0 ? (
          <div style={{ marginTop: 10 }}>

            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: "var(--roam-surface-hover)",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${Math.min(100, (tripProgress.km_from_start / tripProgress.total_km) * 100)}%`,
                  background: "linear-gradient(90deg, var(--roam-accent), var(--roam-success))",
                  borderRadius: 4,
                  transition: "width 0.5s ease-out",
                }}
              />

              {/* Stop markers on the progress bar */}
              {(() => {
                const stops = (navpack?.req?.stops ?? plan.preview?.stops ?? []) as TripStop[];
                const legs = navpack?.primary?.legs ?? [];
                if (stops.length < 2 || legs.length === 0) return null;

                let cumKm = 0;
                const markers: { pct: number; visited: boolean; name: string }[] = [];

                markers.push({
                  pct: 0,
                  visited: tripProgress.visited_stop_ids.includes(stops[0]?.id ?? ""),
                  name: stops[0]?.name ?? "",
                });

                for (let i = 0; i < legs.length; i++) {
                  cumKm += legs[i].distance_m / 1000;
                  const stop = stops[i + 1];
                  if (stop) {
                    markers.push({
                      pct: (cumKm / tripProgress.total_km) * 100,
                      visited: tripProgress.visited_stop_ids.includes(stop.id ?? ""),
                      name: stop.name ?? "",
                    });
                  }
                }

                return markers.map((m, idx) => (
                  <div
                    key={idx}
                    title={m.name}
                    style={{
                      position: "absolute",
                      left: `${Math.min(100, m.pct)}%`,
                      top: -1,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      background: m.visited ? "var(--roam-accent)" : "var(--roam-surface)",
                      border: "2px solid var(--roam-surface-hover)",
                      transform: "translateX(-50%)",
                      zIndex: 2,
                    }}
                  />
                ));
              })()}
            </div>
          </div>
        ) : null}

        {/* ── GPS status ──────────────────────────────────────── */}
        {geo.loading ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              fontWeight: 900,
              color: "var(--roam-text-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Satellite size={14} />
            Getting GPS fix…
          </div>
        ) : geo.error ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              fontWeight: 900,
              color: "var(--text-warn)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <AlertTriangle size={14} />
            {geo.error}
          </div>
        ) : null}

        {err ? (
          <div className="trip-err-box" style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} />
            {err}
          </div>
        ) : null}
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          padding: "0 16px",
        }}
      >
        <GuideView
          focusedPlaceId={focusedPlaceId}
          onFocusPlace={setFocusedPlaceId}
          isOnline={isOnline}
          guideReady={!!(guideKey && guidePack && guideContext)}
          guidePack={guidePack}
          tripProgress={tripProgress}
          onSendMessage={handleSendMessage}
          chatBusy={busy === "chat"}
          onAddStop={handleAddStop}
          onShowOnMap={handleShowOnMap}
          initialTab={askAboutFromUrl && !isOnline ? "discoveries" : "chat"}
          autoAskMessage={askAboutFromUrl && isOnline ? decodeURIComponent(askAboutFromUrl) : null}
          renderTabBar={handleTabBarRender}
        />
      </div>
    </div>
  );
}
