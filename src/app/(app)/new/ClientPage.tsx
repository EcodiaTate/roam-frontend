import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import type { NavPack } from "@/lib/types/navigation";

import { navApi } from "@/lib/api/nav";
import { haptic } from "@/lib/native/haptics";
import { toErrorMessage } from "@/lib/utils/errors";
import { useBundleBuilder } from "@/lib/hooks/useBundleBuilder";
import { checkTripGate, incrementTripsUsed, onAuthReadyForGate } from "@/lib/paywall/tripGate";
import { saveMinimalPlan } from "@/lib/offline/plansStore";
import type { StopSuggestionItem } from "@/lib/types/places";

import { useNewTripDraft } from "@/components/trips/new/useNewTripDraft";
import { NewTripMap } from "@/components/trips/new/NewTripMap";
import { StopsEditor } from "@/components/trips/new/StopsEditor";
import { PlaceSearchModal } from "@/components/trips/new/PlaceSearchModal";
import {
    MapStyleSwitcher,
    type MapBaseMode,
    type VectorTheme,
} from "@/components/trips/new/MapStyleSwitcher";
import { PlanningOverlay } from "@/components/trips/new/PlanningOverlay";
import { AiTripModal, type AiTripSeed } from "@/components/trip/AiTripModal";
import { PlanDrawer } from "@/components/trip/PlanDrawer";
import { WelcomeModal } from "@/components/paywall/WelcomeModal";
import { PaywallModal } from "@/components/paywall/PaywallModal";

