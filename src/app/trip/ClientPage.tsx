// src/app/trip/ClientPage.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { TripMap } from "@/components/trip/TripMap";
import { TripView } from "@/components/trip/TripView";
import { SyncStatusBadge } from "@/components/ui/SyncStatusBadge";

import { useGeolocation } from "@/lib/native/geolocation";
import { useKeepAwake } from "@/lib/native/keepAwake";
import { haptic } from "@/lib/native/haptics";
import { getCurrentPlanId, getOfflinePlan, type OfflinePlanRecord } from "@/lib/offline/plansStore";
import { getAllPacks, hasCorePacks } from "@/lib/offline/packsStore";
import { unpackAndStoreBundle } from "@/lib/offline/unpackBundle";

import type { NavPack, CorridorGraphPack } from "@/lib/types/navigation";
import type { PlacesPack } from "@/lib/types/places";

export function TripClientPage(props: { initialPlanId: string | null }) {
  const router = useRouter();
  const sp = useSearchParams();

  const planIdFromUrl = sp.get("plan_id");
  const focusPlaceFromUrl = sp.get("focus_place_id");

  const desiredPlanId = useMemo(
    () => props.initialPlanId ?? planIdFromUrl ?? null,
    [props.initialPlanId, planIdFromUrl]
  );

  // Native hooks
  const geo = useGeolocation({ autoStart: true, highAccuracy: true });
  useKeepAwake({ auto: true });

  // Data state
  const [plan, setPlan] = useState<OfflinePlanRecord | null>(null);
  const [navpack, setNavpack] = useState<NavPack | null>(null);
  const [corridor, setCorridor] = useState<CorridorGraphPack | null>(null);
  const [places, setPlaces] = useState<PlacesPack | null>(null);

  // UI State
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);
  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(null);

  // Fluid Bottom Sheet Drag State
  const sheetRef = useRef<HTMLDivElement>(null);
  const [offsetY, setOffsetY] = useState(0); // 0 = peek, negative = pulled up
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);
  const dragData = useRef({ startY: 0 });

  // Boot logic (static-export safe)
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const id = desiredPlanId ?? (await getCurrentPlanId());
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
  }, [desiredPlanId]);

  // If we arrived with focus_place_id (from Guide), focus it
  useEffect(() => {
    if (!focusPlaceFromUrl) return;
    setFocusedPlaceId(focusPlaceFromUrl);
    // also pull sheet up a bit so the user sees itinerary context
    if (sheetRef.current) {
      const h = sheetRef.current.clientHeight;
      const maxUp = -(h - 180);
      // pull up ~60% of the way to full height
      setOffsetY(Math.max(maxUp, Math.round(maxUp * 0.6)));
    }
  }, [focusPlaceFromUrl]);

  // Bottom Sheet Handlers
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
    const maxDown = 0;

    let proposedOffset = offsetY + totalDelta;
    if (proposedOffset < maxUp) proposedOffset = maxUp;
    if (proposedOffset > maxDown) proposedOffset = maxDown;

    setDragOffset(proposedOffset - offsetY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    setOffsetY((prev) => prev + dragOffset);
    setDragOffset(0);
  };

  // CSS Clamp guarantees the sheet visually CANNOT detach from the bottom
  const peekBase = `calc(100% - 180px - var(--roam-safe-bottom, 0px))`;
  const sheetTransform = `translateY(clamp(0px, calc(${peekBase} + ${offsetY + dragOffset}px), ${peekBase}))`;

  // Extracted map data
  const effectiveStops = navpack?.req?.stops ?? plan?.preview?.stops ?? [];
  const effectiveGeom = navpack?.primary?.geometry ?? plan?.preview?.geometry ?? null;
  const effectiveBbox = navpack?.primary?.bbox ?? plan?.preview?.bbox ?? null;

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
        <div style={{ color: "var(--roam-text-muted)", fontSize: 16, fontWeight: 800 }}>Loading trip map…</div>
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
      {/* Map Layer */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <TripMap
          styleId="roam-basemap-hybrid"
          stops={effectiveStops}
          geometry={effectiveGeom}
          bbox={effectiveBbox}
          focusedStopId={focusedStopId}
          onStopPress={(id) => {
            haptic.selection();
            setFocusedStopId(id);
          }}
          suggestions={places?.items ?? null}
          focusedSuggestionId={focusedPlaceId}
          onSuggestionPress={(id) => {
            haptic.selection();
            setFocusedPlaceId(id);
            router.push(`/guide?plan_id=${encodeURIComponent(plan.plan_id)}&focus_place_id=${encodeURIComponent(id)}`);
          }}
          userPosition={geo.position}
        />
      </div>

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
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
          transition: isDragging.current ? "none" : "transform 0.1s ease-out",
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
            padding: "0 20px 12px",
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
              margin: "10px auto 12px",
            }}
          />

          {/* Title row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div
                className="trip-h1"
                style={{
                  fontSize: 22,
                  fontWeight: 950,
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "var(--roam-text)",
                  letterSpacing: "-0.3px",
                }}
              >
                <span className="trip-truncate">{plan.label ?? "Trip Plan"}</span> <SyncStatusBadge />
              </div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 850, color: "var(--roam-text-muted)" }}>
                Itinerary
              </div>
            </div>
          </div>

          {/* Action row (the “missing controls”) */}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              type="button"
              className="trip-btn-sm trip-interactive"
              onClick={() => {
                haptic.selection();
                // we already pass geo.position to map; this just nudges the user mentally
                // if TripMap exposes a recenter callback later, hook it here.
                setOffsetY(0); // quick return to peek
              }}
              style={{
                borderRadius: 999,
                minHeight: 42,
                padding: "0 14px",
                fontWeight: 950,
                background: "var(--roam-surface-hover)",
                color: "var(--roam-text)",
                boxShadow: "var(--shadow-button)",
                whiteSpace: "nowrap",
              }}
            >
              Peek
            </button>

            <button
              type="button"
              className="trip-btn-sm trip-interactive"
              onClick={() => {
                haptic.selection();
                router.push(`/guide?plan_id=${encodeURIComponent(plan.plan_id)}`);
              }}
              style={{
                borderRadius: 999,
                minHeight: 42,
                padding: "0 14px",
                fontWeight: 950,
                background: "var(--roam-surface-hover)",
                color: "var(--roam-text)",
                boxShadow: "var(--shadow-button)",
                whiteSpace: "nowrap",
              }}
            >
              Guide
            </button>

            <button
              type="button"
              className="trip-btn-sm trip-interactive"
              onClick={() => {
                haptic.selection();
                router.push(`/plans`);
              }}
              style={{
                marginLeft: "auto",
                borderRadius: 999,
                minHeight: 42,
                padding: "0 14px",
                fontWeight: 950,
                background: "var(--roam-surface-hover)",
                color: "var(--roam-text)",
                boxShadow: "var(--shadow-button)",
                whiteSpace: "nowrap",
              }}
            >
              All Plans
            </button>
          </div>
        </div>

        {/* Itinerary */}
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
              focusedStopId={focusedStopId}
              onFocusStop={setFocusedStopId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
