// src/components/nav/NavigationBar.tsx

import { memo } from "react";
import type { ActiveNavState } from "@/lib/nav/activeNav";
import type { FuelTrackingState } from "@/lib/types/fuel";
import { formatDistance, formatETA } from "@/lib/nav/instructions";
import { haptic } from "@/lib/native/haptics";
import { Fuel } from "lucide-react";

type Props = {
  nav: ActiveNavState;
  fuelTracking?: FuelTrackingState | null;
  visible: boolean;
  simple?: boolean;
  onTap?: () => void;
  onFuelStopTap?: () => void;
};

const BAR_BG = "#242220";

/** Split "2:45 PM" → { time: "2:45", ampm: "PM" } */
function splitEta(eta: string): { time: string; ampm: string } {
  const parts = eta.split(" ");
  if (parts.length === 2) return { time: parts[0], ampm: parts[1] };
  return { time: eta, ampm: "" };
}

/** Compact duration: "2h 15m", "45m", "< 1m" */
function compactDuration(seconds: number): string {
  if (seconds < 60) return "< 1m";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `${hrs}h`;
  return `${hrs}h ${rem}m`;
}

export const NavigationBar = memo(function NavigationBar({ nav, fuelTracking, visible, simple, onTap, onFuelStopTap }: Props) {
  if (!visible) return null;

  const isMultiLeg = nav.totalLegs > 1;
  const primaryEta = isMultiLeg
    ? (nav.legEtaTimestamp > 0 ? formatETA(nav.legEtaTimestamp) : "--:--")
    : (nav.etaTimestamp > 0 ? formatETA(nav.etaTimestamp) : "--:--");
  const primaryDist = isMultiLeg
    ? formatDistance(nav.legDistRemaining_m)
    : formatDistance(nav.distRemaining_m);
  const primaryDur = isMultiLeg
    ? compactDuration(nav.legDurationRemaining_s)
    : compactDuration(nav.durationRemaining_s);

  const fuelText = fuelTracking
    ? fuelTracking.km_to_next_fuel !== null
      ? `${Math.round(fuelTracking.km_to_next_fuel)} km`
      : "--"
    : null;
  const fuelUrgent = !!fuelTracking?.is_critical;

  const cs = simple ? 72 : 66;
  const pad = simple ? 8 : 7;
  const h = cs + pad * 2;
  const speedKmh = nav.speed_mps != null && nav.speed_mps > 0.5
    ? Math.round(nav.speed_mps * 3.6) : null;

  const { time: etaTime, ampm: etaAmpm } = splitEta(primaryEta);

  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--roam-tab-h, 64px) + 18px)",
        left: 12,
        right: 12,
        zIndex: 30,
        pointerEvents: "auto",
      }}
      onClick={() => { haptic.light(); onTap?.(); }}
      role="status"
      aria-label="Navigation summary"
    >
      <div
        className="nav-bar-unroll"
        style={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ["--nav-circle-clip" as any]: `calc(100% - ${h}px)`,
          display: "flex",
          alignItems: "center",
          height: h,
          paddingLeft: 20,
          paddingRight: pad,
          borderRadius: h / 2,
          background: BAR_BG,
          boxShadow: "0 4px 24px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.12)",
        }}
      >
        {/* Left content */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          minWidth: 0,
        }}>
          {/* Distance + divider + time - grouped left */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: simple ? 12 : 10,
            marginLeft: simple ? 16 : 14,
          }}>
            <span style={{
              fontSize: simple ? 22 : 18,
              fontWeight: 950,
              letterSpacing: "-0.6px",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              color: "#faf6ef",
              flexShrink: 0,
            }}>
              {primaryDist}
            </span>

            {/* Vertical divider */}
            <div style={{
              width: 1.5,
              height: simple ? 20 : 16,
              borderRadius: 1,
              background: "rgba(250,246,239,0.15)",
              flexShrink: 0,
            }} />

            <span style={{
              fontSize: simple ? 22 : 18,
              fontWeight: 950,
              letterSpacing: "-0.6px",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              color: "rgba(250,246,239,0.5)",
              flexShrink: 0,
            }}>
              {primaryDur}
            </span>
          </div>

          {/* Spacer pushes fuel button to the right */}
          <div style={{ flex: 1 }} />

          {/* Fuel - tappable pill to detour to nearest servo */}
          {fuelText && (
            <button
              type="button"
              aria-label="Detour to nearest fuel station"
              onClick={(e) => {
                e.stopPropagation();
                haptic.medium();
                onFuelStopTap?.();
              }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, marginRight: 28,
                background: fuelUrgent
                  ? "rgba(181,69,46,0.25)"
                  : "rgba(250,246,239,0.08)",
                border: `1.5px solid ${fuelUrgent ? "rgba(181,69,46,0.4)" : "rgba(250,246,239,0.12)"}`,
                padding: simple ? "6px 12px" : "5px 10px",
                borderRadius: 999,
                cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
                boxShadow: fuelUrgent
                  ? "0 0 8px 1px rgba(181,69,46,0.35), inset 0 0 6px rgba(181,69,46,0.15)"
                  : "0 0 4px 1px rgba(250,246,239,0.38), inset 0 0 2px rgba(250,246,239,0.18)",
              }}
            >
              <Fuel size={simple ? 14 : 12} color={fuelUrgent ? "var(--brand-ochre)" : "rgba(250,246,239,0.45)"} className={fuelUrgent ? "nav-fuel-blink" : undefined} />
              <span style={{
                fontSize: simple ? 14 : 12,
                fontWeight: 800,
                color: fuelUrgent ? "var(--brand-ochre)" : "rgba(250,246,239,0.5)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "0.2px",
                whiteSpace: "nowrap",
              }}>
                {simple ? "Next servo" : fuelText}
              </span>
            </button>
          )}
        </div>

        {/* Circle - ETA stacked: label / time / ampm */}
        <div style={{
          flexShrink: 0,
          width: cs,
          height: cs,
          borderRadius: "50%",
          background: "var(--brand-eucalypt-dark, #1f5236)",
          display: "grid",
          placeItems: "center",
          color: "var(--on-color, #faf6ef)",
        }}>
          <div style={{ textAlign: "center" }}>
            {speedKmh ? (
              <>
                <div style={{
                  fontSize: 7, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: "0.5px",
                  opacity: 0.6,
                }}>speed</div>
                <div style={{
                  fontSize: simple ? 24 : 21, fontWeight: 950, lineHeight: 1,
                  letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums",
                  marginTop: 1,
                }}>{speedKmh}</div>
                <div style={{
                  fontSize: 7, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: "0.3px",
                  opacity: 0.6, marginTop: 1,
                }}>km/h</div>
              </>
            ) : (
              <>
                <div style={{
                  fontSize: 7, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: "0.5px",
                  opacity: 0.6,
                }}>ETA</div>
                <div style={{
                  fontSize: simple ? 22 : 19, fontWeight: 950, lineHeight: 1,
                  letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums",
                  marginTop: 1,
                }}>{etaTime}</div>
                {etaAmpm && (
                  <div style={{
                    fontSize: 8, fontWeight: 800,
                    textTransform: "uppercase", letterSpacing: "0.3px",
                    opacity: 0.6, marginTop: 1,
                  }}>{etaAmpm}</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
