// src/app/trip/ClientPage.tsx
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { MapBaseMode, VectorTheme } from "@/components/trips/new/MapStyleSwitcher";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import maplibregl from "maplibre-gl";

import { TripMap } from "@/components/trip/TripMap";
import { TripView, type TripEditorRebuildMode, type StopQuickActionHandler } from "@/components/trip/TripView";
import { StopQuickActionMenu, type QuickActionMenuState } from "@/components/trip/StopQuickActionMenu";
import type { AlertHighlightEvent } from "@/components/trip/TripAlertsPanel";
import { InviteCodeModal } from "@/components/plans/InviteCodeModal";
import { PlanDrawer } from "@/components/trip/PlanDrawer";
import { FuelPressureIndicator } from "@/components/fuel/FuelPressureIndicator";
import { FuelLastChanceToast } from "@/components/fuel/FuelLastChanceToast";
import { VehicleFuelSettings } from "@/components/fuel/VehicleFuelSettings";

// ── Active navigation components ──
import { NavModeOverlay } from "@/components/nav/NavModeOverlay";
import { NavigationHUD } from "@/components/nav/NavigationHUD";
import { NavigationBar } from "@/components/nav/NavigationBar";
import { NavigationControls } from "@/components/nav/NavigationControls";
import { OffRouteBanner } from "@/components/nav/OffRouteBanner";
import { StartNavigationButton } from "@/components/nav/StartNavigationButton";
import { ElevationStrip } from "@/components/nav/ElevationStrip";
import { RouteScoreCard } from "@/components/trip/RouteScoreCard";
import { ReportTypePicker, ReportPlacementBar, REPORT_OPTIONS } from "@/components/trip/ReportPanel";
import type { ObservationType, ObservationSeverity } from "@/lib/types/peer";
import { ExchangePanel } from "@/components/trip/ExchangePanel";
import { QuickReportWheel } from "@/components/trip/QuickReportWheel";

// ── Hooks ──
import { useGeolocation } from "@/lib/native/geolocation";
import { useKeepAwake } from "@/lib/native/keepAwake";
import { useActiveNavigation } from "@/lib/hooks/useActiveNavigation";
import { DEFAULT_NAV_CONFIG } from "@/lib/nav/activeNav";
import { useMapNavigationMode } from "@/lib/hooks/useMapNavigationMode";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";
import { useNearbyRoamers } from "@/lib/hooks/useNearbyRoamers";
import { useObservations } from "@/lib/hooks/useObservations";
import type { InterpolatedPosition } from "@/lib/nav/gpsInterpolator";

import { haptic } from "@/lib/native/haptics";
import { useStopProximity, dismissProximityStop } from "@/lib/hooks/useStopProximity";
import { StopMemorySheet } from "@/components/memories/StopMemorySheet";
import { presenceBeacon } from "@/lib/offline/presenceBeacon";
import { syncPeerDelta } from "@/lib/offline/peerSync";
import { getCurrentPlanId, getOfflinePlan, listOfflinePlans, setCurrentPlanId, updateOfflinePlan, type OfflinePlanRecord } from "@/lib/offline/plansStore";
import { getAllPacks, hasCorePacks, hasNavpack, putPack, putPacksAtomic } from "@/lib/offline/packsStore";
import type { PackKind } from "@/lib/offline/packsStore";
import { unpackAndStoreBundle } from "@/lib/offline/unpackBundle";
import { onPlanEvent } from "@/lib/offline/planEvents";
import { getVehicleFuelProfile } from "@/lib/offline/fuelProfileStore";
import { rebuildNavpackOfflineWithFuel } from "@/lib/offline/rebuildNavpack";
import { overlaysToHazardZones, overlaysToAvoidZoneRequests } from "@/lib/nav/routeAvoidance";

import { navApi } from "@/lib/api/nav";
import { bundleApi } from "@/lib/api/bundle";
import { useEnrichment } from "@/lib/hooks/useEnrichment";

import { analyzeFuel, computeFuelTracking, windRangeFactor, checkFuelArbitrage, fuelOverlayToPlaceItems, type FuelArbitrageAlert } from "@/lib/nav/fuelAnalysis";
import { computeRefreshPriority, isOverlayStale, formatAge } from "@/lib/offline/refreshPriority";
import { decodePolyline6 } from "@/lib/nav/polyline6";
import { cumulativeKm, buildPolylineIndex, snapToPolylineIndexed, haversineM } from "@/lib/nav/snapToRoute";
import { shortId } from "@/lib/utils/ids";

import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay, ElevationResponse } from "@/lib/types/navigation";
import type { PlacesPack } from "@/lib/types/places";
import type { TripStop } from "@/lib/types/trip";
import type { FuelAnalysis, VehicleFuelProfile } from "@/lib/types/fuel";
import type {
  WeatherOverlay,
  FloodOverlay,
  CoverageOverlay,
  WildlifeOverlay,
  RestAreaOverlay,
  RouteIntelligenceScore,
  FuelOverlay,
  EmergencyServicesOverlay,
  HeritageOverlay,
  AirQualityOverlay,
  BushfireOverlay,
  SpeedCamerasOverlay,
  ToiletsOverlay,
  SchoolZonesOverlay,
  RoadkillOverlay,
} from "@/lib/types/overlays";

// Updated icons here
import { Image as ImageIcon, UserPlus, Library, WifiOff, Megaphone, Radio, Plus } from "lucide-react";
import { TripSkeleton } from "./TripSkeleton";
import { EnrichmentBanner } from "@/components/trip/EnrichmentBanner";
import { isUnlocked as checkIsUnlocked, checkTripGate } from "@/lib/paywall/tripGate";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { NativeShareRenderer } from "@/components/share/NativeShareRenderer";
import { usePlaceDetail } from "@/lib/context/PlaceDetailContext";
import { useUIMode } from "@/lib/hooks/useUIMode";
import type { ShareCardData } from "@/components/share/TripShareCard";
import { captureMapSnapshot } from "@/lib/share/captureMapSnapshot";

/* ── Constants ────────────────────────────────────────────────────────── */

/** Poll overlays every 90 seconds */
const OVERLAY_POLL_INTERVAL_MS = 90_000;
/** Refresh route score every 10 minutes */
const SCORE_POLL_INTERVAL_MS = 10 * 60_000;

/* ── Boot phases ──────────────────────────────────────────────────────── */

type BootPhase = "resolving" | "hydrating" | "ready" | "error" | "deferred";

/* ── Types ────────────────────────────────────────────────────────────── */

type ReportPhase =
  | "picking"
  | { type: ObservationType; severity: ObservationSeverity }
  | null;

/* ── Helpers ──────────────────────────────────────────────────────────── */

/**
 * Compute average wind range factor from weather overlay and route heading.
 * Returns a multiplier (0.85-1.05) that adjusts effective fuel range.
 */
function computeWindFactor(weather: WeatherOverlay | null, navpack: NavPack | null): number {
  if (!weather?.points?.length || !navpack?.primary?.geometry) return 1.0;
  const pts = weather.points;
  const avgWind = pts.reduce((s, p) => s + p.wind_speed_kmh, 0) / pts.length;
  if (avgWind < 10) return 1.0;
  const avgWindDir = pts.reduce((s, p) => s + p.wind_direction_deg, 0) / pts.length;
  // Rough route heading from first and last weather sample points
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dLat = last.lat - first.lat;
  const dLng = last.lng - first.lng;
  const routeHeading = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
  return windRangeFactor(avgWind, avgWindDir, routeHeading);
}

/* ── Component ────────────────────────────────────────────────────────── */

