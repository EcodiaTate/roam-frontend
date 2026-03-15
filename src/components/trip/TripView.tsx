// src/components/trip/TripView.tsx
"use client";

import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from "react";
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
  planId: _planId,
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
  /* ── Auto-rebuild helper (debounced + optimistic) ────────────────── */
  // UI updates (stops reorder) are instant.  The actual route rebuild is
  // debounced by 600ms so rapid changes coalesce into a single request.
  // Buttons stay enabled while the rebuild runs in the background — if
  // the user makes another change mid-flight, we queue a follow-up
  // rebuild with the latest stops once the current one settles.
  const rebuildTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStops = useRef<TripStop[] | null>(null);
  const rebuildInFlight = useRef(false);

  const flushRebuild = useCallback(
    (nextStops: TripStop[]) => {
      if (nextStops.length < 2 || !onRebuildRequested) return;
      // If a rebuild is already in flight, just stash the latest stops —
      // the in-flight completion handler will kick off a follow-up.
      if (rebuildInFlight.current) {
        pendingStops.current = nextStops;
        return;
      }
      rebuildInFlight.current = true;
      setBusy("rebuilding");
      setErr(null);
      onRebuildRequested({ stops: ensureStopIds(nextStops), mode })
        .then(() => {
          setDirty(false);
          haptic.success();
        })
        .catch((e: unknown) => {
          setDirty(true);
          setErr(e instanceof Error ? e.message : "Rebuild failed");
          haptic.error();
        })
        .finally(() => {
          rebuildInFlight.current = false;
          // If the user made more changes while we were rebuilding,
          // kick off another rebuild with the latest stops.
          const queued = pendingStops.current;
          if (queued) {
            pendingStops.current = null;
            flushRebuild(queued);
          } else {
            setBusy(null);
          }
        });
    },
    [onRebuildRequested, mode],
  );

  const autoRebuild = useCallback(
    (nextStops: TripStop[]) => {
      // Clear any pending debounce so we always use the latest stops.
      if (rebuildTimer.current) clearTimeout(rebuildTimer.current);
      setDirty(true);
      rebuildTimer.current = setTimeout(() => {
        rebuildTimer.current = null;
        flushRebuild(nextStops);
      }, 600);
    },
    [flushRebuild],
  );

  // Cleanup debounce timer on unmount.
  useEffect(() => () => { if (rebuildTimer.current) clearTimeout(rebuildTimer.current); }, []);

  /* ── Reorder & remove animation ───────────────────────────────────── */
  const stopElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const flipSnapshot = useRef<Map<string, DOMRect>>(new Map());
  // Which stop id was actively moved (gets the "lifted" highlight)
  const movedIdRef = useRef<string | null>(null);
  // Which stop id was just added (gets the entrance animation)
  const addedIdRef = useRef<string | null>(null);

  const capturePositions = useCallback(() => {
    const snap = new Map<string, DOMRect>();
    stopElsRef.current.forEach((el, id) => snap.set(id, el.getBoundingClientRect()));
    flipSnapshot.current = snap;
  }, []);

  // FLIP: after stops change, animate cards from old → new positions.
  // Also handles entrance animation for newly added stops.
  useLayoutEffect(() => {
    const prev = flipSnapshot.current;
    const movedId = movedIdRef.current;
    const addedId = addedIdRef.current;
    movedIdRef.current = null;
    addedIdRef.current = null;

    // Entrance animation for newly added stop
    if (addedId) {
      const el = stopElsRef.current.get(addedId);
      if (el) {
        el.style.transition = "none";
        el.style.opacity = "0";
        el.style.transform = "translateY(-12px) scale(0.96)";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = "opacity 280ms ease, transform 320ms cubic-bezier(0.34, 1.4, 0.64, 1)";
            el.style.opacity = "1";
            el.style.transform = "";
            const cleanup = () => { el.style.transition = ""; };
            el.addEventListener("transitionend", cleanup, { once: true });
            setTimeout(cleanup, 350);
          });
        });
      }
    }

    if (prev.size === 0) return;

    stopElsRef.current.forEach((el, id) => {
      if (id === addedId) return; // already handled above
      const oldRect = prev.get(id);
      if (!oldRect) return;
      const newRect = el.getBoundingClientRect();
      const dy = oldRect.top - newRect.top;
      if (Math.abs(dy) < 1) return;

      const isMoved = id === movedId;
      // Invert: snap to old position
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)${isMoved ? " scale(1.03)" : ""}`;
      if (isMoved) {
        el.style.zIndex = "10";
        el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
      }
      // Play: animate to final position
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const dur = isMoved ? "320ms" : "280ms";
          const ease = isMoved
            ? "cubic-bezier(0.34, 1.4, 0.64, 1)"   // slight overshoot for moved card
            : "cubic-bezier(0.25, 0.1, 0.25, 1)";
          el.style.transition = [
            `transform ${dur} ${ease}`,
            isMoved ? `box-shadow ${dur} ${ease}` : "",
          ].filter(Boolean).join(", ");
          el.style.transform = "";
          if (isMoved) el.style.boxShadow = "";
          // Clean up after animation finishes
          const cleanup = () => {
            el.style.zIndex = "";
            el.style.transition = "";
          };
          el.addEventListener("transitionend", cleanup, { once: true });
          setTimeout(cleanup, 350);
        });
      });
    });
    flipSnapshot.current = new Map();
  }, [stops]);

  const moveStop = useCallback(
    (fromIdx: number, dir: -1 | 1) => {
      haptic.selection();
      capturePositions();
      setStops((prev) => {
        const toIdx = fromIdx + dir;
        if (toIdx < 0 || toIdx >= prev.length) return prev;
        const from = prev[fromIdx];
        const to = prev[toIdx];
        if (!from || !to || isLockedStop(from) || isLockedStop(to)) return prev;
        movedIdRef.current = from.id ?? null;
        const out = [...prev];
        const [moved] = out.splice(fromIdx, 1);
        out.splice(toIdx, 0, moved);
        autoRebuild(out);
        return out;
      });
    },
    [autoRebuild, capturePositions],
  );

  const removeStop = useCallback(
    (id?: string | null) => {
      if (!id) return;
      haptic.medium();
      const el = stopElsRef.current.get(id);
      const doRemove = () => {
        capturePositions();
        setStops((prev) => {
          const found = prev.find((x) => x.id === id);
          if (!found || isLockedStop(found)) return prev;
          const out = prev.filter((x) => x.id !== id);
          autoRebuild(out);
          return out;
        });
        if (focusedStopId === id) onFocusStop(null);
      };
      if (el) {
        let fired = false;
        const once = () => { if (fired) return; fired = true; doRemove(); };
        // Slide out to the right + fade + collapse height
        const h = el.offsetHeight;
        el.style.height = `${h}px`;
        el.style.overflow = "hidden";
        el.style.transition = "transform 250ms ease, opacity 200ms ease";
        el.style.transform = "translateX(60px)";
        el.style.opacity = "0";
        // After the slide-out, collapse the height for remaining items
        setTimeout(() => {
          el.style.transition = "height 200ms ease, margin 200ms ease, padding 200ms ease";
          el.style.height = "0px";
          el.style.marginTop = "0px";
          el.style.marginBottom = "0px";
          el.style.paddingTop = "0px";
          el.style.paddingBottom = "0px";
        }, 200);
        setTimeout(once, 420);
      } else {
        doRemove();
      }
    },
    [focusedStopId, onFocusStop, autoRebuild, capturePositions],
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
      const newId = shortId();
      const next: TripStop = { id: newId, type: "poi", name: p.name, lat: p.lat, lng: p.lng };
      if (endIdx >= 0) out.splice(endIdx, 0, next);
      else out.push(next);

      capturePositions();
      addedIdRef.current = newId;
      setStops(out);
      hideKeyboard();
      setActiveSection("route");
      autoRebuild(out);
    },
    [onAddSuggestion, stops, autoRebuild, capturePositions],
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
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Rebuild failed");
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
                <div
                  key={stop.id ?? index}
                  className={s.stopEntry}
                  ref={(el) => {
                    const id = stop.id;
                    if (!id) return;
                    if (el) stopElsRef.current.set(id, el);
                    else stopElsRef.current.delete(id);
                  }}
                >
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
                      <div className={s.stopControls} onPointerDown={(e) => e.stopPropagation()}>
                        {index > 1 && (
                          <button
                            type="button"
                            className={s.controlBtn}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            removeStop(stop.id);
                          }}
                          aria-label="Remove stop"
                        >
                          <X size={18} strokeWidth={2.5} />
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
