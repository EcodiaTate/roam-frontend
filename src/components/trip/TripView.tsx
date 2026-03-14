// src/components/trip/TripView.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { TripStop } from "@/lib/types/trip";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { FuelAnalysis } from "@/lib/types/fuel";
import { haptic } from "@/lib/native/haptics";
import { hideKeyboard } from "@/lib/native/keyboard";
import { shortId } from "@/lib/utils/ids";

import {
  Flag,
  MapPin,
  Diamond,
  ChevronUp,
  ChevronDown,
  X,
  Plus,
  RotateCcw,
  Save,
  Loader2,
  Route,
  Map as MapIcon,
  Navigation,
  Clock,
  WifiOff,
} from "lucide-react";

import {
  useAlerts,
  NextAlertBanner,
  LegAlertStrip,
  type AlertHighlightEvent,
} from "@/components/trip/TripAlertsPanel";
import { TripSuggestionsPanel } from "@/components/trip/TripSuggestionsPanel";
import { FuelSummaryCard } from "@/components/fuel/FuelSummaryCard";

import s from "./Tripview.module.css";

/* ── Types ────────────────────────────────────────────────────────────── */

export type TripEditorRebuildMode = "auto" | "online" | "offline";

type ActiveSection = "route" | "places";

/* ── Helpers ──────────────────────────────────────────────────────────── */

function ensureStopIds(stops: TripStop[]): TripStop[] {
  return (stops ?? []).map((st) => (st.id ? st : { ...st, id: shortId() }));
}

function isLockedStop(st: TripStop) {
  const t = st.type ?? "poi";
  return t === "start" || t === "end";
}

function stopLabel(st: TripStop, idx: number) {
  const t = st.type ?? "poi";
  const name = st.name?.trim();
  if (name) return name;
  if (t === "start") return "Start";
  if (t === "end") return "End";
  return `Stop ${idx + 1}`;
}

function resolveType(st: TripStop): string {
  return st.type ?? "poi";
}

function StopIcon({ type, size = 15 }: { type?: string; size?: number }) {
  const props = { size, strokeWidth: 2.5 };
  switch (type) {
    case "start": return <Flag {...props} />;
    case "end":   return <Flag {...props} />;
    case "via":   return <Diamond {...props} />;
    default:      return <MapPin {...props} />;
  }
}

function formatDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatDur(sec: number): string {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.round((sec % 3600) / 60);
  if (hrs === 0) return `${mins} min`;
  return `${hrs}h ${mins}m`;
}

/** Join class names, filtering out falsy values */
function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/* ── Component ────────────────────────────────────────────────────────── */

