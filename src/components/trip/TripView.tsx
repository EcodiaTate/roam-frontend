// src/components/trip/TripView.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { TripStop } from "@/lib/types/trip";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";
import type { RoamPosition } from "@/lib/native/geolocation";
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
} from "lucide-react";

import {
  useAlerts,
  NextAlertBanner,
  LegAlertStrip,
  type AlertHighlightEvent,
} from "@/components/trip/TripAlertsPanel";
import { TripSuggestionsPanel } from "@/components/trip/TripSuggestionsPanel";

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

  const canRebuild = stops.length >= 2 && !!corridor && !!onRebuildRequested;

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

  const alerts = useAlerts(traffic, hazards, routeGeometry, userPosition, stopsForProjection);

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
      setStops((prev) => {
        const out = [...prev];
        const endIdx = out.findIndex((st) => (st.type ?? "poi") === "end");
        const next: TripStop = { id: shortId(), type: "poi", name: p.name, lat: p.lat, lng: p.lng };
        if (endIdx >= 0) out.splice(endIdx, 0, next);
        else out.push(next);
        return out;
      });
      setDirty(true);
      hideKeyboard();
      setActiveSection("route");
    },
    [onAddSuggestion],
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
      {/* ── Route summary ──────────────────────────────────────────────── */}
      <div className={s.summaryCard}>
        <div className={s.summaryRow}>
          <div className={s.summaryLabel}>Route Overview</div>
          <div className={s.summaryStats}>
            {formatDist(distance)} · {formatDur(duration)}
          </div>
        </div>
        {dirty && (
          <div className={s.dirtyBanner}>
            <Save size={12} strokeWidth={2.5} />
            Unsaved route changes
          </div>
        )}
      </div>

      {/* ── Next alert banner (always visible if alerts exist) ──────── */}
      <NextAlertBanner
        next={alerts.next}
        totalCount={alerts.totalCount}
        highCount={alerts.highCount}
        allAlerts={alerts.all}
        highlighted={highlightedAlertId}
        onHighlight={onHighlightAlert}
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
        <div className={s.stopList}>
          {stops.map((stop, index) => {
            const type = resolveType(stop);
            const isFocused = focusedStopId === stop.id;
            const locked = isLockedStop(stop);
            const legAlerts =
              index < stops.length - 1 ? alerts.alertsForLeg(index, index + 1) : [];

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