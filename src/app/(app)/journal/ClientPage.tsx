// src/app/(app)/journal/ClientPage.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";

import type { StopMemory } from "@/lib/types/memories";
import type { OfflinePlanRecord } from "@/lib/offline/plansStore";
import {
  getMemoriesForPlan,
  resolvePhotoUrls,
} from "@/lib/offline/memoriesStore";
import { listOfflinePlans, getCurrentPlanId } from "@/lib/offline/plansStore";
import { haptic } from "@/lib/native/haptics";
import { formatDistance, formatDuration } from "@/lib/utils/format";

import { StopMemorySheet } from "@/components/memories/StopMemorySheet";
import { PhotoLightbox } from "@/components/ui/PhotoLightbox";
import { PlacesClientPage } from "@/app/(app)/places/ClientPage";

import s from "./MemoriesTimeline.module.css";

/* ── Types ────────────────────────────────────────────────────────────── */

type ResolvedMemory = StopMemory & { resolvedUrls: string[] };

type TripOption = {
  plan_id: string;
  label: string;
  distance_m: number;
  duration_s: number;
  stopCount: number;
};

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
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [memories, setMemories] = useState<ResolvedMemory[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Load trip list
  useEffect(() => {
    (async () => {
      const plans = await listOfflinePlans();
      const currentId = await getCurrentPlanId();

      const opts: TripOption[] = plans.map((p) => ({
        plan_id: p.plan_id,
        label: tripLabel(p),
        distance_m: p.preview?.distance_m ?? 0,
        duration_s: p.preview?.duration_s ?? 0,
        stopCount: p.preview?.stops?.length ?? 0,
      }));

      setTrips(opts);

      // Auto-select current trip if it has memories, otherwise first trip with memories
      if (currentId && opts.some((o) => o.plan_id === currentId)) {
        setSelectedPlanId(currentId);
      } else if (opts.length > 0) {
        setSelectedPlanId(opts[0].plan_id);
      }
      setLoading(false);
    })();
  }, []);

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

  const selectedTrip = trips.find((t) => t.plan_id === selectedPlanId);

  /* ── Empty state ─────────────────────────────────────────────────── */
  if (!loading && trips.length === 0) {
    return (
      <div className={s.root}>
        <div className={s.pageHeader}>
          <div className={s.pageTitleRow}>
            <h1 className={s.pageTitle}>Journal</h1>
          </div>
          <div className={s.innerTabBar}>
            <button type="button" className={`${s.innerTab} ${s.innerTabActive}`} onClick={() => { haptic.selection(); setInnerTab("memories"); }}>
              <BookOpen size={13} strokeWidth={2.5} /> Memories
            </button>
            <button type="button" className={s.innerTab} onClick={() => { haptic.selection(); setInnerTab("places"); }}>
              <Bookmark size={13} strokeWidth={2.5} /> Places
            </button>
          </div>
        </div>
        <div className={s.emptyState}>
          <div className={s.emptyIcon}>
            <BookOpen size={40} strokeWidth={1.5} />
          </div>
          <h2 className={s.emptyTitle}>No trips yet</h2>
          <p className={s.emptySub}>
            Plan a trip and memories will appear here as you travel
          </p>
        </div>
      </div>
    );
  }

  if (innerTab === "places") {
    return (
      <div className={s.root}>
        <div className={s.pageHeader}>
          <div className={s.pageTitleRow}>
            <h1 className={s.pageTitle}>Journal</h1>
            <ViewModeToggle viewMode={placesViewMode} setViewMode={setPlacesViewMode} />
          </div>
          <div className={s.innerTabBar}>
            <button type="button" className={s.innerTab} onClick={() => { haptic.selection(); setInnerTab("memories"); }}>
              <BookOpen size={13} strokeWidth={2.5} /> Memories
            </button>
            <button type="button" className={`${s.innerTab} ${s.innerTabActive}`} onClick={() => { haptic.selection(); setInnerTab("places"); }}>
              <Bookmark size={13} strokeWidth={2.5} /> Places
            </button>
          </div>
        </div>
        <PlacesClientPage viewMode={placesViewMode} setViewMode={setPlacesViewMode} />
      </div>
    );
  }

  return (
    <div className={s.root}>
      {/* Header */}
      <div className={s.pageHeader}>
        <div className={s.pageTitleRow}>
          <h1 className={s.pageTitle}>Journal</h1>
        </div>
        <div className={s.innerTabBar}>
          <button type="button" className={`${s.innerTab} ${s.innerTabActive}`} onClick={() => { haptic.selection(); setInnerTab("memories"); }}>
            <BookOpen size={13} strokeWidth={2.5} /> Memories
          </button>
          <button type="button" className={s.innerTab} onClick={() => { haptic.selection(); setInnerTab("places"); }}>
            <Bookmark size={13} strokeWidth={2.5} /> Places
          </button>
        </div>
      </div>

      {/* Trip selector */}
      {trips.length > 1 && (
        <div className={s.tripSelector}>
          <div className={s.tripSelectorScroll}>
            {trips.map((trip) => {
              const active = trip.plan_id === selectedPlanId;
              return (
                <button
                  key={trip.plan_id}
                  type="button"
                  className={active ? s.tripChipActive : s.tripChip}
                  onClick={() => {
                    haptic.selection();
                    setSelectedPlanId(trip.plan_id);
                  }}
                >
                  <Route size={12} strokeWidth={2.5} />
                  <span className={s.tripChipLabel}>{trip.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Trip summary bar */}
      {selectedTrip && (
        <div className={s.tripSummary}>
          <span className={s.tripSummaryItem}>
            <Route size={13} strokeWidth={2} />
            {formatDistance(selectedTrip.distance_m)}
          </span>
          <span className={s.tripSummaryDot}>&middot;</span>
          <span className={s.tripSummaryItem}>
            <Clock size={13} strokeWidth={2} />
            {formatDuration(selectedTrip.duration_s)}
          </span>
          <span className={s.tripSummaryDot}>&middot;</span>
          <span className={s.tripSummaryItem}>
            <MapPin size={13} strokeWidth={2} />
            {selectedTrip.stopCount} stops
          </span>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className={s.loadingState}>Loading memories...</div>
      ) : displayMemories.length === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}>
            <Camera size={36} strokeWidth={1.5} />
          </div>
          <h2 className={s.emptyTitle}>No memories yet</h2>
          <p className={s.emptySub}>
            As you visit stops, your photos and notes will appear here
          </p>
        </div>
      ) : (
        <div className={s.timeline}>
          {displayMemories.map((mem, idx) => (
            <div key={mem.id} className={s.timelineEntry}>
              {/* Connector */}
              {idx > 0 && (
                <div className={s.connector}>
                  <div className={s.connectorLine} />
                  <div className={s.connectorSegment}>
                    <Route size={10} strokeWidth={2} />
                  </div>
                </div>
              )}

              {/* Stop marker dot */}
              <div className={s.markerRow}>
                <div className={s.marker}>
                  <MapPin size={14} strokeWidth={2.5} />
                </div>
                <div className={s.markerInfo}>
                  <span className={s.markerName}>
                    {mem.stop_name ?? `Stop ${mem.stop_index + 1}`}
                  </span>
                  {mem.arrived_at && (
                    <span className={s.markerTime}>
                      <Clock size={10} strokeWidth={2} />
                      {formatArrivalShort(mem.arrived_at)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={s.editBtn}
                  onClick={() => openMemorySheet(mem)}
                >
                  <Pencil size={13} strokeWidth={2} />
                </button>
              </div>

              {/* Photos */}
              {mem.resolvedUrls.length > 0 && (
                <div className={s.photoStrip}>
                  {mem.resolvedUrls.map((url, i) => (
                    <div
                      key={i}
                      className={s.timelinePhoto}
                      onClick={() => setLightbox({ urls: mem.resolvedUrls, index: i })}
                      style={{ cursor: "pointer" }}
                    >
                      <img
                        src={url}
                        alt={`${mem.stop_name ?? "Stop"} photo ${i + 1}`}
                        className={s.timelinePhotoImg}
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Note */}
              {mem.note && (
                <div className={s.noteCard}>
                  <p className={s.noteText}>{mem.note}</p>
                </div>
              )}

              {/* No content yet — prompt */}
              {!mem.note && mem.resolvedUrls.length === 0 && (
                <button
                  type="button"
                  className={s.addPrompt}
                  onClick={() => openMemorySheet(mem)}
                >
                  <Camera size={14} strokeWidth={2} />
                  Add a photo or note
                  <ChevronRight size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

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

      {/* Photo lightbox preview */}
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
