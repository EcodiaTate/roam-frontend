// src/components/nav/NavigationHUD.tsx
"use client";

import { useMemo } from "react";
import type { ActiveNavState } from "@/lib/nav/activeNav";
import { formatInstruction, formatShort, formatDistance, maneuverIcon } from "@/lib/nav/instructions";

type Props = {
  nav: ActiveNavState;
  visible: boolean;
};

/* ── Maneuver arrow SVGs (clean, bold, white on transparent) ──────── */

const ARROW_SVGS: Record<string, string> = {
  "arrow-up":          "M12 4 12 20M12 4 5 11M12 4 19 11",
  "arrow-left":        "M5 12 20 12M5 12 12 5M5 12 12 19",
  "arrow-right":       "M19 12 4 12M19 12 12 5M19 12 12 19",
  "arrow-slight-left": "M7 4 7 20M7 4 17 14",
  "arrow-slight-right":"M17 4 17 20M17 4 7 14",
  "arrow-sharp-left":  "M5 19 5 4M5 19 19 5",
  "arrow-sharp-right": "M19 19 19 4M19 19 5 5",
  "uturn-left":        "M5 20 5 10a7 7 0 0 1 14 0M5 20 1 16M5 20 9 16",
  "roundabout":        "M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0M12 7 12 2M12 2 9 5M12 2 15 5",
  "roundabout-exit":   "M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0M17 12 22 12M22 12 19 9M22 12 19 15",
  "merge-left":        "M6 4 12 12 12 20M18 4 12 12",
  "merge-right":       "M18 4 12 12 12 20M6 4 12 12",
  "fork-left":         "M12 20 12 12 5 4M12 12 19 4",
  "fork-right":        "M12 20 12 12 19 4M12 12 5 4",
  "ramp-left":         "M12 20 12 12 5 4",
  "ramp-right":        "M12 20 12 12 19 4",
  "offramp-left":      "M12 20 12 12 5 4M12 12 4 12",
  "offramp-right":     "M12 20 12 12 19 4M12 12 20 12",
  "arrive":            "M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  "depart":            "M4 2v20M4 2l12 7-12 7",
};

function ManeuverArrow({ iconName, size = 48 }: { iconName: string; size?: number }) {
  const pathD = ARROW_SVGS[iconName] ?? ARROW_SVGS["arrow-up"];
  const isArrive = iconName === "arrive" || iconName === "depart";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isArrive ? "white" : "none"}
      stroke={isArrive ? "none" : "white"}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={pathD} />
    </svg>
  );
}

/* ── Component ───────────────────────────────────────────────────── */

export function NavigationHUD({ nav, visible }: Props) {
  const currentStep = nav.currentStep;
  const nextStep = nav.nextStep;

  const iconName = useMemo(
    () => (currentStep ? maneuverIcon(currentStep.maneuver) : "arrow-up"),
    [currentStep],
  );

  // Determine approach state for visual intensity
  const isImminent = nav.distToNextManeuver_m < 100;
  const isApproaching = nav.distToNextManeuver_m < 500;

  if (!visible || !currentStep) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        left: 12,
        right: 12,
        zIndex: 30,
        pointerEvents: "auto",
        transform: visible ? "translateY(0)" : "translateY(-120%)",
        transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Main maneuver card */}
      <div
        style={{
          background: isImminent
            ? "linear-gradient(135deg, #16a34a, #15803d)"
            : isApproaching
            ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
            : "linear-gradient(135deg, rgba(30,30,30,0.92), rgba(20,20,20,0.95))",
          borderRadius: 20,
          padding: "16px 18px",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)",
          transition: "background 0.4s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Arrow icon */}
          <div
            style={{
              flexShrink: 0,
              width: 56,
              height: 56,
              display: "grid",
              placeItems: "center",
              animation: isImminent ? "hud-pulse 0.8s ease-in-out infinite" : undefined,
            }}
          >
            <ManeuverArrow iconName={iconName} size={48} />
          </div>

          {/* Instruction text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 950,
                color: "white",
                lineHeight: 1.2,
                letterSpacing: "-0.2px",
              }}
            >
              {formatShort(currentStep)}
            </div>
            {currentStep.name && (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.75)",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {currentStep.ref
                  ? `${currentStep.name} (${currentStep.ref})`
                  : currentStep.name}
              </div>
            )}
          </div>

          {/* Distance to maneuver */}
          <div
            style={{
              flexShrink: 0,
              textAlign: "right",
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 950,
                color: "white",
                letterSpacing: "-0.5px",
                lineHeight: 1,
              }}
            >
              {formatDistance(nav.distToNextManeuver_m)}
            </div>
          </div>
        </div>

        {/* Next step preview */}
        {nextStep && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "rgba(255,255,255,0.45)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              then
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(255,255,255,0.6)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {formatInstruction(nextStep)}
            </span>
          </div>
        )}
      </div>

      {/* Pulse animation for imminent turns */}
      <style>{`
        @keyframes hud-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}