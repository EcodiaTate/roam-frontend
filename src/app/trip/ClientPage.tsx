// src/app/trip/ClientPage.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { TripMap } from "@/components/trip/TripMap";
import { TripView } from "@/components/trip/TripView";
import { ExploreView } from "@/components/trip/ExploreView";
import { SyncStatusBadge } from "@/components/ui/SyncStatusBadge";

import { useGeolocation } from "@/lib/native/geolocation";
import { useKeepAwake } from "@/lib/native/keepAwake";
import { haptic } from "@/lib/native/haptics";
import { getCurrentPlanId, getOfflinePlan, type OfflinePlanRecord } from "@/lib/offline/plansStore";
import { getAllPacks, hasCorePacks } from "@/lib/offline/packsStore";
import { unpackAndStoreBundle } from "@/lib/offline/unpackBundle";
import type { NavPack, CorridorGraphPack } from "@/lib/types/navigation";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";

type TabState = "itinerary" | "explore";

export function TripClientPage(props: { initialPlanId: string | null }) {
  const router = useRouter();

  // Native hooks
  const geo = useGeolocation({ autoStart: true, highAccuracy: true });
  useKeepAwake({ auto: true });

  // Data state
  const [plan, setPlan] = useState<OfflinePlanRecord | null>(null);
  const [navpack, setNavpack] = useState<NavPack | null>(null);
  const [corridor, setCorridor] = useState<CorridorGraphPack | null>(null);
  const [places, setPlaces] = useState<PlacesPack | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<TabState>("itinerary");
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null);

  // Bottom Sheet Drag State
  const [snapState, setSnapState] = useState<"peek" | "expanded">("peek");
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);
  const dragData = useRef({ startY: 0, lastY: 0, lastTime: 0, velocity: 0 });

  // Boot logic
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const id = props.initialPlanId ?? (await getCurrentPlanId());
      if (!id || cancelled) return;

      const rec = await getOfflinePlan(id);
      if (!rec || cancelled) return;

      const has = await hasCorePacks(rec.plan_id);
      if (!has) await unpackAndStoreBundle(rec);

      const packs = await getAllPacks(rec.plan_id);
      if (cancelled) return;

      setPlan(rec);
      setNavpack(packs.navpack ?? null);
      setCorridor(packs.corridor ?? null);
      setPlaces(packs.places ?? null);
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [props.initialPlanId]);

  // Bottom Sheet Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    dragData.current = { startY: e.clientY, lastY: e.clientY, lastTime: Date.now(), velocity: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;

    const totalDelta = e.clientY - dragData.current.startY;

    // "Rubber band" resistance when pulling past bounds
    if ((snapState === "expanded" && totalDelta < 0) || (snapState === "peek" && totalDelta > 0)) {
      setDragOffset(totalDelta * 0.15);
    } else {
      setDragOffset(totalDelta);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    let snapped = false;
    if (snapState === "peek" && dragOffset < -60) {
      setSnapState("expanded");
      snapped = true;
    } else if (snapState === "expanded" && dragOffset > 60) {
      setSnapState("peek");
      snapped = true;
    }

    if (snapped) haptic.tap();
    setDragOffset(0);
  };

  const baseTransform =
    snapState === "peek" ? `calc(100% - 180px - var(--roam-safe-bottom, 0px))` : "0px";
  const sheetTransform = `translateY(calc(${baseTransform} + ${dragOffset}px))`;

  // Extracted map data
  const effectiveStops = navpack?.req?.stops ?? plan?.preview?.stops ?? [];
  const effectiveGeom = navpack?.primary?.geometry ?? plan?.preview?.geometry ?? null;
  const effectiveBbox = navpack?.primary?.bbox ?? plan?.preview?.bbox ?? null;

  // TypeScript Safety: Wait until plan, geometry, and bbox are available
  if (!plan || !effectiveGeom || !effectiveBbox) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100dvh",
          width: "100%",
          background: "var(--roam-bg)",
          color: "var(--roam-text)",
        }}
      >
        <div style={{ color: "var(--roam-text-muted)", fontSize: 16, fontWeight: 800 }}>
          Loading trip map...
        </div>
      </div>
    );
  }

  return (
    <div
      className="trip-app-container"
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        overflow: "hidden",
        background: "var(--roam-bg)",
        color: "var(--roam-text)",
      }}
    >
      {/* 1. Map Layer */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <TripMap
          styleId="roam-basemap-hybrid"
          stops={effectiveStops}
          geometry={effectiveGeom} // TS knows string
          bbox={effectiveBbox} // TS knows BBox4
          focusedStopId={focusedStopId}
          onStopPress={(id) => {
            haptic.selection();
            setFocusedStopId(id);
            setActiveTab("itinerary");
          }}
          suggestions={places?.items ?? null}
          focusedSuggestionId={focusedPlaceId}
          onSuggestionPress={(id) => {
            haptic.selection();
            setFocusedPlaceId(id);
            setActiveTab("explore");
            setSnapState("expanded");
          }}
          userPosition={geo.position}
        />
      </div>

      {/* 2. Bottom Sheet */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "92vh",
          zIndex: 20,

          background: "var(--roam-surface)",
          borderRadius: "var(--r-card) var(--r-card) 0 0",
          boxShadow: "0 -12px 48px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",

          transform: sheetTransform,
          transition: isDragging.current ? "none" : "transform 0.4s var(--spring)",
          willChange: "transform",
        }}
      >
        {/* Drag Handle & Header */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="trip-sheet-header"
          style={{
            padding: "0 20px 14px",
            cursor: "grab",
            touchAction: "none",
            background: "var(--roam-surface)",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          <div
            className="trip-drag-handle"
            style={{
              width: 48,
              height: 6,
              borderRadius: 10,
              background: "var(--roam-surface-hover)",
              margin: "10px auto 14px",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h1
              className="trip-h1"
              style={{
                fontSize: 22,
                fontWeight: 900,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "var(--roam-text)",
                letterSpacing: "-0.3px",
              }}
            >
              {plan.label ?? "Trip Plan"} <SyncStatusBadge />
            </h1>
          </div>
        </div>

        {/* Tab Switcher UI */}
        <div
          style={{
            display: "flex",
            padding: "0 20px",
            gap: 16,
            borderBottom: "2px solid rgba(0,0,0,0.06)",
            marginBottom: 14,
          }}
        >
          <button
            type="button"
            className="trip-interactive"
            style={{
              padding: "10px 0",
              borderBottom:
                activeTab === "itinerary"
                  ? "3px solid var(--brand-sky)"
                  : "3px solid transparent",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              fontSize: 16,
              fontWeight: activeTab === "itinerary" ? 900 : 800,
              color: activeTab === "itinerary" ? "var(--roam-text)" : "var(--roam-text-muted)",
              cursor: "pointer",
              transition: "all 0.2s var(--ease-out)",
            }}
            onClick={() => {
              haptic.selection();
              setActiveTab("itinerary");
            }}
          >
            Itinerary
          </button>

          <button
            type="button"
            className="trip-interactive"
            style={{
              padding: "10px 0",
              borderBottom:
                activeTab === "explore" ? "3px solid var(--brand-sky)" : "3px solid transparent",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              fontSize: 16,
              fontWeight: activeTab === "explore" ? 900 : 800,
              color: activeTab === "explore" ? "var(--roam-text)" : "var(--roam-text-muted)",
              cursor: "pointer",
              transition: "all 0.2s var(--ease-out)",
            }}
            onClick={() => {
              haptic.selection();
              setActiveTab("explore");
            }}
          >
            Explore
          </button>
        </div>

        {/* Smooth Sliding Viewport */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div
            style={{
              display: "flex",
              width: "200%",
              height: "100%",
              transform: activeTab === "itinerary" ? "translateX(0)" : "translateX(-50%)",
              transition: "transform 0.4s var(--spring)",
              willChange: "transform",
            }}
          >
            {/* View 1: Itinerary */}
            <div
              style={{
                width: "50%",
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
                focusedStopId={focusedStopId}
                onFocusStop={setFocusedStopId}
              />
            </div>

            {/* View 2: Explore */}
            <div
              style={{
                width: "50%",
                height: "100%",
                overflowY: "auto",
                padding: "0 20px calc(var(--bottom-nav-height) + 20px)",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
              }}
            >
              <ExploreView
                places={places}
                focusedPlaceId={focusedPlaceId}
                onFocusPlace={setFocusedPlaceId}
                onAddStop={(place: PlaceItem) => {
                  haptic.success();
                  // Trigger your add stop rebuild logic here
                  setActiveTab("itinerary");
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
