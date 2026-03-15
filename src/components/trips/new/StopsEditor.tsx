"use client";

import React, { useEffect, useRef, useState } from "react";
import type { TripStop } from "@/lib/types/trip";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import { StopRow } from "./StopRow";
import { haptic } from "@/lib/native/haptics";
import { hideKeyboard } from "@/lib/native/keyboard";

import { useRouter } from "next/navigation";
import {
  Rocket,
  Compass,
  Route,
  Map,
  MapPin,
  Cloud,
  AlertTriangle,
  Package,
  Check,
  Loader2,
  X,
  ArrowLeft,
  Link,
  Library,
} from "lucide-react";

/* ── Types ────────────────────────────────────────────────────────────── */

type OfflineBuildPhase =
  | "idle"
  | "routing"
  | "corridor_ensure"
  | "corridor_get"
  | "places_corridor"
  | "traffic_poll"
  | "hazards_poll"
  | "bundle_build"
  | "ready"
  | "error";

/* ── Build pipeline step definitions ─────────────────────────────────── */

type PipelineStep = {
  id: string;
  phases: OfflineBuildPhase[];
  icon: React.ReactNode;
  label: string;
  activeLabel: string;
  doneLabel: string;
  color: string;
};

const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: "route",
    phases: ["routing"],
    icon: <Route size={18} />,
    label: "Plan your route",
    activeLabel: "Finding the best route…",
    doneLabel: "Route sorted",
    color: "#3b82f6",
  },
  {
    id: "corridor",
    phases: ["corridor_ensure", "corridor_get"],
    icon: <Map size={18} />,
    label: "Save maps offline",
    activeLabel: "Downloading maps along your route…",
    doneLabel: "Maps downloaded",
    color: "#8b5cf6",
  },
  {
    id: "places",
    phases: ["places_corridor"],
    icon: <MapPin size={18} />,
    label: "Find stops along the way",
    activeLabel: "Finding fuel, food & rest stops…",
    doneLabel: "Stops saved",
    color: "#f59e0b",
  },
  {
    id: "traffic",
    phases: ["traffic_poll"],
    icon: <Cloud size={18} />,
    label: "Check live traffic",
    activeLabel: "Checking current traffic…",
    doneLabel: "Traffic checked",
    color: "#06b6d4",
  },
  {
    id: "hazards",
    phases: ["hazards_poll"],
    icon: <AlertTriangle size={18} />,
    label: "Check road hazards",
    activeLabel: "Looking for road warnings…",
    doneLabel: "All clear",
    color: "#ef4444",
  },
  {
    id: "bundle",
    phases: ["bundle_build"],
    icon: <Package size={18} />,
    label: "Pack it all up",
    activeLabel: "Getting everything ready to go…",
    doneLabel: "Ready to roll",
    color: "#22c55e",
  },
];

function getStepState(step: PipelineStep, currentPhase: OfflineBuildPhase): "pending" | "active" | "done" {
  const allPhases: OfflineBuildPhase[] = PIPELINE_STEPS.flatMap((s) => s.phases);
  const currentIdx = allPhases.indexOf(currentPhase);
  const stepStartIdx = allPhases.indexOf(step.phases[0]);
  const stepEndIdx = allPhases.indexOf(step.phases[step.phases.length - 1]);

  if (currentPhase === "ready" || currentPhase === "error") {
    if (currentPhase === "ready") return "done";
    if (currentIdx > stepEndIdx) return "done";
    if (currentIdx >= stepStartIdx && currentIdx <= stepEndIdx) return "active";
    return "pending";
  }

  if (currentIdx > stepEndIdx) return "done";
  if (currentIdx >= stepStartIdx && currentIdx <= stepEndIdx) return "active";
  return "pending";
}

/* ── Animated spinner ────────────────────────────────────────────────── */

function Spinner({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Loader2
      size={size}
      style={{
        color,
        animation: "roam-spin 0.8s linear infinite",
      }}
    />
  );
}

/* ── Elapsed timer ───────────────────────────────────────────────────── */

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const display = m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;

  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: "var(--roam-text-muted)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {display}
    </span>
  );
}

/* ── Build Progress View (takes over the sheet) ──────────────────────── */

