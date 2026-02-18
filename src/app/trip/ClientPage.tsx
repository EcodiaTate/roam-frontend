// src/app/trip/ClientPage.tsx
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Map as MLMap } from "maplibre-gl";

import { TripMap } from "@/components/trip/TripMap";
import { TripView, type TripEditorRebuildMode } from "@/components/trip/TripView";
import type { AlertHighlightEvent } from "@/components/trip/TripAlertsPanel";
import { SyncStatusBadge } from "@/components/ui/SyncStatusBadge";
import { InviteCodeModal } from "@/components/plans/InviteCodeModal";
import { BasemapDownloadCard } from "@/components/basemap/BasemapDownloadCard";
import { FuelPressureIndicator } from "@/components/fuel/FuelPressureIndicator";
import { FuelLastChanceToast } from "@/components/fuel/FuelLastChanceToast";
import { VehicleFuelSettings } from "@/components/fuel/VehicleFuelSettings";

// ── Active navigation components ──
import { NavigationHUD } from "@/components/nav/NavigationHUD";
import { NavigationBar } from "@/components/nav/NavigationBar";
import { NavigationControls } from "@/components/nav/NavigationControls";
import { OffRouteBanner } from "@/components/nav/OffRouteBanner";
import { StartNavigationButton } from "@/components/nav/StartNavigationButton";
import { ElevationStrip } from "@/components/nav/ElevationStrip";

// ── Hooks ──
import { useGeolocation } from "@/lib/native/geolocation";
import { useKeepAwake } from "@/lib/native/keepAwake";
import { useActiveNavigation } from "@/lib/hooks/useActiveNavigation";
import { useMapNavigationMode } from "@/lib/hooks/useMapNavigationMode";

import { haptic } from "@/lib/native/haptics";
import { getCurrentPlanId, getOfflinePlan, type OfflinePlanRecord } from "@/lib/offline/plansStore";
import { getAllPacks, hasCorePacks, putPack } from "@/lib/offline/packsStore";
import { unpackAndStoreBundle } from "@/lib/offline/unpackBundle";
import { getVehicleFuelProfile } from "@/lib/offline/fuelProfileStore";

import { navApi } from "@/lib/api/nav";

import { analyzeFuel, computeFuelTracking } from "@/lib/nav/fuelAnalysis";
import { decodePolyline6 } from "@/lib/nav/polyline6";
import { cumulativeKm, snapToPolyline } from "@/lib/nav/snapToRoute";

import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay, ElevationResponse } from "@/lib/types/navigation";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";
import type { TripStop } from "@/lib/types/trip";
import type { FuelAnalysis, FuelTrackingState, VehicleFuelProfile } from "@/lib/types/fuel";

import { UserRound, Users, UserPlus, Compass, List, MapPinned } from "lucide-react";

/* ── Constants ────────────────────────────────────────────────────────── */

/** Poll overlays every 90 seconds */
const OVERLAY_POLL_INTERVAL_MS = 90_000;

/* ── Boot phases ──────────────────────────────────────────────────────── */

type BootPhase = "resolving" | "no-plan" | "hydrating" | "ready" | "error";

/* ── Component ────────────────────────────────────────────────────────── */

