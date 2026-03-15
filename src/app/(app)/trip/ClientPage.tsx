// src/app/trip/ClientPage.tsx
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import type { Map as MLMap } from "maplibre-gl";

import { TripMap } from "@/components/trip/TripMap";
import { TripView, type TripEditorRebuildMode } from "@/components/trip/TripView";
import type { AlertHighlightEvent } from "@/components/trip/TripAlertsPanel";
import { SyncStatusBadge } from "@/components/ui/SyncStatusBadge";
import { InviteCodeModal } from "@/components/plans/InviteCodeModal";
import { PlanDrawer } from "@/components/trip/PlanDrawer";
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
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";

import { haptic } from "@/lib/native/haptics";
import { getCurrentPlanId, getOfflinePlan, listOfflinePlans, setCurrentPlanId, updateOfflinePlan, type OfflinePlanRecord } from "@/lib/offline/plansStore";
import { getAllPacks, hasCorePacks, putPack, putPacksAtomic } from "@/lib/offline/packsStore";
import { unpackAndStoreBundle } from "@/lib/offline/unpackBundle";
import { getVehicleFuelProfile } from "@/lib/offline/fuelProfileStore";
import { rebuildNavpackOfflineWithFuel } from "@/lib/offline/rebuildNavpack";

import { navApi } from "@/lib/api/nav";

import { analyzeFuel, computeFuelTracking } from "@/lib/nav/fuelAnalysis";
import { decodePolyline6 } from "@/lib/nav/polyline6";
import { cumulativeKm, snapToPolyline } from "@/lib/nav/snapToRoute";
import { shortId } from "@/lib/utils/ids";

import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay, ElevationResponse } from "@/lib/types/navigation";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";
import type { TripStop } from "@/lib/types/trip";
import type { FuelAnalysis, FuelTrackingState, VehicleFuelProfile } from "@/lib/types/fuel";

// Updated icons here
import { UserPlus, Library, WifiOff } from "lucide-react";
import { TripSkeleton } from "./TripSkeleton";
import { isUnlocked as checkIsUnlocked, checkTripGate } from "@/lib/paywall/tripGate";
import { PaywallModal } from "@/components/paywall/PaywallModal";

/* ── Constants ────────────────────────────────────────────────────────── */

/** Poll overlays every 90 seconds */
const OVERLAY_POLL_INTERVAL_MS = 90_000;

/* ── Boot phases ──────────────────────────────────────────────────────── */

type BootPhase = "resolving" | "hydrating" | "ready" | "error";

/* ── Component ────────────────────────────────────────────────────────── */

