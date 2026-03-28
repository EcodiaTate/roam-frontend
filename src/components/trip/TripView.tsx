// src/components/trip/TripView.tsx

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useFLIP } from "@/lib/hooks/useFLIP";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { TripStop } from "@/lib/types/trip";
import type { PlacesPack, PlaceItem } from "@/lib/types/places";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { FuelAnalysis } from "@/lib/types/fuel";
import { haptic } from "@/lib/native/haptics";
import { toErrorMessage } from "@/lib/utils/errors";
import { hideKeyboard } from "@/lib/native/keyboard";
import { shortId } from "@/lib/utils/ids";
import { formatDistance, formatDuration } from "@/lib/utils/format";
import { cx } from "@/lib/utils/cx";

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
    WifiOff,
    GripVertical,
    Shuffle,
    CheckCheck,
    Clock,
} from "lucide-react";

import {
    useAlerts,
    NextAlertBanner,
    LegAlertStrip,
    type AlertHighlightEvent,
} from "@/components/trip/TripAlertsPanel";
import { PlaceSearchPanel } from "@/components/places/PlaceSearchPanel";
import { usePlaceDetail } from "@/lib/context/PlaceDetailContext";
import { FuelSummaryCard } from "@/components/fuel/FuelSummaryCard";
import { alertsToAvoidZones, buildAvoidanceStops } from "@/lib/nav/routeAvoidance";
import { decodePolyline6AsLngLat } from "@/lib/nav/polyline6";
import {
    StopQuickActionMenu,
    type QuickActionMenuState,
    type StopQuickAction,
} from "@/components/trip/StopQuickActionMenu";

import { SectionHeader } from "@/components/ui/SectionHeader";
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

/** Compact schedule label for stop cards (dd/mm HH:MM format). */
function stopSchedule(st: TripStop): string | null {
  const fmt = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      return `${dd}/${mm} ${h}:${m}`;
    } catch { return null; }
  };
  const a = st.arrive_at ? fmt(st.arrive_at) : null;
  const dep = st.depart_at ? fmt(st.depart_at) : null;
  if (a && dep) return `${a} → ${dep}`;
  if (a) return `Arrive ${a}`;
  if (dep) return `Depart ${dep}`;
  return null;
}

function StopIcon({ type, size = 14 }: { type?: string; size?: number }) {
  const props = { size, strokeWidth: 2 };
  switch (type) {
    case "start": return <Flag {...props} />;
    case "end":   return <Flag {...props} />;
    case "via":   return <Diamond {...props} />;
    default:      return <MapPin {...props} />;
  }
}

/* ── Drag state ───────────────────────────────────────────────────────── */

type DragState = {
  fromIdx: number;
  overIdx: number;
  offsetY: number;
  itemHeights: number[];
  itemTops: number[];
};

/* ── Component ────────────────────────────────────────────────────────── */

export type StopQuickActionHandler = (action: StopQuickAction, stopId: string) => void;

