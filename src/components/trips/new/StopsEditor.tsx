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
  UserRound,
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
    label: "Build route",
    activeLabel: "Finding the best route…",
    doneLabel: "Route locked in",
    color: "#3b82f6",
  },
  {
    id: "corridor",
    phases: ["corridor_ensure", "corridor_get"],
    icon: <Map size={18} />,
    label: "Offline corridor",
    activeLabel: "Mapping your offline zone…",
    doneLabel: "Corridor ready",
    color: "#8b5cf6",
  },
  {
    id: "places",
    phases: ["places_corridor"],
    icon: <MapPin size={18} />,
    label: "Cache places",
    activeLabel: "Saving fuel, food & rest stops…",
    doneLabel: "Places cached",
    color: "#f59e0b",
  },
  {
    id: "traffic",
    phases: ["traffic_poll"],
    icon: <Cloud size={18} />,
    label: "Traffic snapshot",
    activeLabel: "Grabbing live traffic…",
    doneLabel: "Traffic saved",
    color: "#06b6d4",
  },
  {
    id: "hazards",
    phases: ["hazards_poll"],
    icon: <AlertTriangle size={18} />,
    label: "Hazard warnings",
    activeLabel: "Checking road warnings…",
    doneLabel: "Warnings loaded",
    color: "#ef4444",
  },
  {
    id: "bundle",
    phases: ["bundle_build"],
    icon: <Package size={18} />,
    label: "Package bundle",
    activeLabel: "Packaging everything for offline…",
    doneLabel: "Bundle ready",
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
  const [now, setNow] = useState(Date.now());

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
              <X size={26} style={{ color: "#ef4444" }} />
            ) : isDone ? (
              <Check
                size={26}
                style={{
                  color: "#22c55e",
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
          {isError ? "Tap back to fix your stops and try again" : isDone ? "Your trip is saved and ready for offline" : "Hang tight — this takes a moment"}
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
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.15)",
            fontSize: 12,
            color: "#ef4444",
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
  onJoinPlan: () => void; // ✅ Added

  onBuildRoute: () => void;
  canBuildRoute: boolean;
  routing: boolean;
  error: string | null;

  onBuildOffline: () => void;

  onDownloadOffline: () => void;
  onSaveOffline: () => void;
  onResetOffline: () => void;

  offlinePhase: OfflineBuildPhase;
  offlineError: string | null;
  offlineManifest: OfflineBundleManifest | null;
  canDownloadOffline: boolean;

  savingOffline: boolean;
  savedOffline: boolean;
}) {
  const router = useRouter();

  // --- Smooth Drag Controller ---
  const [snapState, setSnapState] = useState<"peek" | "expanded">("peek");
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);
  const dragData = useRef({ startY: 0, lastY: 0, lastTime: 0, velocity: 0 });

  // Track when build started for elapsed timer
  const buildStartRef = useRef<number>(0);
  const isBuilding = props.offlinePhase !== "idle";

  useEffect(() => {
    if (isBuilding && props.offlinePhase !== "error") {
      setSnapState("expanded");
      if (buildStartRef.current === 0) buildStartRef.current = Date.now();
    }
  }, [isBuilding, props.offlinePhase]);

  useEffect(() => {
    if (props.offlinePhase === "idle") buildStartRef.current = 0;
  }, [props.offlinePhase]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isBuilding) return;
    isDragging.current = true;
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

  const peekOffsetStr = `calc(100% - 260px - var(--roam-safe-bottom))`;
  const baseTransform = snapState === "peek" ? peekOffsetStr : "0px";
  const finalTransform = `translateY(calc(${baseTransform} + ${dragOffset}px))`;

  const canSave = props.canBuildRoute && !props.savingOffline;

  return (
    <div
      className="trip-bottom-sheet-wrap"
      style={{
        transform: finalTransform,
        transition: isDragging.current ? "none" : "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
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
                {isBuilding ? "Preparing your offline bundle" : "Add stops. Tap save. Done."}
              </div>
            </div>

            {/* ✅ Action Buttons (Join + User) */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="trip-interactive"
                aria-label="Join Plan"
                title="Join Plan"
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag conflict
                onClick={() => {
                  haptic.light();
                  props.onJoinPlan();
                }}
                style={{
                  height: 42,
                  padding: "0 14px",
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: "var(--roam-surface)",
                  color: "var(--roam-text)",
                  border: "1px solid var(--roam-border)",
                  boxShadow: "var(--shadow-soft)",
                  WebkitTapHighlightColor: "transparent",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <span style={{ fontSize: 16 }}>🔗</span>
                Join
              </button>

              <button
                type="button"
                className="trip-interactive trip-btn-icon"
                aria-label="Account"
                title="Account"
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag conflict
                onClick={() => {
                  haptic.selection();
                  router.push("/login");
                }}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--roam-surface)",
                  color: "var(--roam-text)",
                  border: "1px solid var(--roam-border)",
                  boxShadow: "var(--shadow-soft)",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <UserRound size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* CONTENT: either editor or build progress */}
        <div className="trip-sheet-content">
          {isBuilding ? (
            <BuildProgressView
              phase={props.offlinePhase as OfflineBuildPhase}
              error={props.offlineError}
              saved={props.savedOffline}
              startedAt={buildStartRef.current || Date.now()}
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

              <div className="trip-actions" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    haptic.tap();
                    props.onAddStop("poi");
                  }}
                  className="trip-interactive trip-btn trip-btn-secondary"
                >
                  + Add Stop
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.medium();
                    hideKeyboard();
                    props.onBuildOffline();
                  }}
                  disabled={!canSave}
                  className="trip-interactive trip-btn trip-btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  <Rocket size={16} />
                  Let's do it
                </button>
              </div>

              {props.error && <div className="trip-err-box">{props.error}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}