// src/app/(app)/journal/ClientPage.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bookmark,
  Camera,
  ChevronRight,
  Clock,
  List,
  Map as MapIcon,
  MapPin,
  Pencil,
  Route,
  Trash2,
} from "lucide-react";

import type { StopMemory } from "@/lib/types/memories";
import type { OfflinePlanRecord } from "@/lib/offline/plansStore";
import {
  getMemoriesForPlan,
  resolvePhotoUrls,
  getDetachedMemories,
  purgeDetachedMemories,
} from "@/lib/offline/memoriesStore";
import { listOfflinePlans, getCurrentPlanId } from "@/lib/offline/plansStore";
import { haptic } from "@/lib/native/haptics";
import { formatDistance, formatDuration } from "@/lib/utils/format";
import { isFullyOfflineCapable } from "@/lib/offline/basemapManager";

import { StopMemorySheet } from "@/components/memories/StopMemorySheet";
import { PhotoLightbox } from "@/components/ui/PhotoLightbox";
import { PlacesClientPage } from "@/app/(app)/places/ClientPage";
import { JournalMap, type JournalPin } from "@/components/journal/JournalMap";
import { MapStyleSwitcher, type MapBaseMode, type VectorTheme } from "@/components/trips/new/MapStyleSwitcher";

import s from "./MemoriesTimeline.module.css";

/* ── Types ────────────────────────────────────────────────────────────── */

type ResolvedMemory = StopMemory & { resolvedUrls: string[] };

type TripOption = {
  plan_id: string;
  label: string;
  distance_m: number;
  duration_s: number;
  stopCount: number;
  firstStop: import("@/lib/types/trip").TripStop | null;
};

type DetachedGroup = { planId: string; label: string | null; memories: ResolvedMemory[] };

/* ── Helpers ──────────────────────────────────────────────────────────── */

