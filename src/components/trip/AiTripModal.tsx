// src/components/trip/AiTripModal.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Sparkles, Trash2, X } from "lucide-react";
import { haptic } from "@/lib/native/haptics";
import { generateAiTrip, type AiTripStop, type AiTripSuggestion } from "@/lib/api/aiTrip";
import { shortId } from "@/lib/utils/ids";
import type { TripStop } from "@/lib/types/trip";

/* ── Session storage key (read by /new ClientPage) ─────────────────── */
export const AI_TRIP_SEED_KEY = "roam_ai_trip_seed";

export type AiTripSeed = {
  title: string;
  stops: TripStop[];
};

/* ── Helpers ────────────────────────────────────────────────────────── */

function stopToTripStop(s: AiTripStop, idx: number, total: number): TripStop {
  const type = idx === 0 ? "start" : idx === total - 1 ? "end" : "poi";
  return { id: shortId(), type, name: s.name, lat: s.lat, lng: s.lng };
}

/* ── Rotating quips ───────────────────────────────────────────────── */

const THINKING_QUIPS = [
  "Reading the vibes\u2026",
  "Consulting the map gods\u2026",
  "Scouting the good spots\u2026",
  "Finding the roads less travelled\u2026",
  "Picking stops you\u2019ll actually love\u2026",
  "Avoiding the tourist traps\u2026",
  "Almost there. Deep breaths.",
];

const BUILDING_QUIPS = [
  "Plotting the route\u2026",
  "Packing your offline kit\u2026",
  "Saving maps for no-signal zones\u2026",
  "Nearly there\u2026",
];

function useRotatingQuip(quips: string[], active: boolean): string {
  const [idx, setIdx] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setIdx(0);
  }, [active]);

  useEffect(() => {
    if (!active) {
      if (ref.current) clearInterval(ref.current);
      return;
    }
    ref.current = setInterval(() => setIdx((i) => (i + 1) % quips.length), 2800);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [active, quips.length]);

  return quips[active ? idx : 0] ?? quips[0] ?? "";
}

