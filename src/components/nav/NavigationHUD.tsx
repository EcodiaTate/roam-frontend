// src/components/nav/NavigationHUD.tsx

import { memo, useMemo } from "react";
import type { ActiveNavState } from "@/lib/nav/activeNav";
import { formatShort, formatDistance, maneuverIcon } from "@/lib/nav/instructions";

type Props = {
  nav: ActiveNavState;
  visible: boolean;
  simple?: boolean;
};

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

// Dark, high-contrast background: readable in direct sunlight on day and night themes.
const NAV_CARD_BG = "rgba(18, 14, 10, 0.93)";

export const NavigationHUD = memo(function NavigationHUD({ nav, visible, simple }: Props) {
  const currentStep = nav.currentStep;  // step currently being traversed (road name source)
  const nextStep    = nav.nextStep;     // upcoming maneuver point

  // Bug 1 fix: the HUD must show the UPCOMING maneuver instruction (nextStep), not
  // the already-executed one (currentStep). Each step's maneuver point is at its START,
  // so currentStep's maneuver is already behind the driver. nextStep's maneuver is what
  // the driver needs to do next. Falls back to currentStep only on the final arrival
  // segment when nextStep is null.
  const displayStep = nextStep ?? currentStep;

  const maneuverType     = displayStep?.maneuver?.type;
  const maneuverModifier = displayStep?.maneuver?.modifier;
  const iconName = useMemo(
    () => (displayStep ? maneuverIcon(displayStep.maneuver) : "arrow-up"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maneuverType, maneuverModifier],
  );

  const isImminent    = nav.distToNextManeuver_m < 100;
  const isApproaching = nav.distToNextManeuver_m < 500;

  if (!visible || !displayStep) return null;

  const cs  = simple ? 72 : 66;
  const pad = simple ? 8  : 7;

  const circleColor = isImminent
    ? "var(--brand-ochre)"
    : isApproaching
    ? "var(--brand-sky-dark, #145a88)"
    : "var(--brand-eucalypt-dark, #1f5236)";

  // Distance text colour: state-coded on dark background.
  const distColor = isImminent
    ? "var(--brand-ochre)"
    : isApproaching
    ? "#4DB8F0"
    : "#f0ece6";

  // Current road name - the street the driver is on right now.
  const streetText = currentStep?.name
    ? (currentStep.ref && !simple
        ? `${currentStep.name} · ${currentStep.ref}`
        : currentStep.name)
    : null;

  return (
    <div className="roam-nav-hud" style={{
      position: "absolute",
      top: "calc(env(safe-area-inset-top, 0px) + 28px)",
      left: 12,
      right: 12,
      zIndex: 30,
      pointerEvents: "none",
    }}>
      <div
        className="nav-hud-unroll"
        style={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ["--nav-circle-clip" as any]: `calc(100% - ${cs + pad * 2}px)`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          height: cs + pad * 2,
          padding: `${pad}px 20px ${pad}px ${pad}px`,
          borderRadius: (cs + pad * 2) / 2,
          background: NAV_CARD_BG,
          boxShadow: "0 4px 24px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.3)",
          pointerEvents: "auto",
        }}
      >
        {/* Maneuver icon circle - coloured by urgency state */}
        <svg
          className={isImminent ? "hud-imminent" : undefined}
          width={cs}
          height={cs}
          viewBox={`0 0 ${cs} ${cs}`}
          style={{
            flexShrink: 0,
            display: "block",
            width: cs,
            height: cs,
            maxWidth: "none",
            maxHeight: "none",
            transition: "filter 0.4s ease",
            overflow: "visible",
          }}
        >
          <circle cx={cs / 2} cy={cs / 2} r={cs / 2} fill={circleColor} style={{ transition: "fill 0.4s ease" }} />
          {(() => {
            const iconSize = simple ? 36 : 32;
            const scale    = iconSize / 24;
            const offset   = (cs - iconSize) / 2;
            const pathD    = ARROW_SVGS[iconName] ?? ARROW_SVGS["arrow-up"];
            const isArrive = iconName === "arrive" || iconName === "depart";
            return (
              <g transform={`translate(${offset}, ${offset}) scale(${scale})`}>
                <path
                  d={pathD}
                  fill={isArrive ? "var(--on-color, #faf6ef)" : "none"}
                  stroke={isArrive ? "none" : "var(--on-color, #faf6ef)"}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })()}
        </svg>

        {/* Primary direction word + current road name (demoted secondary) */}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {/* Direction verb - what to do at the upcoming maneuver. Large, bright. */}
          <div style={{
            fontSize: simple ? 24 : 20,
            fontWeight: 950,
            color: "#f0ece6",
            lineHeight: 1.15,
            letterSpacing: "-0.3px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {formatShort(displayStep)}
          </div>

          {/* Current road - smaller, muted. Tells driver what street they're on now. */}
          {streetText && (
            <div style={{
              marginTop: 3,
              fontSize: simple ? 13 : 12,
              fontWeight: 700,
              color: "rgba(240, 236, 230, 0.55)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {streetText}
            </div>
          )}
        </div>

        {/* Distance to next maneuver - very large, tabular nums */}
        <div style={{
          fontSize: simple ? 40 : 34,
          fontWeight: 950,
          color: distColor,
          letterSpacing: "-1.5px",
          lineHeight: 1,
          transition: "color 0.3s ease",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}>
          {formatDistance(nav.distToNextManeuver_m)}
        </div>
      </div>
    </div>
  );
});
