// src/app/guide/ClientPage.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { haptic } from "@/lib/native/haptics";
import { getCurrentPlanId, getOfflinePlan, type OfflinePlanRecord } from "@/lib/offline/plansStore";
import { getAllPacks, hasCorePacks } from "@/lib/offline/packsStore";
import { unpackAndStoreBundle } from "@/lib/offline/unpackBundle";

import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import type { ExplorePack, ExploreContext } from "@/lib/types/explore";

import { createExplorePack, exploreSendMessage } from "@/lib/explore/exploreEngine";
import { addPlaceToTrip } from "@/lib/explore/addToTrip";

import { ExploreView } from "@/components/trip/ExploreView";

function useOnlineStatus() {
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
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

export default function GuideClientPage(props: { initialPlanId: string | null; initialFocusPlaceId: string | null }) {
  const router = useRouter();
  const sp = useSearchParams();
  const isOnline = useOnlineStatus();

  const planIdFromUrl = sp.get("plan_id");
  const focusFromUrl = sp.get("focus_place_id");

  const desiredPlanId = useMemo(() => props.initialPlanId ?? planIdFromUrl ?? null, [props.initialPlanId, planIdFromUrl]);
  const desiredFocusPlaceId = useMemo(
    () => props.initialFocusPlaceId ?? focusFromUrl ?? null,
    [props.initialFocusPlaceId, focusFromUrl]
  );

  const [plan, setPlan] = useState<OfflinePlanRecord | null>(null);

  const [navpack, setNavpack] = useState<NavPack | null>(null);
  const [corridor, setCorridor] = useState<CorridorGraphPack | null>(null);
  const [places, setPlaces] = useState<PlacesPack | null>(null);
  const [traffic, setTraffic] = useState<TrafficOverlay | null>(null);
  const [hazards, setHazards] = useState<HazardOverlay | null>(null);
  const [manifest, setManifest] = useState<OfflineBundleManifest | null>(null);

  const [focusedPlaceId, setFocusedPlaceId] = useState<string | null>(desiredFocusPlaceId);

  // Explore state
  const [exploreKey, setExploreKey] = useState<string | null>(null);
  const [explorePack, setExplorePack] = useState<ExplorePack | null>(null);
  const [exploreContext, setExploreContext] = useState<ExploreContext | null>(null);

  const [busy, setBusy] = useState<null | "boot" | "chat" | "add">(null);
  const [err, setErr] = useState<string | null>(null);

  const didBootstrapRef = useRef(false);

  useEffect(() => setFocusedPlaceId(desiredFocusPlaceId), [desiredFocusPlaceId]);

  // Boot packs (IDB)
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

  // Bootstrap Explore pack once packs are ready
  useEffect(() => {
    let cancelled = false;
    async function bootstrapExplore() {
      if (didBootstrapRef.current) return;
      if (!plan) return;

      // need stops, and ideally navpack for route_key/geometry
      const stops = (navpack?.req?.stops ?? plan.preview?.stops ?? []) as any[];
      if (!stops || stops.length === 0) return;

      didBootstrapRef.current = true;
      try {
        const { exploreKey, pack, context } = await createExplorePack({
          planId: plan.plan_id,
          label: plan.label ?? null,
          stops,
          navpack,
          corridor,
          places,
          traffic,
          hazards,
          manifest,
        });

        if (cancelled) return;

        setExploreKey(exploreKey);
        setExplorePack(pack);
        setExploreContext(context);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? String(e));
      }
    }

    bootstrapExplore();
    return () => {
      cancelled = true;
    };
  }, [plan, navpack, corridor, places, traffic, hazards, manifest]);

  const headerTitle = plan?.label ?? "Guide";

  if (!plan) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100dvh", background: "var(--roam-bg)", color: "var(--roam-text)" }}>
        <div style={{ color: "var(--roam-text-muted)", fontSize: 16, fontWeight: 800 }}>
          {busy === "boot" ? "Loading guide…" : "No plan loaded"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--roam-bg)", color: "var(--roam-text)", display: "flex", flexDirection: "column" }}>
      {/* Sticky header */}
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
            }}
          >
            ← Trip
          </button>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "var(--roam-text-muted)" }}>Guide</div>
            <div className="trip-truncate" style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.2px" }}>
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
            }}
          >
            {isOnline ? "Online" : "Offline"}
          </div>
        </div>

        {err ? (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 14, background: "rgba(255,0,0,0.08)", color: "rgba(200,0,0,1)", fontWeight: 850, fontSize: 13 }}>
            {err}
          </div>
        ) : null}
      </div>

      {/* Content */}
      <div style={{ padding: "0 14px 24px" }}>
        <ExploreView
          // packs / focus
          places={places}
          focusedPlaceId={focusedPlaceId}
          onFocusPlace={setFocusedPlaceId}
          isOnline={isOnline}
          // explore engine
          exploreReady={!!(exploreKey && explorePack && exploreContext)}
          explorePack={explorePack}
          onSendMessage={async (text, preferredCategories) => {
            if (!exploreKey || !explorePack || !exploreContext) return;

            setBusy("chat");
            setErr(null);
            try {
              const res = await exploreSendMessage({
                planId: plan.plan_id,
                exploreKey,
                pack: explorePack,
                context: exploreContext,
                userText: text,
                preferredCategories,
                maxSteps: 4,
              });

              setExplorePack(res.pack);
              return res.assistantText;
            } catch (e: any) {
              setErr(e?.message ?? String(e));
              throw e;
            } finally {
              setBusy(null);
            }
          }}
          chatBusy={busy === "chat"}
          // actions
          onAddStop={async (place: PlaceItem) => {
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
          }}
          onShowOnMap={(placeId) => {
            haptic.selection();
            router.push(`/trip?plan_id=${encodeURIComponent(plan.plan_id)}&focus_place_id=${encodeURIComponent(placeId)}`);
          }}
        />
      </div>
    </div>
  );
}