function genPlanId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `plan_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export default function NewTripClientPage() {
  const router = useNavigate();
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

  // AI trip modal
  const [aiOpen, setAiOpen] = useState(false);

  // Plans drawer
  const [drawOpen, setDrawOpen] = useState(false);

  // ── Paywall gate ────────────────────────────────────────────────────
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [isLastFreeTrip, setIsLastFreeTrip] = useState(false);
  const [_gateChecked, setGateChecked] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallVariant, setPaywallVariant] = useState<"gate" | "upgrade">("gate");
  const [unlocked, setUnlocked] = useState<boolean | null>(null);


  useEffect(() => {
    let cancelled = false;
    const run = () => {
      checkTripGate().then((gate) => {
        if (cancelled) return;
        setUnlocked(gate.unlocked);
        if (gate.allowed) {
          // A prior run (pre-session-hydration) may have opened the paywall
          // based on a stale local trip count - close it now that we know
          // the real server-side state.
          setPaywallOpen(false);
          // Trip 2 (tripsUsed === 1): show "last free trip" warning
          // But skip this for unlocked (Untethered) users - they have unlimited trips.
          if (gate.tripsUsed === 1 && !gate.unlocked) {
            setIsLastFreeTrip(true);
            setWelcomeOpen(true);
          }
          setGateChecked(true);
        } else if (gate.reason === "paywall") {
          // Show paywall modal right here instead of redirecting to /trip.
          // Redirecting caused an infinite loop when the user had no plans left.
          // But if we got here because the session hadn't hydrated yet, an
          // auth-state re-run below will flip unlocked=true and close it.
          setPaywallOpen(true);
          setGateChecked(true);
        } else {
          // "welcome" - first ever launch
          setWelcomeOpen(true);
          setGateChecked(true);
        }
      });
    };
    run();
    // Re-check once the Supabase session is actually available. On a fresh
    // login this effect fires before the session is hydrated, so the first
    // check sees no user and the gate falls through to tripCount/localStorage.
    const unsub = onAuthReadyForGate(run);
    return () => { cancelled = true; unsub(); };
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

  // Derive departure time from the start stop's schedule
  const effectiveDepartAt = useMemo(() => {
    const start = draft.stops.find((s) => s.type === "start");
    return start?.depart_at ?? draft.depart_at ?? null;
  }, [draft.stops, draft.depart_at]);

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
        depart_at: effectiveDepartAt,
      });
      setNavPack(pack);
    } catch (e: unknown) {
      setNavPack(null);
      setRouteError(toErrorMessage(e, "Failed to build route"));
    } finally {
      setRouting(false);
    }
  }, [canRoute, draft, effectiveDepartAt]);

  /* ── Auto-route: pre-fetch route as soon as stops are valid ────────── */
  // This populates navPack in the background so that when the user taps
  // "Start Roaming", the route is already cached - making navigation instant.
  useEffect(() => {
    if (!canRoute || navPack || routing) return;
    requestRoute();
  }, [canRoute, navPack, routing, requestRoute]);

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

  /* ── AI trip confirm handler ────────────────────────────────────────── */
  // Called directly by AiTripModal - no sessionStorage relay needed.

  const handleAiConfirm = useCallback((seed: AiTripSeed) => {
    if (Array.isArray(seed.stops) && seed.stops.length >= 2) {
      draft.setStops(seed.stops);
      clearRouteState();
    }
    setAiOpen(false);
  }, [draft, clearRouteState]);

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
    if (!canRoute || savingAndGoing) return;

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
        depart_at: effectiveDepartAt,
      });

      // Step 2: Save to IDB first so /trip page can find the plan on boot
      await Promise.all([
        saveMinimalPlan({
          plan_id,
          navPack: pack,
          stops: draft.stops,
          profile: draft.profile,
          tripPrefs: draft.tripPrefs,
        }),
        incrementTripsUsed(),
      ]);

      // Step 3: Navigate after IDB write completes
      router(`/trip?plan_id=${encodeURIComponent(plan_id)}`, { replace: true });
    } catch (e: unknown) {
      setRouteError(toErrorMessage(e, "Failed to save trip"));
      setSavingAndGoing(false);
    }
  }, [canRoute, savingAndGoing, draft, navPack, router, effectiveDepartAt]);

  /* ── Go Now: online-only instant navigation (no bundle, no save) ──── */

  const goNow = useCallback(async () => {
    if (!canRoute) return;
    setGoingNow(true);
    setRouteError(null);
    try {
      // If we already have a route, navigate instantly
      if (navPack) {
        sessionStorage.setItem("roam_live_navpack", JSON.stringify(navPack));
        router("/live", { replace: true });
        return;
      }
      // Otherwise route first, then navigate
      const pack = await navApi.route({
        profile: draft.profile,
        prefs: draft.prefs,
        avoid: draft.avoid,
        stops: draft.stops,
        depart_at: effectiveDepartAt,
      });
      sessionStorage.setItem("roam_live_navpack", JSON.stringify(pack));
      router("/live", { replace: true });
    } catch (e: unknown) {
      setRouteError(toErrorMessage(e, "Failed to get route"));
      setGoingNow(false);
    }
  }, [canRoute, navPack, draft, router, effectiveDepartAt]);

  /* ── Render ────────────────────────────────────────────────────────── */

  return (
    <div className="trip-app-container">
      <NewTripMap
        stops={draft.stops}
        navPack={navPack}
        styleId={styleId}
        onMapCenterChanged={draft.setMapCenter}
        userPosition={draft.userPosition}
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
        onUseMyLocation={async () => {
          await draft.useMyLocationForStart();
          clearRouteState();
        }}
        isLocating={draft.isLocating}
        onSearchStop={openSearchForStop}
        onAiTrip={() => { haptic.light(); setAiOpen(true); }}
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
        offlinePhase={bundle.phase}
        offlineError={bundle.error}
        offlineManifest={bundle.result?.manifest ?? null}
        canDownloadOffline={false}
        savingOffline={bundle.building}
        savedOffline={bundle.isReady}
        tripPrefs={draft.tripPrefs}
        onTripPrefsChange={(next) => {
          draft.setTripPrefs(next);
          clearRouteState();
        }}
        unlocked={unlocked}
        onUpgrade={() => { setPaywallVariant("upgrade"); setPaywallOpen(true); }}
      />

      {/* Planning overlay - only for full offline bundle builds */}
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
        onAiTrip={() => { setDrawOpen(false); setAiOpen(true); }}
      />

      {/* ── AI Trip Planner (inline - no navigation needed) ───────────── */}
      <AiTripModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onConfirm={handleAiConfirm}
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
        variant={paywallVariant}
        onClose={() => setPaywallOpen(false)}
        onUnlocked={() => { setPaywallOpen(false); setUnlocked(true); }}
      />
    </div>
  );
}
