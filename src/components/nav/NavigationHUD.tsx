// src/components/nav/NavigationHUD.tsx

import { memo, useMemo } from "react";
import type { ActiveNavState } from "@/lib/nav/activeNav";
import { formatShort, formatDistance, formatInstruction, maneuverIcon } from "@/lib/nav/instructions";

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

function ManeuverArrow({ iconName, size = 44 }: { iconName: string; size?: number }) {
  const pathD = ARROW_SVGS[iconName] ?? ARROW_SVGS["arrow-up"];
  const isArrive = iconName === "arrive" || iconName === "depart";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isArrive ? "currentColor" : "none"}
      stroke={isArrive ? "none" : "currentColor"}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={pathD} />
    </svg>
  );
}

const NAV_CARD_BG = "var(--nav-card-bg, #f0e9dc)";

export const NavigationHUD = memo(function NavigationHUD({ nav, visible, simple }: Props) {
  const currentStep = nav.currentStep;
  const nextStep = nav.nextStep;
  // Memoize on maneuver type+modifier (stable strings) instead of object reference,
  // since activeNav returns a new currentStep object every GPS tick even if the step hasn't changed.
  const maneuverType = currentStep?.maneuver?.type;
  const maneuverModifier = currentStep?.maneuver?.modifier;
  const iconName = useMemo(
    () => (currentStep ? maneuverIcon(currentStep.maneuver) : "arrow-up"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maneuverType, maneuverModifier],
  );

  const isImminent  = nav.distToNextManeuver_m < 100;
  const isApproaching = nav.distToNextManeuver_m < 500;

  if (!visible || !currentStep) return null;

  const cs = simple ? 72 : 66;
  const pad = simple ? 8 : 7;

  const circleColor = isImminent
    ? "var(--brand-ochre)" : isApproaching
    ? "var(--brand-sky-dark, #145a88)" : "var(--brand-eucalypt-dark, #1f5236)";

  const distColor = isImminent
    ? "var(--brand-ochre)" : isApproaching
    ? "var(--brand-sky)" : "var(--roam-text, #1a1613)";

  const accentColor = isImminent
    ? "var(--brand-ochre)" : isApproaching
    ? "var(--brand-sky)" : "var(--brand-eucalypt)";

  const streetText = currentStep.name
    ? (currentStep.ref && !simple ? `${currentStep.name} · ${currentStep.ref}` : currentStep.name)
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
          boxShadow: "var(--shadow-medium)",
          pointerEvents: "auto",
        }}
      >
        {/* Circle - rendered as SVG background circle + arrow path in one SVG */}
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
          {/* Background circle */}
          <circle cx={cs / 2} cy={cs / 2} r={cs / 2} fill={circleColor} style={{ transition: "fill 0.4s ease" }} />
          {/* Centered arrow - scale 24→iconSize, then center in circle */}
          {(() => {
            const iconSize = simple ? 36 : 32;
            const scale = iconSize / 24;
            const offset = (cs - iconSize) / 2;
            const pathD = ARROW_SVGS[iconName] ?? ARROW_SVGS["arrow-up"];
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

        {/* Instruction + street inline */}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{
            fontSize: simple ? 18 : 15,
            fontWeight: 950,
            color: "var(--roam-text, #1a1613)",
            lineHeight: 1.2,
            letterSpacing: "-0.3px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {formatShort(currentStep)}
            {streetText && (
              <span style={{
                fontWeight: 800,
                color: accentColor,
                opacity: 0.75,
                transition: "color 0.4s ease",
              }}>
                {" "}{streetText}
              </span>
            )}
          </div>

          {/* "then" preview - inside the card */}
          {!simple && nextStep && (
            <div style={{
              marginTop: 5,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                stroke="var(--roam-text, #1a1613)" strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45, flexShrink: 0 }}>
                <path d={ARROW_SVGS[maneuverIcon(nextStep.maneuver)] ?? ARROW_SVGS["arrow-up"]} />
              </svg>
              <span style={{
                fontSize: 12, fontWeight: 800,
                color: "var(--roam-text, #1a1613)",
                opacity: 0.45,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {formatInstruction(nextStep)}
              </span>
            </div>
          )}
        </div>

        {/* Distance */}
        <div style={{
          fontSize: simple ? 32 : 26,
          fontWeight: 950,
          color: distColor,
          letterSpacing: "-1.2px",
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
