// src/app/(app)/discover/ClientPage.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock,
  Compass,
  Globe,
  Loader,
  MapPin,
  Navigation,
  Plus,
  Route,
  Sliders,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "@/lib/supabase/auth";
import { useGeolocation } from "@/lib/native/geolocation";
import {
  fetchDiscoverFeed,
  clonePublicTrip,
  hasClonedTrip,
} from "@/lib/supabase/publicTrips";
import type { PublicTripRow } from "@/lib/types/discover";
import { formatDistanceOrDash, formatDurationOrDash } from "@/lib/utils/format";
import { haptic } from "@/lib/native/haptics";
import { CLONE_TRIP_SEED_KEY, type CloneTripSeed } from "@/lib/types/discover";

import s from "./Discover.module.css";

const TripPreviewMap = dynamic(() => import("./TripPreviewMap"), { ssr: false });

/* ── Proximity filter options ─────────────────────────────────────── */

const RADIUS_OPTIONS = [
  { label: "Nearby", km: 200 },
  { label: "500 km", km: 500 },
  { label: "1 000 km", km: 1000 },
  { label: "Anywhere", km: 0 },
] as const;

type RadiusOption = (typeof RADIUS_OPTIONS)[number];

/* ── Lazy card map preview ────────────────────────────────────────── */

function CardMapPreview({
  geometry,
  stops,
  bbox,
}: {
  geometry: string;
  stops: import("@/lib/types/trip").TripStop[];
  bbox: [number, number, number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={s.cardMap}>
      {visible && (
        <TripPreviewMap geometry={geometry} stops={stops} bbox={bbox} />
      )}
    </div>
  );
}

/* ── Trip feed card ───────────────────────────────────────────────── */

function TripCard({
  trip,
  onPress,
  index,
}: {
  trip: PublicTripRow;
  onPress: () => void;
  index: number;
}) {
  const stops = trip.stops ?? [];
  const start = stops.find((s) => s.type === "start") ?? stops[0];
  const end = stops.find((s) => s.type === "end") ?? stops[stops.length - 1];
  const viaCount = stops.filter((s) => s.type === "via" || s.type === "poi").length;

  const hasBbox =
    trip.bbox_west != null &&
    trip.bbox_south != null &&
    trip.bbox_east != null &&
    trip.bbox_north != null;
  const bbox: [number, number, number, number] | null = hasBbox
    ? [trip.bbox_west!, trip.bbox_south!, trip.bbox_east!, trip.bbox_north!]
    : null;

  return (
    <button
      type="button"
      onClick={() => { haptic.light(); onPress(); }}
      className={s.card}
      style={{ animation: `disc-cardIn 0.4s cubic-bezier(0.22,1,0.36,1) ${index * 50}ms both` }}
    >
      {/* Map preview */}
      {trip.geometry && bbox && (
        <CardMapPreview geometry={trip.geometry} stops={stops} bbox={bbox} />
      )}

      {/* Main content */}
      <div className={s.cardBody}>
        <p className={s.cardTitle}>{trip.title}</p>

        {viaCount > 0 && (
          <div className={s.cardVia}>
            <Compass size={10} strokeWidth={2.5} />
            {viaCount} stop{viaCount !== 1 ? "s" : ""} along the way
          </div>
        )}

        {/* Stats pills */}
        <div className={s.cardStats}>
          {[
            { icon: Route, text: formatDistanceOrDash(trip.distance_m) },
            { icon: Clock, text: formatDurationOrDash(trip.duration_s) },
            ...((trip.clone_count ?? 0) > 0
              ? [{ icon: Users, text: String(trip.clone_count) }]
              : []),
          ].map((stat) => (
            <span key={stat.text} className={s.cardStatPill}>
              <stat.icon size={10} strokeWidth={2.5} />
              {stat.text}
            </span>
          ))}
        </div>
      </div>

      {/* Footer: start → end */}
      <div className={s.cardFooter}>
        <div className={`${s.cardFooterDot} ${s.cardFooterDotStart}`} />
        <span className={s.cardFooterName}>{start?.name || "Start"}</span>
        <span className={s.cardFooterSep}>···</span>
        <div className={`${s.cardFooterDot} ${s.cardFooterDotEnd}`} />
        <span className={`${s.cardFooterName} ${s.cardFooterNameEnd}`}>{end?.name || "End"}</span>
      </div>
    </button>
  );
}

/* ── Rotating quip hook ───────────────────────────────────────────── */

function useRotatingQuip(quips: string[], active: boolean): string {
  const [idx, setIdx] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setIdx(0); }, [active]);

  useEffect(() => {
    if (!active) {
      if (ref.current) clearInterval(ref.current);
      return;
    }
    ref.current = setInterval(() => setIdx((i) => (i + 1) % quips.length), 2500);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [active, quips.length]);

  return quips[active ? idx : 0] ?? quips[0] ?? "";
}

