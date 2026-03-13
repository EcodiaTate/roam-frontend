"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { NavPack } from "@/lib/types/navigation";

import { navApi } from "@/lib/api/nav";
import { haptic } from "@/lib/native/haptics";
import { useBundleBuilder } from "@/lib/hooks/useBundleBuilder";
import { checkTripGate, incrementTripsUsed } from "@/lib/paywall/tripGate";

import { useNewTripDraft } from "@/components/trips/new/useNewTripDraft";
import { NewTripMap } from "@/components/trips/new/NewTripMap";
import { StopsEditor } from "@/components/trips/new/StopsEditor";
import { PlaceSearchModal } from "@/components/trips/new/PlaceSearchModal";
import {
  MapStyleSwitcher,
  type MapBaseMode,
  type VectorTheme,
} from "@/components/trips/new/MapStyleSwitcher";
import { InviteCodeModal } from "@/components/plans/InviteCodeModal";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { WelcomeModal } from "@/components/paywall/WelcomeModal";
import { Loader2 } from "lucide-react";

function genPlanId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  return `plan_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export default function NewTripClientPage() {
  const router = useRouter();
  const draft = useNewTripDraft();
  const bundle = useBundleBuilder();

  const [navPack, setNavPack] = useState<NavPack | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTargetStopId, setSearchTargetStopId] = useState<string | null>(null);

  const [baseMode, setBaseMode] = useState<MapBaseMode>("hybrid");
  const [vectorTheme, setVectorTheme] = useState<VectorTheme>("bright");

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);

  // ── Paywall gate ────────────────────────────────────────────────────
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [isLastFreeTrip, setIsLastFreeTrip] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);

  useEffect(() => {
    checkTripGate().then((gate) => {
      if (gate.allowed) {
        // Trip 2 (tripsUsed === 1): show "last free trip" warning
        if (gate.tripsUsed === 1) {
          setIsLastFreeTrip(true);
          setWelcomeOpen(true);
        }
        setGateChecked(true);
      } else if (gate.reason === "paywall") {
        setPaywallOpen(true);
        // Don't set gateChecked — keep UI locked until purchase
      } else {
        // "welcome" — first ever launch
        setWelcomeOpen(true);
        setGateChecked(true);
      }
    });
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const styleId = useMemo(() => {
    if (baseMode === "hybrid") return "roam-basemap-hybrid";
    return vectorTheme === "dark" ? "roam-basemap-vector-dark" : "roam-basemap-vector-bright";
  }, [baseMode, vectorTheme]);

  const canRoute = useMemo(() => {
    const s = draft.stops;
    return s.length >= 2 && s.some((x) => x.type === "start") && s.some((x) => x.type === "end");
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
    } catch (e: any) {
      setNavPack(null);
      setRouteError(e?.message ?? "Failed to build route");
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

  /* ── Full offline save (extracted pipeline) ────────────────────────── */

  const saveTripOfflineReady = useCallback(async () => {
    if (!canRoute) return;

    haptic.medium();

    const plan_id: string = planIdRef.current ?? genPlanId();
    planIdRef.current = plan_id;

    try {
      const result = await bundle.build({
        plan_id,
        stops: draft.stops,
        profile: draft.profile,
        prefs: draft.prefs,
        avoid: draft.avoid,
        depart_at: draft.depart_at,
        styleId,
        existingNavPack: navPack,
      });

      // Increment trip counter on successful save
      await incrementTripsUsed();

      setNavPack(result.navPack);
      router.replace(`/trip?plan_id=${encodeURIComponent(plan_id)}`);
    } catch {
      // bundle hook already populates bundle.error / bundle.phase
    }
  }, [canRoute, draft, styleId, navPack, bundle, router]);

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
          draft.addStop(t as any);
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
        onBuildRoute={requestRoute}
        canBuildRoute={canRoute}
        routing={routing}
        error={routeError}
        onBuildOffline={saveTripOfflineReady}
        onDownloadOffline={() => {}}
        onSaveOffline={() => {}}
        onResetOffline={() => {
          planIdRef.current = null;
          bundle.reset();
        }}
        offlinePhase={bundle.phase as any}
        offlineError={bundle.error}
        offlineManifest={bundle.result?.manifest ?? null}
        canDownloadOffline={false}
        savingOffline={bundle.building}
        savedOffline={bundle.isReady}
      />

      {/* Status overlay */}
      {(bundle.building || bundle.phase !== "idle") && (
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: "100%",
              borderRadius: 14,
              padding: "12px 14px",
              background: "var(--overlay-bg)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid var(--roam-border-strong)",
              color: "var(--on-color)",
              fontSize: 13,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span style={{ opacity: 0.95 }}>{bundle.statusText}</span>
            <span style={{ opacity: 0.75, fontWeight: 800, display: "flex", alignItems: "center" }}>
              {bundle.building ? (
                <Loader2 size={14} style={{ animation: "roam-spin 0.6s linear infinite" }} />
              ) : bundle.isReady ? "✓" : ""}
            </span>
          </div>
        </div>
      )}

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

      {/* ── Invite modal (redeem-only from /new) ─────────────────────── */}
      <InviteCodeModal
        open={inviteOpen}
        planId={null}
        mode="redeem"
        onClose={() => setInviteOpen(false)}
        onRedeemed={(joinedPlanId) => {
          setInviteOpen(false);
        }}
      />

      {/* ── Paywall ──────────────────────────────────────────────────── */}
      <PaywallModal
        open={paywallOpen}
        onClose={() => router.back()}
        onUnlocked={() => {
          setPaywallOpen(false);
          setGateChecked(true);
        }}
      />

      {/* ── Welcome / last-free-trip modal ───────────────────────────── */}
      <WelcomeModal
        open={welcomeOpen}
        lastFreeTrip={isLastFreeTrip}
        onClose={() => setWelcomeOpen(false)}
      />
    </div>
  );
}