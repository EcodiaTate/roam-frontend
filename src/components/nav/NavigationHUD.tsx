// src/components/nav/NavigationHUD.tsx
"use client";

import { memo, useMemo } from "react";
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

function ManeuverArrow({ iconName, size = 44 }: { iconName: string; size?: number }) {
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

export const NavigationHUD = memo(function NavigationHUD({ nav, visible }: Props) {
  const currentStep = nav.currentStep;
  const nextStep = nav.nextStep;

  const iconName = useMemo(
    () => (currentStep ? maneuverIcon(currentStep.maneuver) : "arrow-up"),
    [currentStep],
  );

  const isImminent  = nav.distToNextManeuver_m < 100;
  const isApproaching = nav.distToNextManeuver_m < 500;

  if (!visible || !currentStep) return null;

  // ── Color scheme based on approach state ──
  // Imminent  → eucalypt green  (action!)
  // Approach  → sky blue        (heads-up)
  // Normal    → warm dark panel (Roam-native)
  const bgGradient = isImminent
    ? "linear-gradient(135deg, var(--brand-eucalypt) 0%, var(--brand-eucalypt-dark) 100%)"
    : isApproaching
    ? "linear-gradient(135deg, var(--brand-sky) 0%, #155a8a 100%)"
    : "linear-gradient(160deg, rgba(22,18,14,0.96) 0%, rgba(14,11,9,0.98) 100%)";

  // Arrow icon background swatch
  const iconBg = isImminent
    ? "rgba(255,255,255,0.18)"
    : isApproaching
    ? "rgba(255,255,255,0.15)"
    : "rgba(255,255,255,0.07)";

  // Distance text colour  — ochre accent in normal state, white when active
  const distColor = isImminent || isApproaching ? "white" : "var(--brand-amber)";

  return (
    <div
      className="nav-hud-enter"
      style={{
        position: "absolute",
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        left: 12,
        right: 72,
        zIndex: 30,
        pointerEvents: "none",
      }}
    >
      {/* ── Main maneuver card ── */}
      <div
        className="roam-glass"
        style={{
          background: bgGradient,
          borderRadius: 22,
          padding: "14px 16px",
          boxShadow: isImminent
            ? "0 8px 32px rgba(45,110,64,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)"
            : isApproaching
            ? "0 8px 32px rgba(26,111,166,0.40), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.10)"
            : "0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)",
          transition: "background 0.4s ease, box-shadow 0.4s ease",
          border: "1px solid rgba(255,255,255,0.08)",
          pointerEvents: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

          {/* ── Arrow icon in pill swatch ── */}
          <div
            className={isImminent ? "hud-imminent" : undefined}
            style={{
              flexShrink: 0,
              width: 58,
              height: 58,
              borderRadius: 16,
              background: iconBg,
              display: "grid",
              placeItems: "center",
              transition: "background 0.3s ease",
            }}
          >
            <ManeuverArrow iconName={iconName} size={40} />
          </div>

          {/* ── Instruction text ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Action label: Turn left / Continue / etc. */}
            <div
              style={{
                fontSize: 16,
                fontWeight: 950,
                color: "var(--on-color)",
                lineHeight: 1.15,
                letterSpacing: "-0.3px",
              }}
            >
              {formatShort(currentStep)}
            </div>

            {/* Road name */}
            {currentStep.name && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "rgba(250,246,239,0.65)",
                  marginTop: 3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {currentStep.ref
                  ? `${currentStep.name} · ${currentStep.ref}`
                  : currentStep.name}
              </div>
            )}
          </div>

          {/* ── Distance to maneuver — right-aligned ── */}
          <div
            style={{
              flexShrink: 0,
              textAlign: "right",
              paddingLeft: 4,
            }}
          >
            <div
              style={{
                fontSize: 26,
                fontWeight: 950,
                color: distColor,
                letterSpacing: "-0.8px",
                lineHeight: 1,
                transition: "color 0.3s ease",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatDistance(nav.distToNextManeuver_m)}
            </div>
          </div>
        </div>

        {/* ── "then" next step preview ── */}
        {nextStep && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid rgba(250,246,239,0.10)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* Small then-arrow */}
            <div
              style={{
                flexShrink: 0,
                width: 20,
                height: 20,
                borderRadius: 6,
                background: "rgba(255,255,255,0.09)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="rgba(250,246,239,0.5)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d={ARROW_SVGS[maneuverIcon(nextStep.maneuver)] ?? ARROW_SVGS["arrow-up"]} />
              </svg>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "rgba(250,246,239,0.38)",
                textTransform: "uppercase",
                letterSpacing: "0.6px",
                flexShrink: 0,
              }}
            >
              then
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(250,246,239,0.55)",
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
    </div>
  );
});