export function TripClientPage(props: { initialPlanId: string | null }) {
  const router = useRouter();
  const sp = useSearchParams();

  const planIdFromUrl = sp.get("plan_id");
  const focusPlaceFromUrl = sp.get("focus_place_id");

  const desiredPlanId = useMemo(
    () => props.initialPlanId ?? planIdFromUrl ?? null,
    [props.initialPlanId, planIdFromUrl],
  );

  // Native hooks
  const geo = useGeolocation({ autoStart: true, highAccuracy: true });
  useKeepAwake({ auto: true });

  // Boot state
  const [phase, setPhase] = useState<BootPhase>("resolving");
  const [bootError, setBootError] = useState<string | null>(null);

  // Data state
  const [plan, setPlan] = useState<OfflinePlanRecord | null>(null);
  const [navpack, setNavpack] = useState<NavPack | null>(null);
  const [corridor, setCorridor] = useState<CorridorGraphPack | null>(null);
  const [places, setPlaces] = useState<PlacesPack | null>(null);

  // Overlay state
  const [traffic, setTraffic] = useState<TrafficOverlay | null>(null);
  const [hazards, setHazards] = useState<HazardOverlay | null>(null);

  // Fuel state
  const [fuelAnalysis, setFuelAnalysis] = useState<FuelAnalysis | null>(null);
  const [fuelTracking, setFuelTracking] = useState<FuelTrackingState | null>(null);
  const [fuelSettingsOpen, setFuelSettingsOpen] = useState(false);

  // Elevation state
  const [elevation, setElevation] = useState<ElevationResponse | null>(null);

  // UI State
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null);
  const [highlightedAlertId, setHighlightedAlertId] = useState<string | null>(null);

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"create" | "redeem">("create");

  // Fluid Bottom Sheet Drag State
  const sheetRef = useRef<HTMLDivElement>(null);
  const [offsetY, setOffsetY] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);
  const dragData = useRef({ startY: 0 });

  // Overlay polling ref
  const overlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── MapLibre instance ref (shared between TripMap and useMapNavigationMode) ──
  const mapInstanceRef = useRef<MLMap | null>(null);

  // ── Active Navigation ──
  const activeNav = useActiveNavigation(navpack);

  // ── Map Navigation Mode (heading-up camera tracking) ──
  const effectiveBbox = navpack?.primary?.bbox ?? plan?.preview?.bbox ?? null;
  const mapNavMode = useMapNavigationMode({
    mapRef: mapInstanceRef,
    position: activeNav.isActive ? activeNav.lastPosition : null,
    active: activeNav.isActive,
    bbox: effectiveBbox,
  });

  // ── Sheet position when entering/exiting navigation ──
  const prevActiveRef = useRef(false);
  useEffect(() => {
    if (activeNav.isActive && !prevActiveRef.current) {
      // Entering navigation mode → collapse sheet to just the peek handle
      setOffsetY(0);
      setDragOffset(0);
    }
    prevActiveRef.current = activeNav.isActive;
  }, [activeNav.isActive]);

  // ── Boot logic ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const resolvedId = desiredPlanId ?? (await getCurrentPlanId());
        if (cancelled) return;
        if (!resolvedId) { setPhase("no-plan"); return; }

        const rec = await getOfflinePlan(resolvedId);
        if (cancelled) return;
        if (!rec) { setPhase("no-plan"); return; }

        setPhase("hydrating");

        const has = await hasCorePacks(rec.plan_id);
        if (!has) await unpackAndStoreBundle(rec);

        const packs = await getAllPacks(rec.plan_id);
        if (cancelled) return;

        setPlan(rec);
        setNavpack(packs.navpack ?? null);
        setCorridor(packs.corridor ?? null);
        setPlaces(packs.places ?? null);
        setTraffic(packs.traffic ?? null);
        setHazards(packs.hazards ?? null);

        // ── Elevation: load from IDB ──
        if (packs.elevation) {
          setElevation(packs.elevation);
        }

        // ── Fuel analysis: load from IDB or compute fresh ──
        if (packs.fuel_analysis) {
          setFuelAnalysis(packs.fuel_analysis);
        } else if (packs.navpack?.primary?.geometry && packs.places?.items) {
          try {
            const fuelProfile = await getVehicleFuelProfile();
            const analysis = analyzeFuel(
              packs.navpack.primary.geometry,
              packs.places.items,
              fuelProfile,
              packs.navpack.primary.route_key,
            );
            setFuelAnalysis(analysis);
            putPack(rec.plan_id, "fuel_analysis", analysis).catch(() => {});
          } catch (e) {
            console.warn("[Trip] fuel analysis compute failed:", e);
          }
        }

        setPhase("ready");
      } catch (e: any) {
        if (cancelled) return;
        console.error("[Trip] boot error:", e);
        setBootError(e?.message ?? "Failed to load trip");
        setPhase("error");
      }
    }

    boot();
    return () => { cancelled = true; };
  }, [desiredPlanId]);

  // Redirect if no plan
  useEffect(() => {
    if (phase !== "no-plan") return;
    router.replace("/plans");
  }, [phase, router]);

  // Focus place from URL
  useEffect(() => {
    if (!focusPlaceFromUrl) return;
    setFocusedPlaceId(focusPlaceFromUrl);
    if (sheetRef.current) {
      const h = sheetRef.current.clientHeight;
      const maxUp = -(h - 180);
      setOffsetY(Math.max(maxUp, Math.round(maxUp * 0.6)));
    }
  }, [focusPlaceFromUrl]);

  // ── Live fuel tracking from GPS ──────────────────────────────────
  // Use active nav position if navigating, else regular geo
  const effectivePosition = activeNav.isActive ? activeNav.lastPosition : geo.position;

  useEffect(() => {
    if (!fuelAnalysis || !effectivePosition || !navpack?.primary?.geometry) return;

    try {
      const decoded = decodePolyline6(navpack.primary.geometry);
      const cumKm = cumulativeKm(decoded);
      const snap = snapToPolyline(
        { lat: effectivePosition.lat, lng: effectivePosition.lng },
        decoded,
        cumKm,
      );

      // Only track if within 2km of the route
      if (snap.distance_m > 2000) {
        setFuelTracking(null);
        return;
      }

      const tracking = computeFuelTracking(fuelAnalysis, snap.km, fuelAnalysis.profile);
      setFuelTracking(tracking);
    } catch {
      // Non-fatal — just skip this update
    }
  }, [fuelAnalysis, effectivePosition, navpack]);

  // ── Overlay polling ─────────────────────────────────────────────
  const pollOverlays = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (!navpack?.primary?.bbox) return;

    const bbox = navpack.primary.bbox;
    const currentPlanId = plan?.plan_id;

    try {
      const [trafficRes, hazardsRes] = await Promise.allSettled([
        navApi.trafficPoll({ bbox, cache_seconds: 90 }),
        navApi.hazardsPoll({ bbox, cache_seconds: 90 }),
      ]);

      if (trafficRes.status === "fulfilled") {
        setTraffic(trafficRes.value);
        if (currentPlanId) putPack(currentPlanId, "traffic", trafficRes.value).catch(() => {});
      }
      if (hazardsRes.status === "fulfilled") {
        setHazards(hazardsRes.value);
        if (currentPlanId) putPack(currentPlanId, "hazards", hazardsRes.value).catch(() => {});
      }
    } catch (e) {
      console.warn("[Trip] overlay poll failed:", e);
    }
  }, [navpack, plan]);

  // Start polling when navpack is ready
  useEffect(() => {
    if (phase !== "ready" || !navpack?.primary?.bbox) return;

    pollOverlays();

    overlayTimerRef.current = setInterval(pollOverlays, OVERLAY_POLL_INTERVAL_MS);

    return () => {
      if (overlayTimerRef.current) {
        clearInterval(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
    };
  }, [phase, navpack, pollOverlays]);

  // ── Rebuild handler ─────────────────────────────────────────────
  const handleRebuild = useCallback(async (args: { stops: TripStop[]; mode: TripEditorRebuildMode }) => {
    const result = await navApi.route({
      profile: navpack?.primary?.profile ?? "drive",
      stops: args.stops,
    });
    setNavpack(result);

    // Recompute fuel analysis for new route
    if (places?.items && result?.primary?.geometry) {
      try {
        const fuelProfile = await getVehicleFuelProfile();
        const analysis = analyzeFuel(
          result.primary.geometry,
          places.items,
          fuelProfile,
          result.primary.route_key,
        );
        setFuelAnalysis(analysis);
        if (plan?.plan_id) {
          putPack(plan.plan_id, "fuel_analysis", analysis).catch(() => {});
        }
      } catch (e) {
        console.warn("[Trip] fuel recompute on rebuild failed:", e);
      }
    }

    // Fetch elevation for new route
    if (result?.primary?.geometry) {
      try {
        const elevRes = await navApi.elevation({
          geometry: result.primary.geometry,
          route_key: result.primary.route_key,
        });
        setElevation(elevRes);
        if (plan?.plan_id) {
          putPack(plan.plan_id, "elevation", elevRes).catch(() => {});
        }
      } catch (e) {
        console.warn("[Trip] elevation fetch on rebuild failed:", e);
      }
    }

    if (result?.primary?.bbox) {
      try {
        const [t, h] = await Promise.allSettled([
          navApi.trafficPoll({ bbox: result.primary.bbox, cache_seconds: 90 }),
          navApi.hazardsPoll({ bbox: result.primary.bbox, cache_seconds: 90 }),
        ]);
        if (t.status === "fulfilled") {
          setTraffic(t.value);
          if (plan?.plan_id) putPack(plan.plan_id, "traffic", t.value).catch(() => {});
        }
        if (h.status === "fulfilled") {
          setHazards(h.value);
          if (plan?.plan_id) putPack(plan.plan_id, "hazards", h.value).catch(() => {});
        }
      } catch {}
    }
  }, [navpack, plan, places]);

  // ── Fuel settings saved handler ──────────────────────────────────
  const handleFuelProfileSaved = useCallback(async (newProfile: VehicleFuelProfile) => {
    if (!navpack?.primary?.geometry || !places?.items) return;
    try {
      const analysis = analyzeFuel(
        navpack.primary.geometry,
        places.items,
        newProfile,
        navpack.primary.route_key,
      );
      setFuelAnalysis(analysis);
      if (plan?.plan_id) {
        putPack(plan.plan_id, "fuel_analysis", analysis).catch(() => {});
      }
    } catch (e) {
      console.warn("[Trip] fuel recompute on settings change failed:", e);
    }
  }, [navpack, places, plan]);

  // ── Guide navigation handler ────────────────────────────────────
  const handleNavigateToGuide = useCallback((placeId: string) => {
    if (!plan) return;
    router.push(`/guide?plan_id=${encodeURIComponent(plan.plan_id)}&focus_place_id=${encodeURIComponent(placeId)}`);
  }, [plan, router]);

  // ── Alert highlight handler ─────────────────────────────────────
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHighlightAlert = useCallback((ev: AlertHighlightEvent) => {
    haptic.selection();
    setHighlightedAlertId(ev.id);

    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedAlertId(null);
      highlightTimerRef.current = null;
    }, 4000);
  }, []);

  // ── Off-route reroute handler ───────────────────────────────────
  const handleOffRouteReroute = useCallback(async () => {
    // TODO: implement corridor A* reroute from current position
    // For now, rebuild the route from current position through remaining stops
    if (!activeNav.lastPosition || !navpack) return;

    const currentPos = activeNav.lastPosition;
    const allStops = navpack.req.stops;

    // Find which stops are still ahead (use kmAlongRoute from nav state)
    // For simplicity: keep all stops but prepend current location
    const remainingStops: TripStop[] = [
      {
        id: "__reroute_origin",
        name: "Current Location",
        type: "start" as any,
        lat: currentPos.lat,
        lng: currentPos.lng,
      },
      // Keep all non-start stops
      ...allStops.filter((s) => s.type !== "start"),
    ];

    try {
      const result = await navApi.route({
        profile: navpack.primary.profile,
        stops: remainingStops,
      });
      setNavpack(result);
      activeNav.applyReroute(result);
    } catch (e) {
      console.warn("[Trip] reroute failed:", e);
    }
  }, [activeNav, navpack]);

  // ── Bottom Sheet Handlers ───────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    dragData.current = { startY: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !sheetRef.current) return;
    const totalDelta = e.clientY - dragData.current.startY;
    const sheetHeight = sheetRef.current.clientHeight;
    const maxUp = -(sheetHeight - 180);
    let proposedOffset = offsetY + totalDelta;
    if (proposedOffset < maxUp) proposedOffset = maxUp;
    if (proposedOffset > 0) proposedOffset = 0;
    setDragOffset(proposedOffset - offsetY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    setOffsetY((prev) => prev + dragOffset);
    setDragOffset(0);
  };

  // ── Derived values ─────────────────────────────────────────────
  const peekBase = `calc(100% - 180px - var(--roam-safe-bottom, 0px))`;
  const sheetTransform = activeNav.isActive
    ? `translateY(calc(100% - 60px))` // Collapsed to just the drag handle during navigation
    : `translateY(clamp(0px, calc(${peekBase} + ${offsetY + dragOffset}px), ${peekBase}))`;

  const effectiveStops = navpack?.req?.stops ?? plan?.preview?.stops ?? [];
  const effectiveGeom = navpack?.primary?.geometry ?? plan?.preview?.geometry ?? null;

  // Current km along route for fuel tracking + elevation strip
  const currentKm = useMemo(() => {
    if (!fuelTracking) return 0;
    return fuelTracking.km_since_last_fuel + (fuelTracking.last_passed_station?.km_along_route ?? 0);
  }, [fuelTracking]);

  // ── Render gates ────────────────────────────────────────────────
  if (phase === "resolving" || phase === "no-plan") {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100dvh", width: "100%", background: "var(--roam-bg)", color: "var(--roam-text)" }}>
        <div style={{ color: "var(--roam-text-muted)", fontSize: 16, fontWeight: 900 }}>
          {phase === "resolving" ? "Loading…" : "Redirecting…"}
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100dvh", width: "100%", background: "var(--roam-bg)", color: "var(--roam-text)", padding: 32, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 950, color: "var(--roam-danger)", marginBottom: 12 }}>
            Failed to load trip
          </div>
          {bootError && <div style={{ fontSize: 13, color: "var(--roam-text-muted)", marginBottom: 20 }}>{bootError}</div>}
          <button
            type="button"
            className="trip-interactive"
            style={{ borderRadius: 999, minHeight: 42, padding: "0 20px", fontWeight: 950, background: "var(--roam-accent)", color: "white", boxShadow: "var(--shadow-button)" }}
            onClick={() => router.replace("/plans")}
          >
            Go to Plans
          </button>
        </div>
      </div>
    );
  }

  if (phase === "hydrating" || !plan || !effectiveGeom || !effectiveBbox) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100dvh", width: "100%", background: "var(--roam-bg)", color: "var(--roam-text)" }}>
        <div style={{ color: "var(--roam-text-muted)", fontSize: 16, fontWeight: 900 }}>Loading trip map…</div>
      </div>
    );
  }

  // ── Ready ──────────────────────────────────────────────────────
  return (
    <div
      className="trip-app-container"
      style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden", background: "var(--roam-bg)", color: "var(--roam-text)" }}
    >
      {/* Map Layer */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <TripMap
          styleId="roam-basemap-hybrid"
          stops={effectiveStops}
          geometry={effectiveGeom}
          bbox={effectiveBbox}
          focusedStopId={focusedStopId}
          onStopPress={(id) => { haptic.selection(); setFocusedStopId(id); }}
          suggestions={places?.items ?? null}
          focusedSuggestionId={focusedPlaceId}
          onSuggestionPress={(id) => { haptic.selection(); setFocusedPlaceId(id); }}
          traffic={traffic}
          hazards={hazards}
          onTrafficEventPress={(id) => { haptic.selection(); }}
          onHazardEventPress={(id) => { haptic.selection(); }}
          userPosition={activeNav.isActive ? activeNav.lastPosition : geo.position}
          planId={plan.plan_id}
          onNavigateToGuide={handleNavigateToGuide}
          highlightedAlertId={highlightedAlertId}
          fuelStations={fuelAnalysis?.stations ?? null}
          fuelTracking={fuelTracking}
          navigationMode={activeNav.isActive}
          mapInstanceRef={mapInstanceRef}
        />
      </div>

      {/* ── Active Navigation Overlays ── */}

      {/* Turn-by-turn HUD — top of map */}
      <NavigationHUD
        nav={activeNav.nav}
        visible={activeNav.isActive && activeNav.nav.status !== "off_route"}
      />

      {/* Off-route banner — replaces HUD when off route */}
      <OffRouteBanner
        visible={activeNav.nav.status === "off_route"}
        distFromRoute_m={activeNav.nav.distFromRoute_m}
        hasCorridorGraph={!!corridor}
        onReroute={handleOffRouteReroute}
      />

      {/* Navigation controls — right side of map */}
      <NavigationControls
        visible={activeNav.isActive}
        isMuted={activeNav.isMuted}
        onToggleMute={activeNav.toggleMute}
        onOverview={mapNavMode.showOverview}
        onRecenter={mapNavMode.recenter}
        onEnd={activeNav.stop}
      />

      {/* Navigation bar — bottom ETA/distance/fatigue */}
      <NavigationBar
        nav={activeNav.nav}
        fuelTracking={fuelTracking}
        visible={activeNav.isActive}
        onTap={() => {
          // Tapping the bar expands the sheet briefly to show trip details
          if (sheetRef.current) {
            const h = sheetRef.current.clientHeight;
            setOffsetY(-(h - 300));
            setTimeout(() => setOffsetY(0), 8000); // auto-collapse after 8s
          }
        }}
      />

      {/* Fuel pressure indicator — floating pill on map (hidden during active nav, bar shows fuel) */}
      {!activeNav.isActive && <FuelPressureIndicator tracking={fuelTracking} />}

      {/* Fuel last-chance toast */}
      <FuelLastChanceToast tracking={fuelTracking} currentKm={currentKm} />

      {/* Fuel settings modal */}
      <VehicleFuelSettings
        open={fuelSettingsOpen}
        onClose={() => setFuelSettingsOpen(false)}
        onSaved={handleFuelProfileSaved}
      />

      {/* Basemap download card — floats above map, below sheet (hidden during nav) */}
      {!activeNav.isActive && (
        <div style={{ position: "absolute", top: 12, left: 12, right: 12, zIndex: 15, pointerEvents: "auto" }}>
          <BasemapDownloadCard region="australia" compact />
        </div>
      )}

      {/* Invite modal */}
      <InviteCodeModal
        open={inviteOpen}
        planId={plan.plan_id}
        mode={inviteMode}
        onClose={() => setInviteOpen(false)}
        onRedeemed={(joinedPlanId) => {
          router.replace(`/trip?plan_id=${encodeURIComponent(joinedPlanId)}`);
        }}
      />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: "92vh",
          zIndex: 20,
          background: "var(--roam-surface)",
          borderRadius: "var(--r-card) var(--r-card) 0 0",
          boxShadow: "0 -12px 48px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          transform: sheetTransform,
          transition: isDragging.current ? "none" : "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
          willChange: "transform",
        }}
      >
        {/* Drag Handle */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            padding: "10px 20px 10px",
            touchAction: "none",
            cursor: "grab",
            background: "var(--roam-surface)",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          <div
            className="trip-drag-handle"
            style={{ width: 48, height: 6, borderRadius: 10, background: "var(--roam-surface-hover)", margin: "0 auto" }}
          />
        </div>

        {/* Header */}
        <div
          className="trip-sheet-header"
          style={{ padding: "0 20px 12px", background: "var(--roam-surface)" }}
        >
          {/* Title row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 22, fontWeight: 950, margin: 0,
                  display: "flex", alignItems: "center", gap: 10,
                  color: "var(--roam-text)", letterSpacing: "-0.3px",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {plan.label ?? "Trip Plan"}
                </span>
                <SyncStatusBadge />
              </div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 850, color: "var(--roam-text-muted)" }}>
                Itinerary
              </div>
            </div>

            <button
              type="button"
              className="trip-interactive trip-btn-icon"
              aria-label="Account"
              onClick={() => { haptic.selection(); router.push("/login"); }}
              style={{
                borderRadius: 999, width: 42, height: 42,
                display: "grid", placeItems: "center",
                background: "var(--roam-surface-hover)",
                boxShadow: "var(--shadow-button)", flexShrink: 0,
              }}
            >
              <UserRound size={18} />
            </button>
          </div>

          {/* Action row */}
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {[
              { icon: <List size={16} />, label: "Peek", onClick: () => setOffsetY(0) },
              { icon: <Compass size={16} />, label: "Guide", onClick: () => router.push(`/guide?plan_id=${encodeURIComponent(plan.plan_id)}`) },
              { icon: <Users size={16} />, label: "Share", onClick: () => { setInviteMode("create"); setInviteOpen(true); } },
              { icon: <UserPlus size={16} />, label: "Join", onClick: () => { setInviteMode("redeem"); setInviteOpen(true); } },
            ].map((btn) => (
              <button
                key={btn.label}
                type="button"
                className="trip-btn-sm trip-interactive"
                onClick={() => { haptic.selection(); btn.onClick(); }}
                style={{
                  borderRadius: 999, minHeight: 42, padding: "0 14px",
                  fontWeight: 950, background: "var(--roam-surface-hover)",
                  color: "var(--roam-text)", boxShadow: "var(--shadow-button)",
                  whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8,
                  flexShrink: 0,
                }}
              >
                {btn.icon} {btn.label}
              </button>
            ))}

            <button
              type="button"
              className="trip-btn-sm trip-interactive"
              onClick={() => { haptic.selection(); router.push("/plans"); }}
              style={{
                marginLeft: "auto", borderRadius: 999, minHeight: 42, padding: "0 14px",
                fontWeight: 950, background: "var(--roam-surface-hover)",
                color: "var(--roam-text)", boxShadow: "var(--shadow-button)",
                whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8,
                flexShrink: 0,
              }}
            >
              <MapPinned size={16} /> All Plans
            </button>
          </div>

          {/* ── Start Navigation button (shown when NOT actively navigating) ── */}
          {!activeNav.isActive && navpack && (
            <div style={{ marginTop: 14 }}>
              <StartNavigationButton
                onStart={activeNav.start}
                disabled={!navpack?.primary?.legs?.some((l) => l.steps && l.steps.length > 0)}
              />
              {!navpack?.primary?.legs?.some((l) => l.steps && l.steps.length > 0) && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "var(--roam-text-muted)", textAlign: "center" }}>
                  Turn-by-turn data not available. Rebuild route to enable navigation.
                </div>
              )}
            </div>
          )}

          {/* ── Elevation strip (shown below action bar) ── */}
          {elevation?.profile && (
            <div style={{ marginTop: 12 }}>
              <ElevationStrip
                profile={elevation.profile}
                gradeSegments={elevation.grade_segments}
                currentKm={activeNav.isActive ? activeNav.nav.kmAlongRoute : currentKm || null}
                compact
              />
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              overflowY: "auto",
              padding: "0 20px calc(var(--bottom-nav-height) + 20px)",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            <TripView
              planId={plan.plan_id}
              navpack={navpack}
              corridor={corridor}
              places={places}
              traffic={traffic}
              hazards={hazards}
              focusedStopId={focusedStopId}
              onFocusStop={setFocusedStopId}
              focusedPlaceId={focusedPlaceId}
              onFocusPlace={setFocusedPlaceId}
              onRebuildRequested={handleRebuild}
              highlightedAlertId={highlightedAlertId}
              onHighlightAlert={handleHighlightAlert}
              userPosition={effectivePosition}
              fuelAnalysis={fuelAnalysis}
              onOpenFuelSettings={() => setFuelSettingsOpen(true)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}