const ADDING_QUIPS = [
  "Copying the route\u2026",
  "Saving to your trips\u2026",
  "Almost there\u2026",
];

/* ── Trip preview sheet ───────────────────────────────────────────── */

function TripPreviewSheet({
  trip,
  onClose,
  onClone,
  cloned: initialCloned,
}: {
  trip: PublicTripRow;
  onClose: () => void;
  onClone: () => Promise<void>;
  cloned: boolean;
}) {
  const [cloning, setCloning] = useState(false);
  const [cloned, setCloned] = useState(initialCloned);
  const [cloneErr, setCloneErr] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const stops = trip.stops ?? [];

  const animatedClose = useCallback(() => {
    if (closing || cloning) return;
    haptic.light();
    setClosing(true);
    setTimeout(onClose, 280);
  }, [closing, cloning, onClose]);

  // Drag-to-dismiss
  const dragState = useRef<{ startY: number; startTranslate: number } | null>(null);
  const [dragY, setDragY] = useState(0);

  const onDragPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (cloning) return;
    dragState.current = { startY: e.clientY, startTranslate: dragY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [dragY, cloning]);

  const onDragPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const delta = e.clientY - dragState.current.startY;
    setDragY(Math.max(0, dragState.current.startTranslate + delta));
  }, []);

  const onDragPointerUp = useCallback(() => {
    if (!dragState.current) return;
    if (dragY > 120) {
      animatedClose();
    } else {
      setDragY(0);
    }
    dragState.current = null;
  }, [dragY, animatedClose]);

  const addingQuip = useRotatingQuip(ADDING_QUIPS, cloning);

  const handleClone = useCallback(async () => {
    if (cloned) return;
    haptic.medium();
    setCloning(true);
    setCloneErr(null);
    try {
      await onClone();
      setCloned(true);
      haptic.success();
    } catch (e) {
      setCloneErr(e instanceof Error ? e.message : "Failed to add trip");
      haptic.error();
    } finally {
      setCloning(false);
    }
  }, [cloned, onClone]);

  const bbox: [number, number, number, number] | null =
    trip.bbox_west != null &&
    trip.bbox_south != null &&
    trip.bbox_east != null &&
    trip.bbox_north != null
      ? [trip.bbox_west, trip.bbox_south, trip.bbox_east, trip.bbox_north]
      : null;

  const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

  const sheetStyle: React.CSSProperties =
    dragY > 0
      ? { transform: `translateX(-50%) translateY(${dragY}px)`, transition: "none" }
      : closing
        ? {}
        : { transition: `transform 0.28s ${SHEET_EASE}` };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`${s.backdrop} ${closing ? s.backdropExit : s.backdropEnter}`}
        onClick={cloning ? undefined : animatedClose}
      />

      {/* Sheet */}
      <div
        className={`${s.sheet} ${closing ? s.sheetExit : s.sheetEnter}`}
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          className={s.dragHandle}
          style={{ cursor: cloning ? "default" : "grab" }}
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
        >
          <div className={s.dragPill} />
        </div>

        {cloning ? (
          <div className={s.cloningOverlay}>
            <div className={s.cloningSpinnerWrap}>
              <div className={s.cloningSpinnerRing} />
              <Route size={22} style={{ color: "var(--brand-eucalypt)" }} />
            </div>
            <div className={s.cloningText}>
              <div className={s.cloningTitle}>Adding to your trips</div>
              <div key={addingQuip} className={s.cloningQuip}>{addingQuip}</div>
            </div>
            <div className={s.cloningProgress}>
              <div className={s.cloningProgressBar} />
            </div>
          </div>
        ) : (
          <>
            {/* Close button */}
            <button type="button" onClick={animatedClose} className={s.sheetClose}>
              <X size={16} />
            </button>

            {/* Scrollable body */}
            <div className={`${s.sheetBody} roam-scroll`}>
              {/* Map */}
              {bbox && trip.geometry ? (
                <div className={s.sheetMap}>
                  <TripPreviewMap geometry={trip.geometry} stops={trip.stops} bbox={bbox} />
                </div>
              ) : (
                <div className={s.sheetMapEmpty}>
                  <Navigation size={28} style={{ opacity: 0.2 }} />
                </div>
              )}

              {/* Trip info */}
              <div className={s.sheetInfo}>
                <h2 className={s.sheetTitle}>{trip.title}</h2>

                {(trip.clone_count ?? 0) > 0 && (
                  <div className={s.sheetClonerCount}>
                    <Users size={11} />
                    {trip.clone_count} traveller{(trip.clone_count ?? 0) !== 1 ? "s" : ""} added this
                  </div>
                )}

                {/* Stats strip */}
                <div className={s.statsStrip}>
                  {[
                    { value: formatDistanceOrDash(trip.distance_m), label: "distance", icon: Route },
                    { value: formatDurationOrDash(trip.duration_s), label: "drive time", icon: Clock },
                    { value: String(trip.stops.length), label: "stops", icon: MapPin },
                  ].map((stat, i, arr) => (
                    <div key={stat.label} style={{ display: "contents" }}>
                      <div className={s.statCell}>
                        <div className={s.statValue}>
                          <stat.icon size={12} strokeWidth={2.5} style={{ color: "var(--roam-text-muted)", opacity: 0.6 }} />
                          <span className={s.statNumber}>{stat.value}</span>
                        </div>
                        <div className={s.statLabel}>{stat.label}</div>
                      </div>
                      {i < arr.length - 1 && <div className={s.statDivider} />}
                    </div>
                  ))}
                </div>

                {/* Stop list */}
                <div className={s.routeSection}>
                  <div className={s.routeLabel}>
                    <Route size={11} strokeWidth={2.5} />
                    Route
                  </div>
                  <div className={s.stopList}>
                    {stops.map((stop, i) => {
                      const isStart = stop.type === "start" || i === 0;
                      const isEnd = stop.type === "end" || i === stops.length - 1;
                      return (
                        <div
                          key={stop.id ?? i}
                          className={`${s.stopRow} ${isStart || isEnd ? s.stopRowHighlight : ""}`}
                          style={{ animation: `dps-stopIn 0.25s cubic-bezier(0.22,1,0.36,1) ${i * 40}ms both` }}
                        >
                          <div
                            className={`${s.stopDot} ${isStart ? s.stopDotStart : isEnd ? s.stopDotEnd : s.stopDotVia}`}
                          />
                          <span className={`${s.stopName} ${isStart || isEnd ? s.stopNameBold : s.stopNameNormal}`}>
                            {stop.name || (isStart ? "Start" : isEnd ? "Destination" : `Stop ${i + 1}`)}
                          </span>
                          {isStart && <span className={s.stopBadge}>Start</span>}
                          {isEnd && <span className={s.stopBadge}>End</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className={s.sheetFooter}>
              {cloneErr && <div className={s.cloneError}>{cloneErr}</div>}
              <button
                type="button"
                disabled={cloned}
                onClick={handleClone}
                className={`${s.cloneBtn} ${cloned ? s.cloneBtnDone : ""}`}
              >
                <div className={s.cloneBtnNoise} />
                {cloned ? (
                  <>
                    <Check size={18} style={{ position: "relative" }} />
                    <span style={{ position: "relative" }}>Added to My Trips</span>
                  </>
                ) : (
                  <>
                    <Plus size={18} style={{ position: "relative" }} />
                    <span style={{ position: "relative" }}>Add to My Trips</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ── Main Discover Screen ─────────────────────────────────────────── */

export default function DiscoverClientPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { position } = useGeolocation({ autoStart: true });

  const [feed, setFeed] = useState<PublicTripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [radiusOption, setRadiusOption] = useState<RadiusOption>(RADIUS_OPTIONS[0]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterClosing, setFilterClosing] = useState(false);

  const [selectedTrip, setSelectedTrip] = useState<PublicTripRow | null>(null);
  const [selectedCloned, setSelectedCloned] = useState(false);
  const [clonedIds, setClonedIds] = useState<Set<string>>(new Set());

  const [feedRefreshing, setFeedRefreshing] = useState(false);

  const userLat = position?.lat;
  const userLng = position?.lng;

  const loadFeed = useCallback(
    async (radius: RadiusOption, isRefresh = false) => {
      if (isRefresh) {
        setFeedRefreshing(true);
      } else {
        setLoading(true);
      }
      setLoadErr(null);
      try {
        const rows = await fetchDiscoverFeed({
          userLat: radius.km > 0 ? userLat : undefined,
          userLng: radius.km > 0 ? userLng : undefined,
          radiusKm: radius.km > 0 ? radius.km : undefined,
          limit: 40,
        });
        setFeed(rows);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Failed to load trips");
      } finally {
        setLoading(false);
        setFeedRefreshing(false);
      }
    },
    [userLat, userLng],
  );

  const initialLoaded = useRef(false);
  useEffect(() => {
    if (!initialLoaded.current) {
      initialLoaded.current = true;
      loadFeed(radiusOption);
    }
  }, [radiusOption, loadFeed]);

  const toggleFilter = useCallback(() => {
    haptic.selection();
    if (filterOpen) {
      setFilterClosing(true);
      setTimeout(() => { setFilterOpen(false); setFilterClosing(false); }, 150);
    } else {
      setFilterOpen(true);
    }
  }, [filterOpen]);

  const handleFilterSelect = useCallback(
    (opt: RadiusOption) => {
      if (opt.label === radiusOption.label) return;
      haptic.selection();
      setRadiusOption(opt);
      loadFeed(opt, true);
    },
    [radiusOption, loadFeed],
  );

  const handleSelectTrip = useCallback(
    async (trip: PublicTripRow) => {
      setSelectedTrip(trip);
      if (user) {
        const already = clonedIds.has(trip.id) || (await hasClonedTrip(user.id, trip.id));
        setSelectedCloned(already);
      } else {
        setSelectedCloned(false);
      }
    },
    [user, clonedIds],
  );

  const handleClone = useCallback(async () => {
    if (!selectedTrip) return;
    if (!user) throw new Error("Sign in to add trips to your account.");

    const { stops, title } = await clonePublicTrip(user.id, selectedTrip.id);
    setClonedIds((prev) => new Set(prev).add(selectedTrip.id));

    const seed: CloneTripSeed = { title, stops };
    try {
      sessionStorage.setItem(CLONE_TRIP_SEED_KEY, JSON.stringify(seed));
    } catch {
      // sessionStorage unavailable — /new will start empty
    }

    router.push("/new");
  }, [user, selectedTrip, router]);

  const showFilterChips = filterOpen || filterClosing;

  return (
    <div className={s.root}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.titleRow}>
          <div className={s.titleGroup}>
            <h1 className={s.pageTitle}>Discover</h1>
            <p className={s.pageSub}>Trips shared by travellers</p>
          </div>
          <button
            type="button"
            onClick={toggleFilter}
            className={`${s.filterBtn} ${filterOpen ? s.filterBtnActive : ""}`}
          >
            <Sliders size={13} />
            {radiusOption.label}
          </button>
        </div>

        {/* Proximity filter chips */}
        <div className={`${s.filterChipGrid} ${showFilterChips ? s.filterChipGridOpen : ""}`}>
          <div className={s.filterChipInner}>
            <div className={s.filterChips}>
              {RADIUS_OPTIONS.map((opt, i) => {
                const isActive = radiusOption.label === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleFilterSelect(opt)}
                    className={`${s.filterChip} ${isActive ? s.filterChipActive : ""}`}
                    style={{
                      animation: filterClosing
                        ? `disc-chipHide 0.15s ease both ${i * 20}ms`
                        : filterOpen
                          ? `disc-chipReveal 0.2s cubic-bezier(0.22,1,0.36,1) ${i * 30}ms both`
                          : "none",
                    }}
                  >
                    {isActive && <Check size={11} style={{ marginRight: 3 }} />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div
        className={`${s.feed} roam-scroll ${feedRefreshing ? s.feedRefreshing : ""}`}
      >
        {loading && feed.length === 0 ? (
          <div className={s.stateCenter}>
            <div className={s.loadingSpinner} />
            <span className={s.stateSub}>Finding trips near you…</span>
          </div>
        ) : loadErr ? (
          <div className={s.stateCenter}>
            <div className={s.stateIcon}>
              <Globe size={28} style={{ opacity: 0.5 }} />
            </div>
            <p className={s.stateTitle}>Could not load trips</p>
            <p className={s.stateSub}>{loadErr}</p>
            <button
              type="button"
              className={s.retryBtn}
              onClick={() => { haptic.light(); loadFeed(radiusOption); }}
            >
              Retry
            </button>
          </div>
        ) : feed.length === 0 ? (
          <div className={s.stateCenter}>
            <div className={s.stateIcon}>
              <Navigation size={28} style={{ opacity: 0.5 }} />
            </div>
            <p className={s.stateTitle}>No trips found</p>
            <p className={s.stateSub}>
              {radiusOption.km > 0
                ? `No public trips within ${radiusOption.label.toLowerCase()} of your location. Try a wider range.`
                : "No public trips yet. Be the first to publish one from the Plans drawer."}
            </p>
          </div>
        ) : (
          <div className={s.feedGrid}>
            {feed.map((trip, i) => (
              <TripCard key={trip.id} trip={trip} index={i} onPress={() => handleSelectTrip(trip)} />
            ))}
          </div>
        )}

        {/* Inline refreshing indicator */}
        {feedRefreshing && (
          <div className={s.refreshRow}>
            <div className={s.refreshSpinner} />
            <span className={s.refreshLabel}>Updating…</span>
          </div>
        )}
      </div>

      {/* Trip preview sheet */}
      {selectedTrip && (
        <TripPreviewSheet
          trip={selectedTrip}
          cloned={selectedCloned}
          onClose={() => setSelectedTrip(null)}
          onClone={handleClone}
        />
      )}
    </div>
  );
}