export function TripClientPage(props: { initialPlanId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const planIdFromUrl = sp.get("plan_id");
  const focusPlaceFromUrl = sp.get("focus_place_id");
  const focusLatFromUrl = sp.get("focus_lat");
  const focusLngFromUrl = sp.get("focus_lng");
  const focusPlaceNameFromUrl = sp.get("focus_place_name");

  const desiredPlanId = useMemo(
    () => props.initialPlanId ?? planIdFromUrl ?? null,
    [props.initialPlanId, planIdFromUrl],
  );

  // UI mode (simple vs full)
  const { isSimple } = useUIMode();

  // Native hooks
  const geo = useGeolocation({ autoStart: true, highAccuracy: true });
  useKeepAwake({ auto: true });
  const { online: isOnline } = useNetworkStatus();
  const { registerNavigateHandler, registerShowOnMapHandler, closePlace, openPlace, setStopPlaceIds: setContextStopPlaceIds } = usePlaceDetail();

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
  const [weather, setWeather] = useState<WeatherOverlay | null>(null);
  const [flood, setFlood] = useState<FloodOverlay | null>(null);
  const [coverage, setCoverage] = useState<CoverageOverlay | null>(null);
  const [wildlife, setWildlife] = useState<WildlifeOverlay | null>(null);
  const [restAreas, setRestAreas] = useState<RestAreaOverlay | null>(null);
  const [routeScore, setRouteScore] = useState<RouteIntelligenceScore | null>(null);
  const [emergency, setEmergency] = useState<EmergencyServicesOverlay | null>(null);
  const [heritage, setHeritage] = useState<HeritageOverlay | null>(null);
  const [airQuality, setAirQuality] = useState<AirQualityOverlay | null>(null);
  const [bushfire, setBushfire] = useState<BushfireOverlay | null>(null);
  const [speedCameras, setSpeedCameras] = useState<SpeedCamerasOverlay | null>(null);
  const [toilets, setToilets] = useState<ToiletsOverlay | null>(null);
  const [schoolZones, setSchoolZones] = useState<SchoolZonesOverlay | null>(null);
  const [roadkill, setRoadkill] = useState<RoadkillOverlay | null>(null);

  // Fuel state
  const [fuelAnalysis, setFuelAnalysis] = useState<FuelAnalysis | null>(null);
  const [fuelOverlay, setFuelOverlay] = useState<FuelOverlay | null>(null);
  // fuelTracking is derived from props, not stored in state — see computedFuelTracking below
  const [fuelSettingsOpen, setFuelSettingsOpen] = useState(false);
  const [fuelArbitrage, setFuelArbitrage] = useState<FuelArbitrageAlert | null>(null);

  // Elevation state
  const [elevation, setElevation] = useState<ElevationResponse | null>(null);
  const [elevCollapsed, setElevCollapsed] = useState(false);
  const [viewportKmRange, setViewportKmRange] = useState<[number, number] | null>(null);

  // Offline routing indicator — true when last rebuild used corridor A* instead of OSRM
  const [offlineRouted, setOfflineRouted] = useState(false);

  // UI State
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null);
  const [highlightedAlertId, setHighlightedAlertId] = useState<string | null>(null);
  const [filteredPlaceIds, setFilteredPlaceIds] = useState<Set<string> | null>(null);
  // Quick action menu triggered from map stop-pin long-press
  const [mapQuickMenu, setMapQuickMenu] = useState<QuickActionMenuState | null>(null);

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"create" | "redeem">("create");

  // Remote sync toast
  const [remoteToastVisible, setRemoteToastVisible] = useState(false);
  const remoteToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Plans drawer state
  const [drawOpen, setDrawOpen] = useState(false);
  const [plansDot, setPlansDot] = useState(false);

  // Plan status (Untethered)
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallVariant, setPaywallVariant] = useState<"gate" | "upgrade">("upgrade");

  // Offline modal
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);

  // Report panel state — two-phase flow:
  //   "picking" = type picker overlay visible
  //   { type, severity } = marker placement mode (picker dismissed, map zoomed in)
  //   null = closed
  const [reportPhase, setReportPhase] = useState<ReportPhase>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [reportMarker, setReportMarker] = useState<{ lat: number; lng: number } | null>(null);

  // Share state — OS share sheet (native or Web Share API)
  const [nativeSharePayload, setNativeSharePayload] = useState<{ data: ShareCardData; mapImageUrl: string | null; label: string } | null>(null);

  // Map style
  const [baseMode, setBaseMode] = useState<MapBaseMode>("hybrid");
  const [vectorTheme, setVectorTheme] = useState<VectorTheme>("bright");
  const styleId = useMemo(() => {
    if (baseMode === "hybrid") return "roam-basemap-hybrid";
    return vectorTheme === "dark" ? "roam-basemap-vector-dark" : "roam-basemap-vector-bright";
  }, [baseMode, vectorTheme]);

  // Stop-added toast
  const [stopAddedToast, setStopAddedToast] = useState<string | null>(null);

  // Memory sheet state — opened by proximity notification or stop quick action
  const [memorySheetOpen, setMemorySheetOpen] = useState(false);
  const [memorySheetStop, setMemorySheetStop] = useState<{
    stopId: string;
    stopName: string | null;
    stopIndex: number;
    lat: number;
    lng: number;
  } | null>(null);

  useEffect(() => {
    checkIsUnlocked().then((result) => {
      setUnlocked(result);
      // If redirected from /new with ?upgrade=1, open the paywall as gate variant
      if (!result && sp.get("upgrade") === "1") {
        setPaywallVariant("gate");
        setPaywallOpen(true);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show notification dot on Plans button when another plan is saved (not the current one)
  useEffect(() => {
    return onPlanEvent((type, payload) => {
      if (type === "plan:saved" && payload.planId !== bootedPlanIdRef.current) {
        setPlansDot(true);
      }
    });
  }, []);

  // Bottom Sheet Snap State (2 snaps: expanded, peek)
  const sheetRef = useRef<HTMLDivElement>(null);
  type SheetSnap = "expanded" | "peek";
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const dragData = useRef({ startY: 0, startSnap: "peek" as SheetSnap });

  // Overlay polling refs
  const overlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scoreTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track which plan has been booted so URL-param changes (focus_place_id etc.) don't re-boot
  const bootedPlanIdRef = useRef<string | null>(null);

  // ── MapLibre instance ref (shared between TripMap and useMapNavigationMode) ──
  const mapInstanceRef = useRef<MLMap | null>(null);

  // ── Active Navigation ──
  const activeNav = useActiveNavigation(navpack, DEFAULT_NAV_CONFIG, weather);

  // ── Map Navigation Mode (heading-up camera tracking) ──
  const effectiveBbox = navpack?.primary?.bbox ?? plan?.preview?.bbox ?? null;
  const mapNavMode = useMapNavigationMode({
    mapRef: mapInstanceRef,
    position: activeNav.isActive ? (activeNav.lastPosition ?? geo.position) : null,
    active: activeNav.isActive,
    bbox: effectiveBbox,
  });

  // ── Wire the 60 fps interpolator to map camera + user puck ──
  // This runs OUTSIDE React state — directly mutates MapLibre sources and camera
  // each animation frame for zero-latency, Google Maps-quality smoothness.
  const mapNavModeRef = useRef(mapNavMode);
  mapNavModeRef.current = mapNavMode;

  useEffect(() => {
    const interpolator = activeNav.interpolator;
    interpolator.setOnFrame((pos: InterpolatedPosition) => {
      // 1. Update camera (heading-up tracking via jumpTo)
      mapNavModeRef.current.onInterpolatedFrame(pos);

      // 2. Update user puck GeoJSON source directly (bypass React)
      const map = mapInstanceRef.current;
      if (!map) return;
      const locSrc = map.getSource("roam-user-loc-src") as GeoJSONSource | undefined;
      if (locSrc) {
        locSrc.setData({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: { accuracy: pos.accuracy, heading: pos.heading, speed: pos.speed },
            geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
          }],
        });
      }
      // 3. Update heading cone source directly
      const headSrc = map.getSource("roam-user-loc-heading-src") as GeoJSONSource | undefined;
      if (headSrc) {
        if (pos.speed > 0.5) {
          headSrc.setData({
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: { heading: pos.heading },
              geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
            }],
          });
        } else {
          headSrc.setData({ type: "FeatureCollection", features: [] });
        }
      }
    });
  }, [activeNav.interpolator]);

  // ── Sheet position when entering/exiting navigation ──
  const [prevActive, setPrevActive] = useState(false);
  if (activeNav.isActive && !prevActive) {
    // Entering navigation mode → collapse sheet to just the peek handle
    setSheetSnap("peek");
    setDragOffset(0);
    setPrevActive(true);
  } else if (!activeNav.isActive && prevActive) {
    setPrevActive(false);
  }

  // ── Re-apply URL focus once places load (timing race fix) ─────────
  // Use a ref to ensure we only apply the initial URL focus once per URL value,
  // regardless of how many times places or sp re-renders.
  const [urlFocusApplied, setUrlFocusApplied] = useState<string | null>(null);
  if (
    focusPlaceFromUrl &&
    places?.items?.length &&
    urlFocusApplied !== focusPlaceFromUrl
  ) {
    setUrlFocusApplied(focusPlaceFromUrl);
    setFocusedPlaceId((prev) => (prev === focusPlaceFromUrl ? prev : focusPlaceFromUrl));
  }

  // ── Boot logic ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const preferredId = desiredPlanId ?? (await getCurrentPlanId());
        if (cancelled) return;

        // If this exact plan is already booted and ready, skip re-booting.
        // This prevents focus_place_id / focus_lat / focus_lng URL params from
        // triggering a full reload when the guide navigates to /trip?plan_id=X&focus_...
        if (preferredId && bootedPlanIdRef.current === preferredId) return;

        // Find the first plan that has a usable local bundle.
        // A plan is usable if its packs are already in IDB, or if it has a
        // zip_blob we can unpack. Cloud-synced stubs (no zip, no packs) are
        // skipped so they never surface the "Plan has no zip blob" error.
        let rec: OfflinePlanRecord | undefined;
        if (preferredId) {
          const preferred = await getOfflinePlan(preferredId);
          if (preferred) {
            const hasPacks = await hasCorePacks(preferred.plan_id);
            const hasNav = !hasPacks && await hasNavpack(preferred.plan_id);
            if (hasPacks || preferred.zip_blob || hasNav) rec = preferred;
          }
        }

        if (!rec) {
          // Preferred plan wasn't usable — scan all plans for one that is
          const all = await listOfflinePlans();
          for (const candidate of all) {
            const hasPacks = await hasCorePacks(candidate.plan_id);
            const hasNav = !hasPacks && await hasNavpack(candidate.plan_id);
            if (hasPacks || candidate.zip_blob || hasNav) { rec = candidate; break; }
          }
        }

        if (cancelled) return;
        if (!rec) {
          // Check if user is paywalled before redirecting to /new.
          // If they are, redirecting to /new would just bounce back here (loop).
          // Instead, show an empty state with the paywall modal.
          const gate = await checkTripGate();
          if (cancelled) return;
          if (!gate.allowed && gate.reason === "paywall") {
            setPaywallVariant("gate");
            setPaywallOpen(true);
            setPhase("error");
            setBootError(null); // signal "no plans + paywalled" (not a real error)
            return;
          }
          // Only redirect when the user is actually viewing the /trip tab.
          // PersistentTabs pre-mounts this page on other tabs — don't hijack navigation.
          if (pathnameRef.current === "/trip" || pathnameRef.current === "/trip/") {
            router.replace("/new");
          } else {
            setPhase("deferred");
          }
          return;
        }

        // If we fell back to a different plan, update the current pointer
        if (rec.plan_id !== preferredId) {
          await setCurrentPlanId(rec.plan_id);
        }

        // Set plan early so the preview (geometry/bbox/stops) is available
        // for rendering during hydration — avoids showing the skeleton
        // for minimal plans that have preview data from saveMinimalPlan.
        setPlan(rec);
        setPhase("hydrating");

        const has = await hasCorePacks(rec.plan_id);
        if (!has && rec.zip_blob) await unpackAndStoreBundle(rec);
        // else: minimal plan (navpack-only) — packs load from IDB, rest enriched in background

        const packs = await getAllPacks(rec.plan_id);
        if (cancelled) return;

        bootedPlanIdRef.current = rec.plan_id;
        setPlan(rec);
        setNavpack(packs.navpack ?? null);
        setCorridor(packs.corridor ?? null);
        setPlaces(packs.places ?? null);
        setTraffic(packs.traffic ?? null);
        setHazards(packs.hazards ?? null);
        setWeather(packs.weather ?? null);
        setFlood(packs.flood ?? null);
        setCoverage(packs.coverage ?? null);
        setWildlife(packs.wildlife ?? null);
        setRestAreas(packs.rest_areas ?? null);
        setRouteScore(packs.route_score ?? null);
        setFuelOverlay(packs.fuel ?? null);
        setEmergency(packs.emergency ?? null);
        setHeritage(packs.heritage ?? null);
        setAirQuality(packs.air_quality ?? null);
        setBushfire(packs.bushfire ?? null);
        setSpeedCameras(packs.speed_cameras ?? null);
        setToilets(packs.toilets ?? null);
        setSchoolZones(packs.school_zones ?? null);
        setRoadkill(packs.roadkill ?? null);

        // ── Coverage: refresh if IDB has no points (stale/empty pack) ──
        const geometry = packs.navpack?.primary?.geometry;
        const coverageStale = !packs.coverage?.points?.length;
        if (coverageStale && geometry) {
          navApi.coverageAlongRoute({ geometry }).then((fresh) => {
            if (cancelled) return;
            if (fresh.points.length > 0) {
              setCoverage(fresh);
              putPack(rec.plan_id, "coverage", fresh).catch(() => {});
            }
          }).catch(() => {});
        }

        // ── Wildlife: refresh if IDB has no zones (stale/empty pack) ──
        const wildlifeStale = !packs.wildlife?.zones?.length;
        if (wildlifeStale && geometry) {
          navApi.wildlifeAlongRoute({ polyline6: geometry }).then((fresh) => {
            if (cancelled) return;
            if (fresh.zones.length > 0) {
              setWildlife(fresh);
              putPack(rec.plan_id, "wildlife", fresh).catch(() => {});
            }
          }).catch(() => {});
        }

        // ── Elevation: load from IDB ──
        if (packs.elevation) {
          setElevation(packs.elevation);
        }

        // ── Fuel analysis: load from IDB or compute fresh ──
        // Invalidate cached analysis if the places pack has changed since it was computed.
        const cachedAnalysis = packs.fuel_analysis;
        const placesKeyNow = packs.places?.places_key;
        const analysisStale =
          !cachedAnalysis ||
          (placesKeyNow && cachedAnalysis.places_key !== placesKeyNow);

        if (cachedAnalysis && !analysisStale) {
          setFuelAnalysis(cachedAnalysis);
        } else if (packs.navpack?.primary?.geometry && packs.places?.items) {
          try {
            const fuelProfile = await getVehicleFuelProfile();
            const wFactor = computeWindFactor(packs.weather ?? null, packs.navpack);
            // Merge fuel overlay stations into places so fuel analysis
            // picks them up even if they were budget-squeezed from PlacesPack.
            const placeIds = new Set(packs.places.items.map((p) => p.id));
            const overlayPlaces = fuelOverlayToPlaceItems(packs.fuel ?? null, placeIds);
            const mergedPlaces = overlayPlaces.length > 0
              ? [...packs.places.items, ...overlayPlaces]
              : packs.places.items;
            const analysis = analyzeFuel(
              packs.navpack.primary.geometry,
              mergedPlaces,
              fuelProfile,
              packs.navpack.primary.route_key,
              placesKeyNow,
              wFactor,
            );
            setFuelAnalysis(analysis);
            putPack(rec.plan_id, "fuel_analysis", analysis).catch(() => {});
          } catch (e) {
            console.warn("[Trip] fuel analysis compute failed:", e);
          }
        }

        setPhase("ready");
      } catch (e: unknown) {
        if (cancelled) return;
        console.error("[Trip] boot error:", e);
        setBootError(e instanceof Error ? e.message : "Failed to load trip");
        setPhase("error");
      }
    }

    boot();
    return () => { cancelled = true; };
  }, [desiredPlanId, router, sp]);

  // ── Deferred redirect: boot found no plans while on another tab.
  //    When the user actually navigates to /trip, redirect to /new.
  useEffect(() => {
    if (phase === "deferred" && (pathname === "/trip" || pathname === "/trip/")) {
      router.replace("/new");
    }
  }, [phase, pathname, router]);

  // ── Background enrichment for minimal (navpack-only) plans ──────
  const enrichPackHandler = useCallback((kind: PackKind, data: unknown) => {
    switch (kind) {
      case "corridor": setCorridor(data as CorridorGraphPack); break;
      case "traffic": setTraffic(data as TrafficOverlay); break;
      case "hazards": setHazards(data as HazardOverlay); break;
      case "places": setPlaces(data as PlacesPack); break;
      case "weather": setWeather(data as WeatherOverlay); break;
      case "flood": setFlood(data as FloodOverlay); break;
      case "fuel": setFuelOverlay(data as FuelOverlay); break;
      case "coverage": setCoverage(data as CoverageOverlay); break;
      case "wildlife": setWildlife(data as WildlifeOverlay); break;
      case "rest_areas": setRestAreas(data as RestAreaOverlay); break;
      case "route_score": setRouteScore(data as RouteIntelligenceScore); break;
      case "emergency": setEmergency(data as EmergencyServicesOverlay); break;
      case "heritage": setHeritage(data as HeritageOverlay); break;
      case "air_quality": setAirQuality(data as AirQualityOverlay); break;
      case "bushfire": setBushfire(data as BushfireOverlay); break;
      case "speed_cameras": setSpeedCameras(data as SpeedCamerasOverlay); break;
      case "toilets": setToilets(data as ToiletsOverlay); break;
      case "school_zones": setSchoolZones(data as SchoolZonesOverlay); break;
      case "roadkill": setRoadkill(data as RoadkillOverlay); break;
    }
  }, []);

  const enrichment = useEnrichment(enrichPackHandler);
  const enrichmentRef = useRef(enrichment);
  enrichmentRef.current = enrichment;

  // Track which plan enrichment has been kicked off for. Once enrichment
  // starts for a plan it runs to completion — we never cancel/restart it
  // just because an overlay pack arrived and changed React state.
  const enrichStartedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (phase !== "ready" || !plan || !navpack || !isOnline) return;
    // Already kicked off (or finished) for this plan — don't restart
    if (enrichStartedForRef.current === plan.plan_id) return;
    const e = enrichmentRef.current;
    if (e.isEnriching || e.isDone) return;
    // Full-bundle plans already have a corridor — no enrichment needed
    if (corridor) return;

    enrichStartedForRef.current = plan.plan_id;
    e.start({
      planId: plan.plan_id,
      navPack: navpack,
      departAt: navpack.req?.depart_at ?? null,
    });

    // NOTE: no cleanup cancellation. Enrichment runs to completion even if
    // this effect re-fires (e.g. isOnline flickers). The enrichStartedForRef
    // guard prevents double-starting. We only cancel on unmount via the ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, plan, navpack, isOnline]);

  // Focus place from URL — expand sheet to show detail
  const [prevFocusUrl, setPrevFocusUrl] = useState<string | null>(null);
  if (focusPlaceFromUrl && prevFocusUrl !== focusPlaceFromUrl) {
    setPrevFocusUrl(focusPlaceFromUrl);
    setFocusedPlaceId(focusPlaceFromUrl);
  }
  useEffect(() => {
    if (!focusPlaceFromUrl) return;
    setSheetSnap("expanded");
  }, [focusPlaceFromUrl]);

  // ── Live fuel tracking from GPS ──────────────────────────────────
  // Use active nav position if navigating, else regular geo
  const effectivePosition = activeNav.isActive ? activeNav.lastPosition : geo.position;

  // ── Feed GPS position into presence beacon ──
  const isSharedTrip = !!plan?.is_shared;
  useEffect(() => {
    if (effectivePosition) presenceBeacon.updatePosition(effectivePosition);
  }, [effectivePosition]);

  // Faster presence pings on shared trips (15s vs 30s)
  useEffect(() => {
    presenceBeacon.setSharedTrip(isSharedTrip);
  }, [isSharedTrip]);

  // Only broadcast presence while actively navigating —
  // no point tracking someone parked at home
  useEffect(() => {
    presenceBeacon.setNavigating(activeNav.isActive);
  }, [activeNav.isActive]);

  // ── Nearby roamers (dead-reckoning proximity) ──
  // Polls every 20s on shared trips (vs 60s default) for real-time awareness
  const { roamers: nearbyRoamers } = useNearbyRoamers({ radiusKm: 50, enabled: !!effectivePosition, sharedTrip: isSharedTrip });

  // ── Peer sync: pull delta when a new roamer is detected ──
  const prevRoamerCountRef = useRef(0);
  useEffect(() => {
    if (nearbyRoamers.length > prevRoamerCountRef.current && effectivePosition) {
      void syncPeerDelta(effectivePosition.lat, effectivePosition.lng);
    }
    prevRoamerCountRef.current = nearbyRoamers.length;
  }, [nearbyRoamers.length, effectivePosition]);

  // ── User observations (crowd-sourced road intel) ──
  const observations = useObservations({
    lat: effectivePosition?.lat,
    lng: effectivePosition?.lng,
    radiusKm: 50,
    autoFetch: true,
  });

  // ── Report placement mode: zoom in, show draggable marker, listen for map taps ──
  const reportMarkerRef = useRef<maplibregl.Marker | null>(null);
  const prevCameraRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const isPlacing = reportPhase !== null && reportPhase !== "picking";

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (isPlacing && !activeNav.isActive) {
      // Save current camera so we can restore on close
      const c = map.getCenter();
      if (!prevCameraRef.current) {
        prevCameraRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
      }

      // Zoom in around the user's position (or map center if no GPS)
      const pos = geo.position;
      const target: [number, number] = pos ? [pos.lng, pos.lat] : [c.lng, c.lat];
      map.easeTo({ center: target, zoom: Math.max(map.getZoom(), 15), duration: 500 });

      // Place a draggable marker
      const marker = new maplibregl.Marker({ color: "#4a6c53", draggable: true })
        .setLngLat(target)
        .addTo(map);
      reportMarkerRef.current = marker;
      setReportMarker({ lat: target[1], lng: target[0] });

      // Update state when marker is dragged
      const onDragEnd = () => {
        const ll = marker.getLngLat();
        setReportMarker({ lat: ll.lat, lng: ll.lng });
      };
      marker.on("dragend", onDragEnd);

      // Tap map to move the marker
      const onClick = (e: maplibregl.MapMouseEvent) => {
        marker.setLngLat(e.lngLat);
        setReportMarker({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      };
      map.on("click", onClick);

      return () => {
        marker.off("dragend", onDragEnd);
        map.off("click", onClick);
        marker.remove();
        reportMarkerRef.current = null;
      };
    }

    // Placement closed — restore camera
    if (!isPlacing && prevCameraRef.current) {
      map.easeTo({
        center: prevCameraRef.current.center,
        zoom: prevCameraRef.current.zoom,
        duration: 400,
      });
      prevCameraRef.current = null;
    }
    setReportMarker(null);
  }, [isPlacing, activeNav.isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a synthetic RoamPosition from the marker for the placement bar
  const reportPosition = useMemo(() => {
    if (!reportMarker) return effectivePosition;
    return {
      lat: reportMarker.lat,
      lng: reportMarker.lng,
      accuracy: 0,
      altitude: null,
      altitudeAccuracy: null,
      heading: effectivePosition?.heading ?? null,
      speed: null,
      timestamp: Date.now(),
    } satisfies import("@/lib/native/geolocation").RoamPosition;
  }, [reportMarker, effectivePosition]);

  // Cache decoded polyline + cumulative km — only recompute when the route changes,
  // NOT on every GPS tick. For long routes (e.g. 1700km SC→Cairns) decoding +
  // cumulativeKm can produce 20-50k points with haversine per segment.
  // Build a spatial index over the route — O(n) once, then snap is O(1).
  const routeIndex = useMemo(() => {
    const geom = navpack?.primary?.geometry;
    if (!geom) return null;
    try {
      const decoded = decodePolyline6(geom);
      const cumKmArr = cumulativeKm(decoded);
      return buildPolylineIndex(decoded, cumKmArr);
    } catch {
      return null;
    }
  }, [navpack?.primary?.geometry]);

  // ── Viewport → km range tracking for elevation strip ──
  // On map moveend, compute which km range of the route is visible in the viewport.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !routeIndex) {
      setViewportKmRange(null);
      return;
    }

    function computeViewportKm() {
      const m = mapInstanceRef.current;
      if (!m || !routeIndex) return;
      const bounds = m.getBounds();
      const { decoded, cumKm } = routeIndex;

      // Walk the polyline and find the km range of points inside the viewport
      let minKm = Infinity;
      let maxKm = -Infinity;
      for (let i = 0; i < decoded.length; i++) {
        const pt = decoded[i];
        if (
          pt.lat >= bounds.getSouth() && pt.lat <= bounds.getNorth() &&
          pt.lng >= bounds.getWest() && pt.lng <= bounds.getEast()
        ) {
          const km = cumKm[i];
          if (km < minKm) minKm = km;
          if (km > maxKm) maxKm = km;
        }
      }

      if (minKm <= maxKm) {
        setViewportKmRange([minKm, maxKm]);
      } else {
        setViewportKmRange(null);
      }
    }

    // Compute once on mount, then on every moveend
    computeViewportKm();
    map.on("moveend", computeViewportKm);
    return () => { map.off("moveend", computeViewportKm); };
  }, [routeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Elevation strip tap → fly map to location ──
  const handleElevTap = useCallback((loc: { lat: number; lng: number; km: number }) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.getZoom(), 12), duration: 800 });
  }, []);

  // Throttled fuel tracking — debounce GPS ticks to once per 2s.
  const [fuelTracking, setFuelTracking] = useState<ReturnType<typeof computeFuelTracking> | null>(null);
  const fuelSnapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fuelSnapTimerRef.current) clearTimeout(fuelSnapTimerRef.current);

    if (!fuelAnalysis || !effectivePosition || !routeIndex) {
      fuelSnapTimerRef.current = setTimeout(() => setFuelTracking(null), 0);
      return () => { if (fuelSnapTimerRef.current) clearTimeout(fuelSnapTimerRef.current); };
    }

    // Debounce: wait 2s after last position change before snapping.
    fuelSnapTimerRef.current = setTimeout(() => {
      try {
        const snap = snapToPolylineIndexed(
          { lat: effectivePosition.lat, lng: effectivePosition.lng },
          routeIndex,
        );
        if (snap.distance_m > 2000) {
          setFuelTracking(null);
          setFuelArbitrage(null);
        } else {
          setFuelTracking(computeFuelTracking(fuelAnalysis, snap.km, fuelAnalysis.profile));
          // Check for fuel price arbitrage if we have live pricing data
          if (fuelOverlay) {
            setFuelArbitrage(
              checkFuelArbitrage(snap.km, fuelOverlay, fuelAnalysis.profile, fuelAnalysis.profile.fuel_type),
            );
          }
        }
      } catch {
        setFuelTracking(null);
      }
    }, 2000);

    return () => {
      if (fuelSnapTimerRef.current) clearTimeout(fuelSnapTimerRef.current);
    };
  }, [fuelAnalysis, effectivePosition, routeIndex, fuelOverlay]);

  // ── Overlay polling ─────────────────────────────────────────────
  const pollOverlays = useCallback(async () => {
    if (!isOnline) return;
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
  }, [navpack, plan, isOnline]);

  // Start polling when navpack is ready
  useEffect(() => {
    if (phase !== "ready" || !navpack?.primary?.bbox) return;

    // Schedule initial poll immediately (avoid synchronous setState in effect)
    const initialPoll = setTimeout(pollOverlays, 0);

    overlayTimerRef.current = setInterval(pollOverlays, OVERLAY_POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialPoll);
      if (overlayTimerRef.current) {
        clearInterval(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
    };
  }, [phase, navpack, pollOverlays]);

  // ── Route score polling ──────────────────────────────────────────
  const pollRouteScore = useCallback(async () => {
    if (!isOnline) return;
    if (!navpack?.primary?.bbox || !navpack.primary.route_key) return;

    const currentPlanId = plan?.plan_id;
    try {
      const fresh = await bundleApi.scoreRefresh({
        route_key: navpack.primary.route_key,
        bbox: navpack.primary.bbox,
      });
      setRouteScore(fresh);
      if (currentPlanId) putPack(currentPlanId, "route_score", fresh).catch(() => {});
    } catch (e) {
      console.warn("[Trip] score poll failed:", e);
    }
  }, [navpack, plan, isOnline]);

  useEffect(() => {
    if (phase !== "ready" || !navpack?.primary?.bbox) return;

    scoreTimerRef.current = setInterval(pollRouteScore, SCORE_POLL_INTERVAL_MS);

    return () => {
      if (scoreTimerRef.current) {
        clearInterval(scoreTimerRef.current);
        scoreTimerRef.current = null;
      }
    };
  }, [phase, navpack, pollRouteScore]);

  // ── Smart reconnection: prioritized overlay refresh on signal return ──
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    const wasOffline = !wasOnlineRef.current;
    wasOnlineRef.current = isOnline;

    if (!isOnline || !wasOffline || phase !== "ready") return;
    if (!navpack?.primary?.bbox || !navpack.primary.route_key) return;

    // Use bundle created_at to compute staleness-based priority
    const bundleCreatedAt = navpack.primary.created_at ?? new Date(Date.now() - 86400_000).toISOString();
    const prioritized = computeRefreshPriority(bundleCreatedAt);

    if (prioritized.length > 0) {
      console.info(
        "[Trip] Reconnected — refreshing %d stale overlays: %s",
        prioritized.length,
        prioritized.map((p) => `${p.overlay}(${formatAge(p.age_s)})`).join(", "),
      );
    }

    // Trigger overlay + score poll immediately (existing handlers pick up isOnline=true)
    pollOverlays();
    pollRouteScore();
  }, [isOnline, phase, navpack, pollOverlays, pollRouteScore]);

  // ── Rebuild handler ─────────────────────────────────────────────
  // Falls back to offline corridor A* routing when the backend is unreachable.
  const handleRebuild = useCallback(async (args: { stops: TripStop[]; mode: TripEditorRebuildMode }) => {
    const planId = plan?.plan_id;

    // ── Offline path: use corridor A* ───────────────────────────────
    if (!isOnline && corridor) {
      try {
        const prev = navpack ?? {
          req: { stops: args.stops, profile: "drive" },
          primary: { profile: "drive", provider: "corridor", algo_version: "offline.astar.v1", route_key: "", geometry: "", bbox: { minLng: 0, minLat: 0, maxLng: 0, maxLat: 0 }, distance_m: 0, duration_s: 0, legs: [], created_at: new Date().toISOString() },
          alternates: { alternates: [] },
        } as NavPack;
        const routeKey = `offline_${shortId(12)}`;
        // Build hazard penalty zones from cached traffic/hazards so A* avoids them
        const hazardZones = overlaysToHazardZones(traffic, hazards);
        const { navpack: offlineNavpack, fuelAnalysis: offlineFuel } = await rebuildNavpackOfflineWithFuel({
          planId: planId ?? "",
          prevNavpack: prev,
          corridor,
          stops: args.stops,
          route_key: routeKey,
          hazardZones: hazardZones.length > 0 ? hazardZones : undefined,
        });

        setNavpack(offlineNavpack);
        setOfflineRouted(true);
        if (offlineFuel) setFuelAnalysis(offlineFuel as FuelAnalysis);

        // Persist offline rebuild to IDB so the app can resume after kill
        if (planId) {
          const preview = {
            stops: args.stops,
            geometry: offlineNavpack.primary.geometry,
            bbox: offlineNavpack.primary.bbox,
            distance_m: offlineNavpack.primary.distance_m,
            duration_s: offlineNavpack.primary.duration_s,
            profile: offlineNavpack.primary.profile,
          };

          putPacksAtomic({
            planId,
            updates: {
              navpack: offlineNavpack,
              ...(offlineFuel ? { fuel_analysis: offlineFuel } : {}),
            },
          }).catch(() => {});

          updateOfflinePlan(planId, { route_key: routeKey, preview }).catch(() => {});
        }
      } catch (offlineErr) {
        console.error("[Trip] offline corridor A* rebuild failed:", offlineErr);
        // Don't throw — keep the existing route intact. The user's current
        // navpack is better than no navpack. The error is logged so we can
        // diagnose what's happening with the corridor graph.
      }

      // Traffic + hazards stay as-is from the cached bundle (still valid for the corridor)
      return;
    }

    // ── Online path: use OSRM via backend ───────────────────────────
    // Wrapped in try-catch so that if the network request fails (stale
    // isOnline, spotty connectivity, etc.) we fall back to offline
    // corridor A* routing automatically — the user should never be
    // stuck without a route when the corridor graph is available.
    let result: NavPack | null = null;
    try {
      // Build avoid zones from current traffic/hazards so OSRM picks the safest alternative
      const avoidZones = overlaysToAvoidZoneRequests(traffic, hazards);
      result = await navApi.route({
        profile: navpack?.primary?.profile ?? "drive",
        stops: args.stops,
        ...(avoidZones.length > 0 ? { avoid_zones: avoidZones } : {}),
      });
    } catch (onlineErr) {
      // ── Fallback: corridor A* when online OSRM fails ────────────
      if (corridor && navpack) {
        console.warn("[Trip] online rebuild failed, falling back to offline corridor A*:", onlineErr);
        const routeKey = `offline_fallback_${shortId(12)}`;
        const fallbackHazardZones = overlaysToHazardZones(traffic, hazards);
        const { navpack: offlineNavpack, fuelAnalysis: offlineFuel } = await rebuildNavpackOfflineWithFuel({
          planId: planId ?? "",
          prevNavpack: navpack,
          corridor,
          stops: args.stops,
          route_key: routeKey,
          reason: "online_fallback",
          hazardZones: fallbackHazardZones.length > 0 ? fallbackHazardZones : undefined,
        });

        setNavpack(offlineNavpack);
        setOfflineRouted(true);
        if (offlineFuel) setFuelAnalysis(offlineFuel as FuelAnalysis);

        if (planId) {
          const preview = {
            stops: args.stops,
            geometry: offlineNavpack.primary.geometry,
            bbox: offlineNavpack.primary.bbox,
            distance_m: offlineNavpack.primary.distance_m,
            duration_s: offlineNavpack.primary.duration_s,
            profile: offlineNavpack.primary.profile,
          };
          putPacksAtomic({
            planId,
            updates: {
              navpack: offlineNavpack,
              ...(offlineFuel ? { fuel_analysis: offlineFuel } : {}),
            },
          }).catch(() => {});
          updateOfflinePlan(planId, { route_key: routeKey, preview }).catch(() => {});
        }
        return;
      }
      // No corridor available — log and keep existing route
      console.error("[Trip] rebuild failed: online unreachable, no corridor available for offline fallback", onlineErr);
      return;
    }

    setNavpack(result);
    setOfflineRouted(false);

    // Persist the new navpack and updated preview so the app resumes
    // correctly after a kill/restart (online rebuild was previously only
    // updating React state, leaving IDB with the old route).
    if (planId && result?.primary) {
      const preview = {
        stops: args.stops,
        geometry: result.primary.geometry,
        bbox: result.primary.bbox,
        distance_m: result.primary.distance_m,
        duration_s: result.primary.duration_s,
        profile: result.primary.profile,
      };
      putPacksAtomic({
        planId,
        updates: { navpack: result },
      }).catch(() => {});
      updateOfflinePlan(planId, { route_key: result.primary.route_key, preview }).catch(() => {});
    }

    // Recompute fuel analysis for new route (wind-corrected)
    if (places?.items && result?.primary?.geometry) {
      try {
        const fuelProfile = await getVehicleFuelProfile();
        const wFactor = computeWindFactor(weather, { primary: result.primary } as NavPack);
        const pIds = new Set(places.items.map((p) => p.id));
        const ovPlaces = fuelOverlayToPlaceItems(fuelOverlay, pIds);
        const merged = ovPlaces.length > 0 ? [...places.items, ...ovPlaces] : places.items;
        const analysis = analyzeFuel(
          result.primary.geometry,
          merged,
          fuelProfile,
          result.primary.route_key,
          undefined,
          wFactor,
        );
        setFuelAnalysis(analysis);
        if (planId) {
          putPack(planId, "fuel_analysis", analysis).catch(() => {});
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
        if (planId) {
          putPack(planId, "elevation", elevRes).catch(() => {});
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
          if (planId) putPack(planId, "traffic", t.value).catch(() => {});
        }
        if (h.status === "fulfilled") {
          setHazards(h.value);
          if (planId) putPack(planId, "hazards", h.value).catch(() => {});
        }
      } catch {}
    }
  }, [navpack, plan, places, corridor, isOnline, traffic, hazards]);

  // ── React to remote plan changes (shared trip sync) ───────────────
  // planSync merges Supabase Realtime updates into IDB and emits
  // "plan:remote-updated". We re-read IDB and either update metadata
  // (label change) or trigger a full route rebuild (stop/route change).
  // If enrichment is in progress, we defer the rebuild to avoid concurrent
  // IDB writes between the enrichment pipeline and the rebuild path.
  const pendingRemoteRebuildRef = useRef<{ stops: TripStop[] } | null>(null);

  useEffect(() => {
    const activePlanId = plan?.plan_id;
    if (!activePlanId || phase !== "ready") return;

    const unsub = onPlanEvent(async (type, payload) => {
      if (type !== "plan:remote-updated") return;
      if (payload.planId !== activePlanId) return;

      try {
        const freshPlan = await getOfflinePlan(activePlanId);
        if (!freshPlan) return;

        const currentRouteKey = plan?.route_key;
        const routeChanged = freshPlan.route_key !== currentRouteKey;

        // Always update the plan record (label, manifest status, etc.)
        setPlan(freshPlan);

        if (routeChanged && freshPlan.preview?.stops && freshPlan.preview.stops.length >= 2) {
          if (enrichmentRef.current.isEnriching) {
            // Defer rebuild until enrichment finishes to avoid concurrent IDB writes
            console.info("[Trip] deferring remote rebuild — enrichment in progress");
            pendingRemoteRebuildRef.current = { stops: freshPlan.preview.stops };
          } else {
            // Route changed by collaborator — rebuild locally
            handleRebuild({ stops: freshPlan.preview.stops, mode: "auto" }).catch((e) => {
              console.warn("[Trip] remote sync rebuild failed:", e);
            });
          }
        }

        // Show toast
        setRemoteToastVisible(true);
        if (remoteToastTimerRef.current) clearTimeout(remoteToastTimerRef.current);
        remoteToastTimerRef.current = setTimeout(() => setRemoteToastVisible(false), 3000);
      } catch (e) {
        console.warn("[Trip] remote plan sync failed:", e);
      }
    });

    return () => {
      unsub();
      if (remoteToastTimerRef.current) clearTimeout(remoteToastTimerRef.current);
    };
  }, [plan?.plan_id, plan?.route_key, phase, handleRebuild]);

  // Flush deferred remote rebuild once enrichment finishes
  useEffect(() => {
    const e = enrichmentRef.current;
    if ((e.isDone || e.isError) && pendingRemoteRebuildRef.current) {
      const { stops } = pendingRemoteRebuildRef.current;
      pendingRemoteRebuildRef.current = null;
      console.info("[Trip] flushing deferred remote rebuild");
      handleRebuild({ stops, mode: "auto" }).catch((err) => {
        console.warn("[Trip] deferred remote rebuild failed:", err);
      });
    }
  }, [enrichment.isDone, enrichment.isError, handleRebuild]);

  // ── Fuel settings saved handler ──────────────────────────────────
  const handleFuelProfileSaved = useCallback(async (newProfile: VehicleFuelProfile) => {
    if (!navpack?.primary?.geometry || !places?.items) return;
    try {
      const wFactor = computeWindFactor(weather, navpack);
      const pIds = new Set(places.items.map((p) => p.id));
      const ovPlaces = fuelOverlayToPlaceItems(fuelOverlay, pIds);
      const merged = ovPlaces.length > 0 ? [...places.items, ...ovPlaces] : places.items;
      const analysis = analyzeFuel(
        navpack.primary.geometry,
        merged,
        newProfile,
        navpack.primary.route_key,
        undefined,
        wFactor,
      );
      setFuelAnalysis(analysis);
      if (plan?.plan_id) {
        putPack(plan.plan_id, "fuel_analysis", analysis).catch(() => {});
      }
    } catch (e) {
      console.warn("[Trip] fuel recompute on settings change failed:", e);
    }
  }, [navpack, places, plan, weather, fuelOverlay]);

  // ── Guide navigation handler ────────────────────────────────────
  const handleNavigateToGuide = useCallback((placeId: string, placeName?: string) => {
    if (!plan) return;
    // Use name from places pack or the name passed from the popup button
    const p = places?.items?.find((x) => x.id === placeId);
    const name = p?.name ?? placeName ?? null;
    const askAbout = name ? encodeURIComponent(`Tell me more about ${name}`) : "";
    const url = `/guide?plan_id=${encodeURIComponent(plan.plan_id)}&focus_place_id=${encodeURIComponent(placeId)}${askAbout ? `&ask_about=${askAbout}` : ""}`;
    router.push(url);
  }, [plan, places, router]);

  // ── Add stop from map popup ──────────────────────────────────────
  const handleAddStopFromMap = useCallback(async (placeId: string, coords?: { lat: number; lng: number; name?: string }) => {
    if (!plan || !navpack) return;
    // Check already in stops
    const currentStops = navpack.req?.stops ?? plan.preview?.stops ?? [];
    if (currentStops.some((s) => s.id === placeId)) return;

    // Find the PlaceItem from places pack, or fall back to passed coords, or URL coords
    const place = places?.items?.find((x) => x.id === placeId);
    const fallbackLat = coords?.lat ?? (focusLatFromUrl ? parseFloat(focusLatFromUrl) : null);
    const fallbackLng = coords?.lng ?? (focusLngFromUrl ? parseFloat(focusLngFromUrl) : null);
    if (!place && (!fallbackLat || !fallbackLng)) return;

    haptic.medium();
    try {
      const newStop: TripStop = place
        ? { id: place.id, name: place.name ?? "Stop", lat: place.lat, lng: place.lng, type: "poi" }
        : { id: placeId, name: coords?.name ?? "Stop", lat: fallbackLat!, lng: fallbackLng!, type: "poi" };

      const endIdx = currentStops.findIndex((s) => (s.type ?? "poi") === "end");
      const newStops: TripStop[] = [...currentStops];
      if (endIdx >= 0) newStops.splice(endIdx, 0, newStop);
      else newStops.push(newStop);

      await handleRebuild({ stops: newStops, mode: "auto" });
      haptic.success();
      setFocusedPlaceId(null);
    } catch (e) {
      haptic.error();
      console.warn("[Trip] addStopFromMap failed:", e);
    }
  }, [plan, navpack, places, focusLatFromUrl, focusLngFromUrl, handleRebuild]);

  // ── Register "Add to trip" for PlaceDetailSheet popup ─────────────
  useEffect(() => {
    registerNavigateHandler((placeId, lat, lng, name) => {
      closePlace();
      setStopAddedToast(name || "Stop");
      setTimeout(() => setStopAddedToast(null), 2400);
      handleAddStopFromMap(placeId, { lat, lng, name });
    });
    return () => registerNavigateHandler(null);
  }, [handleAddStopFromMap, registerNavigateHandler, closePlace]);

  // ── Register "Show on Map" for PlaceDetailSheet ─────────────────
  useEffect(() => {
    registerShowOnMapHandler((placeId, lat, lng) => {
      closePlace();
      setFocusedPlaceId(placeId);
    });
    return () => registerShowOnMapHandler(null);
  }, [registerShowOnMapHandler, closePlace]);

  // ── Open place detail from map tap (suggestions, fuel, EV, rest areas) ──
  const handleOpenPlaceDetail = useCallback((placeId: string, coords: { lat: number; lng: number; name?: string; category?: string; extra?: Record<string, unknown> }) => {
    haptic.selection();
    // Try to find existing PlaceItem in places pack for full detail
    const existing = places?.items?.find((x) => x.id === placeId);
    if (existing) {
      openPlace(existing);
    } else {
      // Build a minimal PlaceItem from marker data
      openPlace({
        id: placeId,
        name: coords.name ?? "Place",
        lat: coords.lat,
        lng: coords.lng,
        category: (coords.category ?? "rest_area") as import("@/lib/types/places").PlaceCategory,
        extra: coords.extra as import("@/lib/types/places").PlaceExtra & Record<string, unknown>,
      });
    }
  }, [places, openPlace]);

  // ── Stable TripMap callback props (avoid inline arrow fns) ───────
  const handleStyleChange = useCallback((next: { mode: MapBaseMode; vectorTheme: VectorTheme }) => {
    setBaseMode(next.mode);
    setVectorTheme(next.vectorTheme);
  }, []);

  const handleStopPress = useCallback((id: string) => {
    haptic.selection();
    setFocusedStopId(id);
  }, []);

  const handleSuggestionPress = useCallback((id: string) => {
    haptic.selection();
    setFocusedPlaceId(id);
  }, []);

  const handleOverlayEventPress = useCallback(() => {
    haptic.selection();
  }, []);

  // ── Map stop long-press → quick action menu ─────────────────────
  const handleMapStopLongPress = useCallback(
    (stopId: string, screenX: number, screenY: number) => {
      if (!navpack) return;
      const stop = (navpack.req?.stops ?? []).find((s) => s.id === stopId);
      if (!stop) return;
      haptic.heavy();
      setMapQuickMenu({
        stopId,
        stopName: stop.name?.trim() || (stop.type ?? "Stop"),
        anchorX: screenX,
        anchorY: screenY,
        isLocked: stop.type === "start" || stop.type === "end",
        isWaypoint: (stop.type ?? "poi") === "via",
      });
    },
    [navpack],
  );

  const handleMapStopQuickAction: StopQuickActionHandler = useCallback(
    (action, stopId) => {
      if (!navpack) return;
      const stops: TripStop[] = (navpack.req?.stops ?? []).map((s) =>
        s.id ? s : { ...s, id: shortId() }
      );

      if (action === "delete") {
        const filtered = stops.filter((s) => {
          if (s.id !== stopId) return true;
          return s.type === "start" || s.type === "end"; // never delete locked
        });
        if (filtered.length !== stops.length) {
          handleRebuild({ stops: filtered, mode: "auto" }).catch(() => haptic.error());
          haptic.medium();
        }
        return;
      }

      if (action === "move-to-start" || action === "move-to-end") {
        const idx = stops.findIndex((s) => s.id === stopId);
        if (idx < 0) return;
        const stop = stops[idx];
        if (!stop || stop.type === "start" || stop.type === "end") return;
        const startLocked = stops[0] && (stops[0].type === "start" || stops[0].type === "end");
        const endLocked = stops[stops.length - 1] && (stops[stops.length - 1].type === "start" || stops[stops.length - 1].type === "end");
        const targetIdx = action === "move-to-start"
          ? (startLocked ? 1 : 0)
          : (endLocked ? stops.length - 2 : stops.length - 1);
        if (idx === targetIdx) return;
        const out = [...stops];
        const [moved] = out.splice(idx, 1);
        out.splice(targetIdx, 0, moved);
        handleRebuild({ stops: out, mode: "auto" }).catch(() => haptic.error());
        haptic.medium();
        return;
      }

      if (action === "set-waypoint") {
        const out = stops.map((s) => {
          if (s.id !== stopId || s.type === "start" || s.type === "end") return s;
          return { ...s, type: ((s.type ?? "poi") === "via" ? "poi" : "via") as TripStop["type"] };
        });
        handleRebuild({ stops: out, mode: "auto" }).catch(() => haptic.error());
        haptic.tap();
        return;
      }

      // add-note: nothing to do at this layer yet
    },
    [navpack, handleRebuild],
  );

  // ── Alert highlight handler ─────────────────────────────────────
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHighlightAlert = useCallback((ev: AlertHighlightEvent) => {
    haptic.selection();
    setHighlightedAlertId(ev.id);
    setSheetSnap("peek"); // collapse sheet to peek so the map is visible

    // Pan map to the alert location
    const map = mapInstanceRef.current;
    if (map && ev.lat != null && ev.lng != null) {
      map.easeTo({ center: [ev.lng, ev.lat], zoom: Math.max(map.getZoom(), 12), duration: 420 });
    }

    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedAlertId(null);
      highlightTimerRef.current = null;
    }, 4000);
  }, []);

  // ── Off-route reroute handler ───────────────────────────────────
  // Offline-first: always try corridor A* first for instant reroute,
  // then optionally enrich with OSRM in the background when online.
  const handleOffRouteReroute = useCallback(async () => {
    if (!activeNav.lastPosition || !navpack) return;

    const currentPos = activeNav.lastPosition;
    const allStops = navpack.req.stops;

    const remainingStops: TripStop[] = [
      {
        id: "__reroute_origin",
        name: "Current Location",
        type: "start" as const,
        lat: currentPos.lat,
        lng: currentPos.lng,
      },
      ...allStops.filter((s) => s.type !== "start"),
    ];

    // ── 1. Instant offline corridor A* reroute (always tried first) ──
    if (corridor) {
      try {
        const routeKey = `offline_reroute_${shortId(12)}`;
        const { navpack: offlineNavpack, fuelAnalysis: offlineFuel } = await rebuildNavpackOfflineWithFuel({
          planId: plan?.plan_id ?? "",
          prevNavpack: navpack,
          corridor,
          stops: remainingStops,
          route_key: routeKey,
          reason: "off_route_reroute",
        });

        setNavpack(offlineNavpack);
        setOfflineRouted(true);
        if (offlineFuel) setFuelAnalysis(offlineFuel as FuelAnalysis);
        activeNav.applyReroute(offlineNavpack);

        // Persist to IDB
        if (plan?.plan_id) {
          putPacksAtomic({
            planId: plan.plan_id,
            updates: {
              navpack: offlineNavpack,
              ...(offlineFuel ? { fuel_analysis: offlineFuel } : {}),
            },
          }).catch(() => {});
        }

        // ── 2. Background OSRM enrichment (better turn-by-turn steps) ──
        if (isOnline) {
          navApi.route({
            profile: navpack.primary.profile,
            stops: remainingStops,
          }).then((osrmResult) => {
            setNavpack(osrmResult);
            setOfflineRouted(false);
            activeNav.applyReroute(osrmResult);
            if (plan?.plan_id) {
              putPacksAtomic({
                planId: plan.plan_id,
                updates: { navpack: osrmResult },
              }).catch(() => {});
            }
          }).catch(() => {
            // Non-fatal — we already have the offline route working
          });
        }
        return;
      } catch (corridorErr) {
        console.warn("[Trip] corridor A* reroute failed:", corridorErr);
      }
    }

    // ── 3. Fallback: OSRM reroute if no corridor graph available ──
    if (isOnline) {
      try {
        const result = await navApi.route({
          profile: navpack.primary.profile,
          stops: remainingStops,
        });
        setNavpack(result);
        setOfflineRouted(false);
        activeNav.applyReroute(result);
      } catch (e) {
        console.warn("[Trip] reroute failed (no corridor, OSRM failed):", e);
      }
    }
  }, [activeNav, navpack, corridor, isOnline, plan]);

  // ── Auto-reroute on navigation start from different position ─────
  // If the user's GPS position is > 500m from the route start, reroute
  // from their actual position so they get directions from where they are.
  const handleStartNavigation = useCallback(async () => {
    await activeNav.start();

    // Check distance from user's position to route start
    const userPos = geo.position;
    const routeStart = navpack?.req.stops.find((s) => s.type === "start") ?? navpack?.req.stops[0];
    if (!userPos || !routeStart || !navpack) return;

    const distToStart = haversineM(userPos.lat, userPos.lng, routeStart.lat, routeStart.lng);
    if (distToStart > 500) {
      // User is far from the planned start — reroute from current position
      handleOffRouteReroute();
    }
  }, [activeNav, navpack, geo.position, handleOffRouteReroute]);

  // ── Bottom Sheet Handlers ───────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    setIsDraggingState(true);
    dragData.current = { startY: e.clientY, startSnap: sheetSnap };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [sheetSnap]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const delta = e.clientY - dragData.current.startY;
    setDragOffset(delta);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    setIsDraggingState(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}

    const delta = dragOffset;
    const startSnap = dragData.current.startSnap;
    const THRESHOLD = 60;

    // Determine next snap based on drag direction + distance
    if (delta < -THRESHOLD) {
      // Dragged up → expand
      if (startSnap === "peek") { setSheetSnap("expanded"); haptic.tap(); }
    } else if (delta > THRESHOLD) {
      // Dragged down → peek
      if (startSnap === "expanded") { setSheetSnap("peek"); haptic.tap(); }
    }

    setDragOffset(0);
  }, [dragOffset]);

  // ── Derived values ─────────────────────────────────────────────
  // Snap positions (translateY values).
  // The sheet extends 300px below the viewport to absorb spring bounce,
  // so peek/nav snaps add 300px to compensate.
  //   expanded:  0px (sheet fills from 80px down)
  //   peek:      calc(100% - 520px - safe-bottom)   [220px visible + 300px offset]
  const snapY = (() => {
    if (activeNav.isActive) return `calc(100% - 360px)`;
    switch (sheetSnap) {
      case "expanded":  return "0px";
      case "peek":
      default:          return `calc(100% - 520px - var(--roam-safe-bottom, 0px))`;
    }
  })();
  const sheetTransform = isDraggingState
    ? `translateY(calc(${snapY} + ${dragOffset}px))`
    : `translateY(${snapY})`;

  const sheetTransition = isDraggingState ? "none" : "transform 0.35s cubic-bezier(0.34, 1.12, 0.64, 1)";

  const effectiveStops = useMemo(() => navpack?.req?.stops ?? plan?.preview?.stops ?? [], [navpack, plan]);
  const effectiveGeom = navpack?.primary?.geometry ?? plan?.preview?.geometry ?? null;

  // ── Stop proximity detection → notification + memory sheet ──
  useStopProximity({
    position: geo.position,
    stops: effectiveStops,
    planId: plan?.plan_id ?? null,
    enabled: phase === "ready",
    onArrival: useCallback((event: { stop: TripStop; stopIndex: number; distance: number }) => {
      setMemorySheetStop({
        stopId: event.stop.id ?? `stop-${event.stopIndex}`,
        stopName: event.stop.name ?? null,
        stopIndex: event.stopIndex,
        lat: event.stop.lat,
        lng: event.stop.lng,
      });
      setMemorySheetOpen(true);
    }, []),
  });

  // Set of place IDs already in the trip — passed to TripMap and PlaceDetailSheet context
  const stopPlaceIds = useMemo(() => new Set(effectiveStops.map((s) => s.id).filter((id): id is string => !!id)), [effectiveStops]);

  // Sync stop IDs into PlaceDetailContext so PlaceDetailSheet shows "Already in Trip"
  useEffect(() => { setContextStopPlaceIds(stopPlaceIds); }, [stopPlaceIds, setContextStopPlaceIds]);

  // Stable reference for focus fallback coord (avoid [new, array] on every render)
  const focusFallbackCoord = useMemo<[number, number] | null>(() => {
    if (!focusLatFromUrl || !focusLngFromUrl) return null;
    return [parseFloat(focusLngFromUrl), parseFloat(focusLatFromUrl)];
  }, [focusLatFromUrl, focusLngFromUrl]);

  const focusFallbackName = useMemo<string | null>(() => {
    if (!focusPlaceFromUrl) return null;
    return places?.items?.find((x) => x.id === focusPlaceFromUrl)?.name ?? focusPlaceNameFromUrl ?? null;
  }, [focusPlaceFromUrl, places, focusPlaceNameFromUrl]);

  // Stable user position reference — avoid ternary object swap on every render
  const mapUserPosition = useMemo(
    () => activeNav.isActive ? activeNav.lastPosition : geo.position,
    [activeNav.isActive, activeNav.lastPosition, geo.position],
  );

  // Stable suggestions reference
  const mapSuggestions = useMemo(() => places?.items ?? null, [places]);

  // Current km along route for fuel tracking + elevation strip
  const currentKm = useMemo(() => {
    if (!fuelTracking) return 0;
    return fuelTracking.km_since_last_fuel + (fuelTracking.last_passed_station?.km_along_route ?? 0);
  }, [fuelTracking]);

  // ── Render gates ────────────────────────────────────────────────
  // For minimal plans (from /new → saveAndGo), the plan record has a preview
  // with geometry/bbox/stops. Skip the skeleton entirely if we already have
  // enough to render the map — this makes the transition feel instant.
  const hasPreviewData = plan?.preview?.geometry && plan?.preview?.bbox;
  if (phase === "deferred" || (phase === "resolving" && !hasPreviewData)) {
    return <TripSkeleton />;
  }

  if (phase === "error") {
    // No plans + paywalled: show empty state with paywall modal (no bootError means this case)
    const isPaywallEmpty = !bootError && paywallOpen;
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%", width: "100%", background: "var(--roam-bg)", color: "var(--roam-text)", padding: 32, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 950, color: isPaywallEmpty ? "var(--roam-text)" : "var(--roam-danger)", marginBottom: 12 }}>
            {isPaywallEmpty ? "No trips yet" : "Failed to load trip"}
          </div>
          {bootError && <div style={{ fontSize: 13, color: "var(--roam-text-muted)", marginBottom: 20 }}>{bootError}</div>}
          {isPaywallEmpty ? (
            <button
              type="button"
              className="trip-interactive"
              style={{ borderRadius: 999, minHeight: 42, padding: "0 20px", fontWeight: 950, background: "var(--roam-accent)", color: "var(--on-color)", boxShadow: "var(--shadow-button)" }}
              onClick={() => { setPaywallVariant("gate"); setPaywallOpen(true); }}
            >
              Upgrade to create more trips
            </button>
          ) : (
            <button
              type="button"
              className="trip-interactive"
              style={{ borderRadius: 999, minHeight: 42, padding: "0 20px", fontWeight: 950, background: "var(--roam-accent)", color: "var(--on-color)", boxShadow: "var(--shadow-button)" }}
              onClick={() => router.replace("/new")}
            >
              Build a Trip
            </button>
          )}
        </div>
        <PaywallModal
          open={paywallOpen}
          variant={paywallVariant}
          onClose={() => setPaywallOpen(false)}
          onUnlocked={() => { setPaywallOpen(false); setUnlocked(true); router.replace("/new"); }}
        />
      </div>
    );
  }

  if ((phase === "hydrating" || !plan || !effectiveGeom || !effectiveBbox) && !hasPreviewData) {
    return <TripSkeleton />;
  }

  // If we're still resolving/hydrating but have preview data, render the trip
  // view with what we have. The map shows the route from the preview while
  // packs load in the background — feels instant to the user.
  // hasPreviewData guarantees plan is non-null (plan?.preview?.geometry is truthy).
  if (!plan) return <TripSkeleton />;
  const renderGeom = effectiveGeom ?? plan.preview!.geometry;
  const renderBbox = effectiveBbox ?? plan.preview!.bbox;

  // ── Ready ──────────────────────────────────────────────────────
  return (
    <div className="trip-app-container">
      {/* Map Layer */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <TripMap
          styleId={styleId}
          onStyleChange={handleStyleChange}
          stops={effectiveStops}
          geometry={renderGeom}
          bbox={renderBbox}
          focusedStopId={focusedStopId}
          onStopPress={handleStopPress}
          onStopLongPress={handleMapStopLongPress}
          suggestions={mapSuggestions}
          filteredSuggestionIds={filteredPlaceIds}
          focusedSuggestionId={focusedPlaceId}
          focusFallbackCoord={focusFallbackCoord}
          focusFallbackName={focusFallbackName}
          onSuggestionPress={handleSuggestionPress}
          onOpenPlaceDetail={handleOpenPlaceDetail}
          traffic={traffic}
          hazards={hazards}
          onTrafficEventPress={handleOverlayEventPress}
          onHazardEventPress={handleOverlayEventPress}
          userPosition={mapUserPosition}
          planId={plan.plan_id}
          onNavigateToGuide={handleNavigateToGuide}
          onAddStopFromMap={handleAddStopFromMap}
          stopPlaceIds={stopPlaceIds}
          isOnline={isOnline}
          highlightedAlertId={highlightedAlertId}
          fuelStations={fuelAnalysis?.stations ?? null}
          fuelTracking={fuelTracking}
          flood={flood}
          coverage={coverage}
          wildlife={wildlife}
          restAreas={restAreas}
          fuelOverlay={fuelOverlay}
          weather={weather}
          emergency={emergency}
          heritage={heritage}
          airQuality={airQuality}
          bushfire={bushfire}
          speedCameras={speedCameras}
          toilets={toilets}
          schoolZones={schoolZones}
          roadkill={roadkill}
          navigationMode={activeNav.isActive}
          mapInstanceRef={mapInstanceRef}
          corridorDebug={corridor ? { bbox: corridor.bbox } : null}
        />
      </div>

      {/* ── Enrichment banner (progressive trip loading) — hidden in simple mode ── */}
      {!isSimple && <EnrichmentBanner progress={enrichment.progress} />}

      {/* ── Remote sync toast ── */}
      {remoteToastVisible && (
        <div
          style={{
            position: "absolute",
            top: "calc(var(--roam-safe-top, 0px) + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 30,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: 20,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          Trip updated by travel partner
        </div>
      )}

      {/* ── Stop-added toast ── */}
      {stopAddedToast && (
        <div
          style={{
            position: "absolute",
            top: "calc(var(--roam-safe-top, 0px) + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 30,
            background: "var(--brand-eucalypt, #2d6e40)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            padding: "8px 16px",
            borderRadius: 20,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            animation: "roam-fadeIn 0.2s ease",
          }}
        >
          <Plus size={13} strokeWidth={2.5} />
          {stopAddedToast} added to trip
        </div>
      )}

      {/* ── Map stop pin quick action menu ── */}
      <StopQuickActionMenu
        state={mapQuickMenu}
        onAction={(action, stopId) => {
          handleMapStopQuickAction(action, stopId);
        }}
        onClose={() => setMapQuickMenu(null)}
      />

      {/* ── FAB Stack (Report + Exchange) — hidden in simple mode ── */}
      {!activeNav.isActive && !isSimple && (
        <div style={{
          position: "absolute",
          bottom: "calc(220px + var(--roam-safe-bottom, 0px) + 24px)",
          right: 12,
          zIndex: 18,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-end",
        }}>
          {/* Exchange FAB — badge shows nearby roamer count */}
          <button
            type="button"
            className="map-fab-btn"
            onClick={() => { haptic.selection(); setExchangeOpen(true); }}
            aria-label={nearbyRoamers.length > 0
              ? `Exchange — ${nearbyRoamers.length} roamer${nearbyRoamers.length > 1 ? "s" : ""} nearby`
              : "Exchange data with nearby roamer"}
            style={{
              position: "relative",
              width: 46, height: 46,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              transition: "transform 0.1s ease",
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.90)"; }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
          >
            <Radio size={19} strokeWidth={2.5} />
            {nearbyRoamers.length > 0 && (
              <span style={{
                position: "absolute",
                top: -4, right: -4,
                minWidth: 18, height: 18,
                borderRadius: 9,
                background: "var(--brand-eucalypt, #2d6e40)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                lineHeight: 1,
              }}>
                {nearbyRoamers.length}
              </span>
            )}
          </button>
          {/* Report FAB */}
          <button
            type="button"
            className="map-fab-btn"
            onClick={() => { haptic.selection(); setReportPhase("picking"); }}
            aria-label="Report road condition"
            style={{
              width: 46, height: 46,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              transition: "transform 0.1s ease",
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.90)"; }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
          >
            <Megaphone size={19} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* ── Report Phase 1: Type Picker Overlay — hidden in simple mode ── */}
      {!isSimple && reportPhase === "picking" && (
        <ReportTypePicker
          onTypeSelected={(type) => {
            const opt = REPORT_OPTIONS.find((o) => o.type === type)!;
            setReportPhase({ type, severity: opt.severity });
          }}
          onClose={() => setReportPhase(null)}
        />
      )}

      {/* ── Report Phase 2: Placement Bar (map marker mode) — hidden in simple mode ── */}
      {!isSimple && isPlacing && typeof reportPhase === "object" && (
        <div style={{
          position: "absolute",
          bottom: "calc(220px + var(--roam-safe-bottom, 0px) + 16px)",
          left: 12, right: 12,
          zIndex: 25,
          display: "flex",
          justifyContent: "center",
        }}>
          <ReportPlacementBar
            type={reportPhase.type}
            position={reportPosition}
            onSubmit={observations.submit}
            onCancel={() => setReportPhase(null)}
          />
        </div>
      )}

      {/* ── Exchange Panel (ultrasonic peer transfer) — hidden in simple mode ── */}
      {!isSimple && <ExchangePanel open={exchangeOpen} onClose={() => setExchangeOpen(false)} nearbyRoamers={nearbyRoamers} />}

      {/* Navigation overlays are rendered at the end of the tree (after bottom sheet)
         so they paint above all other layers. See below. */}

      {!activeNav.isActive && !isSimple && <FuelPressureIndicator tracking={fuelTracking} />}
      <FuelLastChanceToast tracking={fuelTracking} currentKm={currentKm} />

      {/* Fuel price arbitrage toast — hidden in simple mode */}
      {!isSimple && fuelArbitrage && (
        <div
          style={{
            position: "fixed",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
            left: 16,
            right: 16,
            zIndex: 200,
            background: "var(--roam-surface)",
            borderRadius: 12,
            padding: "12px 16px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: "1px solid var(--roam-success)",
          }}
        >
          <div style={{ fontSize: 22 }}>⛽</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--roam-success)" }}>
              Save {fuelArbitrage.savings_cents}¢/L — skip to {fuelArbitrage.cheaper_station}
            </div>
            <div style={{ fontSize: 11, color: "var(--roam-text-muted)", marginTop: 2 }}>
              {fuelArbitrage.distance_km}km further · {fuelArbitrage.cheaper_price_cents}¢/L vs {fuelArbitrage.current_price_cents}¢/L
            </div>
          </div>
          <button
            onClick={() => setFuelArbitrage(null)}
            style={{ background: "none", border: "none", color: "var(--roam-text-muted)", cursor: "pointer", padding: 4 }}
          >
            ✕
          </button>
        </div>
      )}
      <VehicleFuelSettings
        open={fuelSettingsOpen}
        onClose={() => setFuelSettingsOpen(false)}
        onSaved={handleFuelProfileSaved}
      />

      {/* BasemapDownloadCard removed — not needed in either mode */}

      <PlanDrawer
        open={drawOpen}
        onClose={() => setDrawOpen(false)}
        currentPlanId={plan.plan_id}
        onNewTrip={async () => {
          if (!isOnline) {
            setOfflineModalOpen(true);
            return;
          }
          const gate = await checkTripGate();
          if (gate.allowed) {
            router.push("/new");
          } else {
            setPaywallVariant("gate");
            setPaywallOpen(true);
          }
        }}
      />

      <InviteCodeModal
        open={inviteOpen}
        planId={plan.plan_id}
        mode={inviteMode}
        onClose={() => setInviteOpen(false)}
        onRedeemed={(joinedPlanId) => {
          router.replace(`/trip?plan_id=${encodeURIComponent(joinedPlanId)}`);
        }}
      />

      {/* Share — renders card off-screen, invokes OS share sheet (native or Web Share API) */}
      {nativeSharePayload && (
        <NativeShareRenderer
          data={nativeSharePayload.data}
          mapImageUrl={nativeSharePayload.mapImageUrl}
          tripLabel={nativeSharePayload.label}
          onDone={() => setNativeSharePayload(null)}
          onError={() => setNativeSharePayload(null)}
        />
      )}

      <PaywallModal
        open={paywallOpen}
        variant={paywallVariant}
        onClose={() => setPaywallOpen(false)}
        onUnlocked={() => { setPaywallOpen(false); setUnlocked(true); }}
      />

      {/* Offline modal — shown when user taps "New" while offline */}
      {offlineModalOpen && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOfflineModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(10, 8, 6, 0.75)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: "var(--surface-card, #f4efe6)",
              borderRadius: 20,
              overflow: "hidden",
              textAlign: "center",
            }}
          >
            <div style={{
              padding: "32px 28px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "var(--roam-surface-hover, rgba(26,22,19,0.05))",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <WifiOff size={28} strokeWidth={1.8} style={{ color: "var(--roam-text-muted, #7a7067)" }} />
              </div>

              <h2 style={{
                margin: 0, fontSize: 18, fontWeight: 800,
                color: "var(--roam-text, #1a1613)",
              }}>
                You&apos;re offline
              </h2>

              <p style={{
                margin: 0, fontSize: 14, fontWeight: 500,
                color: "var(--roam-text-muted, #7a7067)",
                lineHeight: 1.5,
              }}>
                Creating a new trip requires an internet connection to fetch routes and maps. Reconnect and try again.
              </p>
            </div>

            <div style={{ padding: "0 28px 24px" }}>
              <button
                type="button"
                onClick={() => { haptic.light(); setOfflineModalOpen(false); }}
                style={{
                  width: "100%",
                  background: "var(--roam-accent)",
                  color: "var(--on-color, #faf6ef)",
                  border: "none",
                  padding: "14px",
                  borderRadius: "var(--r-btn, 14px)",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "var(--shadow-button)",
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Bottom Sheet — extra 300px below absorbs spring overshoot so
           the bottom edge never lifts above the tab bar */}
      <div
        ref={sheetRef}
        className="trip-bottom-sheet"
        style={{
          position: "absolute",
          bottom: -300, left: 0, right: 0,
          height: "calc(100% - 80px + 300px)",
          zIndex: 20,
          transform: sheetTransform,
          transition: sheetTransition,
          willChange: "transform",
        }}
      >
        {/* ── Elevation profile strip (between map and sheet) — hidden in simple mode ── */}
        {!isSimple && elevation?.profile && (
          <div style={{
            position: "relative",
            zIndex: 1,
            borderRadius: "28px 28px 0 0",
            overflow: "hidden",
          }}>
            <ElevationStrip
              profile={elevation.profile}
              gradeSegments={elevation.grade_segments}
              currentKm={activeNav.isActive ? activeNav.nav.kmAlongRoute : currentKm || null}
              viewportKmRange={viewportKmRange}
              onTapLocation={handleElevTap}
              collapsed={elevCollapsed}
              onToggleCollapse={() => setElevCollapsed((c) => !c)}
            />
          </div>
        )}

        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            padding: elevation?.profile ? "8px 20px 6px" : "16px 20px 6px",
            touchAction: "none",
            cursor: "grab",
          }}
        >
          <div className="trip-drag-handle" />
        </div>

        {/* Header */}
        <div style={{ padding: "0 20px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: isSimple ? 22 : 18, fontWeight: isSimple ? 900 : 800, margin: 0,
                  color: "var(--roam-text)", letterSpacing: "-0.3px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {plan.label ?? "Trip Plan"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                className="trip-interactive trip-btn-icon"
                aria-label="Plans"
                onClick={() => { haptic.selection(); setPlansDot(false); setDrawOpen(true); }}
                style={{
                  borderRadius: 10, width: 40, height: 40,
                  display: "grid", placeItems: "center",
                  background: "transparent", color: "var(--roam-text-muted)",
                  border: "none",
                  position: "relative",
                }}
              >
                <Library size={16} strokeWidth={1.8} />
                {plansDot && (
                  <span
                    aria-label="New plan available"
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--roam-accent, #b5452e)",
                      border: "2px solid var(--roam-surface, #f4efe6)",
                      pointerEvents: "none",
                    }}
                  />
                )}
              </button>

              {/* Invite — hidden in simple mode */}
              {!isSimple && (
                <button
                  type="button"
                  className="trip-interactive trip-btn-icon"
                  aria-label="Invite"
                  onClick={() => { haptic.selection(); setInviteMode("create"); setInviteOpen(true); }}
                  style={{
                    borderRadius: 10, width: 40, height: 40,
                    display: "grid", placeItems: "center",
                    background: "transparent", color: "var(--roam-text-muted)",
                    border: "none",
                  }}
                >
                  <UserPlus size={16} strokeWidth={1.8} />
                </button>
              )}

              {/* Share — hidden in simple mode */}
              {!isSimple && (
                <button
                  type="button"
                  className="trip-interactive trip-btn-icon"
                  aria-label="Share trip card"
                  onClick={() => {
                    haptic.selection();
                    const preview = plan?.preview;
                    if (!preview) return;
                    const cardData: ShareCardData = {
                      stops: preview.stops,
                      geometry: preview.geometry,
                      distance_m: preview.distance_m,
                      duration_s: preview.duration_s,
                      label: plan?.label ?? null,
                    };
                    const label = plan?.label?.trim() || (() => {
                      const s = preview.stops.find((x) => x.type === "start");
                      const e = preview.stops.find((x) => x.type === "end");
                      return `${s?.name || "Start"} → ${e?.name || "End"}`;
                    })();
                    // Capture map snapshot then invoke OS share sheet (native or Web Share API)
                    captureMapSnapshot(preview.bbox).then((mapImageUrl) => {
                      setNativeSharePayload({ data: cardData, mapImageUrl, label });
                    });
                  }}
                  style={{
                    borderRadius: 10, width: 40, height: 40,
                    display: "grid", placeItems: "center",
                    background: "transparent", color: "var(--roam-text-muted)",
                    border: "none",
                  }}
                >
                  <ImageIcon size={16} strokeWidth={1.8} />
                </button>
              )}

              {/* Upgrade — show when NOT unlocked; hide Untethered badge when already unlocked */}
              {unlocked ? null : unlocked === false ? (
                <button
                  type="button"
                  className="trip-interactive"
                  aria-label="Upgrade to Roam Untethered"
                  onClick={() => { haptic.selection(); setPaywallVariant("upgrade"); setPaywallOpen(true); }}
                  style={{
                    position: "relative",
                    display: "flex", alignItems: "center", gap: 4,
                    background: "linear-gradient(135deg, #122d1e 0%, var(--brand-eucalypt-dark, #1f5236) 40%, var(--brand-eucalypt, #2d6e40) 80%, #3d8f54 100%)",
                    borderRadius: 10, padding: "0 12px",
                    height: 40, border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer",
                    boxShadow: "0 2px 10px rgba(31,82,54,0.40), inset 0 1px 0 rgba(255,255,255,0.10)",
                    overflow: "hidden",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.10) 50%, transparent 70%)",
                    borderRadius: "inherit", pointerEvents: "none",
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: "0.06em", textTransform: "uppercase", position: "relative" }}>
                    Upgrade
                  </span>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, position: "relative" }}>
                    <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: "hidden", touchAction: "pan-y" }}>
          <div
            className="roam-scroll"
            style={{
              height: "100%",
              overflowY: "auto",
              padding: "0 20px calc(var(--bottom-nav-height) + 320px)",
            }}
          >
            {/* ── Start Navigation button (shown when NOT actively navigating) ── */}
            {!activeNav.isActive && navpack && (
              <div style={{ marginBottom: 16 }}>
                <StartNavigationButton
                  onStart={handleStartNavigation}
                  disabled={!navpack?.primary?.legs?.some((l) => l.steps && l.steps.length > 0)}
                />
                {!navpack?.primary?.legs?.some((l) => l.steps && l.steps.length > 0) && (
                  <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: "var(--roam-text-muted)", textAlign: "center" }}>
                    Rebuild route to enable turn-by-turn
                  </div>
                )}
              </div>
            )}

            {/* ── Route intelligence score ── */}
            {routeScore && !activeNav.isActive && (
              <div style={{ marginBottom: 16 }}>
                <RouteScoreCard score={routeScore} simple={isSimple} />
              </div>
            )}

            {/* ── Flood route warning banner ── */}
            {flood?.route_passes_through_warning && (
              <div style={{
                marginBottom: 12,
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#ef4444" }}>
                    Flood Warning on Route
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--roam-text-muted)", marginTop: 2 }}>
                    Your route passes through an active flood warning catchment. Check conditions before travel.
                  </div>
                </div>
              </div>
            )}

            {/* ── Fatigue gap warnings from backend ── */}
            {restAreas?.fatigue_warnings?.filter((w) => w.type === "long_gap").map((w, i) => (
              <div key={`fatigue-${i}`} style={{
                marginBottom: 8,
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.2)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--roam-text)", lineHeight: 1.4 }}>
                  {w.message}
                </div>
              </div>
            ))}

            <TripView
              planId={plan.plan_id}
              navpack={navpack}
              corridor={corridor}
              places={places}
              traffic={traffic}
              hazards={hazards}
              simple={isSimple}
              focusedStopId={focusedStopId}
              onFocusStop={(id) => {
                setFocusedStopId(id);
                setSheetSnap("peek");    // collapse sheet to peek so the map is visible
              }}
              focusedPlaceId={focusedPlaceId}
              onFocusPlace={setFocusedPlaceId}
              onRebuildRequested={handleRebuild}
              highlightedAlertId={highlightedAlertId}
              onHighlightAlert={handleHighlightAlert}
              userPosition={effectivePosition}
              fuelAnalysis={fuelAnalysis}
              onOpenFuelSettings={() => setFuelSettingsOpen(true)}
              offlineRouted={offlineRouted}
              isOnline={isOnline}
              onFilteredIdsChange={setFilteredPlaceIds}
              onStopQuickAction={(action, stopId) => {
                if (action === "add-note") {
                  const idx = effectiveStops.findIndex((st) => st.id === stopId);
                  const stop = effectiveStops[idx];
                  if (stop) {
                    setMemorySheetStop({
                      stopId: stop.id ?? `stop-${idx}`,
                      stopName: stop.name ?? null,
                      stopIndex: idx,
                      lat: stop.lat,
                      lng: stop.lng,
                    });
                    setMemorySheetOpen(true);
                  }
                }
              }}
            />
          </div>
        </div>
      </div>{/* end trip-bottom-sheet */}

      {/* ── Stop memory sheet (note + photos) — hidden in simple mode ── */}
      {!isSimple && memorySheetStop && plan && (
        <StopMemorySheet
          open={memorySheetOpen}
          planId={plan.plan_id}
          stopId={memorySheetStop.stopId}
          stopName={memorySheetStop.stopName}
          stopIndex={memorySheetStop.stopIndex}
          lat={memorySheetStop.lat}
          lng={memorySheetStop.lng}
          onClose={() => {
            setMemorySheetOpen(false);
            // Mark this stop as dismissed so proximity won't re-prompt this session
            if (plan) dismissProximityStop(plan.plan_id, memorySheetStop.stopId);
          }}
        />
      )}

      {/* ── Active Navigation Overlays ──
           Rendered last in the tree so they sit above the bottom sheet
           and all other layers in the stacking context.
           NavModeOverlay fires a cinematic flash + vignette when active flips true. */}
      <NavModeOverlay active={activeNav.isActive}>
        <NavigationHUD
          nav={activeNav.nav}
          visible={activeNav.isActive && activeNav.nav.status !== "off_route"}
          simple={isSimple}
        />
        <OffRouteBanner
          visible={activeNav.nav.status === "off_route"}
          distFromRoute_m={activeNav.nav.distFromRoute_m}
          hasCorridorGraph={!!corridor}
          onReroute={handleOffRouteReroute}
        />
        <NavigationControls
          visible={activeNav.isActive}
          isMuted={activeNav.isMuted}
          onToggleMute={activeNav.toggleMute}
          onOverview={mapNavMode.showOverview}
          onRecenter={mapNavMode.recenter}
          onEnd={activeNav.stop}
        />
        {activeNav.isActive && !isSimple && (
          <div style={{
            position: "absolute",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--roam-tab-h, 64px) + 130px)",
            right: 12,
            zIndex: 31,
            pointerEvents: "auto",
          }}>
            <QuickReportWheel
              position={effectivePosition}
              onSubmit={observations.submit}
            />
          </div>
        )}
        <NavigationBar
          nav={activeNav.nav}
          fuelTracking={fuelTracking}
          visible={activeNav.isActive}
          simple={isSimple}
          onTap={() => {
            setSheetSnap("expanded");
            setTimeout(() => setSheetSnap("peek"), 8000);
          }}
        />
      </NavModeOverlay>

      <style>{`
        .map-fab-btn {
          background: linear-gradient(160deg, rgba(255,255,255,0.92) 0%, rgba(244,239,230,0.96) 100%);
          color: var(--text-main, #1a1613);
          border: 1px solid rgba(0,0,0,0.10);
          box-shadow: 0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.06);
        }
        @media (prefers-color-scheme: dark) {
          .map-fab-btn {
            background: linear-gradient(160deg, rgba(26,21,16,0.96) 0%, rgba(16,13,10,0.98) 100%);
            color: var(--on-color);
            border: 1px solid rgba(255,255,255,0.09);
            box-shadow: 0 4px 16px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.15);
          }
        }
      `}</style>
    </div>
  );
}
