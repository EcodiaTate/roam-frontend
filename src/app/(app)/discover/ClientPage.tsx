// src/app/(app)/discover/ClientPage.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Globe, Loader, MapPin, Navigation, Route, Clock, Users, X, Plus, Sliders, Check, Compass } from "lucide-react";

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
    <div
      ref={ref}
      style={{
        height: 120,
        width: "100%",
        background: "var(--roam-surface-hover, #e8eaed)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
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
      style={{
        all: "unset",
        display: "flex",
        flexDirection: "column",
        background: "var(--roam-card-bg, var(--roam-surface))",
        borderRadius: 20,
        border: "1px solid var(--roam-border)",
        overflow: "hidden",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        boxSizing: "border-box",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.03)",
        transition: "box-shadow 0.2s ease, transform 0.2s cubic-bezier(0.25,0.46,0.45,0.94)",
        animation: `disc-cardIn 0.4s cubic-bezier(0.22,1,0.36,1) ${index * 50}ms both`,
      }}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.975)"; }}
      onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
      onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
    >
      {/* Map preview */}
      {trip.geometry && bbox && (
        <CardMapPreview geometry={trip.geometry} stops={stops} bbox={bbox} />
      )}

      {/* Main content */}
      <div style={{ padding: "16px 16px 14px" }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "var(--roam-text)",
            lineHeight: 1.3,
            marginBottom: 6,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            letterSpacing: "-0.01em",
          }}
        >
          {trip.title}
        </div>

        {/* Via count */}
        {viaCount > 0 && (
          <div
            style={{
              fontSize: 11,
              color: "var(--roam-accent)",
              fontWeight: 700,
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Compass size={10} strokeWidth={2.5} />
            {viaCount} stop{viaCount !== 1 ? "s" : ""} along the way
          </div>
        )}

        {/* Stats pills */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          {[
            { icon: Route, text: formatDistanceOrDash(trip.distance_m) },
            { icon: Clock, text: formatDurationOrDash(trip.duration_s) },
            ...((trip.clone_count ?? 0) > 0
              ? [{ icon: Users, text: String(trip.clone_count) }]
              : []),
          ].map((stat) => (
            <span
              key={stat.text}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 700,
                color: "var(--roam-text-muted)",
                background: "var(--roam-surface-hover, rgba(0,0,0,0.03))",
                borderRadius: 8,
                padding: "4px 8px",
              }}
            >
              <stat.icon size={10} strokeWidth={2.5} />
              {stat.text}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom: start → end quick-glance */}
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid color-mix(in srgb, var(--roam-border) 60%, transparent)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "var(--roam-text-muted)",
          fontWeight: 600,
        }}
      >
        <div style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#22c55e",
          flexShrink: 0,
          boxShadow: "0 0 0 2px rgba(34,197,94,0.15)",
        }} />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {start?.name || "Start"}
        </span>
        <span style={{ color: "var(--roam-text-muted)", opacity: 0.4, fontSize: 10, flexShrink: 0 }}>
          ───
        </span>
        <div style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#ef4444",
          flexShrink: 0,
          boxShadow: "0 0 0 2px rgba(239,68,68,0.15)",
        }} />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            textAlign: "right",
          }}
        >
          {end?.name || "End"}
        </span>
      </div>
    </button>
  );
}

/* ── Keyframes for discover sheet ──────────────────────────────────── */

const DISCOVER_KEYFRAMES = `
@keyframes dps-fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes dps-fadeOut {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@keyframes dps-slideUp {
  from { transform: translateX(-50%) translateY(100%); }
  to   { transform: translateX(-50%) translateY(0); }
}
@keyframes dps-slideDown {
  from { transform: translateX(-50%) translateY(0); }
  to   { transform: translateX(-50%) translateY(100%); }
}
@keyframes dps-spin {
  to { transform: rotate(360deg); }
}
@keyframes dps-stopIn {
  from { opacity: 0; transform: translateX(-6px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes dps-quipIn {
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dps-progress {
  0%   { width: 5%; margin-left: 0; }
  50%  { width: 40%; margin-left: 30%; }
  100% { width: 5%; margin-left: 95%; }
}
`;

