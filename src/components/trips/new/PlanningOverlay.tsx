"use client";

/**
 * PlanningOverlay
 *
 * Bottom-sheet loading experience shown while the offline bundle builds.
 * Matches the WelcomeModal / PaywallModal design language:
 *   – blurred scrim + bottom sheet on --surface-card
 *   – eucalypt gradient hero band
 *   – warm divider step list
 *   – inline design tokens throughout
 */

import { useEffect, useRef, useState } from "react";
import type { BuildPhase } from "@/lib/offline/buildPlanBundle";

/* ─── Step definitions ───────────────────────────────────────────────────── */

type StepId =
  | "routing"
  | "corridor"
  | "places"
  | "fuel"
  | "traffic"
  | "hazards"
  | "bundle"
  | "saving";

interface StepDef {
  id: StepId;
  icon: string;
  label: string;
  quips: string[];
  doneQuip: string;
}

const STEPS: StepDef[] = [
  {
    id: "routing",
    icon: "🗺️",
    label: "Plotting your route",
    quips: [
      "Consulting the sacred maps…",
      "Arguing with the GPS about shortest vs fastest…",
      "Triple-checking for unsealed roads your sedan won't survive…",
      "Drawing the squiggly line that will define your weekend…",
    ],
    doneQuip: "Route locked in. No U-turns.",
  },
  {
    id: "corridor",
    icon: "📡",
    label: "Mapping the offline corridor",
    quips: [
      "Carving a bubble of knowledge around your route…",
      "Downloading the relevant slice of Australia…",
      "This is where we grab a lot of map data. Completely normal.",
      "Pre-loading your surroundings like a responsible adult…",
    ],
    doneQuip: "Corridor secured.",
  },
  {
    id: "places",
    icon: "📍",
    label: "Caching points of interest",
    quips: [
      "Logging servo locations so you don't run dry in the outback…",
      "Finding every roadhouse, rest stop, and dodgy pub en route…",
      "Cataloguing thousands of places. Most closed on Sundays.",
      "Bookmarking the good bakeries — and the bad ones, for context.",
    ],
    doneQuip: "Places locked and loaded.",
  },
  {
    id: "fuel",
    icon: "⛽",
    label: "Analysing fuel coverage",
    quips: [
      "Checking you can actually make it without pushing the car…",
      "Running fuel math. Fingers crossed you filled up.",
      "Scanning for suspicious 300 km gaps between servos…",
      "Crunching range vs distance. The numbers will not lie.",
    ],
    doneQuip: "Fuel coverage mapped.",
  },
  {
    id: "traffic",
    icon: "🚦",
    label: "Checking live traffic",
    quips: [
      "Pinging the traffic gods…",
      "Scanning for inexplicable 40 km/h zones nobody asked for…",
      "Looking for that one crash near the highway merge. There's always one.",
      "Checking if the highway is moving or just… sitting there.",
    ],
    doneQuip: "Traffic snapshot captured.",
  },
  {
    id: "hazards",
    icon: "⚠️",
    label: "Fetching road warnings",
    quips: [
      "Checking for floods, fires, and other classic Aussie hazards…",
      "Scanning road condition reports. The results may shock you.",
      "Looking for any warnings issued since last Tuesday's drama…",
      "Fetching advisories. Mostly fine. Probably.",
    ],
    doneQuip: "Hazards noted. Drive sensibly.",
  },
  {
    id: "bundle",
    icon: "📦",
    label: "Packaging your offline kit",
    quips: [
      "Wrapping everything into a tidy offline bundle…",
      "Compressing maps, routes, and wisdom into one neat parcel…",
      "Zipping files. Genuinely the most satisfying part.",
      "Assembling your full outback survival kit…",
    ],
    doneQuip: "Bundle packaged.",
  },
  {
    id: "saving",
    icon: "💾",
    label: "Saving to your device",
    quips: [
      "Writing to storage. Don't close the app now.",
      "Committing to disk. Very nearly there.",
      "Persisting your trip so it survives airplane mode, tunnels, and the Nullarbor.",
      "Almost done. Hold tight.",
    ],
    doneQuip: "Saved to device.",
  },
];

/* ─── Phase → step mapping ───────────────────────────────────────────────── */

