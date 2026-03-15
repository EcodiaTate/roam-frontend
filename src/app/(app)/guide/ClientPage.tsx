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

import Image from "next/image";
import { Wifi, WifiOff, Satellite, AlertTriangle } from "lucide-react";
import { GuideSkeleton } from "./GuideSkeleton";

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
        if (!has) await unpackAndStoreBundle(rec);

        const packs = await getAllPacks(rec.plan_id);
        if (cancelled) return;

        const navpackLoaded = (packs as any).navpack ?? null;
        const corridorLoaded = (packs as any).corridor ?? null;
        const placesLoaded = (packs as any).places ?? null;
        const trafficLoaded = (packs as any).traffic ?? null;
        const hazardsLoaded = (packs as any).hazards ?? null;
        const manifestLoaded = (packs as any).manifest ?? null;

        setPlan(rec);
        setNavpack(navpackLoaded);
        setCorridor(corridorLoaded);
        setPlaces(placesLoaded);
        setTraffic(trafficLoaded);
        setHazards(hazardsLoaded);
        setManifest(manifestLoaded);

        // ── Bootstrap guide pack immediately (no extra render cycle) ──
        const stops = (navpackLoaded?.req?.stops ?? rec.preview?.stops ?? []) as any[];
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
          progress: null,
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
          ? `[SYSTEM: The user just opened the guide for their trip from ${origin} to ${dest} (${totalKm}km). Give them a warm, brief welcome — mention one or two highlights or heads-ups for this route. Keep it to 2-4 sentences. Be the mate riding shotgun who's excited about this trip.]`
          : `[SYSTEM: The user just opened the guide for their trip from ${origin} to ${dest}. Give them a warm, brief welcome. Keep it to 2-4 sentences.]`;

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
          });
          if (!cancelled) setGuidePack(res.pack);
        } catch {
          // Non-critical — guide still works without greeting
        } finally {
          if (!cancelled) setBusy(null);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? String(e));
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
      haptic.medium();
      if (!plan) return;
      router.replace(
        `/trip?plan_id=${encodeURIComponent(plan.plan_id)}&focus_place_id=${encodeURIComponent(placeId)}`,
      );
    },
    [plan, router],
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
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}
    >
      {/* ── Sticky header ───────────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          padding: "16px 16px 12px",
          background: "linear-gradient(to bottom, var(--roam-bg) 78%, transparent)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            flexShrink: 0,
          }}>
            <Image src="/img/roam-app-icon.png" alt="Roam" width={32} height={32} style={{ objectFit: "cover" }} priority />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>

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
              background: isOnline ? "var(--accent-tint)" : "var(--bg-warn)",
              color: isOnline ? "var(--roam-success)" : "var(--text-warn)",
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
          padding: "0 16px",
          paddingBottom: "calc(var(--bottom-nav-height, 80px) + 24px)",
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
        />
      </div>
    </div>
  );
}
