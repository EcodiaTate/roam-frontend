// src/app/guide/ClientPage.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { haptic } from "@/lib/native/haptics";
import { useGeolocation } from "@/lib/native/geolocation";
import { getCurrentPlanId, getOfflinePlan, type OfflinePlanRecord } from "@/lib/offline/plansStore";
import { getAllPacks, hasCorePacks } from "@/lib/offline/packsStore";
import { unpackAndStoreBundle } from "@/lib/offline/unpackBundle";

import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { GuidePack, GuideContext, TripProgress } from "@/lib/types/guide";

import { createGuidePack, guideSendMessage } from "@/lib/guide/guideEngine";
import { computeTripProgress } from "@/lib/guide/tripProgress";
import { addPlaceToTrip } from "@/lib/guide/addToTrip";

import { GuideView } from "@/components/trip/GuideView";

import { ArrowLeft, Wifi, WifiOff, Satellite, AlertTriangle } from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Online status hook
// ──────────────────────────────────────────────────────────────

function useOnlineStatus() {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
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
  const isOnline = useOnlineStatus();

  const planIdFromUrl = sp.get("plan_id");
  const focusFromUrl = sp.get("focus_place_id");

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
  const [traffic, setTraffic] = useState<TrafficOverlay | null>(null);
  const [hazards, setHazards] = useState<HazardOverlay | null>(null);
  const [manifest, setManifest] = useState<OfflineBundleManifest | null>(null);

  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(desiredFocusPlaceId);

  // ── Trip progress ────────────────────────────────────────────
  const [tripProgress, setTripProgress] = useState<TripProgress | null>(null);

  // ── Guide state ──────────────────────────────────────────────
  const [guideKey, setGuideKey] = useState<string | null>(null);
  const [guidePack, setGuidePack] = useState<GuidePack | null>(null);
  const [guideContext, setGuideContext] = useState<GuideContext | null>(null);

  const [busy, setBusy] = useState<null | "boot" | "chat" | "add">(null);
  const [err, setErr] = useState<string | null>(null);

  const didBootstrapRef = useRef(false);

  useEffect(() => setFocusedPlaceId(desiredFocusPlaceId), [desiredFocusPlaceId]);

  // ── Boot packs from IDB ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setBusy("boot");
      setErr(null);
      try {
        const id = desiredPlanId ?? (await getCurrentPlanId());
        if (!id || cancelled) return;

        const rec = await getOfflinePlan(id);
        if (!rec || cancelled) return;

        const has = await hasCorePacks(rec.plan_id);
        if (!has) await unpackAndStoreBundle(rec);

        const packs = await getAllPacks(rec.plan_id);
        if (cancelled) return;

        setPlan(rec);
        setNavpack((packs as any).navpack ?? null);
        setCorridor((packs as any).corridor ?? null);
        setPlaces((packs as any).places ?? null);
        setTraffic((packs as any).traffic ?? null);
        setHazards((packs as any).hazards ?? null);
        setManifest((packs as any).manifest ?? null);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setBusy(null);
      }
    }

    boot();
    return () => {
      cancelled = true;
      didBootstrapRef.current = false;
    };
  }, [desiredPlanId]);

  // ── Compute trip progress when position updates ──────────────
  useEffect(() => {
    if (!geo.position || !plan) return;

    const stops = (navpack?.req?.stops ?? plan.preview?.stops ?? []) as any[];
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

  // ── Bootstrap Guide pack (with IDB restore) ──────────────────
  useEffect(() => {
    let cancelled = false;

    async function bootstrapGuide() {
      if (didBootstrapRef.current) return;
      if (!plan) return;

      const stops = (navpack?.req?.stops ?? plan.preview?.stops ?? []) as any[];
      if (!stops || stops.length === 0) return;

      didBootstrapRef.current = true;
      try {
        const { guideKey, pack, context } = await createGuidePack({
          planId: plan.plan_id,
          label: plan.label ?? null,
          stops,
          navpack,
          corridor,
          places,
          traffic,
          hazards,
          manifest,
          progress: tripProgress,
        });

        if (cancelled) return;

        setGuideKey(guideKey);
        setGuidePack(pack);
        setGuideContext(context);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? String(e));
      }
    }

    bootstrapGuide();
    return () => {
      cancelled = true;
    };
  }, [plan, navpack, corridor, places, traffic, hazards, manifest, tripProgress]);

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
          const stops = (navpack?.req?.stops ?? plan.preview?.stops ?? []) as any[];
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

        // Update context with latest progress
        const freshContext: GuideContext = {
          ...guideContext,
          progress: latestProgress,
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
          maxSteps: 4,
          progress: latestProgress,
          corridorPlaces,
        });

        setGuidePack(res.pack);
        setGuideContext(freshContext);
        return res.assistantText;
      } catch (e: any) {
        setErr(e?.message ?? String(e));
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
      } catch (e: any) {
        haptic.error();
        setErr(e?.message ?? String(e));
      } finally {
        setBusy(null);
      }
    },
    [plan, navpack, corridor, router],
  );

  const handleShowOnMap = useCallback(
    (placeId: string) => {
      haptic.selection();
      if (!plan) return;
      router.push(
        `/trip?plan_id=${encodeURIComponent(plan.plan_id)}&focus_place_id=${encodeURIComponent(placeId)}`,
      );
    },
    [plan, router],
  );

  // ── Render ───────────────────────────────────────────────────

  const headerTitle = plan?.label ?? "Guide";

  if (!plan) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100dvh",
          background: "var(--roam-bg)",
          color: "var(--roam-text)",
        }}
      >
        <div
          style={{
            color: "var(--roam-text-muted)",
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          {busy === "boot" ? "Loading guide…" : "No plan loaded"}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--roam-bg)",
        color: "var(--roam-text)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Sticky header ───────────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          padding: "16px 14px 12px",
          background: "linear-gradient(to bottom, var(--roam-bg) 78%, rgba(0,0,0,0))",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="trip-btn-sm trip-interactive"
            onClick={() => {
              haptic.selection();
              router.push(`/trip?plan_id=${encodeURIComponent(plan.plan_id)}`);
            }}
            style={{
              borderRadius: 999,
              minHeight: 42,
              padding: "0 14px",
              fontWeight: 950,
              background: "var(--roam-surface)",
              color: "var(--roam-text)",
              boxShadow: "var(--shadow-soft)",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ArrowLeft size={16} />
            Trip
          </button>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>
              Guide
            </div>
            <div
              className="trip-truncate"
              style={{
                fontSize: 18,
                fontWeight: 950,
                letterSpacing: "-0.2px",
              }}
            >
              {headerTitle}
            </div>
          </div>

          <div
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 900,
              background: isOnline ? "rgba(0,200,120,0.12)" : "rgba(255,180,0,0.12)",
              color: isOnline ? "rgba(0,160,90,1)" : "rgba(200,130,0,1)",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isOnline ? "Online" : "Offline"}
          </div>
        </div>

        {/* ── Progress bar ────────────────────────────────────── */}
        {tripProgress && tripProgress.total_km > 0 ? (
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                fontWeight: 900,
                color: "var(--roam-text-muted)",
                marginBottom: 4,
              }}
            >
              <span>{tripProgress.km_from_start.toFixed(0)} km travelled</span>
              <span>{tripProgress.km_remaining.toFixed(0)} km to go</span>
            </div>

            <div
              style={{
                height: 6,
                borderRadius: 3,
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
                  background: "var(--roam-accent)",
                  borderRadius: 3,
                  transition: "width 0.5s ease-out",
                }}
              />

              {/* Stop markers on the progress bar */}
              {(() => {
                const stops = (navpack?.req?.stops ?? plan.preview?.stops ?? []) as any[];
                const legs = navpack?.primary?.legs ?? [];
                if (stops.length < 2 || legs.length === 0) return null;

                let cumKm = 0;
                const markers: { pct: number; visited: boolean; name: string }[] = [];

                markers.push({
                  pct: 0,
                  visited: tripProgress.visited_stop_ids.includes(stops[0]?.id),
                  name: stops[0]?.name ?? "",
                });

                for (let i = 0; i < legs.length; i++) {
                  cumKm += legs[i].distance_m / 1000;
                  const stop = stops[i + 1];
                  if (stop) {
                    markers.push({
                      pct: (cumKm / tripProgress.total_km) * 100,
                      visited: tripProgress.visited_stop_ids.includes(stop.id),
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
                      width: 8,
                      height: 8,
                      borderRadius: 4,
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
              color: "rgba(200,100,0,1)",
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
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 14,
              background: "rgba(255,0,0,0.08)",
              color: "rgba(200,0,0,1)",
              fontWeight: 850,
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertTriangle size={16} />
            {err}
          </div>
        ) : null}
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: "0 14px",
          paddingBottom: "calc(var(--bottom-nav-height, 80px) + 24px)",
        }}
      >
        <GuideView
          places={places}
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
        />
      </div>
    </div>
  );
}
