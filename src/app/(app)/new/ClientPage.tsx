"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { NavPack } from "@/lib/types/navigation";

import { navApi } from "@/lib/api/nav";
import { haptic } from "@/lib/native/haptics";
import { toErrorMessage } from "@/lib/utils/errors";
import { useBundleBuilder } from "@/lib/hooks/useBundleBuilder";
import { checkTripGate, incrementTripsUsed } from "@/lib/paywall/tripGate";
import { saveMinimalPlan } from "@/lib/offline/plansStore";
import type { StopSuggestionItem } from "@/lib/types/places";

import { useNewTripDraft } from "@/components/trips/new/useNewTripDraft";
import { AI_TRIP_SEED_KEY, type AiTripSeed } from "@/components/trip/AiTripModal";
import { CLONE_TRIP_SEED_KEY, type CloneTripSeed } from "@/lib/types/discover";
import { NewTripMap } from "@/components/trips/new/NewTripMap";
import { StopsEditor } from "@/components/trips/new/StopsEditor";
import { PlaceSearchModal } from "@/components/trips/new/PlaceSearchModal";
import {
  MapStyleSwitcher,
  type MapBaseMode,
  type VectorTheme,
} from "@/components/trips/new/MapStyleSwitcher";
import { PlanningOverlay } from "@/components/trips/new/PlanningOverlay";
import { InviteCodeModal } from "@/components/plans/InviteCodeModal";
import { PlanDrawer } from "@/components/trip/PlanDrawer";
import { WelcomeModal } from "@/components/paywall/WelcomeModal";
import { PaywallModal } from "@/components/paywall/PaywallModal";