function phaseToStepId(phase: BuildPhase): StepId | null {
  switch (phase) {
    case "routing":           return "routing";
    case "corridor_ensure":
    case "corridor_get":      return "corridor";
    case "places_corridor":   return "places";
    case "fuel_analysis":     return "fuel";
    case "traffic_poll":      return "traffic";
    case "hazards_poll":      return "hazards";
    case "bundle_build":      return "bundle";
    case "downloading":
    case "saving":            return "saving";
    default:                  return null;
  }
}

function stepIndex(id: StepId | null): number {
  if (!id) return -1;
  return STEPS.findIndex((s) => s.id === id);
}

/* ─── Rotating quip hook ────────────────────────────────────────────────── */

function useRotatingQuip(quips: string[], active: boolean): string {
  const [idx, setIdx] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (ref.current) clearInterval(ref.current);
      setIdx(0);
      return;
    }
    ref.current = setInterval(() => setIdx((i) => (i + 1) % quips.length), 3000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [active, quips.length]);

  return quips[idx] ?? quips[0] ?? "";
}

/* ─── Spinner ────────────────────────────────────────────────────────────── */

function Spinner() {
  return (
    <div
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: "2px solid rgba(200,90,58,0.20)",
        borderTopColor: "var(--brand-ochre, #c85a3a)",
        animation: "roam-po-spin 0.75s linear infinite",
        flexShrink: 0,
      }}
      aria-hidden
    />
  );
}

/* ─── Main overlay ───────────────────────────────────────────────────────── */

export interface PlanningOverlayProps {
  phase: BuildPhase;
  error: string | null;
  visible: boolean;
}