export function TripView({
  planId: _planId,
  navpack,
  corridor,
  places,
  traffic,
  hazards,
  focusedStopId,
  onFocusStop,
  focusedPlaceId: _focusedPlaceId,
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
  onFilteredIdsChange,
  onStopQuickAction,
  simple,
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
  onFilteredIdsChange?: (ids: Set<string> | null) => void;
  onStopQuickAction?: StopQuickActionHandler;
  /** Simple mode - fewer controls, bigger tap targets */
  simple?: boolean;
}) {
  /* ── Context ──────────────────────────────────────────────────────────── */
  const { openPlace } = usePlaceDetail();

  /* ── Editor state ───────────────────────────────────────────────────── */
  const [stops, setStops] = useState<TripStop[]>(() => ensureStopIds(navpack?.req?.stops ?? []));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>("route");
  // Defer mounting PlaceSearchPanel until the user first opens the Places tab.
  // Avoids search/filter/merge work on initial render and while Route tab is active.
  const [placesEverOpened, setPlacesEverOpened] = useState(false);
  const mode: TripEditorRebuildMode = "auto";

  useEffect(() => {
    setStops(ensureStopIds(navpack?.req?.stops ?? []));
    setDirty(false);
    setErr(null);
  }, [navpack]);

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

  /* ── Auto-rebuild helper (debounced + optimistic) ────────────────── */
  const rebuildTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStops = useRef<TripStop[] | null>(null);
  const rebuildInFlight = useRef(false);

  const flushRebuild = useCallback(
    (nextStops: TripStop[]) => {
      if (nextStops.length < 2 || !onRebuildRequested) return;
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
          setErr(toErrorMessage(e, "Rebuild failed"));
          haptic.error();
        })
        .finally(() => {
          rebuildInFlight.current = false;
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
      if (rebuildTimer.current) clearTimeout(rebuildTimer.current);
      setDirty(true);
      rebuildTimer.current = setTimeout(() => {
        rebuildTimer.current = null;
        flushRebuild(nextStops);
      }, 600);
    },
    [flushRebuild],
  );

  useEffect(() => () => { if (rebuildTimer.current) clearTimeout(rebuildTimer.current); }, []);

  /* ── Reorder & remove animation (shared FLIP hook) ───────────────── */
  const { registerEl: registerStopEl, capturePositions, setMovedId, setAddedId, getEl } = useFLIP(stops, { entrance: true });

  const moveStop = useCallback(
    (fromIdx: number, dir: -1 | 1) => {
      haptic.selection();
      capturePositions();
      let moved: TripStop[] | null = null;
      setStops((prev) => {
        const toIdx = fromIdx + dir;
        if (toIdx < 0 || toIdx >= prev.length) return prev;
        const from = prev[fromIdx];
        const to = prev[toIdx];
        if (!from || !to || isLockedStop(from) || isLockedStop(to)) return prev;
        setMovedId(from.id ?? null);
        const out = [...prev];
        const [m] = out.splice(fromIdx, 1);
        out.splice(toIdx, 0, m);
        moved = out;
        return out;
      });
      if (moved) autoRebuild(moved);
    },
    [autoRebuild, capturePositions, setMovedId],
  );

  const removeStop = useCallback(
    (id?: string | null) => {
      if (!id) return;
      haptic.medium();
      const el = getEl(id);
      const doRemove = () => {
        capturePositions();
        let removed: TripStop[] | null = null;
        setStops((prev) => {
          const found = prev.find((x) => x.id === id);
          if (!found || isLockedStop(found)) return prev;
          const out = prev.filter((x) => x.id !== id);
          removed = out;
          return out;
        });
        if (removed) autoRebuild(removed);
        if (focusedStopId === id) onFocusStop(null);
      };
      if (el) {
        let fired = false;
        const once = () => { if (fired) return; fired = true; doRemove(); };
        el.style.height = `${el.offsetHeight}px`;
        el.dataset.removing = "true";
        setTimeout(() => { el.dataset.collapsing = "true"; }, 200);
        setTimeout(once, 420);
      } else {
        doRemove();
      }
    },
    [focusedStopId, onFocusStop, autoRebuild, capturePositions, getEl],
  );

  const _addStopFromPlace = useCallback(
    (p: PlaceItem) => {
      haptic.tap();
      if (onAddSuggestion) {
        onAddSuggestion(p);
        return;
      }
      const prev = ensureStopIds(stops);
      const out = [...prev];
      const endIdx = out.findIndex((st) => (st.type ?? "poi") === "end");
      const newId = shortId();
      const next: TripStop = { id: newId, type: "poi", name: p.name, lat: p.lat, lng: p.lng };
      if (endIdx >= 0) out.splice(endIdx, 0, next);
      else out.push(next);
      capturePositions();
      setAddedId(newId);
      setStops(out);
      hideKeyboard();
      setActiveSection("route");
      autoRebuild(out);
    },
    [onAddSuggestion, stops, autoRebuild, capturePositions, setAddedId],
  );

  const reset = useCallback(() => {
    haptic.tap();
    setStops(ensureStopIds(navpack?.req?.stops ?? []));
    setDirty(false);
    setErr(null);
  }, [navpack]);

  /* ── Optimize route (nearest-neighbour TSP) ──────────────────── */
  const [optimizeToast, setOptimizeToast] = useState(false);

  const optimizeRoute = useCallback(() => {
    let optimized: TripStop[] | null = null;
    setStops((prev) => {
      if (prev.length < 3) return prev;

      const startLocked = prev[0] && isLockedStop(prev[0]);
      const endLocked = prev[prev.length - 1] && isLockedStop(prev[prev.length - 1]);

      const fixedStart = startLocked ? prev[0] : null;
      const fixedEnd = endLocked ? prev[prev.length - 1] : null;

      // Middle stops to reorder
      const middle = prev.filter((st) => !isLockedStop(st));
      if (middle.length < 2) return prev;

      // Nearest-neighbour from the start position
      const startLat = fixedStart?.lat ?? middle[0]?.lat ?? 0;
      const startLng = fixedStart?.lng ?? middle[0]?.lng ?? 0;

      const unvisited = [...middle];
      const ordered: TripStop[] = [];
      let curLat = startLat;
      let curLng = startLng;

      while (unvisited.length > 0) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
          const st = unvisited[i]!;
          if (typeof st.lat !== "number" || typeof st.lng !== "number") { nearestIdx = i; break; }
          const dlat = st.lat - curLat;
          const dlng = st.lng - curLng;
          const d = dlat * dlat + dlng * dlng; // squared distance is fine for comparison
          if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
        }
        const next = unvisited.splice(nearestIdx, 1)[0]!;
        ordered.push(next);
        curLat = next.lat ?? curLat;
        curLng = next.lng ?? curLng;
      }

      const out: TripStop[] = [
        ...(fixedStart ? [fixedStart] : []),
        ...ordered,
        ...(fixedEnd ? [fixedEnd] : []),
      ];

      // Only apply if order actually changed
      const changed = out.some((st, i) => st.id !== prev[i]?.id);
      if (!changed) return prev;

      capturePositions();
      optimized = out;
      return out;
    });
    if (optimized) autoRebuild(optimized);

    haptic.success();
    setOptimizeToast(true);
    setTimeout(() => setOptimizeToast(false), 2200);
  }, [capturePositions, autoRebuild]);

  const rebuild = useCallback(async () => {
    if (!canRebuild || !onRebuildRequested) return;
    haptic.medium();
    hideKeyboard();
    setBusy("rebuilding");
    setErr(null);
    try {
      let rebuildStops = ensureStopIds(stops);

      // When route blockers or high-severity alerts exist, compute avoidance waypoints
      // that detour around hazard zones before sending to OSRM
      if (routeBlockers.length > 0 || allAlerts.some((a) => a.routeImpact === "affects_route" && (a.severity === "major" || a.severity === "high"))) {
        const geom = routeGeometry;
        if (geom) {
          try {
            const routeCoords = decodePolyline6AsLngLat(geom);
            const zones = alertsToAvoidZones([...routeBlockers, ...allAlerts]);
            const avoidStops = buildAvoidanceStops(rebuildStops, zones, routeCoords);
            if (avoidStops) rebuildStops = ensureStopIds(avoidStops);
          } catch (avoidErr) {
            console.warn("[TripView] avoidance waypoint computation failed, rebuilding without avoidance:", avoidErr);
          }
        }
      }

      await onRebuildRequested({ stops: rebuildStops, mode });
      setDirty(false);
      haptic.success();
    } catch (e: unknown) {
      setErr(toErrorMessage(e, "Rebuild failed"));
      haptic.error();
    } finally {
      setBusy(null);
    }
  }, [canRebuild, onRebuildRequested, stops, mode, routeBlockers, allAlerts, routeGeometry]);

  /* ── Drag-to-reorder ─────────────────────────────────────────────── */
  const listRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [ghostTop, setGhostTop] = useState(0);

  const snapshotItemRects = useCallback(() => {
    if (!listRef.current) return { heights: [] as number[], tops: [] as number[] };
    const listTop = listRef.current.getBoundingClientRect().top;
    const items = Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-stop-idx]"));
    const heights = items.map((el) => el.offsetHeight);
    const tops = items.map((el) => el.getBoundingClientRect().top - listTop);
    return { heights, tops };
  }, []);

  const onDragHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, idx: number) => {
      const stop = stops[idx];
      if (!stop || isLockedStop(stop)) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);

      const { heights, tops } = snapshotItemRects();
      const listTop = listRef.current?.getBoundingClientRect().top ?? 0;
      const itemTopViewport = (tops[idx] ?? 0) + listTop;
      const offsetY = e.clientY - itemTopViewport;

      haptic.selection();
      setDragFromIdx(idx);
      setDragOverIdx(idx);
      setGhostTop(tops[idx] ?? 0);

      dragStateRef.current = {
        fromIdx: idx,
        overIdx: idx,
        offsetY,
        itemHeights: heights,
        itemTops: tops,
      };
    },
    [stops, snapshotItemRects],
  );

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      e.preventDefault();

      const listTop = listRef.current?.getBoundingClientRect().top ?? 0;
      const newGhostTop = e.clientY - listTop - ds.offsetY;
      setGhostTop(newGhostTop);

      // Determine hover index by midpoints
      const dragedItemH = ds.itemHeights[ds.fromIdx] ?? 60;
      const midY = e.clientY - listTop - ds.offsetY + dragedItemH / 2;
      let newOver = ds.fromIdx;
      for (let i = 0; i < ds.itemTops.length; i++) {
        const midI = (ds.itemTops[i] ?? 0) + (ds.itemHeights[i] ?? 60) / 2;
        if (midY > midI) newOver = i;
      }
      newOver = Math.max(0, Math.min(newOver, stops.length - 1));

      // Clamp away from locked start/end
      const startLocked = stops[0] && isLockedStop(stops[0]);
      const endLocked = stops[stops.length - 1] && isLockedStop(stops[stops.length - 1]);
      if (startLocked) newOver = Math.max(1, newOver);
      if (endLocked) newOver = Math.min(stops.length - 2, newOver);

      if (newOver !== ds.overIdx) {
        haptic.selection();
        ds.overIdx = newOver;
        setDragOverIdx(newOver);
      }
    },
    [stops],
  );

  const onDragPointerUp = useCallback(() => {
    const ds = dragStateRef.current;
    if (!ds) return;
    dragStateRef.current = null;

    const fromIdx = ds.fromIdx;
    const toIdx = ds.overIdx;
    setDragFromIdx(null);
    setDragOverIdx(null);

    if (fromIdx !== toIdx) {
      capturePositions();
      let reordered: TripStop[] | null = null;
      setStops((prev) => {
        const stop = prev[fromIdx];
        if (!stop || isLockedStop(stop)) return prev;
        const target = prev[toIdx];
        if (!target || isLockedStop(target)) return prev;
        setMovedId(stop.id ?? null);
        const out = [...prev];
        const [moved] = out.splice(fromIdx, 1);
        out.splice(toIdx, 0, moved);
        reordered = out;
        return out;
      });
      if (reordered) autoRebuild(reordered);
      haptic.medium();
    }
  }, [autoRebuild, capturePositions, setMovedId]);

  /* ── Long-press for quick action menu ───────────────────────────── */
  const [quickMenu, setQuickMenu] = useState<QuickActionMenuState | null>(null);
  const longPressTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const startLongPress = useCallback(
    (e: React.PointerEvent<HTMLElement>, stop: TripStop) => {
      // Don't fire long-press when drag has started
      if (dragStateRef.current) return;
      const id = stop.id ?? "";
      if (longPressTimers.current.has(id)) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const anchorX = e.clientX;
      const anchorY = e.clientY;

      const timer = setTimeout(() => {
        longPressTimers.current.delete(id);
        // Don't open menu if a drag started during the wait
        if (dragStateRef.current) return;
        haptic.heavy();
        setQuickMenu({
          stopId: id,
          stopName: stop.name?.trim() || stopLabel(stop, 0),
          anchorX,
          anchorY,
          isLocked: isLockedStop(stop),
          isWaypoint: (stop.type ?? "poi") === "via",
        });
      }, 500);
      longPressTimers.current.set(id, timer);

      const cancel = () => {
        clearTimeout(timer);
        longPressTimers.current.delete(id);
      };
      const onMove = (mv: PointerEvent) => {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        if (Math.sqrt(dx * dx + dy * dy) > 8) cancel();
      };
      const cleanup = () => {
        cancel();
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", cleanup);
        document.removeEventListener("pointercancel", cleanup);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", cleanup);
      document.addEventListener("pointercancel", cleanup);
    },
    [],
  );

  const handleQuickAction = useCallback(
    (action: StopQuickAction, stopId: string) => {
      if (action === "delete") {
        removeStop(stopId);
        return;
      }
      if (action === "move-to-start" || action === "move-to-end") {
        haptic.medium();
        capturePositions();
        let reordered: TripStop[] | null = null;
        setStops((prev) => {
          const idx = prev.findIndex((x) => x.id === stopId);
          if (idx < 0) return prev;
          const stop = prev[idx];
          if (!stop || isLockedStop(stop)) return prev;
          const startLocked = prev[0] && isLockedStop(prev[0]);
          const endLocked = prev[prev.length - 1] && isLockedStop(prev[prev.length - 1]);
          const targetIdx = action === "move-to-start"
            ? (startLocked ? 1 : 0)
            : (endLocked ? prev.length - 2 : prev.length - 1);
          if (idx === targetIdx) return prev;
          setMovedId(stopId);
          const out = [...prev];
          const [moved] = out.splice(idx, 1);
          out.splice(targetIdx, 0, moved);
          reordered = out;
          return out;
        });
        if (reordered) autoRebuild(reordered);
        return;
      }
      if (action === "set-waypoint") {
        haptic.tap();
        let updated: TripStop[] | null = null;
        setStops((prev) => {
          const idx = prev.findIndex((x) => x.id === stopId);
          if (idx < 0) return prev;
          const stop = prev[idx];
          if (!stop || isLockedStop(stop)) return prev;
          const newType = (stop.type ?? "poi") === "via" ? "poi" : "via";
          const out = [...prev];
          out[idx] = { ...stop, type: newType };
          updated = out;
          return out;
        });
        if (updated) autoRebuild(updated);
        return;
      }
      // Delegate add-note and other actions to parent
      onStopQuickAction?.(action, stopId);
    },
    [removeStop, capturePositions, setMovedId, autoRebuild, onStopQuickAction],
  );

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

  /* ── Leg data indexed by from-stop position ─────────────────────────── */
  const legs = navpack?.primary?.legs ?? [];

  /* ── Ghost height ───────────────────────────────────────────────────── */
  const ghostStop = dragFromIdx !== null ? stops[dragFromIdx] : null;
  const ghostHeight =
    dragFromIdx !== null && listRef.current
      ? (listRef.current.querySelector<HTMLElement>(`[data-stop-idx="${dragFromIdx}"]`)?.offsetHeight ?? 60)
      : 60;

  return (
    <div className={s.root} data-simple={simple ? "true" : undefined}>
      {/* ── Quick action menu ─── */}
      <StopQuickActionMenu
        state={quickMenu}
        onAction={handleQuickAction}
        onClose={() => setQuickMenu(null)}
      />

      {/* ── Fuel summary card ────── */}
      <FuelSummaryCard
        analysis={fuelAnalysis ?? null}
        onOpenSettings={onOpenFuelSettings}
      />

      {/* Alerts - simple mode: only show route blockers, no minor alerts */}
      <NextAlertBanner
        next={simple ? null : nextAlert}
        totalCount={simple ? routeBlockers.length : totalCount}
        highCount={simple ? routeBlockers.length : highCount}
        allAlerts={simple ? routeBlockers : allAlerts}
        routeBlockers={routeBlockers}
        highlighted={highlightedAlertId}
        onHighlight={onHighlightAlert}
        onDismiss={simple ? undefined : dismissAlert}
        onRebuildRequested={canRebuild ? rebuild : undefined}
        staleness={simple ? undefined : staleness}
        hideBehind={simple ? undefined : hideBehind}
        onToggleHideBehind={simple ? undefined : toggleHideBehind}
        behindCount={simple ? undefined : behindCount}
        dismissedCount={simple ? undefined : dismissedCount}
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
          {/* Route meta */}
          <div className={`${s.routeMeta} terra-topo`}>
            <div className={s.routeMetaStats}>
              <span>{formatDistance(distance)}</span>
              <span style={{ opacity: 0.4 }}>&middot;</span>
              <span>{formatDuration(duration)}</span>
            </div>

            {!simple && dirty && (
              <span className={s.unsavedBadge}>
                Unsaved changes
              </span>
            )}
          </div>

          {/* Offline routing indicator - hidden in simple mode */}
          {!simple && offlineRouted && (
            <div className={s.offlineBanner}>
              <WifiOff size={12} strokeWidth={2} />
              <span>Offline route</span>
              {isOnline && (
                <span className={s.offlineRebuild}>
                  Rebuild online
                </span>
              )}
            </div>
          )}

          {/* Stop list with drag-to-reorder */}
          <div
            ref={listRef}
            className={cx(s.stopList, dragFromIdx !== null && s.stopListDragging)}
          >
            {stops.map((stop, index) => {
              const type = resolveType(stop);
              const isFocused = focusedStopId === stop.id;
              const locked = isLockedStop(stop);
              const legAlerts =
                index < stops.length - 1 ? alertsForLeg(index, index + 1) : [];
              const isDraggingThis = dragFromIdx === index;
              const isDropTarget =
                dragFromIdx !== null && dragOverIdx === index && dragFromIdx !== index;

              return (
                <div
                  key={stop.id ?? index}
                  data-stop-idx={index}
                  className={cx(
                    s.stopEntry,
                    isDraggingThis && s.stopEntryDragging,
                    isDropTarget && s.stopEntryDropTarget,
                  )}
                  ref={(el) => {
                    if (stop.id) registerStopEl(stop.id, el);
                  }}
                >
                  {/* Stop card */}
                  <div
                    className={cx(s.stopCard, isFocused && s.stopCardFocused)}
                    data-stop-type={type}
                    onPointerDown={simple ? undefined : (e) => startLongPress(e, stop)}
                    onClick={() => {
                      haptic.selection();
                      onFocusStop(stop.id ?? null);
                    }}
                  >
                    {/* Drag handle (non-locked stops only) - hidden in simple mode */}
                    {!simple && !locked && (
                      <div
                        className={s.dragHandle}
                        onPointerDown={(e) => onDragHandlePointerDown(e, index)}
                        onPointerMove={onDragPointerMove}
                        onPointerUp={onDragPointerUp}
                        onPointerCancel={onDragPointerUp}
                        aria-label="Drag to reorder"
                      >
                        <GripVertical size={14} strokeWidth={2} />
                      </div>
                    )}

                    {/* Marker icon */}
                    <div className={s.stopMarker} data-type={type}>
                      <StopIcon type={type} />
                      <div className={s.indexBadge} data-type={type}>
                        {index + 1}
                      </div>
                    </div>

                    {/* Name + type + schedule */}
                    <div className={s.stopContent}>
                      <div className={s.stopName}>{stopLabel(stop, index)}</div>
                      {!simple && (
                        <div className={s.stopMeta}>
                          <span className={s.stopTypeBadge}>
                            {type === "poi" ? "stop" : type}
                          </span>
                        </div>
                      )}
                      {stopSchedule(stop) && (
                        <div className={s.stopSchedule}>
                          <Clock size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
                          {stopSchedule(stop)}
                        </div>
                      )}
                    </div>

                    {/* Edit controls - simple mode: delete only */}
                    {!locked && (
                      <div className={s.stopControls} onPointerDown={(e) => e.stopPropagation()}>
                        {!simple && index > 1 && (
                          <button
                            type="button"
                            className={s.controlBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStop(index, -1);
                            }}
                            aria-label="Move up"
                          >
                            <ChevronUp size={14} strokeWidth={2} />
                          </button>
                        )}
                        {!simple && index < stops.length - 2 && (
                          <button
                            type="button"
                            className={s.controlBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveStop(index, 1);
                            }}
                            aria-label="Move down"
                          >
                            <ChevronDown size={14} strokeWidth={2} />
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
                          <X size={14} strokeWidth={2} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Inline leg alerts - hidden in simple mode */}
                  {!simple && legAlerts.length > 0 && (
                    <LegAlertStrip
                      alerts={legAlerts}
                      highlighted={highlightedAlertId}
                      onHighlight={onHighlightAlert}
                      onDismiss={dismissAlert}
                    />
                  )}

                  {/* Connector line + leg pill between stops */}
                  {index < stops.length - 1 && legAlerts.length === 0 && (() => {
                    const leg = legs[index];
                    return (
                      <div className={s.connector}>
                        <div className={s.connectorLine} />
                        {leg && (
                          <span className={s.legPill}>
                            {formatDuration(leg.duration_s)}&nbsp;&middot;&nbsp;{formatDistance(leg.distance_m)}
                          </span>
                        )}
                        <div className={s.connectorLine} />
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {/* Drag ghost - floating card that follows the pointer */}
            {ghostStop && dragFromIdx !== null && (
              <div
                className={s.dragGhost}
                style={{ top: ghostTop, height: ghostHeight }}
                aria-hidden
              >
                <div className={cx(s.stopCard, s.dragGhostCard)} data-stop-type={resolveType(ghostStop)}>
                  <div className={s.dragHandle} style={{ pointerEvents: "none" }}>
                    <GripVertical size={14} strokeWidth={2} />
                  </div>
                  <div className={s.stopMarker} data-type={resolveType(ghostStop)}>
                    <StopIcon type={resolveType(ghostStop)} />
                    <div className={s.indexBadge}>{dragFromIdx + 1}</div>
                  </div>
                  <div className={s.stopContent}>
                    <div className={s.stopName}>{stopLabel(ghostStop, dragFromIdx)}</div>
                    <div className={s.stopMeta}>
                      <span className={s.stopTypeBadge}>
                        {resolveType(ghostStop) === "poi" ? "stop" : resolveType(ghostStop)}
                      </span>
                    </div>
                    {stopSchedule(ghostStop) && (
                      <div className={s.stopSchedule}>
                        <Clock size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
                        {stopSchedule(ghostStop)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Add stop button */}
            <button
              type="button"
              className={s.addStopBtn}
              onClick={() => {
                haptic.tap();
                setActiveSection("places");
              }}
            >
              <Plus size={14} strokeWidth={2} />
              Add stop
            </button>

            {/* Optimize route button - hidden in simple mode */}
            {!simple && stops.filter((st) => !isLockedStop(st)).length >= 2 && (
              optimizeToast ? (
                <div className={s.optimizeToast}>
                  <CheckCheck size={13} strokeWidth={2.5} />
                  Route optimised
                </div>
              ) : (
                <button
                  type="button"
                  className={s.optimizeBtn}
                  disabled={!!busy}
                  onClick={optimizeRoute}
                >
                  <Shuffle size={13} strokeWidth={2} />
                  Optimise Route
                </button>
              )
            )}

            {/* Save / Reset footer */}
            {dirty && (
              <div className={s.footer}>
                <button
                  type="button"
                  className={s.resetBtn}
                  disabled={!!busy}
                  onClick={reset}
                >
                  <RotateCcw size={13} strokeWidth={2} />
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
                      <Loader2 size={14} strokeWidth={2} className={s.spinner} />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save size={14} strokeWidth={2} />
                      Save Route
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ Places section - lazy-mounted on first tab open, hidden via CSS after ══ */}
      {activeSection === "places" || placesEverOpened ? (
        <div
          className={s.placesSection}
          style={activeSection !== "places" ? { display: "none" } : undefined}
          ref={(el) => { if (el && !placesEverOpened) setPlacesEverOpened(true); }}
        >
          <PlaceSearchPanel
            places={places ?? null}
            userPosition={userPosition ? { lat: userPosition.lat, lng: userPosition.lng, heading: userPosition.heading ?? null } : undefined}
            onSelectPlace={(p) => { openPlace(p); }}
            onShowPlaceOnMap={onFocusPlace ? (p) => { onFocusPlace(p.id); } : undefined}
            onFilteredIdsChange={onFilteredIdsChange}
            maxHeight="50vh"
          />
        </div>
      ) : null}
    </div>
  );
}