function genPlanId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `plan_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export default function NewTripClientPage() {
  const router = useRouter();
  const draft = useNewTripDraft();
  const bundle = useBundleBuilder();

  const [navPack, setNavPack] = useState<NavPack | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [goingNow, setGoingNow] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTargetStopId, setSearchTargetStopId] = useState<string | null>(null);

  const [baseMode, setBaseMode] = useState<MapBaseMode>("hybrid");
  const [vectorTheme, setVectorTheme] = useState<VectorTheme>("bright");

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);

  // Plans drawer
  const [drawOpen, setDrawOpen] = useState(false);

  // ── Paywall gate ────────────────────────────────────────────────────
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [isLastFreeTrip, setIsLastFreeTrip] = useState(false);
  const [_gateChecked, setGateChecked] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [unlocked, setUnlocked] = useState<boolean | null>(null);

  // ── AI trip seed ─────────────────────────────────────────────────────
  // When the user confirms an AI-generated trip, AiTripModal writes the seed
  // to sessionStorage and navigates here. We read it once on mount, seed the
  // draft stops, then clear the key so a refresh starts fresh.
  useEffect(() => {
    try {
      // 1. Check for AI trip seed
      const aiRaw = sessionStorage.getItem(AI_TRIP_SEED_KEY);
      if (aiRaw) {
        sessionStorage.removeItem(AI_TRIP_SEED_KEY);
        const seed = JSON.parse(aiRaw) as AiTripSeed;
        if (Array.isArray(seed.stops) && seed.stops.length >= 2) {
          draft.setStops(seed.stops);
          return;
        }
      }

      // 2. Check for Discover clone seed
      const cloneRaw = sessionStorage.getItem(CLONE_TRIP_SEED_KEY);
      if (cloneRaw) {
        sessionStorage.removeItem(CLONE_TRIP_SEED_KEY);
        const seed = JSON.parse(cloneRaw) as CloneTripSeed;
        if (Array.isArray(seed.stops) && seed.stops.length >= 2) {
          draft.setStops(seed.stops);
        }
      }
    } catch {
      // malformed or unavailable — ignore
    }
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    checkTripGate().then((gate) => {
      setUnlocked(gate.unlocked);
      if (gate.allowed) {
        // Trip 2 (tripsUsed === 1): show "last free trip" warning
        // But skip this for unlocked (Untethered) users — they have unlimited trips.
        if (gate.tripsUsed === 1 && !gate.unlocked) {
          setIsLastFreeTrip(true);
          setWelcomeOpen(true);
        }
        setGateChecked(true);
      } else if (gate.reason === "paywall") {
        // Show paywall modal right here instead of redirecting to /trip.
        // Redirecting caused an infinite loop when the user had no plans left.
        setPaywallOpen(true);
        setGateChecked(true);
      } else {
        // "welcome" — first ever launch
        setWelcomeOpen(true);
        setGateChecked(true);
      }
    });
    // Run once on mount
  }, []);

  const styleId = useMemo(() => {
    if (baseMode === "hybrid") return "roam-basemap-hybrid";
    return vectorTheme === "dark" ? "roam-basemap-vector-dark" : "roam-basemap-vector-bright";
  }, [baseMode, vectorTheme]);

  const canRoute = useMemo(() => {
    const s = draft.stops;
    const start = s.find((x) => x.type === "start");
    const end = s.find((x) => x.type === "end");
    return !!start && !!end && !!start.name?.trim() && !!end.name?.trim();
  }, [draft.stops]);

  const planIdRef = useRef<string | null>(null);

  /* ── Route preview (quick, no bundle) ──────────────────────────────── */

  const requestRoute = useCallback(async () => {
    if (!canRoute) return;
    setRouteError(null);
    setRouting(true);
    try {
      const pack = await navApi.route({
        profile: draft.profile,
        prefs: draft.prefs,
        avoid: draft.avoid,
        stops: draft.stops,
        depart_at: draft.depart_at ?? null,
      });
      setNavPack(pack);
    } catch (e: unknown) {
      setNavPack(null);
      setRouteError(toErrorMessage(e, "Failed to build route"));
    } finally {
      setRouting(false);
    }
  }, [canRoute, draft]);

  /* ── Search modal ──────────────────────────────────────────────────── */

  const openSearchForStop = useCallback((stopId: string) => {
    setSearchTargetStopId(stopId);
    setSearchOpen(true);
  }, []);

  const onPickPlace = useCallback(
    (args: { stopId: string; name: string; lat: number; lng: number }) => {
      draft.updateStop(args.stopId, { name: args.name, lat: args.lat, lng: args.lng });
      setSearchOpen(false);
      setSearchTargetStopId(null);
      setNavPack(null);
      setRouteError(null);
      bundle.reset();
    },
    [draft, bundle],
  );

  /* ── Clear route + artifacts on any stop/profile change ────────────── */

  const clearRouteState = useCallback(() => {
    setNavPack(null);
    setRouteError(null);
    bundle.reset();
  }, [bundle]);

  /* ── Add a suggestion as a new stop ────────────────────────────────── */

  const addStopFromSuggestion = useCallback(
    (item: StopSuggestionItem) => {
      draft.addStopWithLocation({ name: item.name, lat: item.lat, lng: item.lng });
      clearRouteState();
    },
    [draft, clearRouteState],
  );

  /* ── Save & Go: instant navigation with background enrichment ─────── */

  const [savingAndGoing, setSavingAndGoing] = useState(false);

  const saveAndGo = useCallback(async () => {
    if (!canRoute) return;

    haptic.medium();
    setSavingAndGoing(true);

    const plan_id: string = planIdRef.current ?? genPlanId();
    planIdRef.current = plan_id;

    try {
      // Step 1: Get route (reuse if already previewed)
      const pack = navPack ?? await navApi.route({
        profile: draft.profile,
        prefs: draft.prefs,
        avoid: draft.avoid,
        stops: draft.stops,
        depart_at: draft.depart_at ?? null,
      });

      // Step 2: Minimal save to IDB (<50ms)
      await saveMinimalPlan({
        plan_id,
        navPack: pack,
        stops: draft.stops,
        profile: draft.profile,
      });

      // Step 3: Trip counter
      await incrementTripsUsed();

      // Step 4: Navigate immediately — enrichment happens on /trip
      router.replace(`/trip?plan_id=${encodeURIComponent(plan_id)}`);
    } catch (e: unknown) {
      setRouteError(toErrorMessage(e, "Failed to save trip"));
      setSavingAndGoing(false);
    }
  }, [canRoute, draft, navPack, router]);

  /* ── Go Now: online-only instant navigation (no bundle, no save) ──── */

  const goNow = useCallback(async () => {
    if (!canRoute) return;
    setGoingNow(true);
    setRouteError(null);
    try {
      const pack = navPack ?? await navApi.route({
        profile: draft.profile,
        prefs: draft.prefs,
        avoid: draft.avoid,
        stops: draft.stops,
        depart_at: draft.depart_at ?? null,
      });
      // Store NavPack in sessionStorage for the /live page to pick up
      sessionStorage.setItem("roam_live_navpack", JSON.stringify(pack));
      router.replace("/live");
    } catch (e: unknown) {
      setRouteError(toErrorMessage(e, "Failed to get route"));
      setGoingNow(false);
    }
  }, [canRoute, navPack, draft, router]);

  /* ── Render ────────────────────────────────────────────────────────── */

  return (
    <div className="trip-app-container">
      <NewTripMap
        stops={draft.stops}
        navPack={navPack}
        styleId={styleId}
        onMapCenterChanged={draft.setMapCenter}
      />

      <MapStyleSwitcher
        mode={baseMode}
        vectorTheme={vectorTheme}
        onChange={(next) => {
          setBaseMode(next.mode);
          setVectorTheme(next.vectorTheme);
          bundle.reset();
        }}
      />

      <StopsEditor
        profile={draft.profile}
        onProfileChange={(p) => {
          draft.setProfile(p);
          clearRouteState();
        }}
        stops={draft.stops}
        onAddStop={(t) => {
          draft.addStop(t);
          clearRouteState();
        }}
        onRemoveStop={(id) => {
          draft.removeStop(id);
          clearRouteState();
        }}
        onReorderStop={(a, b) => {
          draft.reorderStop(a, b);
          clearRouteState();
        }}
        onEditStop={(id, patch) => {
          draft.updateStop(id, patch);
          clearRouteState();
        }}
        onUseMyLocation={() => {
          draft.useMyLocationForStart();
          clearRouteState();
        }}
        onSearchStop={openSearchForStop}
        onJoinPlan={() => {
          setInviteOpen(true);
        }}
        onPlans={() => {
          setDrawOpen(true);
        }}
        navPack={navPack}
        onAddSuggestion={addStopFromSuggestion}
        onBuildRoute={requestRoute}
        canBuildRoute={canRoute}
        routing={routing}
        error={routeError}
        onGoNow={goNow}
        goingNow={goingNow}
        onBuildOffline={saveAndGo}
        onDownloadOffline={() => {}}
        onSaveOffline={() => {}}
        onResetOffline={() => {
          planIdRef.current = null;
          bundle.reset();
          setSavingAndGoing(false);
        }}
        offlinePhase={savingAndGoing ? "routing" as const : bundle.phase}
        offlineError={bundle.error}
        offlineManifest={bundle.result?.manifest ?? null}
        canDownloadOffline={false}
        savingOffline={savingAndGoing || bundle.building}
        savedOffline={bundle.isReady}
        unlocked={unlocked}
        onUpgrade={() => { setPaywallOpen(true); }}
      />

      {/* Planning overlay */}
      <PlanningOverlay
        phase={bundle.phase}
        error={bundle.error}
        visible={bundle.building || bundle.phase === "ready" || bundle.phase === "error"}
      />

      <PlaceSearchModal
        open={searchOpen}
        stopId={searchTargetStopId}
        onClose={() => {
          setSearchOpen(false);
          setSearchTargetStopId(null);
        }}
        mapCenter={draft.mapCenter}
        onPick={onPickPlace}
      />

      {/* ── Plans drawer ──────────────────────────────────────────────── */}
      <PlanDrawer
        open={drawOpen}
        onClose={() => setDrawOpen(false)}
      />

      {/* ── Invite modal (redeem-only from /new) ─────────────────────── */}
      <InviteCodeModal
        open={inviteOpen}
        planId={null}
        mode="redeem"
        onClose={() => setInviteOpen(false)}
        onRedeemed={(_joinedPlanId) => {
          setInviteOpen(false);
        }}
      />

      {/* ── Welcome / last-free-trip modal ───────────────────────────── */}
      <WelcomeModal
        open={welcomeOpen}
        lastFreeTrip={isLastFreeTrip}
        onClose={() => setWelcomeOpen(false)}
      />

      {/* ── Paywall modal (shown when user has used all free trips) ── */}
      <PaywallModal
        open={paywallOpen}
        variant="gate"
        onClose={() => setPaywallOpen(false)}
        onUnlocked={() => { setPaywallOpen(false); setUnlocked(true); }}
      />
    </div>
  );
}