const ADDING_QUIPS = [
  "Copying the route\u2026",
  "Saving to your trips\u2026",
  "Almost there\u2026",
];

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

  // ── Animated dismiss ──
  const animatedClose = useCallback(() => {
    if (closing || cloning) return;
    haptic.light();
    setClosing(true);
    setTimeout(onClose, 280);
  }, [closing, cloning, onClose]);

  // ── Drag-to-dismiss ──
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

  // Spring-style easing for native feel
  const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

  return (
    <>
      <style>{DISCOVER_KEYFRAMES}</style>

      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,8,6,0.65)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 60,
          animation: closing
            ? "dps-fadeOut 0.25s ease forwards"
            : "dps-fadeIn 0.2s ease both",
        }}
        onClick={cloning ? undefined : animatedClose}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          left: "50%",
          bottom: 0,
          transform: dragY > 0 ? `translateX(-50%) translateY(${dragY}px)` : undefined,
          width: "min(100%, 480px)",
          zIndex: 61,
          background: "var(--roam-surface)",
          borderRadius: "22px 22px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90dvh",
          animation: closing
            ? `dps-slideDown 0.28s ${SHEET_EASE} forwards`
            : dragY > 0
              ? "none"
              : `dps-slideUp 0.35s ${SHEET_EASE} both`,
          transition: dragState.current ? "none" : `transform 0.28s ${SHEET_EASE}`,
          paddingBottom: "calc(var(--bottom-nav-height, 100px) + 12px)",
          overflow: "hidden",
          willChange: "transform",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          style={{
            padding: "10px 0 6px",
            cursor: cloning ? "default" : "grab",
            touchAction: "none",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: "var(--roam-border)",
              margin: "0 auto",
            }}
          />
        </div>

        {cloning ? (
          /* ── Adding overlay ── */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "48px 20px 56px",
              gap: 16,
              animation: "dps-fadeIn 0.25s ease both",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(45,110,64,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: -2,
                  borderRadius: "50%",
                  border: "2px solid transparent",
                  borderTopColor: "var(--brand-eucalypt, #2d6e40)",
                  borderRightColor: "var(--brand-sky, #38bdf8)",
                  animation: "dps-spin 1.5s linear infinite",
                }}
              />
              <Route size={22} style={{ color: "var(--brand-eucalypt, #2d6e40)" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--roam-text)", marginBottom: 6 }}>
                Adding to your trips
              </div>
              <div
                key={addingQuip}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--roam-text-muted)",
                  animation: "dps-quipIn 0.3s ease both",
                }}
              >
                {addingQuip}
              </div>
            </div>
            <div
              style={{
                width: "50%",
                height: 3,
                borderRadius: 2,
                background: "var(--roam-border)",
                overflow: "hidden",
                marginTop: 4,
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 2,
                  background: "linear-gradient(90deg, var(--brand-eucalypt, #2d6e40), var(--brand-sky, #38bdf8))",
                  animation: "dps-progress 2s ease-in-out infinite",
                }}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Close button */}
            <button
              type="button"
              onClick={animatedClose}
              style={{
                all: "unset",
                position: "absolute",
                top: 10,
                right: 10,
                zIndex: 5,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "var(--roam-surface-hover)",
                color: "var(--roam-text-muted)",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
                transition: "transform 60ms ease-out",
              }}
              onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.90)"; }}
              onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
              onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
            >
              <X size={16} />
            </button>

            {/* Scrollable content */}
            <div
              className="roam-scroll"
              style={{
                flex: 1,
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {/* Map preview */}
              {bbox && trip.geometry ? (
                <div style={{ height: 200, position: "relative", flexShrink: 0, borderRadius: 16, overflow: "hidden", margin: "0 12px" }}>
                  <TripPreviewMap
                    geometry={trip.geometry}
                    stops={trip.stops}
                    bbox={bbox}
                  />
                </div>
              ) : (
                <div
                  style={{
                    height: 100,
                    margin: "0 12px",
                    borderRadius: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--roam-surface-hover)",
                    color: "var(--roam-text-muted)",
                  }}
                >
                  <Navigation size={28} style={{ opacity: 0.2 }} />
                </div>
              )}

              {/* Trip info */}
              <div style={{ padding: "16px 16px 0" }}>
                {/* Title + clone count */}
                <h2
                  style={{
                    fontSize: 19,
                    fontWeight: 900,
                    color: "var(--roam-text)",
                    margin: "0 0 4px",
                    lineHeight: 1.25,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {trip.title}
                </h2>

                {(trip.clone_count ?? 0) > 0 && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--roam-text-muted)",
                      marginBottom: 12,
                    }}
                  >
                    <Users size={11} />
                    {trip.clone_count} traveller{(trip.clone_count ?? 0) !== 1 ? "s" : ""} added this
                  </div>
                )}

                {/* Stats strip */}
                <div
                  style={{
                    display: "flex",
                    gap: 0,
                    marginBottom: 16,
                    padding: "10px 0",
                    background: "var(--roam-surface-raised, var(--roam-surface))",
                    borderRadius: 14,
                    border: "1px solid var(--roam-border)",
                    overflow: "hidden",
                  }}
                >
                  {[
                    { value: formatDistanceOrDash(trip.distance_m), label: "distance", icon: Route },
                    { value: formatDurationOrDash(trip.duration_s), label: "drive time", icon: Clock },
                    { value: String(trip.stops.length), label: "stops", icon: MapPin },
                  ].map((stat, i, arr) => (
                    <div key={stat.label} style={{ display: "contents" }}>
                      <div style={{ textAlign: "center", flex: 1, padding: "0 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 2 }}>
                          <stat.icon size={12} strokeWidth={2.5} style={{ color: "var(--roam-text-muted)", opacity: 0.6 }} />
                          <span style={{ fontSize: 16, fontWeight: 900, color: "var(--roam-text)" }}>{stat.value}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--roam-text-muted)", fontWeight: 600 }}>{stat.label}</div>
                      </div>
                      {i < arr.length - 1 && (
                        <div style={{ width: 1, background: "var(--roam-border)", alignSelf: "stretch" }} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Stop list */}
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "var(--roam-text-muted)",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Route size={11} strokeWidth={2.5} />
                    Route
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {stops.map((stop, i) => {
                      const isStart = stop.type === "start" || i === 0;
                      const isEnd = stop.type === "end" || i === stops.length - 1;
                      const dotColor = isStart
                        ? "#22c55e"
                        : isEnd
                          ? "#ef4444"
                          : "var(--roam-text-muted)";
                      return (
                        <div
                          key={stop.id ?? i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "7px 10px",
                            borderRadius: 10,
                            background: isStart || isEnd ? "var(--roam-surface-raised, var(--roam-surface))" : "transparent",
                            animation: `dps-stopIn 0.25s cubic-bezier(0.22,1,0.36,1) ${i * 40}ms both`,
                          }}
                        >
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              flexShrink: 0,
                              background: dotColor,
                              boxShadow: isStart || isEnd ? `0 0 0 3px color-mix(in srgb, ${dotColor} 20%, transparent)` : "none",
                            }}
                          />
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: isStart || isEnd ? 750 : 500,
                              color: "var(--roam-text)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {stop.name || (isStart ? "Start" : isEnd ? "Destination" : `Stop ${i + 1}`)}
                          </span>
                          {isStart && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--roam-text-muted)", marginLeft: "auto", flexShrink: 0 }}>START</span>
                          )}
                          {isEnd && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--roam-text-muted)", marginLeft: "auto", flexShrink: 0 }}>END</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div
              style={{
                padding: "12px 16px 4px",
                borderTop: "1px solid var(--roam-border)",
                flexShrink: 0,
                animation: "dps-fadeIn 0.3s ease 0.1s both",
              }}
            >
              {cloneErr && (
                <div
                  style={{
                    marginBottom: 8,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "var(--bg-error, #fae5e2)",
                    color: "var(--text-error, #922018)",
                    fontSize: 13,
                    fontWeight: 600,
                    animation: "dps-fadeIn 0.2s ease both",
                  }}
                >
                  {cloneErr}
                </div>
              )}
              <button
                type="button"
                disabled={cloned}
                onClick={handleClone}
                style={{
                  all: "unset",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  height: 54,
                  borderRadius: 16,
                  background: cloned
                    ? "linear-gradient(135deg, var(--brand-eucalypt, #2d6e40), #3a8f52)"
                    : "linear-gradient(135deg, var(--brand-ochre, #b5452e), #c9633e)",
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: cloned ? "default" : "pointer",
                  boxShadow: cloned
                    ? "0 4px 20px rgba(45,110,64,0.25)"
                    : "0 4px 20px rgba(181,69,46,0.30)",
                  transition: "background 0.25s, box-shadow 0.25s, transform 60ms ease-out",
                  boxSizing: "border-box",
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                  position: "relative",
                  overflow: "hidden",
                }}
                onPointerDown={(e) => { if (!cloned) (e.currentTarget as HTMLElement).style.transform = "scale(0.97)"; }}
                onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
                onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
              >
                {/* Noise texture */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: "url(/img/noise.png)",
                    backgroundRepeat: "repeat",
                    backgroundSize: "200px",
                    opacity: 0.05,
                    pointerEvents: "none",
                    borderRadius: "inherit",
                    mixBlendMode: "overlay",
                  }}
                />
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

/* ── Discover-specific keyframes ───────────────────────────────────── */

const DISCOVER_PAGE_KEYFRAMES = `
@keyframes disc-chipReveal {
  from { opacity: 0; transform: translateY(-4px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes disc-chipHide {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(-4px) scale(0.96); }
}
@keyframes disc-feedFade {
  from { opacity: 0.4; }
  to   { opacity: 1; }
}
@keyframes disc-cardIn {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes disc-headerIn {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes disc-subtitleIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`;

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

  // Track whether a filter change caused a re-fetch so we can show subtle transition
  const [feedRefreshing, setFeedRefreshing] = useState(false);

  const userLat = position?.lat;
  const userLng = position?.lng;

  // Load feed — non-blocking when switching filters (keeps old cards visible)
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

  // Initial load
  const initialLoaded = useRef(false);
  useEffect(() => {
    if (!initialLoaded.current) {
      initialLoaded.current = true;
      loadFeed(radiusOption);
    }
  }, [radiusOption, loadFeed]);

  // Animate filter panel open/close
  const toggleFilter = useCallback(() => {
    haptic.selection();
    if (filterOpen) {
      setFilterClosing(true);
      setTimeout(() => { setFilterOpen(false); setFilterClosing(false); }, 150);
    } else {
      setFilterOpen(true);
    }
  }, [filterOpen]);

  // Select a filter chip — keep filters open, don't reload the whole page
  const handleFilterSelect = useCallback(
    (opt: RadiusOption) => {
      if (opt.label === radiusOption.label) return;
      haptic.selection();
      setRadiusOption(opt);
      // Refresh feed in background — old cards stay visible with dim overlay
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

    // 1. Record the clone in Supabase and get the full trip data
    const { stops, title } = await clonePublicTrip(user.id, selectedTrip.id);
    setClonedIds((prev) => new Set(prev).add(selectedTrip.id));

    // 2. Seed sessionStorage so /new picks up the stops and runs the full
    //    bundle pipeline (routing, corridor, offline zip, IDB save).
    const seed: CloneTripSeed = { title, stops };
    try {
      sessionStorage.setItem(CLONE_TRIP_SEED_KEY, JSON.stringify(seed));
    } catch {
      // sessionStorage unavailable — /new will start empty
    }

    // 3. Navigate to /new after a brief delay so the "Added" animation plays
    setTimeout(() => router.push("/new"), 600);
  }, [user, selectedTrip, router]);

  const showFilterChips = filterOpen || filterClosing;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--roam-bg)",
        overflow: "hidden",
      }}
    >
      <style>{DISCOVER_PAGE_KEYFRAMES}</style>

      {/* Header — transparent, floating above content */}
      <div
        style={{
          paddingTop: "calc(var(--roam-safe-top, 0px) + 24px)",
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 8,
          flexShrink: 0,
          animation: "disc-headerIn 0.5s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 2,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: "var(--roam-text)",
                margin: 0,
                letterSpacing: "-0.025em",
                lineHeight: 1.15,
              }}
            >
              Discover
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--roam-text-muted)",
                animation: "disc-subtitleIn 0.6s ease 0.15s both",
              }}
            >
              Trips shared by travellers
            </p>
          </div>
          <button
            type="button"
            onClick={toggleFilter}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "10px 16px",
              minHeight: 44,
              borderRadius: 14,
              background: filterOpen
                ? "var(--roam-accent)"
                : "var(--roam-card-bg, var(--roam-surface))",
              color: filterOpen ? "var(--on-color)" : "var(--roam-text)",
              fontSize: 12,
              fontWeight: 700,
              border: filterOpen ? "none" : "1px solid var(--roam-border)",
              boxShadow: filterOpen
                ? "0 2px 12px rgba(0,0,0,0.12)"
                : "0 1px 6px rgba(0,0,0,0.04)",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              transition: "all 0.2s cubic-bezier(0.25,0.46,0.45,0.94)",
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.93)"; }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
          >
            <Sliders size={13} />
            {radiusOption.label}
          </button>
        </div>

        {/* Proximity filter chips — animated reveal */}
        <div
          style={{
            display: "grid",
            gridTemplateRows: showFilterChips ? "1fr" : "0fr",
            transition: "grid-template-rows 0.25s cubic-bezier(0.25,0.46,0.45,0.94)",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                paddingTop: 12,
              }}
            >
              {RADIUS_OPTIONS.map((opt, i) => {
                const isActive = radiusOption.label === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleFilterSelect(opt)}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      padding: "8px 18px",
                      minHeight: 40,
                      borderRadius: 20,
                      fontSize: 13,
                      fontWeight: 700,
                      background: isActive
                        ? "var(--roam-accent)"
                        : "var(--roam-card-bg, var(--roam-surface))",
                      color: isActive ? "var(--on-color)" : "var(--roam-text)",
                      border: isActive ? "none" : "1px solid var(--roam-border)",
                      boxShadow: isActive
                        ? "0 2px 10px rgba(0,0,0,0.10)"
                        : "0 1px 4px rgba(0,0,0,0.03)",
                      WebkitTapHighlightColor: "transparent",
                      transition: "all 0.2s cubic-bezier(0.25,0.46,0.45,0.94)",
                      animation: filterClosing
                        ? `disc-chipHide 0.15s ease both ${i * 20}ms`
                        : filterOpen
                          ? `disc-chipReveal 0.2s cubic-bezier(0.22,1,0.36,1) ${i * 30}ms both`
                          : "none",
                    }}
                    onPointerDown={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "scale(0.94)";
                    }}
                    onPointerUp={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "";
                    }}
                    onPointerCancel={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "";
                    }}
                  >
                    {isActive && (
                      <Check size={11} style={{ marginRight: 5, verticalAlign: -1 }} />
                    )}
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
        className="roam-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          scrollBehavior: "smooth",
          paddingTop: 8,
          paddingRight: 16,
          paddingBottom: "calc(var(--bottom-nav-height, 100px) + 24px)",
          paddingLeft: 16,
          boxSizing: "border-box",
          opacity: feedRefreshing ? 0.5 : 1,
          transition: "opacity 0.25s ease",
        }}
      >
        {loading && feed.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: 80,
              gap: 14,
              color: "var(--roam-text-muted)",
              animation: "disc-subtitleIn 0.4s ease both",
            }}
          >
            <Loader size={22} style={{ animation: "roam-spin 0.8s linear infinite", opacity: 0.5 }} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Finding trips near you…</span>
          </div>
        ) : loadErr ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: 80,
              gap: 12,
              color: "var(--roam-text-muted)",
              animation: "disc-subtitleIn 0.4s ease both",
            }}
          >
            <Globe size={32} style={{ opacity: 0.2 }} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>Could not load trips</span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{loadErr}</span>
            <button
              type="button"
              onClick={() => { haptic.light(); loadFeed(radiusOption); }}
              style={{
                all: "unset",
                cursor: "pointer",
                marginTop: 8,
                padding: "12px 28px",
                minHeight: 44,
                borderRadius: 14,
                background: "var(--roam-accent)",
                color: "var(--on-color)",
                fontSize: 14,
                fontWeight: 700,
                boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
                transition: "transform 0.15s ease-out",
              }}
              onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.95)"; }}
              onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
              onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
            >
              Retry
            </button>
          </div>
        ) : feed.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: 80,
              gap: 12,
              color: "var(--roam-text-muted)",
              textAlign: "center",
              padding: "80px 32px 48px",
              animation: "disc-subtitleIn 0.4s ease both",
            }}
          >
            <Navigation size={36} style={{ opacity: 0.2 }} />
            <span style={{ fontSize: 16, fontWeight: 800 }}>No trips found</span>
            <span style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.7 }}>
              {radiusOption.km > 0
                ? `No public trips within ${radiusOption.label.toLowerCase()} of your location. Try a wider range.`
                : "No public trips yet. Be the first to publish one from the Plans drawer."}
            </span>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 12,
              animation: feedRefreshing ? "none" : "disc-feedFade 0.3s ease",
            }}
          >
            {feed.map((trip, i) => (
              <TripCard key={trip.id} trip={trip} index={i} onPress={() => handleSelectTrip(trip)} />
            ))}
          </div>
        )}

        {/* Inline refreshing indicator */}
        {feedRefreshing && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px 0 8px",
              gap: 8,
              color: "var(--roam-text-muted)",
              animation: "roam-fadeIn 0.2s ease",
            }}
          >
            <Loader size={14} style={{ animation: "roam-spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Updating…</span>
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