export function TripClientPage(props: { initialPlanId: string | null }) {
  const router = useRouter();
  const sp = useSearchParams();

  const planIdFromUrl = sp.get("plan_id");
  const focusPlaceFromUrl = sp.get("focus_place_id");
  const focusLatFromUrl = sp.get("focus_lat");
  const focusLngFromUrl = sp.get("focus_lng");

  const desiredPlanId = useMemo(
    () => props.initialPlanId ?? planIdFromUrl ?? null,
    [props.initialPlanId, planIdFromUrl],
  );

  // Native hooks
  const geo = useGeolocation({ autoStart: true, highAccuracy: true });
  useKeepAwake({ auto: true });
  const { online: isOnline } = useNetworkStatus();

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

  // Offline routing indicator — true when last rebuild used corridor A* instead of OSRM
  const [offlineRouted, setOfflineRouted] = useState(false);

  // UI State
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null);
  const [highlightedAlertId, setHighlightedAlertId] = useState<string | null>(null);

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"create" | "redeem">("create");

  // Plans drawer state
  const [drawOpen, setDrawOpen] = useState(false);

  // Plan status (Untethered)
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallVariant, setPaywallVariant] = useState<"gate" | "upgrade">("upgrade");

  // Offline modal
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);

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

  // ── Re-apply URL focus once places load (timing race fix) ─────────
  useEffect(() => {
    const fp = sp.get("focus_place_id");
    if (fp && places && places.items?.length > 0) {
      // Only set if not already focused (avoid infinite loop)
      setFocusedPlaceId((prev) => (prev === fp ? prev : fp));
    }
  }, [places, sp]);

  // ── Boot logic ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const preferredId = desiredPlanId ?? (await getCurrentPlanId());
        if (cancelled) return;

        // Find the first plan that has a usable local bundle.
        // A plan is usable if its packs are already in IDB, or if it has a
        // zip_blob we can unpack. Cloud-synced stubs (no zip, no packs) are
        // skipped so they never surface the "Plan has no zip blob" error.
        let rec: OfflinePlanRecord | undefined;
        if (preferredId) {
          const preferred = await getOfflinePlan(preferredId);
          if (preferred) {
            const hasPacks = await hasCorePacks(preferred.plan_id);
            if (hasPacks || preferred.zip_blob) rec = preferred;
          }
        }

        if (!rec) {
          // Preferred plan wasn't usable — scan all plans for one that is
          const all = await listOfflinePlans();
          for (const candidate of all) {
            const hasPacks = await hasCorePacks(candidate.plan_id);
            if (hasPacks || candidate.zip_blob) { rec = candidate; break; }
          }
        }

        if (cancelled) return;
        if (!rec) { router.replace("/new"); return; }

        // If we fell back to a different plan, update the current pointer
        if (rec.plan_id !== preferredId) {
          await setCurrentPlanId(rec.plan_id);
        }

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
            const analysis = analyzeFuel(
              packs.navpack.primary.geometry,
              packs.places.items,
              fuelProfile,
              packs.navpack.primary.route_key,
              placesKeyNow,
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
      // Non-fatal - just skip this update
    }
  }, [fuelAnalysis, effectivePosition, navpack]);

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
  // Falls back to offline corridor A* routing when the backend is unreachable.
  const handleRebuild = useCallback(async (args: { stops: TripStop[]; mode: TripEditorRebuildMode }) => {
    const planId = plan?.plan_id;

    // ── Offline path: use corridor A* ───────────────────────────────
    if (!isOnline && corridor) {
      const prev = navpack ?? {
        req: { stops: args.stops, profile: "drive" },
        primary: { profile: "drive", provider: "corridor", algo_version: "offline.astar.v1", route_key: "", geometry: "", bbox: { minLng: 0, minLat: 0, maxLng: 0, maxLat: 0 }, distance_m: 0, duration_s: 0, legs: [], created_at: new Date().toISOString() },
        alternates: { alternates: [] },
      } as NavPack;
      const routeKey = `offline_${shortId(12)}`;
      const { navpack: offlineNavpack, fuelAnalysis: offlineFuel } = await rebuildNavpackOfflineWithFuel({
        planId: planId ?? "",
        prevNavpack: prev,
        corridor,
        stops: args.stops,
        route_key: routeKey,
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
      result = await navApi.route({
        profile: navpack?.primary?.profile ?? "drive",
        stops: args.stops,
      });
    } catch (onlineErr) {
      // ── Fallback: corridor A* when online OSRM fails ────────────
      if (corridor && navpack) {
        console.warn("[Trip] online rebuild failed, falling back to offline corridor A*:", onlineErr);
        const routeKey = `offline_fallback_${shortId(12)}`;
        const { navpack: offlineNavpack, fuelAnalysis: offlineFuel } = await rebuildNavpackOfflineWithFuel({
          planId: planId ?? "",
          prevNavpack: navpack,
          corridor,
          stops: args.stops,
          route_key: routeKey,
          reason: "online_fallback",
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
      // No corridor available either — rethrow so UI shows the error
      throw onlineErr;
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
  }, [navpack, plan, places, corridor, isOnline]);

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
  // Falls back to offline corridor A* when the backend is unreachable.
  const handleOffRouteReroute = useCallback(async () => {
    if (!activeNav.lastPosition || !navpack) return;

    const currentPos = activeNav.lastPosition;
    const allStops = navpack.req.stops;

    const remainingStops: TripStop[] = [
      {
        id: "__reroute_origin",
        name: "Current Location",
        type: "start" as any,
        lat: currentPos.lat,
        lng: currentPos.lng,
      },
      ...allStops.filter((s) => s.type !== "start"),
    ];

    try {
      // ── Offline: corridor A* reroute ────────────────────────────
      if (!isOnline && corridor) {
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
        return;
      }

      // ── Online: OSRM reroute ────────────────────────────────────
      const result = await navApi.route({
        profile: navpack.primary.profile,
        stops: remainingStops,
      });
      setNavpack(result);
      setOfflineRouted(false);
      activeNav.applyReroute(result);
    } catch (e) {
      // Last resort: try offline A* even if we thought we were online
      if (corridor) {
        try {
          const routeKey = `offline_reroute_fallback_${shortId(12)}`;
          const { navpack: fallbackNavpack, fuelAnalysis: fallbackFuel } = await rebuildNavpackOfflineWithFuel({
            planId: plan?.plan_id ?? "",
            prevNavpack: navpack,
            corridor,
            stops: remainingStops,
            route_key: routeKey,
            reason: "off_route_reroute_fallback",
          });

          setNavpack(fallbackNavpack);
          setOfflineRouted(true);
          if (fallbackFuel) setFuelAnalysis(fallbackFuel as FuelAnalysis);
          activeNav.applyReroute(fallbackNavpack);
          return;
        } catch (offlineErr) {
          console.warn("[Trip] offline reroute fallback also failed:", offlineErr);
        }
      }
      console.warn("[Trip] reroute failed:", e);
    }
  }, [activeNav, navpack, corridor, isOnline, plan]);

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
    const maxUp = -(sheetHeight - 220);
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
  const peekBase = `calc(100% - 220px - var(--roam-safe-bottom, 0px))`;
  const sheetTransform = activeNav.isActive
    ? `translateY(calc(100% - 60px))` // Collapsed to just the drag handle during navigation
    : `translateY(clamp(0px, calc(${peekBase} + ${offsetY + dragOffset}px), ${peekBase}))`;

  const sheetTransition = isDragging.current ? "none" : "transform 0.25s cubic-bezier(0.4,0,0.2,1)";

  const effectiveStops = navpack?.req?.stops ?? plan?.preview?.stops ?? [];
  const effectiveGeom = navpack?.primary?.geometry ?? plan?.preview?.geometry ?? null;

  // Current km along route for fuel tracking + elevation strip
  const currentKm = useMemo(() => {
    if (!fuelTracking) return 0;
    return fuelTracking.km_since_last_fuel + (fuelTracking.last_passed_station?.km_along_route ?? 0);
  }, [fuelTracking]);

  // ── Render gates ────────────────────────────────────────────────
  if (phase === "resolving") {
    return <TripSkeleton />;
  }

  if (phase === "error") {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%", width: "100%", background: "var(--roam-bg)", color: "var(--roam-text)", padding: 32, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 950, color: "var(--roam-danger)", marginBottom: 12 }}>
            Failed to load trip
          </div>
          {bootError && <div style={{ fontSize: 13, color: "var(--roam-text-muted)", marginBottom: 20 }}>{bootError}</div>}
          <button
            type="button"
            className="trip-interactive"
            style={{ borderRadius: 999, minHeight: 42, padding: "0 20px", fontWeight: 950, background: "var(--roam-accent)", color: "var(--on-color)", boxShadow: "var(--shadow-button)" }}
            onClick={() => router.replace("/new")}
          >
            Build a Trip
          </button>
        </div>
      </div>
    );
  }

  if (phase === "hydrating" || !plan || !effectiveGeom || !effectiveBbox) {
    return <TripSkeleton />;
  }

  // ── Ready ──────────────────────────────────────────────────────
  return (
    <div className="trip-app-container">
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
          focusFallbackCoord={focusLatFromUrl && focusLngFromUrl ? [parseFloat(focusLngFromUrl), parseFloat(focusLatFromUrl)] : null}
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
      <NavigationHUD
        nav={activeNav.nav}
        visible={activeNav.isActive && activeNav.nav.status !== "off_route"}
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
      <NavigationBar
        nav={activeNav.nav}
        fuelTracking={fuelTracking}
        visible={activeNav.isActive}
        onTap={() => {
          if (sheetRef.current) {
            const h = sheetRef.current.clientHeight;
            setOffsetY(-(h - 300));
            setTimeout(() => setOffsetY(0), 8000);
          }
        }}
      />

      {!activeNav.isActive && <FuelPressureIndicator tracking={fuelTracking} />}
      <FuelLastChanceToast tracking={fuelTracking} currentKm={currentKm} />
      <VehicleFuelSettings
        open={fuelSettingsOpen}
        onClose={() => setFuelSettingsOpen(false)}
        onSaved={handleFuelProfileSaved}
      />

      {!activeNav.isActive && (
        <div style={{ position: "absolute", top: 56, left: 12, right: 12, zIndex: 15, pointerEvents: "auto" }}>
          <BasemapDownloadCard region="australia"/>
        </div>
      )}

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

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="trip-bottom-sheet"
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: "calc(100% - 80px)",
          zIndex: 20,
          transform: sheetTransform,
          transition: sheetTransition,
          willChange: "transform",
        }}
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            padding: "16px 20px 6px",
            touchAction: "none",
            cursor: "grab",
          }}
        >
          <div className="trip-drag-handle" />
        </div>

        {/* Header */}
        <div style={{ padding: "0 20px 12px" }}>
          {/* Top Row: Title + Icon Buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 20, fontWeight: 950, margin: 0,
                  display: "flex", alignItems: "center", gap: 10,
                  color: "var(--roam-text)", letterSpacing: "-0.3px",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {plan.label ?? "Trip Plan"}
                </span>
                <SyncStatusBadge />
              </div>
            </div>

            {/* Circular Action Buttons */}
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                className="trip-interactive trip-btn-icon"
                aria-label="Plans"
                onClick={() => { haptic.selection(); setDrawOpen(true); }}
                style={{
                  borderRadius: 999, width: 40, height: 40,
                  display: "grid", placeItems: "center",
                  background: "rgba(0, 0, 0, 0.08)", color: "var(--roam-text)",
                }}
              >
                <Library size={18} />
              </button>

              <button
                type="button"
                className="trip-interactive trip-btn-icon"
                aria-label="Invite"
                onClick={() => { haptic.selection(); setInviteMode("create"); setInviteOpen(true); }}
                style={{
                  borderRadius: 999, width: 40, height: 40,
                  display: "grid", placeItems: "center",
                  background: "rgba(0, 0, 0, 0.08)", color: "var(--roam-text)",
                }}
              >
                <UserPlus size={18} />
              </button>

              {unlocked ? (
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    background: "linear-gradient(135deg, var(--brand-ochre, #b5452e) 0%, #d4664a 100%)",
                    borderRadius: 999, padding: "6px 14px",
                    height: 40, border: "none", cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(181,69,46,0.25)",
                  }}
                  title="Roam Untethered"
                >
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    Untethered
                  </span>
                </div>
              ) : unlocked === false ? (
                <button
                  type="button"
                  className="trip-interactive"
                  aria-label="Upgrade to Roam Untethered"
                  onClick={() => { haptic.selection(); setPaywallVariant("upgrade"); setPaywallOpen(true); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    background: "linear-gradient(135deg, var(--brand-eucalypt-dark, #1f5236) 0%, var(--brand-eucalypt, #2d6e40) 100%)",
                    borderRadius: 999, padding: "6px 12px",
                    height: 40,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: "0.02em" }}>
                    Upgrade
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          {/* ── Start Navigation button (shown when NOT actively navigating) ── */}
          {!activeNav.isActive && navpack && (
            <div style={{ marginTop: 12 }}>
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

          {/* ── Elevation strip ── */}
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
        <div style={{ flex: 1, overflow: "hidden", touchAction: "pan-y" }}>
          <div
            className="roam-scroll"
            style={{
              height: "100%",
              overflowY: "auto",
              padding: "0 20px calc(var(--bottom-nav-height) + 20px)",
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
              offlineRouted={offlineRouted}
              isOnline={isOnline}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