export function TripView({
  planId,
  navpack,
  corridor,
  places,
  traffic,
  hazards,
  focusedStopId,
  onFocusStop,
  focusedPlaceId,
  onFocusPlace,
  onRebuildRequested,
  onAddSuggestion,
  highlightedAlertId,
  onHighlightAlert,
  userPosition,
  fuelAnalysis,
  onOpenFuelSettings,
  offlineRouted,
  isOnline,
}: {
  planId: string;
  navpack: NavPack | null;
  corridor: CorridorGraphPack | null;
  places?: PlacesPack | null;
  traffic?: TrafficOverlay | null;
  hazards?: HazardOverlay | null;
  focusedStopId: string | null;
  onFocusStop: (id: string | null) => void;
  focusedPlaceId?: string | null;
  onFocusPlace?: (placeId: string | null) => void;
  onRebuildRequested?: (args: { stops: TripStop[]; mode: TripEditorRebuildMode }) => Promise<void>;
  onAddSuggestion?: (place: PlaceItem) => Promise<void> | void;
  highlightedAlertId?: string | null;
  onHighlightAlert?: (ev: AlertHighlightEvent) => void;
  userPosition?: RoamPosition | null;
  fuelAnalysis?: FuelAnalysis | null;
  onOpenFuelSettings?: () => void;
  offlineRouted?: boolean;
  isOnline?: boolean;
}) {
  /* ── Editor state ───────────────────────────────────────────────────── */
  const [stops, setStops] = useState<TripStop[]>(() => ensureStopIds(navpack?.req?.stops ?? []));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>("route");
  const [mode] = useState<TripEditorRebuildMode>("auto");

  useEffect(() => {
    setStops(ensureStopIds(navpack?.req?.stops ?? []));
    setDirty(false);
    setErr(null);
  }, [navpack]);

  // Online: OSRM handles routing (corridor not required).
  // Offline: corridor graph required for A* routing.
  const canRebuild = stops.length >= 2 && !!onRebuildRequested && (isOnline || !!corridor);

  /* ── Alert intelligence ─────────────────────────────────────────────── */
  const routeGeometry = navpack?.primary?.geometry ?? null;
  const stopsForProjection = useMemo(
    () =>
      stops.filter((st) => typeof st.lat === "number" && typeof st.lng === "number") as Array<{
        lat: number;
        lng: number;
      }>,
    [stops],
  );

  const {
    all: allAlerts,
    next: nextAlert,
    routeBlockers,
    alertsForLeg,
    highCount,
    totalCount,
    staleness,
    hideBehind,
    toggleHideBehind,
    behindCount,
    dismissAlert,
    dismissedCount,
  } = useAlerts(traffic, hazards, routeGeometry, userPosition, stopsForProjection);

  /* ── Stop editing ───────────────────────────────────────────────────── */
  const moveStop = useCallback(
    (fromIdx: number, dir: -1 | 1) => {
      haptic.selection();
      setStops((prev) => {
        const toIdx = fromIdx + dir;
        if (toIdx < 0 || toIdx >= prev.length) return prev;
        const from = prev[fromIdx];
        const to = prev[toIdx];
        if (!from || !to || isLockedStop(from) || isLockedStop(to)) return prev;
        const out = [...prev];
        const [moved] = out.splice(fromIdx, 1);
        out.splice(toIdx, 0, moved);
        return out;
      });
      setDirty(true);
    },
    [],
  );

  const removeStop = useCallback(
    (id?: string | null) => {
      if (!id) return;
      haptic.medium();
      setStops((prev) => {
        const found = prev.find((x) => x.id === id);
        if (!found || isLockedStop(found)) return prev;
        return prev.filter((x) => x.id !== id);
      });
      if (focusedStopId === id) onFocusStop(null);
      setDirty(true);
    },
    [focusedStopId, onFocusStop],
  );

  const addStopFromPlace = useCallback(
    (p: PlaceItem) => {
      haptic.tap();
      if (onAddSuggestion) {
        onAddSuggestion(p);
        return;
      }

      // Build the updated stops list so we can trigger an immediate rebuild.
      const prev = ensureStopIds(stops);
      const out = [...prev];
      const endIdx = out.findIndex((st) => (st.type ?? "poi") === "end");
      const next: TripStop = { id: shortId(), type: "poi", name: p.name, lat: p.lat, lng: p.lng };
      if (endIdx >= 0) out.splice(endIdx, 0, next);
      else out.push(next);

      setStops(out);
      hideKeyboard();
      setActiveSection("route");

      // Auto-rebuild so the route recalculates and persists to IDB immediately.
      if (out.length >= 2 && onRebuildRequested) {
        setBusy("rebuilding");
        setErr(null);
        onRebuildRequested({ stops: out, mode })
          .then(() => {
            setDirty(false);
            haptic.success();
          })
          .catch((e: any) => {
            // Rebuild failed — mark dirty so user can retry manually
            setDirty(true);
            setErr(e?.message ?? "Rebuild failed");
            haptic.error();
          })
          .finally(() => setBusy(null));
      } else {
        setDirty(true);
      }
    },
    [onAddSuggestion, stops, onRebuildRequested, mode],
  );

  const reset = useCallback(() => {
    haptic.tap();
    setStops(ensureStopIds(navpack?.req?.stops ?? []));
    setDirty(false);
    setErr(null);
  }, [navpack]);

  const rebuild = useCallback(async () => {
    if (!canRebuild || !onRebuildRequested) return;
    haptic.medium();
    hideKeyboard();
    setBusy("rebuilding");
    setErr(null);
    try {
      await onRebuildRequested({ stops: ensureStopIds(stops), mode });
      setDirty(false);
      haptic.success();
    } catch (e: any) {
      setErr(e?.message ?? "Rebuild failed");
      haptic.error();
    } finally {
      setBusy(null);
    }
  }, [canRebuild, onRebuildRequested, stops, mode]);

  /* ── Derived ────────────────────────────────────────────────────────── */
  const distance = navpack?.primary?.distance_m ?? 0;
  const duration = navpack?.primary?.duration_s ?? 0;
  const placesCount = places?.items?.length ?? 0;

  /* ── No-route fallback ──────────────────────────────────────────────── */
  if (!navpack) {
    return <div className={s.noRoute}>No route active.</div>;
  }

  /* ── Section tabs config ────────────────────────────────────────────── */
  const tabs: { key: ActiveSection; label: string; icon: React.ReactNode; badge?: string }[] = [
    { key: "route", label: "Route", icon: <Route size={14} strokeWidth={2.5} /> },
    {
      key: "places",
      label: "Places",
      icon: <MapIcon size={14} strokeWidth={2.5} />,
      badge: placesCount > 0 ? String(placesCount) : undefined,
    },
  ];

  return (
    <div className={s.root}>
      {/* ── Fuel summary card ────── */}
      <FuelSummaryCard
        analysis={fuelAnalysis ?? null}
        onOpenSettings={onOpenFuelSettings}
      />

      <NextAlertBanner
        next={nextAlert}
        totalCount={totalCount}
        highCount={highCount}
        allAlerts={allAlerts}
        routeBlockers={routeBlockers}
        highlighted={highlightedAlertId}
        onHighlight={onHighlightAlert}
        onDismiss={dismissAlert}
        onRebuildRequested={canRebuild ? rebuild : undefined}
        staleness={staleness}
        hideBehind={hideBehind}
        onToggleHideBehind={toggleHideBehind}
        behindCount={behindCount}
        dismissedCount={dismissedCount}
      />
      {/* ── Error ──────────────────────────────────────────────────────── */}
      {err && <div className={s.errorBox}>{err}</div>}

      {/* ── Section tabs ───────────────────────────────────────────────── */}
      <div className={s.tabBar}>
        {tabs.map((tab) => {
          const active = activeSection === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={cx(s.tab, active && s.tabActive)}
              onClick={() => {
                haptic.selection();
                setActiveSection(tab.key);
              }}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && <span className={s.tabBadge}>{tab.badge}</span>}
            </button>
          );
        })}
      </div>

      {/* ══ Route section ═══════════════════════════════════════════════ */}
      {activeSection === "route" && (
        <>
          {/* Subtle Route Meta Row */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 4px 16px",
            color: "var(--roam-text-muted)",
            fontSize: 12,
            fontWeight: 700
          }}>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Navigation size={13} strokeWidth={2.5} />
                {formatDist(distance)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={13} strokeWidth={2.5} />
                {formatDur(duration)}
              </div>
            </div>

            {dirty && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "var(--roam-warn)",
                background: "var(--severity-minor-tint)",
                padding: "2px 8px",
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 900
              }}>
                <Save size={11} strokeWidth={2.5} />
                Unsaved
              </div>
            )}
          </div>

          {/* Offline routing indicator */}
          {offlineRouted && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              marginBottom: 12,
              borderRadius: 10,
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              fontSize: 11,
              fontWeight: 800,
              color: "rgb(180, 120, 10)",
            }}>
              <WifiOff size={13} strokeWidth={2.5} />
              <span>Route built offline using corridor graph. Turn-by-turn steps unavailable.</span>
              {isOnline && (
                <span style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--roam-accent)",
                  whiteSpace: "nowrap",
                }}>
                  Rebuild online for full navigation
                </span>
              )}
            </div>
          )}

          <div className={s.stopList}>
            {stops.map((stop, index) => {
              const type = resolveType(stop);
              const isFocused = focusedStopId === stop.id;
              const locked = isLockedStop(stop);
              const legAlerts =
              index < stops.length - 1 ? alertsForLeg(index, index + 1) : [];
              return (
                <div key={stop.id ?? index} className={s.stopEntry}>
                  {/* Stop card */}
                  <div
                    className={cx(s.stopCard, isFocused && s.stopCardFocused)}
                    data-stop-type={type}
                    onClick={() => {
                      haptic.selection();
                      onFocusStop(stop.id ?? null);
                    }}
                  >
                    {/* Marker icon */}
                    <div className={s.stopMarker} data-type={type}>
                      <StopIcon type={type} />
                      <div className={s.indexBadge} data-type={type}>
                        {index + 1}
                      </div>
                    </div>

                    {/* Name + meta */}
                    <div className={s.stopContent}>
                      <div className={s.stopName}>{stopLabel(stop, index)}</div>
                      <div className={s.stopMeta}>
                        {typeof stop.lat === "number" && typeof stop.lng === "number" && (
                          <span className={s.stopCoords}>
                            {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                          </span>
                        )}
                        <span className={s.stopTypeBadge} data-type={type}>
                          {type}
                        </span>
                      </div>
                    </div>

                    {/* Edit controls */}
                    {!locked && (
                      <div className={s.stopControls}>
                        {index > 1 && (
                          <button
                            type="button"
                            className={s.controlBtn}
                            disabled={!!busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStop(index, -1);
                            }}
                            aria-label="Move up"
                          >
                            <ChevronUp size={14} strokeWidth={2.5} />
                          </button>
                        )}
                        {index < stops.length - 2 && (
                          <button
                            type="button"
                            className={s.controlBtn}
                            disabled={!!busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStop(index, 1);
                            }}
                            aria-label="Move down"
                          >
                            <ChevronDown size={14} strokeWidth={2.5} />
                          </button>
                        )}
                        <button
                          type="button"
                          className={s.controlBtnDanger}
                          disabled={!!busy}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeStop(stop.id);
                          }}
                          aria-label="Remove stop"
                        >
                          <X size={14} strokeWidth={2.5} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Inline leg alerts */}
                  {legAlerts.length > 0 && (
                  <LegAlertStrip
                  alerts={legAlerts}
                  highlighted={highlightedAlertId}
                  onHighlight={onHighlightAlert}
                  onDismiss={dismissAlert}
                />
                  )}

                  {/* Connector line between stops */}
                  {index < stops.length - 1 && legAlerts.length === 0 && (
                    <div className={s.connector}>
                      <div className={s.connectorLine} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add stop button */}
            <button
              type="button"
              className={s.addStopBtn}
              disabled={!!busy}
              onClick={() => {
                haptic.tap();
                setActiveSection("places");
              }}
            >
              <Plus size={15} strokeWidth={2.5} />
              Add Stop from Places
            </button>

            {/* Save / Reset footer */}
            {dirty && (
              <div className={s.footer}>
                <button
                  type="button"
                  className={s.resetBtn}
                  disabled={!!busy}
                  onClick={reset}
                >
                  <RotateCcw size={13} strokeWidth={2.5} />
                  Reset
                </button>
                <button
                  type="button"
                  className={cx(s.saveBtn, (!canRebuild || !!busy) && s.saveBtnDisabled)}
                  disabled={!!busy || !canRebuild}
                  onClick={rebuild}
                >
                  {busy ? (
                    <>
                      <Loader2 size={14} strokeWidth={2.5} className={s.spinner} />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save size={14} strokeWidth={2.5} />
                      Save Route
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ Places section ══════════════════════════════════════════════ */}
      {activeSection === "places" && (
        <div className={s.placesSection}>
          {places && placesCount > 0 ? (
            <TripSuggestionsPanel
              places={places}
              enableSearch={true}
              maxHeight="50vh"
              focusedPlaceId={focusedPlaceId ?? null}
              onFocusPlace={onFocusPlace}
              onAddStopFromPlace={addStopFromPlace}
            />
          ) : (
            <div className={s.emptyPlaces}>
              <div className={s.emptyPlacesIcon}>
                <MapIcon size={28} strokeWidth={1.5} />
              </div>
              <div className={s.emptyPlacesTitle}>No places loaded yet</div>
              <div className={s.emptyPlacesSub}>
                Places will appear here once your route corridor is loaded
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