export function PlanningOverlay({ phase, error, visible }: PlanningOverlayProps) {
  const activeStepId = phaseToStepId(phase);
  const activeIdx = stepIndex(activeStepId);
  const isReady = phase === "ready";

  const activeStep = activeStepId ? STEPS.find((s) => s.id === activeStepId) : null;
  const quip = useRotatingQuip(activeStep?.quips ?? ["Working…"], !!activeStep && !isReady);

  if (!visible) return null;

  const doneCount = isReady ? STEPS.length : Math.max(0, activeIdx);

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* Scrim */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 60,
          background: "rgba(10, 8, 6, 0.75)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingBottom: "var(--bottom-nav-height, calc(80px + env(safe-area-inset-bottom, 0px)))",
          animation: "roam-po-fadein 0.3s ease both",
        }}
        role="status"
        aria-live="polite"
        aria-label="Building your trip"
      >
        {/* Sheet */}
        <div
          style={{
            width: "100%",
            maxWidth: 480,
            background: "var(--surface-card, #f4efe6)",
            borderRadius: "28px 28px 0 0",
            overflow: "hidden",
            maxHeight: "calc(100vh - var(--bottom-nav-height, 80px) - 48px)",
            display: "flex",
            flexDirection: "column",
            animation: "roam-po-slideup 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
        >
          {/* ── Hero band ── */}
          <div
            style={{
              background: error
                ? "linear-gradient(135deg, #7a1800 0%, var(--brand-ochre, #c85a3a) 100%)"
                : isReady
                ? "linear-gradient(135deg, #7a3d00 0%, var(--brand-amber, #b8872a) 100%)"
                : "linear-gradient(135deg, #7a3d00 0%, var(--brand-ochre, #c85a3a) 100%)",
              padding: "20px 20px 16px",
              position: "relative",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {/* Decorative rings */}
            <div style={{
              position: "absolute", top: -60, right: -60,
              width: 200, height: 200, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.08)",
              pointerEvents: "none",
            }} />
            <div style={{
              position: "absolute", top: -30, right: -30,
              width: 130, height: 130, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.10)",
              pointerEvents: "none",
            }} />

            {/* Eyebrow badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.15)",
              borderRadius: 999, padding: "3px 10px",
              marginBottom: 10,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 800,
                letterSpacing: "0.06em",
                color: "rgba(255,255,255,0.9)",
                textTransform: "uppercase" as const,
              }}>
                {isReady ? "Trip ready" : error ? "Build failed" : "Planning your trip"}
              </span>
            </div>

            <h2 style={{
              margin: "0 0 4px",
              fontSize: 19, fontWeight: 900,
              color: "#fff", lineHeight: 1.2,
            }}>
              {isReady
                ? "You're good to go 🟢"
                : error
                ? "Something went wrong"
                : `${doneCount} of ${STEPS.length} steps complete`}
            </h2>

            <p style={{
              margin: 0,
              fontSize: 12, fontWeight: 500,
              color: "rgba(255,255,255,0.75)",
              lineHeight: 1.45,
            }}>
              {isReady
                ? "Your trip is saved offline — works without signal, anywhere."
                : error
                ? error
                : activeStep
                ? quip
                : "Getting things ready…"}
            </p>

            {/* Progress bar */}
            {!error && (
              <div style={{
                marginTop: 14,
                height: 3,
                background: "rgba(255,255,255,0.18)",
                borderRadius: 2,
                overflow: "hidden",
              }}>
                <div style={{
                  height: "100%",
                  width: `${isReady ? 100 : Math.max(4, Math.round((doneCount / STEPS.length) * 100))}%`,
                  background: "rgba(255,255,255,0.75)",
                  borderRadius: 2,
                  transition: "width 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
                }} />
              </div>
            )}
          </div>

          {/* ── Step list ── */}
          {!error && (
            <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" as any }}>
              {STEPS.map((step, i) => {
                const done = isReady || i < activeIdx;
                const active = !isReady && i === activeIdx;
                const waiting = !isReady && i > activeIdx;

                return (
                  <div
                    key={step.id}
                    role="listitem"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "7px 20px",
                      borderBottom: i < STEPS.length - 1
                        ? "1px solid var(--roam-border, rgba(26,22,19,0.07))"
                        : "none",
                      opacity: waiting ? 0.32 : 1,
                      background: active ? "rgba(200,90,58,0.05)" : "transparent",
                      transition: "opacity 0.2s, background 0.2s",
                    }}
                  >
                    {/* Icon / state indicator */}
                    <div style={{
                      width: 30, height: 30, flexShrink: 0,
                      borderRadius: 8,
                      background: done
                        ? "var(--accent-tint, rgba(51,120,74,0.10))"
                        : active
                        ? "rgba(200,90,58,0.10)"
                        : "var(--surface-muted, #e3dccf)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: done ? 12 : 16,
                      color: done ? "var(--brand-eucalypt, #2d6e40)" : undefined,
                      fontWeight: done ? 900 : undefined,
                      transition: "background 0.2s",
                    }}>
                      {done ? "✓" : active ? <Spinner /> : step.icon}
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700,
                        color: done
                          ? "var(--roam-text-muted, #7a7067)"
                          : "var(--roam-text, #1a1613)",
                        lineHeight: 1.3,
                        letterSpacing: "-0.01em",
                      }}>
                        {step.label}
                      </div>
                      {active && (
                        <div style={{
                          fontSize: 11, fontWeight: 500,
                          color: "var(--roam-text-muted, #7a7067)",
                          marginTop: 1,
                          lineHeight: 1.35,
                          animation: "roam-po-quipin 0.3s ease both",
                        }}>
                          {quip}
                        </div>
                      )}
                    </div>

                    {/* Done quip on the right for completed rows */}
                    {done && (
                      <div style={{
                        fontSize: 11, fontWeight: 500,
                        color: "var(--brand-eucalypt, #2d6e40)",
                        flexShrink: 0,
                        maxWidth: 110,
                        textAlign: "right" as const,
                        lineHeight: 1.3,
                      }}>
                        {step.doneQuip}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Error detail ── */}
          {error && (
            <div style={{ padding: "14px 20px 16px", flexShrink: 0 }}>
              <div style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--bg-error, #fae5e2)",
                color: "var(--text-error, #922018)",
                fontSize: 13, fontWeight: 600,
                lineHeight: 1.5,
              }}>
                {error}
              </div>
            </div>
          )}

          {/* ── Bottom breathing room ── */}
          <div style={{ height: 10, flexShrink: 0 }} />
        </div>
      </div>
    </>
  );
}

/* ─── Keyframes ──────────────────────────────────────────────────────────── */

const KEYFRAMES = `
@keyframes roam-po-fadein {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes roam-po-slideup {
  from { transform: translateY(24px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes roam-po-spin {
  to { transform: rotate(360deg); }
}
@keyframes roam-po-quipin {
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;