/* ── Spinner ──────────────────────────────────────────────────────── */

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid rgba(181,69,46,0.18)`,
        borderTopColor: "var(--brand-ochre, #b5452e)",
        animation: "aitm-spin 0.75s linear infinite",
        flexShrink: 0,
      }}
      aria-hidden
    />
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function StopPreviewRow({
  stop,
  reason,
  idx,
  total,
  onRemove,
  animDelay,
}: {
  stop: AiTripStop;
  reason: string;
  idx: number;
  total: number;
  onRemove: () => void;
  animDelay: number;
}) {
  const isEnd = idx === total - 1;
  const isStart = idx === 0;
  const label = isStart ? "Start" : isEnd ? "Destination" : `Stop ${idx}`;
  const dotColor = isStart ? "#22c55e" : isEnd ? "#ef4444" : "var(--brand-sky, #38bdf8)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        borderRadius: "var(--r-card)",
        background: "var(--roam-surface-raised, var(--roam-surface))",
        border: "1px solid var(--roam-border)",
        animation: `aitm-stopIn 0.35s cubic-bezier(0.22,1,0.36,1) ${animDelay}ms both`,
      }}
    >
      {/* dot + connector line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
        <div
          style={{
            marginTop: 3,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
            boxShadow: `0 0 0 3px color-mix(in srgb, ${dotColor} 20%, transparent)`,
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--roam-text-muted)",
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 750,
            color: "var(--roam-text)",
            marginBottom: reason ? 3 : 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {stop.name}
        </div>
        {reason && (
          <div
            style={{
              fontSize: 12,
              color: "var(--roam-text-muted)",
              lineHeight: 1.4,
            }}
          >
            {reason}
          </div>
        )}
      </div>

      {/* Remove - only for intermediate stops */}
      {!isStart && !isEnd && (
        <button
          type="button"
          onClick={() => { haptic.light(); onRemove(); }}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: "var(--r-card)",
            color: "var(--roam-text-muted)",
            flexShrink: 0,
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
          aria-label={`Remove ${stop.name}`}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

/* ── Generating overlay (replaces the body while AI is thinking) ──── */

function GeneratingView({ quip }: { quip: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px 48px",
        gap: 16,
        animation: "aitm-fadeIn 0.25s ease both",
      }}
    >
      {/* Animated sparkle ring */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(181,69,46,0.10), rgba(56,189,248,0.10))",
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
            borderTopColor: "var(--brand-ochre, #b5452e)",
            borderRightColor: "var(--brand-sky, #38bdf8)",
            animation: "aitm-spin 2s linear infinite",
          }}
        />
        <Sparkles size={24} style={{ color: "var(--brand-ochre, #b5452e)" }} />
      </div>

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "var(--roam-text)",
            marginBottom: 6,
          }}
        >
          Dreaming up your trip
        </div>
        <div
          key={quip}
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--roam-text-muted)",
            lineHeight: 1.4,
            animation: "aitm-quipIn 0.3s ease both",
          }}
        >
          {quip}
        </div>
      </div>
    </div>
  );
}

/* ── Building trip overlay (after confirm, before navigation) ──────── */

function BuildingView({ quip }: { quip: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px 48px",
        gap: 16,
        animation: "aitm-fadeIn 0.25s ease both",
      }}
    >
      {/* Route icon with spinner */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(56,189,248,0.10))",
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
            animation: "aitm-spin 1.5s linear infinite",
          }}
        />
        <MapPin size={22} style={{ color: "var(--brand-eucalypt, #2d6e40)" }} />
      </div>

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "var(--roam-text)",
            marginBottom: 6,
          }}
        >
          Building your trip
        </div>
        <div
          key={quip}
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--roam-text-muted)",
            lineHeight: 1.4,
            animation: "aitm-quipIn 0.3s ease both",
          }}
        >
          {quip}
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: "60%",
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
            animation: "aitm-progress 2s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}

/* ── Main modal ─────────────────────────────────────────────────────── */

export function AiTripModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with trip stops + title after user confirms. */
  onConfirm: (seed: AiTripSeed) => void;
}) {
  const [vibe, setVibe] = useState("");
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<AiTripSuggestion | null>(null);
  const [stops, setStops] = useState<AiTripStop[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const thinkingQuip = useRotatingQuip(THINKING_QUIPS, loading);
  const buildingQuip = useRotatingQuip(BUILDING_QUIPS, building);

  // ── Entrance transition ──
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(raf);
    }
    setMounted(false);
  }, [open]);

  // ── Drag-to-dismiss ──
  const dragState = useRef<{ startY: number; startTranslate: number } | null>(null);
  const [dragY, setDragY] = useState(0);

  const onDragPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (loading || building) return; // no dismiss while working
    dragState.current = { startY: e.clientY, startTranslate: dragY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [dragY, loading, building]);

  const onDragPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const delta = e.clientY - dragState.current.startY;
    setDragY(Math.max(0, dragState.current.startTranslate + delta));
  }, []);

  const onDragPointerUp = useCallback(() => {
    if (!dragState.current) return;
    if (dragY > 120) onClose();
    setDragY(0);
    dragState.current = null;
  }, [dragY, onClose]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setVibe("");
      setLoading(false);
      setBuilding(false);
      setError(null);
      setSuggestion(null);
      setStops([]);
      setDragY(0);
      dragState.current = null;
      abortRef.current?.abort();
    } else {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleGenerate = useCallback(async () => {
    const trimmed = vibe.trim();
    if (!trimmed || loading || building) return;

    haptic.medium();
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    setSuggestion(null);
    setStops([]);

    try {
      const result = await generateAiTrip(trimmed, ctrl.signal);
      setSuggestion(result);
      setStops(result.stops);
      haptic.success();
      // Scroll to top of results after they render
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
      haptic.error();
    } finally {
      setLoading(false);
    }
  }, [vibe, loading, building]);

  const handleRemoveStop = useCallback((idx: number) => {
    setStops((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleConfirm = useCallback(() => {
    if (!suggestion || stops.length < 2 || building) return;
    haptic.medium();
    setBuilding(true);

    // Brief delay so the user sees the building state, then hand off
    const timer = setTimeout(() => {
      const tripStops: TripStop[] = stops.map((s, i) => stopToTripStop(s, i, stops.length));
      onConfirm({ title: suggestion.title, stops: tripStops });
    }, 1200);

    return () => clearTimeout(timer);
  }, [suggestion, stops, onConfirm, building]);

  if (!open) return null;

  const hasPreview = suggestion !== null;
  const busy = loading || building;

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(10,8,6,0.65)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 50,
          animation: "aitm-fadeIn 0.15s ease",
        }}
        onClick={busy ? undefined : onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        style={{
          position: "fixed",
          left: "50%",
          bottom: 0,
          transform: mounted
            ? `translateX(-50%) translateY(${dragY}px)`
            : "translateX(-50%) translateY(100%)",
          width: "min(100%, 440px)",
          maxHeight: "90dvh",
          background: "var(--roam-surface)",
          borderRadius: "24px 24px 0 0",
          boxShadow: "var(--shadow-sheet, 0 -8px 32px rgba(40,32,20,0.10))",
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
          transition: dragState.current ? "none" : "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
          paddingBottom: "calc(var(--bottom-nav-height, 100px) + 12px)",
          willChange: "transform",
          contain: "layout style",
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
            padding: "12px 0 8px",
            cursor: busy ? "default" : "grab",
            touchAction: "none",
            flexShrink: 0,
            minHeight: 28,
          }}
        >
          <div
            style={{
              width: 36,
              height: 5,
              borderRadius: 3,
              background: "var(--roam-border-strong)",
              opacity: 0.6,
              margin: "0 auto",
            }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px 10px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "var(--r-card)",
                background: "linear-gradient(135deg, rgba(56,189,248,0.15), rgba(181,69,46,0.10))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={16} style={{ color: "var(--brand-sky, #38bdf8)" }} />
            </div>
            <div>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: "var(--roam-text)",
                  letterSpacing: "-0.01em",
                }}
              >
                AI Trip Planner
              </span>
            </div>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={onClose}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: "var(--r-card)",
                background: "var(--roam-surface-hover)",
                color: "var(--roam-text-muted)",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* ── Body ── */}
        {building ? (
          <BuildingView quip={buildingQuip} />
        ) : loading ? (
          <GeneratingView quip={thinkingQuip} />
        ) : (
          <>
            {/* Scrollable body */}
            <div
              ref={scrollRef}
              className="roam-scroll"
              style={{
                flex: 1,
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                padding: "0 16px",
              }}
            >
              {/* Subtitle hint */}
              {!hasPreview && (
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--roam-text-muted)",
                    lineHeight: 1.45,
                    marginBottom: 14,
                    animation: "aitm-fadeIn 0.3s ease both",
                  }}
                >
                  Describe where you want to go and the kind of trip you're after. We'll plan the stops.
                </div>
              )}

              {/* Vibe input */}
              <div style={{ marginBottom: 12 }}>
                <textarea
                  ref={inputRef}
                  value={vibe}
                  onChange={(e) => {
                    setVibe(e.target.value);
                    if (suggestion) { setSuggestion(null); setStops([]); }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate();
                  }}
                  placeholder={"e.g. \u201CSydney to Byron Bay, 3 days, coastal roads and hidden beaches\u201D"}
                  rows={3}
                  maxLength={800}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    resize: "none",
                    background: "var(--roam-surface-raised, var(--roam-surface))",
                    border: "1.5px solid var(--roam-border)",
                    borderRadius: "var(--r-card)",
                    padding: "12px 14px",
                    fontSize: 14,
                    color: "var(--roam-text)",
                    outline: "none",
                    lineHeight: 1.5,
                    fontFamily: "inherit",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--brand-sky, #38bdf8)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--roam-border)"; }}
                />
              </div>

              {/* Generate button */}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!vibe.trim()}
                style={{
                  all: "unset",
                  cursor: !vibe.trim() ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  boxSizing: "border-box",
                  height: 48,
                  borderRadius: "var(--r-card)",
                  background: !vibe.trim()
                    ? "var(--roam-surface-hover)"
                    : "linear-gradient(135deg, var(--brand-ochre, #b5452e), #c9633e)",
                  color: !vibe.trim()
                    ? "var(--roam-text-muted)"
                    : "#fff",
                  fontSize: 15,
                  fontWeight: 800,
                  boxShadow: !vibe.trim() ? "none" : "0 4px 16px rgba(181,69,46,0.25)",
                  transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
                  marginBottom: 16,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Noise texture on button */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: "url(/img/noise.png)",
                    backgroundRepeat: "repeat",
                    backgroundSize: "200px",
                    opacity: vibe.trim() ? 0.05 : 0,
                    pointerEvents: "none",
                    borderRadius: "inherit",
                    mixBlendMode: "overlay",
                  }}
                />
                <Sparkles size={16} style={{ position: "relative" }} />
                <span style={{ position: "relative" }}>
                  {suggestion ? "Try Again" : "Generate Trip"}
                </span>
              </button>

              {/* Error */}
              {error && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 14px",
                    borderRadius: "var(--r-card)",
                    background: "var(--bg-error, #fae5e2)",
                    color: "var(--text-error, #922018)",
                    fontSize: 13,
                    fontWeight: 600,
                    lineHeight: 1.5,
                    animation: "aitm-fadeIn 0.2s ease both",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Preview */}
              {hasPreview && stops.length > 0 && (
                <div style={{ marginBottom: 16, animation: "aitm-fadeIn 0.3s ease both" }}>
                  {/* Title */}
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 900,
                      color: "var(--roam-text)",
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      animation: "aitm-fadeIn 0.3s ease both",
                    }}
                  >
                    <MapPin size={15} style={{ color: "var(--brand-eucalypt, #2d6e40)", flexShrink: 0 }} />
                    {suggestion!.title}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--roam-text-muted)",
                      marginBottom: 12,
                      paddingLeft: 22,
                    }}
                  >
                    {stops.length} stops &middot; remove any you don&apos;t want
                  </div>

                  {/* Stop list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {stops.map((s, i) => (
                      <StopPreviewRow
                        key={`${s.name}-${i}`}
                        stop={s}
                        reason={s.reason}
                        idx={i}
                        total={stops.length}
                        onRemove={() => handleRemoveStop(i)}
                        animDelay={i * 60}
                      />
                    ))}
                  </div>

                  {stops.length < 2 && (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--roam-text-muted)",
                        textAlign: "center",
                      }}
                    >
                      A trip needs at least 2 stops. Try regenerating.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Confirm footer */}
            {hasPreview && stops.length >= 2 && (
              <div
                style={{
                  padding: "12px 16px 4px",
                  flexShrink: 0,
                  borderTop: "1px solid var(--roam-border)",
                  animation: "aitm-fadeIn 0.3s ease 0.15s both",
                }}
              >
                <button
                  type="button"
                  onClick={handleConfirm}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    width: "100%",
                    boxSizing: "border-box",
                    height: 54,
                    borderRadius: "var(--r-card)",
                    background: "linear-gradient(135deg, var(--brand-eucalypt, #2d6e40), #3a8f52)",
                    color: "var(--on-color)",
                    fontSize: 16,
                    fontWeight: 800,
                    boxShadow: "var(--shadow-medium)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
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
                  <MapPin size={16} style={{ position: "relative" }} />
                  <span style={{ position: "relative" }}>Let&apos;s Go</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ── Keyframes ─────────────────────────────────────────────────────── */

const KEYFRAMES = `
@keyframes aitm-fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes aitm-spin {
  to { transform: rotate(360deg); }
}
@keyframes aitm-quipIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes aitm-stopIn {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes aitm-progress {
  0%   { width: 5%; margin-left: 0; }
  50%  { width: 40%; margin-left: 30%; }
  100% { width: 5%; margin-left: 95%; }
}
`;