function BuildProgressView({
  phase,
  error,
  saved,
  startedAt,
  onCancel,
}: {
  phase: OfflineBuildPhase;
  error: string | null;
  saved: boolean;
  startedAt: number;
  onCancel: () => void;
}) {
  const isError = phase === "error";
  const isDone = phase === "ready" && saved;

  const completedCount = PIPELINE_STEPS.filter((s) => getStepState(s, phase) === "done").length;
  const progressFraction = isDone ? 1 : completedCount / PIPELINE_STEPS.length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "28px 20px 20px",
        gap: 20,
        minHeight: 0,
        flex: 1,
        overflow: "hidden",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ position: "relative", width: 72, height: 72, margin: "0 auto 14px" }}>
          <svg width={72} height={72} viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
            <circle cx={36} cy={36} r={30} fill="none" stroke="var(--roam-border)" strokeWidth={4} />
            <circle
              cx={36}
              cy={36}
              r={30}
              fill="none"
              stroke={isError ? "#ef4444" : isDone ? "#22c55e" : "#3b82f6"}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 30}`}
              strokeDashoffset={`${2 * Math.PI * 30 * (1 - progressFraction)}`}
              style={{
                transition: "stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s",
              }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isError ? (
              <X size={26} style={{ color: "var(--roam-danger)" }} />
            ) : isDone ? (
              <Check
                size={26}
                style={{
                  color: "var(--roam-success)",
                  animation: "roam-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              />
            ) : (
              <Rocket
                size={24}
                style={{
                  color: "#3b82f6",
                  animation: "roam-pulse 1.5s ease-in-out infinite",
                }}
              />
            )}
          </div>
        </div>

        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--roam-text)", letterSpacing: -0.3 }}>
          {isError ? "Something went wrong" : isDone ? "You're all set!" : "Building your trip"}
        </div>
        <div style={{ fontSize: 13, color: "var(--roam-text-muted)", marginTop: 4, fontWeight: 500 }}>
          {isError ? "Go back, check your stops, and try again" : isDone ? "Your trip is saved and works without internet" : "This only takes a moment"}
        </div>
        {!isDone && !isError && (
          <div style={{ marginTop: 6 }}>
            <ElapsedTimer startedAt={startedAt} />
          </div>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 2 }}>
        {PIPELINE_STEPS.map((step) => {
          const state = getStepState(step, phase);
          const isActive = state === "active";
          const isDoneStep = state === "done";

          return (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 12,
                background: isActive ? `${step.color}0D` : "transparent",
                transition: "background 0.3s, opacity 0.3s",
                opacity: state === "pending" ? 0.35 : 1,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isDoneStep ? `${step.color}1A` : isActive ? `${step.color}1A` : "var(--roam-surface)",
                  border: isActive ? `1.5px solid ${step.color}40` : "1px solid var(--roam-border)",
                  color: isDoneStep || isActive ? step.color : "var(--roam-text-muted)",
                  transition: "all 0.3s",
                  flexShrink: 0,
                }}
              >
                {isActive ? <Spinner color={step.color} size={16} /> : isDoneStep ? <Check size={15} strokeWidth={3} /> : <span style={{ opacity: 0.5 }}>{step.icon}</span>}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? "var(--roam-text)" : isDoneStep ? "var(--roam-text)" : "var(--roam-text-muted)",
                    transition: "color 0.3s",
                  }}
                >
                  {isActive ? step.activeLabel : isDoneStep ? step.doneLabel : step.label}
                </div>
              </div>

              {isDoneStep && (
                <Check
                  size={14}
                  strokeWidth={3}
                  style={{
                    color: step.color,
                    flexShrink: 0,
                    animation: "roam-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {isError && error && (
        <div
          style={{
            width: "100%",
            maxWidth: 360,
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--danger-tint)",
            border: "1px solid var(--roam-border-strong)",
            fontSize: 12,
            color: "var(--roam-danger)",
            fontWeight: 600,
            lineHeight: 1.4,
            wordBreak: "break-word",
          }}
        >
          {error}
        </div>
      )}

      {isError && (
        <button
          type="button"
          onClick={() => {
            haptic.light();
            onCancel();
          }}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 20px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            color: "var(--roam-text)",
            background: "var(--roam-surface)",
            border: "1px solid var(--roam-border)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <ArrowLeft size={16} />
          Back to editor
        </button>
      )}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────── */

export function StopsEditor(props: {
  profile: string;
  onProfileChange: (p: string) => void;

  stops: TripStop[];
  onAddStop: (type?: "poi" | "via") => void;
  onRemoveStop: (id: string) => void;
  onReorderStop: (fromIdx: number, toIdx: number) => void;

  onEditStop: (id: string, patch: Partial<Pick<TripStop, "name" | "lat" | "lng">>) => void;
  onUseMyLocation: () => void;
  onSearchStop: (id: string) => void;
  onJoinPlan: () => void;
  onPlans: () => void;

  onBuildRoute: () => void;
  canBuildRoute: boolean;
  routing: boolean;
  error: string | null;

  onBuildOffline: () => void;
  onGoNow: () => void;
  goingNow: boolean;

  onDownloadOffline: () => void;
  onSaveOffline: () => void;
  onResetOffline: () => void;

  offlinePhase: OfflineBuildPhase;
  offlineError: string | null;
  offlineManifest: OfflineBundleManifest | null;
  canDownloadOffline: boolean;

  savingOffline: boolean;
  savedOffline: boolean;

  /** Whether user has Roam Untethered. null = still loading. */
  unlocked?: boolean | null;
  /** Called when user taps the upgrade button. */
  onUpgrade?: () => void;
}) {
  const router = useRouter();

  // --- Smooth Drag Controller ---
  const [snapState, setSnapState] = useState<"peek" | "expanded">("peek");
  const [dragOffset, setDragOffset] = useState(0);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const isDragging = useRef(false);
  const dragData = useRef({ startY: 0, lastY: 0, lastTime: 0, velocity: 0 });

  // Track when build started for elapsed timer
  const [buildStartTime, setBuildStartTime] = useState<number>(0);
  const [prevPhase, setPrevPhase] = useState(props.offlinePhase);
  const isBuilding = props.offlinePhase !== "idle";

  // During-render state updates when phase changes
  if (props.offlinePhase !== prevPhase) {
    setPrevPhase(props.offlinePhase);
    if (props.offlinePhase !== "idle" && props.offlinePhase !== "error") {
      setSnapState("expanded");
    }
    if (props.offlinePhase === "idle") {
      setBuildStartTime(0);
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isBuilding) return;
    isDragging.current = true;
    setIsDraggingState(true);
    dragData.current = { startY: e.clientY, lastY: e.clientY, lastTime: Date.now(), velocity: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const currentY = e.clientY;
    const currentTime = Date.now();
    const deltaY = currentY - dragData.current.lastY;
    const deltaTime = currentTime - dragData.current.lastTime;
    if (deltaTime > 0) dragData.current.velocity = deltaY / deltaTime;
    dragData.current.lastY = currentY;
    dragData.current.lastTime = currentTime;

    const totalDelta = currentY - dragData.current.startY;
    if (snapState === "expanded" && totalDelta < 0) setDragOffset(totalDelta * 0.15);
    else if (snapState === "peek" && totalDelta > 0) setDragOffset(totalDelta * 0.15);
    else setDragOffset(totalDelta);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    setIsDraggingState(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    const { velocity } = dragData.current;
    let snapped = false;

    if (snapState === "peek" && (dragOffset < -60 || velocity < -0.5)) {
      setSnapState("expanded");
      snapped = true;
    }
    if (snapState === "expanded" && (dragOffset > 60 || velocity > 0.5)) {
      setSnapState("peek");
      snapped = true;
    }
    if (snapped) haptic.tap();
    setDragOffset(0);
  };

  const peekOffsetStr = `calc(100% - 260px - 400px - var(--roam-safe-bottom))`;
  const baseTransform = snapState === "peek" ? peekOffsetStr : "12px";
  const finalTransform = `translateY(calc(${baseTransform} + ${dragOffset}px))`;

  const canSave = props.canBuildRoute && !props.savingOffline;

  return (
    <div
      className="trip-bottom-sheet-wrap"
      style={{
        transform: finalTransform,
        transition: isDraggingState ? "none" : "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <style>{`
        @keyframes roam-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes roam-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(0.92); } }
        @keyframes roam-pop { 0% { transform: scale(0.5); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
      `}</style>

      <div className="trip-bottom-sheet">
        {/* DRAG HEADER */}
        <div
          className="trip-sheet-header trip-interactive"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ cursor: isBuilding ? "default" : undefined }}
        >
          <div className="trip-drag-handle" />

          <div className="trip-row-between">
            <div>
              <h1 className="trip-h1">{isBuilding ? "Building Trip" : "Plan Trip"}</h1>
              <div className="trip-muted" style={{ marginTop: 2 }}>
                {isBuilding ? "Getting your trip ready for the road" : "Add stops. Tap save. Done."}
              </div>
            </div>

            {/* Action Buttons (Plans + Join + User) */}
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                className="trip-interactive trip-btn-icon"
                aria-label="Plans"
                title="Plans"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  haptic.selection();
                  props.onPlans();
                }}
                style={{
                  borderRadius: 999,
                  width: 40,
                  height: 40,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(0, 0, 0, 0.08)",
                  color: "var(--roam-text)",
                  border: "none",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <Library size={18} />
              </button>

              <button
                type="button"
                className="trip-interactive trip-btn-icon"
                aria-label="Join Plan"
                title="Join Plan"
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag conflict
                onClick={() => {
                  haptic.light();
                  props.onJoinPlan();
                }}
                style={{
                  borderRadius: 999,
                  width: 40,
                  height: 40,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(0, 0, 0, 0.08)",
                  color: "var(--roam-text)",
                  border: "none",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <Link size={18} />
              </button>

              {props.unlocked ? (
                <button
                  type="button"
                  aria-label="Roam Untethered — view your plan"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { haptic.selection(); router.push("/untethered"); }}
                  style={{
                    position: "relative",
                    display: "flex", alignItems: "center", gap: 6,
                    background: "linear-gradient(135deg, #5c1a0e 0%, var(--brand-ochre, #b5452e) 40%, #d4664a 70%, #e8956a 100%)",
                    borderRadius: 999, padding: "0 16px",
                    height: 40, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer",
                    boxShadow: "0 2px 12px rgba(181,69,46,0.40), 0 1px 3px rgba(181,69,46,0.20), inset 0 1px 0 rgba(255,255,255,0.12)",
                    overflow: "hidden",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {/* Shimmer sweep */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.14) 50%, transparent 70%)",
                    borderRadius: "inherit",
                    pointerEvents: "none",
                  }} />
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, position: "relative" }}>
                    <path d="M6 1L7.5 4.5H11L8.25 6.75L9.25 10.5L6 8.5L2.75 10.5L3.75 6.75L1 4.5H4.5L6 1Z" fill="rgba(255,255,255,0.95)" />
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: "0.06em", textTransform: "uppercase", position: "relative" }}>
                    Untethered
                  </span>
                </button>
              ) : props.unlocked === false ? (
                <button
                  type="button"
                  className="trip-interactive"
                  aria-label="Upgrade to Roam Untethered"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { haptic.selection(); props.onUpgrade?.(); }}
                  style={{
                    position: "relative",
                    display: "flex", alignItems: "center", gap: 6,
                    background: "linear-gradient(135deg, #122d1e 0%, var(--brand-eucalypt-dark, #1f5236) 40%, var(--brand-eucalypt, #2d6e40) 80%, #3d8f54 100%)",
                    borderRadius: 999, padding: "0 14px",
                    height: 40, border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer",
                    boxShadow: "0 2px 12px rgba(31,82,54,0.45), 0 1px 3px rgba(31,82,54,0.20), inset 0 1px 0 rgba(255,255,255,0.10)",
                    overflow: "hidden",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.10) 50%, transparent 70%)",
                    borderRadius: "inherit", pointerEvents: "none",
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: "0.06em", textTransform: "uppercase", position: "relative" }}>
                    Upgrade
                  </span>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, position: "relative" }}>
                    <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* CONTENT: either editor or build progress */}
        <div className="trip-sheet-content" style={{ paddingBottom: "calc(var(--bottom-nav-height, 80px) + 120px)" }}>
          {isBuilding ? (
            <BuildProgressView
              phase={props.offlinePhase as OfflineBuildPhase}
              error={props.offlineError}
              saved={props.savedOffline}
              startedAt={buildStartTime}
              onCancel={props.onResetOffline}
            />
          ) : (
            <>
              <div className="trip-flex-col">
                {props.stops.map((s, idx) => (
                  <StopRow
                    key={s.id ?? `${idx}`}
                    stop={s}
                    idx={idx}
                    count={props.stops.length}
                    onEdit={(patch) => {
                      if (s.id) props.onEditStop(s.id, patch);
                    }}
                    onSearch={() => {
                      if (s.id) {
                        haptic.tap();
                        props.onSearchStop(s.id);
                      }
                    }}
                    onRemove={() => {
                      if (s.id) {
                        haptic.medium();
                        props.onRemoveStop(s.id);
                      }
                    }}
                    onMoveUp={() => {
                      haptic.selection();
                      props.onReorderStop(idx, idx - 1);
                    }}
                    onMoveDown={() => {
                      haptic.selection();
                      props.onReorderStop(idx, idx + 1);
                    }}
                    onUseMyLocation={s.type === "start" ? props.onUseMyLocation : undefined}
                  />
                ))}
              </div>

              <div className="trip-actions" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {/* Start Roaming — full offline bundle, the hero action */}
                <button
                  type="button"
                  onClick={() => {
                    haptic.medium();
                    hideKeyboard();
                    setBuildStartTime(Date.now());
                    props.onBuildOffline();
                  }}
                  disabled={!canSave}
                  className="trip-interactive"
                  style={{
                    position: "relative",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    width: "100%",
                    padding: "16px 24px",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "linear-gradient(135deg, #5c1a0e 0%, var(--brand-ochre, #b5452e) 40%, #d4664a 70%, #e8956a 100%)",
                    color: "#fff",
                    fontSize: 16,
                    fontWeight: 900,
                    letterSpacing: "-0.2px",
                    cursor: canSave ? "pointer" : "default",
                    opacity: canSave ? 1 : 0.45,
                    boxShadow: "0 4px 20px rgba(181,69,46,0.45), 0 2px 6px rgba(181,69,46,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
                    overflow: "hidden",
                    WebkitTapHighlightColor: "transparent",
                    transition: "opacity 0.2s, transform 0.15s",
                  }}
                >
                  {/* Shimmer sweep */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.08) 45%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.08) 55%, transparent 75%)",
                    borderRadius: "inherit", pointerEvents: "none",
                  }} />
                  <Compass size={18} style={{ position: "relative", flexShrink: 0 }} />
                  <span style={{ position: "relative" }}>Start Roaming</span>
                </button>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      haptic.tap();
                      props.onAddStop("poi");
                    }}
                    className="trip-interactive"
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      padding: "10px 14px",
                      borderRadius: "var(--r-btn, 14px)",
                      border: "none",
                      background: "var(--brand-eucalypt, #2d6e40)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    + Add Stop
                  </button>

                  {/* Quick Trip — online-only, instant nav */}
                  <button
                    type="button"
                    onClick={() => {
                      haptic.medium();
                      hideKeyboard();
                      props.onGoNow();
                    }}
                    disabled={!props.canBuildRoute || props.goingNow}
                    className="trip-interactive"
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "10px 14px",
                      borderRadius: "var(--r-btn, 14px)",
                      border: "none",
                      background: "var(--brand-eucalypt, #2d6e40)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: (props.canBuildRoute && !props.goingNow) ? "pointer" : "default",
                      opacity: (props.canBuildRoute && !props.goingNow) ? 1 : 0.45,
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    {props.goingNow ? (
                      <Loader2 size={14} style={{ animation: "roam-spin 0.8s linear infinite" }} />
                    ) : (
                      <Route size={14} />
                    )}
                    {props.goingNow ? "Loading…" : "Quick Trip"}
                  </button>
                </div>
              </div>

              {props.error && <div className="trip-err-box">{props.error}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