function formatArrivalShort(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function tripLabel(plan: OfflinePlanRecord): string {
  if (plan.label) return plan.label;
  const stops = plan.preview?.stops ?? [];
  const start = stops.find((st) => st.type === "start") ?? stops[0];
  const end = stops.find((st) => st.type === "end") ?? stops[stops.length - 1];
  if (start?.name && end?.name) return `${start.name} → ${end.name}`;
  return "Untitled trip";
}

type InnerTab = "memories" | "places";
type ViewMode = "map" | "list" | "split";

function SplitIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="1" width="14" height="6" rx="1.5" fill="currentColor" opacity="0.8" />
      <rect x="1" y="9" width="14" height="6" rx="1.5" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

/* ── Component ────────────────────────────────────────────────────────── */

export default function MemoriesClientPage() {
  const [innerTab, setInnerTab] = useState<InnerTab>("memories");
  const [placesViewMode, setPlacesViewMode] = useState<ViewMode>("split");

  // Swipe between tabs
  const TABS: InnerTab[] = ["memories", "places"];
  const trackRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ x: number; y: number; locked: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function getTrackPct(tab: InnerTab) {
    return -(TABS.indexOf(tab) * 100) / TABS.length;
  }

  function setTrackTransform(pct: number, animated: boolean) {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = animated ? "transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)" : "none";
    el.style.transform = `translateX(${pct}%)`;
  }

  useEffect(() => {
    setTrackTransform(getTrackPct(innerTab), true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [innerTab]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const node = el;

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      swipeRef.current = { x: t.clientX, y: t.clientY, locked: false };
    }

    function onTouchMove(e: TouchEvent) {
      const sw = swipeRef.current;
      if (!sw) return;
      const dx = e.touches[0].clientX - sw.x;
      const dy = e.touches[0].clientY - sw.y;
      if (!sw.locked) {
        if (Math.abs(dy) > Math.abs(dx) * 1.5) { swipeRef.current = null; return; }
        sw.locked = true;
      }
      e.preventDefault();
      const basePct = getTrackPct(innerTab);
      const w = node.offsetWidth || 1;
      const dragPct = (dx / w) * (100 / TABS.length);
      setTrackTransform(basePct + dragPct, false);
    }

    function onTouchEnd(e: TouchEvent) {
      const sw = swipeRef.current;
      swipeRef.current = null;
      if (!sw || !sw.locked) return;
      const dx = e.changedTouches[0].clientX - sw.x;
      const w = node.offsetWidth || 1;
      const currentIndex = TABS.indexOf(innerTab);
      if (dx < -w * 0.2 && currentIndex < TABS.length - 1) {
        setInnerTab(TABS[currentIndex + 1]);
      } else if (dx > w * 0.2 && currentIndex > 0) {
        setInnerTab(TABS[currentIndex - 1]);
      } else {
        setTrackTransform(getTrackPct(innerTab), true);
      }
    }

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [innerTab]);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [memories, setMemories] = useState<ResolvedMemory[]>([]);
  const [loading, setLoading] = useState(true);

  // Detached memories from deleted trips (preserved for journal)
  const [pastTrips, setPastTrips] = useState<DetachedGroup[]>([]);

  // Map style state — default satellite when online, vector when offline-only
  const [baseMode, setBaseMode] = useState<MapBaseMode>(() =>
    isFullyOfflineCapable() && typeof navigator !== "undefined" && !navigator.onLine
      ? "vector"
      : "hybrid",
  );
  const [vectorTheme, setVectorTheme] = useState<VectorTheme>("bright");

  // Photo lightbox state
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  // Memory sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStop, setSheetStop] = useState<{
    stopId: string;
    stopName: string | null;
    stopIndex: number;
    lat: number;
    lng: number;
  } | null>(null);

  // Load trip list + detached (past) memories
  const loadTripsAndPast = useCallback(async () => {
    const plans = await listOfflinePlans();
    const currentId = await getCurrentPlanId();

    const opts: TripOption[] = plans.map((p) => ({
      plan_id: p.plan_id,
      label: tripLabel(p),
      distance_m: p.preview?.distance_m ?? 0,
      duration_s: p.preview?.duration_s ?? 0,
      stopCount: p.preview?.stops?.length ?? 0,
      firstStop: p.preview?.stops?.[0] ?? null,
    }));

    setTrips(opts);

    // Auto-select current trip if available
    if (currentId && opts.some((o) => o.plan_id === currentId)) {
      setSelectedPlanId(currentId);
    } else if (opts.length > 0) {
      setSelectedPlanId(opts[0].plan_id);
    }

    // Load detached memories from deleted trips
    const detached = await getDetachedMemories();
    const groups: DetachedGroup[] = [];
    for (const [planId, group] of detached) {
      const resolved: ResolvedMemory[] = await Promise.all(
        group.memories.map(async (m) => ({
          ...m,
          resolvedUrls: await resolvePhotoUrls(m),
        })),
      );
      groups.push({ planId, label: group.label, memories: resolved });
    }
    setPastTrips(groups);

    setLoading(false);
  }, []);

  useEffect(() => { loadTripsAndPast(); }, [loadTripsAndPast]);

  // Load memories for selected plan
  useEffect(() => {
    if (!selectedPlanId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const mems = await getMemoriesForPlan(selectedPlanId);

      // Resolve photo URLs
      const resolved: ResolvedMemory[] = await Promise.all(
        mems.map(async (m) => {
          const urls = await resolvePhotoUrls(m);
          return { ...m, resolvedUrls: urls };
        }),
      );

      if (!cancelled) {
        setMemories(resolved);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedPlanId]);

  // Clear memories when no plan is selected
  const displayMemories = selectedPlanId ? memories : [];

  const openMemorySheet = useCallback(
    (mem: ResolvedMemory) => {
      haptic.tap();
      setSheetStop({
        stopId: mem.stop_id,
        stopName: mem.stop_name,
        stopIndex: mem.stop_index,
        lat: mem.lat,
        lng: mem.lng,
      });
      setSheetOpen(true);
    },
    [],
  );

  const handleSheetSaved = useCallback(() => {
    // Refresh memories
    if (selectedPlanId) {
      (async () => {
        const mems = await getMemoriesForPlan(selectedPlanId);
        const resolved: ResolvedMemory[] = await Promise.all(
          mems.map(async (m) => ({
            ...m,
            resolvedUrls: await resolvePhotoUrls(m),
          })),
        );
        setMemories(resolved);
      })();
    }
  }, [selectedPlanId]);

  // Purge all detached memories for a past trip
  const handlePurgePastTrip = useCallback(async (planId: string) => {
    haptic.medium();
    await purgeDetachedMemories(planId);
    setPastTrips((prev) => prev.filter((g) => g.planId !== planId));
  }, []);

  // Derive map pins from resolved memories
  const mapPins: JournalPin[] = useMemo(
    () =>
      displayMemories.map((m) => ({
        id: m.id,
        stopName: m.stop_name,
        stopIndex: m.stop_index,
        lat: m.lat,
        lng: m.lng,
        hasPhotos: m.resolvedUrls.length > 0,
        hasNote: !!m.note,
      })),
    [displayMemories],
  );

  const handleMapPinPress = useCallback(
    (memId: string) => {
      const mem = displayMemories.find((m) => m.id === memId);
      if (mem) openMemorySheet(mem);
    },
    [displayMemories, openMemorySheet],
  );

  // Auto-switch to vector when going offline (satellite tiles won't load)
  useEffect(() => {
    function onOffline() {
      if (baseMode === "hybrid") setBaseMode("vector");
    }
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, [baseMode]);

  const selectedTrip = trips.find((t) => t.plan_id === selectedPlanId);

  /* ── Shared header ───────────────────────────────────────────────── */
  const header = (
    <div className={s.pageHeader}>
      <div className={s.pageTitleRow}>
        <h1 className={s.pageTitle}>Journal</h1>
        <div className={s.innerTabBar}>
          <button
            type="button"
            className={innerTab === "memories" ? `${s.innerTab} ${s.innerTabActive}` : s.innerTab}
            onClick={() => { haptic.selection(); setInnerTab("memories"); }}
          >
            <BookOpen size={13} strokeWidth={2.5} /> Memories
          </button>
          <button
            type="button"
            className={innerTab === "places" ? `${s.innerTab} ${s.innerTabActive}` : s.innerTab}
            onClick={() => { haptic.selection(); setInnerTab("places"); }}
          >
            <Bookmark size={13} strokeWidth={2.5} /> Places
          </button>
        </div>
        {innerTab === "places" && (
          <ViewModeToggle viewMode={placesViewMode} setViewMode={setPlacesViewMode} />
        )}
        {innerTab === "memories" && <div className={s.tabRightSpacer} />}
      </div>
    </div>
  );

  /* ── Memories panel ──────────────────────────────────────────────── */
  const memoriesPanel = (
    <div className={s.tabPanel}>
      {/* Trip selector + stats */}
      {!loading && trips.length === 0 && pastTrips.length === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}><BookOpen size={32} strokeWidth={1.5} /></div>
          <h2 className={s.emptyTitle}>No trips yet</h2>
          <p className={s.emptySub}>Plan a trip and memories will appear here as you travel</p>
        </div>
      ) : !loading && trips.length === 0 && pastTrips.length > 0 ? (
        /* No active trips but past memories exist */
        <div className={s.pastTripsSection}>
          <div className={s.pastTripsHeader}>
            <span className={s.pastTripsLabel}>Past Trips</span>
            <div className={s.sectionDividerLine} />
          </div>
          {pastTrips.map((group) => (
            <div key={group.planId} className={s.pastTripGroup}>
              <div className={s.pastTripTitleRow}>
                <span className={s.pastTripName}>{group.label ?? "Deleted trip"}</span>
                <span className={s.pastTripBadge}>
                  {group.memories.length} {group.memories.length === 1 ? "memory" : "memories"}
                </span>
                <button type="button" className={s.pastTripPurge} onClick={() => handlePurgePastTrip(group.planId)} aria-label="Delete past trip memories">
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
              <div className={s.timeline}>
                {group.memories.map((mem, idx) => (
                  <div key={mem.id} className={s.timelineEntry}>
                    {idx > 0 && <div className={s.connector}><div className={s.connectorLine} /></div>}
                    <div className={s.stopCard}>
                      <div className={s.markerRow}>
                        <div className={s.marker}><MapPin size={15} strokeWidth={2.5} /></div>
                        <div className={s.markerInfo}>
                          <span className={s.markerName}>{mem.stop_name ?? `Stop ${mem.stop_index + 1}`}</span>
                          {mem.arrived_at && (
                            <span className={s.markerTime}><Clock size={10} strokeWidth={2} />{formatArrivalShort(mem.arrived_at)}</span>
                          )}
                        </div>
                      </div>
                      {mem.resolvedUrls.length > 0 && (
                        <>
                          <div className={s.cardDivider} />
                          <div className={s.photoStrip}>
                            {mem.resolvedUrls.map((url, i) => (
                              <div key={i} className={s.timelinePhoto} onClick={() => setLightbox({ urls: mem.resolvedUrls, index: i })} style={{ cursor: "pointer" }}>
                                <img src={url} alt={`${mem.stop_name ?? "Stop"} photo ${i + 1}`} className={s.timelinePhotoImg} loading="lazy" />
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {mem.note && (
                        <>
                          {mem.resolvedUrls.length === 0 && <div className={s.cardDivider} />}
                          <div className={s.noteCard}><p className={s.noteText}>{mem.note}</p></div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {trips.length > 1 ? (
            <div className={s.tripControlsRow}>
              <div className={s.tripSelectorScroll}>
                {trips.map((trip) => {
                  const active = trip.plan_id === selectedPlanId;
                  return (
                    <button
                      key={trip.plan_id}
                      type="button"
                      className={active ? s.tripChipActive : s.tripChip}
                      onClick={() => { haptic.selection(); setSelectedPlanId(trip.plan_id); }}
                    >
                      <Route size={12} strokeWidth={2.5} />
                      <span className={s.tripChipLabel}>{trip.label}</span>
                    </button>
                  );
                })}
              </div>
              {selectedTrip && (
                <div className={s.tripStats}>
                  <span className={s.statPill}><Route size={12} strokeWidth={2} />{formatDistance(selectedTrip.distance_m)}</span>
                  <span className={s.statPill}><Clock size={12} strokeWidth={2} />{formatDuration(selectedTrip.duration_s)}</span>
                  <span className={s.statPill}><MapPin size={12} strokeWidth={2} />{selectedTrip.stopCount} stops</span>
                </div>
              )}
            </div>
          ) : selectedTrip ? (
            <div className={s.tripStatsOnly}>
              <span className={s.statPill}><Route size={12} strokeWidth={2} />{formatDistance(selectedTrip.distance_m)}</span>
              <span className={s.statPill}><Clock size={12} strokeWidth={2} />{formatDuration(selectedTrip.duration_s)}</span>
              <span className={s.statPill}><MapPin size={12} strokeWidth={2} />{selectedTrip.stopCount} stops</span>
            </div>
          ) : null}

          {/* Map */}
          {!loading && displayMemories.length > 0 && (
            <div className={s.mapContainer}>
              <JournalMap pins={mapPins} onPinPress={handleMapPinPress} mode={baseMode} vectorTheme={vectorTheme} />
              <MapStyleSwitcher
                mode={baseMode}
                vectorTheme={vectorTheme}
                onChange={({ mode, vectorTheme: vt }) => { setBaseMode(mode); setVectorTheme(vt); }}
              />
            </div>
          )}

          {/* Timeline */}
          {loading ? (
            <div className={s.loadingState}>Loading memories…</div>
          ) : displayMemories.length === 0 ? (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}><Camera size={32} strokeWidth={1.5} /></div>
              <h2 className={s.emptyTitle}>No memories yet</h2>
              <p className={s.emptySub}>As you visit stops, your photos and notes will appear here</p>
              {selectedTrip?.firstStop && (
                <button
                  type="button"
                  className={s.addPrompt}
                  onClick={() => {
                    haptic.tap();
                    const stop = selectedTrip.firstStop!;
                    setSheetStop({ stopId: stop.id ?? selectedTrip.plan_id + "_0", stopName: stop.name ?? null, stopIndex: 0, lat: stop.lat, lng: stop.lng });
                    setSheetOpen(true);
                  }}
                >
                  <span className={s.addPromptIcon}><Camera size={13} strokeWidth={2} /></span>
                  Add a memory manually
                  <span className={s.addPromptChevron}><ChevronRight size={14} strokeWidth={2} /></span>
                </button>
              )}
            </div>
          ) : (
            <div className={s.timeline}>
              {displayMemories.map((mem, idx) => (
                <div key={mem.id} className={s.timelineEntry}>
                  {idx > 0 && <div className={s.connector}><div className={s.connectorLine} /></div>}
                  <div className={s.stopCard}>
                    <div className={s.markerRow}>
                      <div className={s.marker}><MapPin size={15} strokeWidth={2.5} /></div>
                      <div className={s.markerInfo}>
                        <span className={s.markerName}>{mem.stop_name ?? `Stop ${mem.stop_index + 1}`}</span>
                        {mem.arrived_at && (
                          <span className={s.markerTime}>
                            <Clock size={10} strokeWidth={2} />
                            {formatArrivalShort(mem.arrived_at)}
                          </span>
                        )}
                      </div>
                      <button type="button" className={s.editBtn} onClick={() => openMemorySheet(mem)}>
                        <Pencil size={13} strokeWidth={2} />
                      </button>
                    </div>
                    {mem.resolvedUrls.length > 0 && (
                      <>
                        <div className={s.cardDivider} />
                        <div className={s.photoStrip}>
                          {mem.resolvedUrls.map((url, i) => (
                            <div key={i} className={s.timelinePhoto} onClick={() => setLightbox({ urls: mem.resolvedUrls, index: i })} style={{ cursor: "pointer" }}>
                              <img src={url} alt={`${mem.stop_name ?? "Stop"} photo ${i + 1}`} className={s.timelinePhotoImg} loading="lazy" />
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {mem.note && (
                      <>
                        {mem.resolvedUrls.length === 0 && <div className={s.cardDivider} />}
                        <div className={s.noteCard}><p className={s.noteText}>{mem.note}</p></div>
                      </>
                    )}
                    {!mem.note && mem.resolvedUrls.length === 0 && (
                      <button type="button" className={s.addPrompt} onClick={() => openMemorySheet(mem)}>
                        <span className={s.addPromptIcon}><Camera size={13} strokeWidth={2} /></span>
                        Add a photo or note
                        <span className={s.addPromptChevron}><ChevronRight size={14} strokeWidth={2} /></span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Past trips — detached memories from deleted plans */}
          {!loading && pastTrips.length > 0 && (
            <div className={s.pastTripsSection}>
              <div className={s.pastTripsHeader}>
                <span className={s.pastTripsLabel}>Past Trips</span>
                <div className={s.sectionDividerLine} />
              </div>
              {pastTrips.map((group) => (
                <div key={group.planId} className={s.pastTripGroup}>
                  <div className={s.pastTripTitleRow}>
                    <span className={s.pastTripName}>
                      {group.label ?? "Deleted trip"}
                    </span>
                    <span className={s.pastTripBadge}>
                      {group.memories.length} {group.memories.length === 1 ? "memory" : "memories"}
                    </span>
                    <button
                      type="button"
                      className={s.pastTripPurge}
                      onClick={() => handlePurgePastTrip(group.planId)}
                      aria-label="Delete past trip memories"
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </div>
                  <div className={s.timeline}>
                    {group.memories.map((mem, idx) => (
                      <div key={mem.id} className={s.timelineEntry}>
                        {idx > 0 && <div className={s.connector}><div className={s.connectorLine} /></div>}
                        <div className={s.stopCard}>
                          <div className={s.markerRow}>
                            <div className={s.marker}><MapPin size={15} strokeWidth={2.5} /></div>
                            <div className={s.markerInfo}>
                              <span className={s.markerName}>{mem.stop_name ?? `Stop ${mem.stop_index + 1}`}</span>
                              {mem.arrived_at && (
                                <span className={s.markerTime}>
                                  <Clock size={10} strokeWidth={2} />
                                  {formatArrivalShort(mem.arrived_at)}
                                </span>
                              )}
                            </div>
                          </div>
                          {mem.resolvedUrls.length > 0 && (
                            <>
                              <div className={s.cardDivider} />
                              <div className={s.photoStrip}>
                                {mem.resolvedUrls.map((url, i) => (
                                  <div key={i} className={s.timelinePhoto} onClick={() => setLightbox({ urls: mem.resolvedUrls, index: i })} style={{ cursor: "pointer" }}>
                                    <img src={url} alt={`${mem.stop_name ?? "Stop"} photo ${i + 1}`} className={s.timelinePhotoImg} loading="lazy" />
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                          {mem.note && (
                            <>
                              {mem.resolvedUrls.length === 0 && <div className={s.cardDivider} />}
                              <div className={s.noteCard}><p className={s.noteText}>{mem.note}</p></div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className={s.root}>
      {header}
      <div className={s.contentArea} ref={containerRef}>
        {/* Sliding track */}
        <div className={s.tabTrackOuter}>
          <div ref={trackRef} className={s.tabTrack}>
            {memoriesPanel}
            <div className={s.tabPanel}>
              <PlacesClientPage viewMode={placesViewMode} setViewMode={setPlacesViewMode} />
            </div>
          </div>
        </div>
      </div>

      {/* Memory editor sheet */}
      {sheetStop && selectedPlanId && (
        <StopMemorySheet
          open={sheetOpen}
          planId={selectedPlanId}
          stopId={sheetStop.stopId}
          stopName={sheetStop.stopName}
          stopIndex={sheetStop.stopIndex}
          lat={sheetStop.lat}
          lng={sheetStop.lng}
          onClose={() => setSheetOpen(false)}
          onSaved={handleSheetSaved}
        />
      )}

      {lightbox && (
        <PhotoLightbox
          urls={lightbox.urls}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

/* ── View mode toggle (split / map / list) ────────────────────────────── */

function ViewModeToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}) {
  return (
    <div className={s.viewToggle}>
      {(["split", "map", "list"] as ViewMode[]).map((mode) => {
        const Icon = mode === "list" ? List : mode === "map" ? MapIcon : SplitIcon;
        const active = viewMode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => { haptic.selection(); setViewMode(mode); }}
            className={active ? `${s.viewToggleBtn} ${s.viewToggleBtnActive}` : s.viewToggleBtn}
            aria-label={`${mode} view`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
