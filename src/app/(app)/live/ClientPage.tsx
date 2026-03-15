// src/app/live/ClientPage.tsx
// Online-only "Go Now" trip — instant navigation without offline bundles.
// No IDB storage, no corridor, no bundle build. Just route + navigate.
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Map as MLMap } from "maplibre-gl";

import { TripMap } from "@/components/trip/TripMap";
import { TripView, type TripEditorRebuildMode } from "@/components/trip/TripView";

// ── Active navigation components ──
import { NavigationHUD } from "@/components/nav/NavigationHUD";
import { NavigationBar } from "@/components/nav/NavigationBar";
import { NavigationControls } from "@/components/nav/NavigationControls";
import { OffRouteBanner } from "@/components/nav/OffRouteBanner";
import { StartNavigationButton } from "@/components/nav/StartNavigationButton";

// ── Hooks ──
import { useGeolocation } from "@/lib/native/geolocation";
import { useKeepAwake } from "@/lib/native/keepAwake";
import { useActiveNavigation } from "@/lib/hooks/useActiveNavigation";
import { useMapNavigationMode } from "@/lib/hooks/useMapNavigationMode";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";

import { haptic } from "@/lib/native/haptics";
import { navApi } from "@/lib/api/nav";

import type { NavPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { TripStop } from "@/lib/types/trip";

import { Radio } from "lucide-react";

/* ── Constants ────────────────────────────────────────────────────────── */

const LIVE_NAVPACK_KEY = "roam_live_navpack";
const OVERLAY_POLL_INTERVAL_MS = 90_000;

/* ── Session helpers ─────────────────────────────────────────────────── */

function loadLiveNavPack(): NavPack | null {
  try {
    const raw = sessionStorage.getItem(LIVE_NAVPACK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NavPack;
  } catch {
    return null;
  }
}

function clearLiveNavPack(): void {
  try { sessionStorage.removeItem(LIVE_NAVPACK_KEY); } catch {}
}

/* ── Component ────────────────────────────────────────────────────────── */

export default function LiveTripClientPage() {
  const router = useRouter();

  // Native hooks
  const geo = useGeolocation({ autoStart: true, highAccuracy: true });
  useKeepAwake({ auto: true });
  const { online: isOnline } = useNetworkStatus();

  // Stable ID for this live session (not persisted)
  const livePlanId = useRef(`live_${Date.now().toString(36)}`);

  // Core state
  const [navpack, setNavpack] = useState<NavPack | null>(null);
  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  // Overlay state (polled live, never persisted)
  const [traffic, setTraffic] = useState<TrafficOverlay | null>(null);
  const [hazards, setHazards] = useState<HazardOverlay | null>(null);

  // UI state
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // MapLibre instance ref
  const mapInstanceRef = useRef<MLMap | null>(null);

  // Active navigation
  const activeNav = useActiveNavigation(navpack);

  // Map navigation mode
  const effectiveBbox = navpack?.primary?.bbox ?? null;
  const mapNavMode = useMapNavigationMode({
    mapRef: mapInstanceRef,
    position: activeNav.isActive ? (activeNav.lastPosition ?? geo.position) : null,
    active: activeNav.isActive,
    bbox: effectiveBbox,
  });

  // Bottom sheet drag state
  const sheetRef = useRef<HTMLDivElement>(null);
  const [offsetY, setOffsetY] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const dragData = useRef({ startY: 0 });

  // Collapse sheet when entering navigation
  const [prevActive, setPrevActive] = useState(false);
  if (activeNav.isActive && !prevActive) {
    setOffsetY(0);
    setDragOffset(0);
    setPrevActive(true);
  } else if (!activeNav.isActive && prevActive) {
    setPrevActive(false);
  }

  // ── Boot: load NavPack from sessionStorage ──────────────────────
  // We intentionally do NOT clear sessionStorage here — React StrictMode
  // double-fires effects, and clearing on the first mount would leave
  // the second mount with nothing. sessionStorage auto-clears on tab close.
  useEffect(() => {
    const pack = loadLiveNavPack();
    if (!pack) {
      setBootError("No route data found");
      return;
    }
    setNavpack(pack);
    setBooted(true);
  }, []);

  // ── Overlay polling ─────────────────────────────────────────────
  const pollOverlays = useCallback(async () => {
    if (!isOnline || !navpack?.primary?.bbox) return;
    const bbox = navpack.primary.bbox;
    try {
      const [t, h] = await Promise.allSettled([
        navApi.trafficPoll({ bbox, cache_seconds: 90 }),
        navApi.hazardsPoll({ bbox, cache_seconds: 90 }),
      ]);
      if (t.status === "fulfilled") setTraffic(t.value);
      if (h.status === "fulfilled") setHazards(h.value);
    } catch (e) {
      console.warn("[Live] overlay poll failed:", e);
    }
  }, [navpack, isOnline]);

  useEffect(() => {
    if (!booted || !navpack?.primary?.bbox) return;
    const initialPoll = setTimeout(pollOverlays, 0);
    overlayTimerRef.current = setInterval(pollOverlays, OVERLAY_POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initialPoll);
      if (overlayTimerRef.current) {
        clearInterval(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
    };
  }, [booted, navpack, pollOverlays]);

  // ── Rebuild handler (online-only rerouting) ──────────────────────
  const handleRebuild = useCallback(async (args: { stops: TripStop[]; mode: TripEditorRebuildMode }) => {
    const result = await navApi.route({
      profile: navpack?.primary?.profile ?? "drive",
      stops: args.stops,
    });
    setNavpack(result);
  }, [navpack]);

  // ── Off-route reroute handler ────────────────────────────────────
  const handleOffRouteReroute = useCallback(async () => {
    if (!activeNav.lastPosition || !navpack) return;
    const currentPos = activeNav.lastPosition;
    const remainingStops: TripStop[] = [
      { id: "__reroute_origin", name: "Current Location", type: "start", lat: currentPos.lat, lng: currentPos.lng },
      ...navpack.req.stops.filter((s) => s.type !== "start"),
    ];
    try {
      const result = await navApi.route({
        profile: navpack.primary.profile,
        stops: remainingStops,
      });
      setNavpack(result);
      activeNav.applyReroute(result);
    } catch (e) {
      console.warn("[Live] reroute failed:", e);
    }
  }, [activeNav, navpack]);

  // ── Bottom sheet drag handlers ──────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    setIsDraggingState(true);
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
    setIsDraggingState(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    setOffsetY((prev) => prev + dragOffset);
    setDragOffset(0);
  };

  // ── Derived values ──────────────────────────────────────────────
  const effectiveStops = useMemo(() => navpack?.req?.stops ?? [], [navpack]);
  const effectiveGeom = navpack?.primary?.geometry ?? null;
  const effectivePosition = activeNav.isActive ? activeNav.lastPosition : geo.position;

  const peekBase = `calc(100% - 220px - var(--roam-safe-bottom, 0px))`;
  const sheetTransform = activeNav.isActive
    ? `translateY(calc(100% - 60px))`
    : `translateY(clamp(0px, calc(${peekBase} + ${offsetY + dragOffset}px), ${peekBase}))`;
  const sheetTransition = isDraggingState ? "none" : "transform 0.25s cubic-bezier(0.4,0,0.2,1)";

  // ── Error / loading gates ───────────────────────────────────────
  if (bootError) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%", width: "100%", background: "var(--roam-bg)", color: "var(--roam-text)", padding: 32, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 950, color: "var(--roam-danger)", marginBottom: 12 }}>
            No route loaded
          </div>
          <div style={{ fontSize: 13, color: "var(--roam-text-muted)", marginBottom: 20 }}>
            {bootError}
          </div>
          <button
            type="button"
            className="trip-interactive"
            style={{ borderRadius: 999, minHeight: 42, padding: "0 20px", fontWeight: 950, background: "var(--roam-accent)", color: "var(--on-color)", boxShadow: "var(--shadow-button)" }}
            onClick={() => router.replace("/new")}
          >
            Plan a Trip
          </button>
        </div>
      </div>
    );
  }

  if (!booted || !navpack || !effectiveGeom || !effectiveBbox) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%", width: "100%", background: "var(--roam-bg)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--roam-text-muted)" }}>Loading route…</div>
      </div>
    );
  }

  // ── Ready ───────────────────────────────────────────────────────
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
          traffic={traffic}
          hazards={hazards}
          onTrafficEventPress={(_id) => { haptic.selection(); }}
          onHazardEventPress={(_id) => { haptic.selection(); }}
          userPosition={activeNav.isActive ? activeNav.lastPosition : geo.position}
          isOnline={isOnline}
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
        hasCorridorGraph={false}
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
        fuelTracking={null}
        visible={activeNav.isActive}
        onTap={() => {
          if (sheetRef.current) {
            const h = sheetRef.current.clientHeight;
            setOffsetY(-(h - 300));
            setTimeout(() => setOffsetY(0), 8000);
          }
        }}
      />

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
                  Live Trip
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 999,
                  background: "rgba(34, 197, 94, 0.12)", color: "#16a34a",
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.04em",
                  textTransform: "uppercase", flexShrink: 0,
                  border: "1px solid rgba(34, 197, 94, 0.2)",
                }}>
                  <Radio size={10} strokeWidth={3} />
                  Live
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--roam-text-muted)", marginTop: 2 }}>
                Online only &middot; not saved to device
              </div>
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
              padding: "0 20px calc(var(--bottom-nav-height) + 20px)",
            }}
          >
            {/* Start Navigation button */}
            {!activeNav.isActive && navpack && (
              <div style={{ marginBottom: 16 }}>
                <StartNavigationButton
                  onStart={activeNav.start}
                  disabled={!navpack?.primary?.legs?.some((l) => l.steps && l.steps.length > 0)}
                />
                {!navpack?.primary?.legs?.some((l) => l.steps && l.steps.length > 0) && (
                  <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "var(--roam-text-muted)", textAlign: "center" }}>
                    Turn-by-turn data not available.
                  </div>
                )}
              </div>
            )}

            <TripView
              planId={livePlanId.current}
              navpack={navpack}
              corridor={null}
              places={null}
              traffic={traffic}
              hazards={hazards}
              focusedStopId={focusedStopId}
              onFocusStop={setFocusedStopId}
              focusedPlaceId={null}
              onFocusPlace={() => {}}
              onRebuildRequested={handleRebuild}
              highlightedAlertId={null}
              onHighlightAlert={() => {}}
              userPosition={effectivePosition}
              fuelAnalysis={null}
              onOpenFuelSettings={() => {}}
              offlineRouted={false}
              isOnline={isOnline}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
