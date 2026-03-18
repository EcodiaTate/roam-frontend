// src/components/nav/NavigationBar.tsx
"use client";

import { memo } from "react";
import type { ActiveNavState } from "@/lib/nav/activeNav";
import type { FuelTrackingState } from "@/lib/types/fuel";
import { formatDistance, formatDuration, formatETA } from "@/lib/nav/instructions";
import { formatDriveSinceRest, fatigueColor } from "@/lib/nav/fatigue";
import { haptic } from "@/lib/native/haptics";
import { Fuel, Clock, MapPin, Navigation, Flag } from "lucide-react";

type Props = {
  nav: ActiveNavState;
  fuelTracking?: FuelTrackingState | null;
  visible: boolean;
  /** Simple mode — ETA + distance only, no speed/leg/fatigue detail */
  simple?: boolean;
  onTap?: () => void;
};

/* ── Component ───────────────────────────────────────────────────────── */

export const NavigationBar = memo(function NavigationBar({ nav, fuelTracking, visible, simple, onTap }: Props) {
  if (!visible) return null;

  const isMultiLeg = nav.totalLegs > 1;

  // Primary: show leg-level metrics when multi-leg, trip-level when single-leg
  const primaryEta = isMultiLeg
    ? (nav.legEtaTimestamp > 0 ? formatETA(nav.legEtaTimestamp) : "--:--")
    : (nav.etaTimestamp > 0 ? formatETA(nav.etaTimestamp) : "--:--");
  const primaryDist = isMultiLeg
    ? formatDistance(nav.legDistRemaining_m)
    : formatDistance(nav.distRemaining_m);
  const primaryTime = isMultiLeg
    ? formatDuration(nav.legDurationRemaining_s)
    : formatDuration(nav.durationRemaining_s);
  const primaryLabel = isMultiLeg && nav.nextStopName
    ? nav.nextStopName
    : "ETA";

  // Secondary: show trip total when multi-leg
  const tripEta = nav.etaTimestamp > 0 ? formatETA(nav.etaTimestamp) : "--:--";
  const tripDist = formatDistance(nav.distRemaining_m);
  const tripTime = formatDuration(nav.durationRemaining_s);

  const fatigue = nav.fatigue;
  const fColor = fatigueColor(fatigue.warningLevel);

  const fuelText = fuelTracking
    ? fuelTracking.km_to_next_fuel !== null
      ? `${Math.round(fuelTracking.km_to_next_fuel)} km`
      : "--"
    : null;
  const fuelUrgent = !!fuelTracking?.is_critical;

  // Fatigue level determines accent on drive-time indicator
  const fatigueUrgent = fatigue.warningLevel === "recommended" || fatigue.warningLevel === "urgent";

  return (
    <div
      className="nav-bar-enter"
      style={{
        position: "absolute",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--roam-tab-h, 64px) + 8px)",
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
        className="roam-glass"
        style={{
          background: "linear-gradient(160deg, rgba(20,16,12,0.97) 0%, rgba(12,9,7,0.99) 100%)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 -2px 0 rgba(255,255,255,0.04), 0 12px 40px rgba(0,0,0,0.40), 0 3px 10px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {/* ── Top accent line (eucalypt green) ── */}
        <div
          style={{
            height: 3,
            background: "linear-gradient(90deg, var(--brand-eucalypt) 0%, var(--brand-sky) 60%, transparent 100%)",
            opacity: 0.8,
          }}
        />

        <div style={{ padding: "14px 18px 14px" }}>
          {/* ── Main stats row (next stop or destination) ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>

            {/* ETA – left, most prominent */}
            <div style={{ flex: "0 0 auto", marginRight: 20 }}>
              <div
                style={{
                  fontSize: simple ? 38 : 30,
                  fontWeight: 950,
                  color: "var(--on-color)",
                  letterSpacing: "-1px",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
                aria-label={`Estimated arrival ${primaryEta}`}
              >
                {primaryEta}
              </div>
              <div
                style={{
                  fontSize: simple ? 13 : 10,
                  fontWeight: 800,
                  color: isMultiLeg ? "var(--brand-eucalypt)" : "var(--brand-amber)",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                  marginTop: 3,
                  maxWidth: simple ? 120 : 80,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {primaryLabel}
              </div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: simple ? 44 : 36, background: "rgba(255,255,255,0.08)", marginRight: 20, flexShrink: 0 }} />

            {/* Distance + Time — right of divider */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: simple ? 8 : 6 }}>
              {/* Distance remaining (to next stop) */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <MapPin size={simple ? 15 : 12} color="var(--brand-sky)" aria-hidden="true" />
                <span
                  style={{
                    fontSize: simple ? 20 : 15,
                    fontWeight: 900,
                    color: "rgba(250,246,239,0.88)",
                    letterSpacing: "-0.3px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                  aria-label={`${primaryDist} remaining`}
                >
                  {primaryDist}
                </span>
              </div>

              {/* Time remaining (to next stop) */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Clock size={simple ? 15 : 12} color="rgba(250,246,239,0.4)" aria-hidden="true" />
                <span
                  style={{
                    fontSize: simple ? 17 : 13,
                    fontWeight: 800,
                    color: "rgba(250,246,239,0.55)",
                    letterSpacing: "-0.2px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                  aria-label={`${primaryTime} drive time remaining`}
                >
                  {primaryTime}
                </span>
              </div>
            </div>

            {/* Speed badge — far right — hidden in simple mode */}
            {!simple && nav.speed_mps != null && nav.speed_mps > 0.5 && (
              <div
                className="nav-speed-enter"
                style={{
                  flexShrink: 0,
                  marginLeft: 12,
                  background: "rgba(255,255,255,0.07)",
                  borderRadius: 12,
                  padding: "6px 10px",
                  textAlign: "center",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
                aria-label={`Current speed ${Math.round(nav.speed_mps * 3.6)} kilometres per hour`}
              >
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 950,
                    color: "var(--on-color)",
                    letterSpacing: "-0.5px",
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(nav.speed_mps * 3.6)}
                </div>
                <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(250,246,239,0.40)", textTransform: "uppercase", letterSpacing: "0.4px", marginTop: 2 }}>
                  km/h
                </div>
              </div>
            )}
          </div>

          {/* ── Trip total row (only shown for multi-leg trips) — hidden in simple mode ── */}
          {!simple && isMultiLeg && (
            <div
              style={{
                marginTop: 10,
                paddingTop: 8,
                borderTop: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Flag size={10} color="rgba(250,246,239,0.35)" aria-hidden="true" />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "rgba(250,246,239,0.40)",
                  letterSpacing: "-0.1px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                Total
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "rgba(250,246,239,0.35)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {tripDist}
              </span>
              <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>·</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "rgba(250,246,239,0.35)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {tripTime}
              </span>
              <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>·</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "rgba(250,246,239,0.35)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {tripEta}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "rgba(250,246,239,0.25)",
                  marginLeft: "auto",
                }}
              >
                Leg {nav.currentLegIdx + 1}/{nav.totalLegs}
              </span>
            </div>
          )}

          {/* ── Indicator pills row (fuel + fatigue) ── */}
          {/* Simple mode: only show critical fuel warning as a single colour bar */}
          {simple ? (
            fuelUrgent && fuelText ? (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flex: 1,
                    background: "rgba(212,102,74,0.20)",
                    borderRadius: 12,
                    padding: "8px 14px",
                    border: "1px solid rgba(212,102,74,0.35)",
                  }}
                  aria-label={`Fuel critical: ${fuelText} to next station`}
                >
                  <Fuel
                    size={14}
                    color="var(--brand-ochre)"
                    className="nav-fuel-blink"
                    aria-hidden="true"
                  />
                  <span style={{ fontSize: 14, fontWeight: 900, color: "var(--brand-ochre)" }}>
                    Low fuel — {fuelText}
                  </span>
                </div>
              </div>
            ) : null
          ) : (
            (fuelText || fatigue.warningLevel !== "none") && (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {/* Fuel pill */}
                {fuelText && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      background: fuelUrgent ? "rgba(212,102,74,0.16)" : "rgba(184,135,42,0.12)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      border: `1px solid ${fuelUrgent ? "rgba(212,102,74,0.3)" : "rgba(184,135,42,0.2)"}`,
                    }}
                    aria-label={fuelUrgent ? `Fuel critical: ${fuelText} to next station` : `${fuelText} to next fuel`}
                  >
                    <Fuel
                      size={11}
                      color={fuelUrgent ? "var(--brand-ochre)" : "var(--brand-amber)"}
                      className={fuelUrgent ? "nav-fuel-blink" : undefined}
                      aria-hidden="true"
                    />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 850,
                        color: fuelUrgent ? "var(--brand-ochre)" : "var(--brand-amber)",
                        letterSpacing: "-0.1px",
                      }}
                    >
                      {fuelUrgent ? "Fuel! " : ""}{fuelText}
                    </span>
                  </div>
                )}

                {/* Fatigue pill — only shown when warning */}
                {fatigue.warningLevel !== "none" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      background: fatigueUrgent ? "rgba(184,135,42,0.14)" : "rgba(255,255,255,0.06)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      border: `1px solid ${fatigueUrgent ? "rgba(184,135,42,0.25)" : "rgba(255,255,255,0.09)"}`,
                    }}
                    aria-label={`Drive time: ${formatDriveSinceRest(fatigue)}`}
                  >
                    <Navigation
                      size={11}
                      color={fColor}
                      aria-hidden="true"
                    />
                    <span style={{ fontSize: 11, fontWeight: 850, color: fColor, letterSpacing: "-0.1px" }}>
                      {formatDriveSinceRest(fatigue)}
                    </span>
                  </div>
                )}

                {/* Drive time — always shown (subtle) */}
                {fatigue.warningLevel === "none" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                    }}
                    aria-label={`Drive time: ${formatDriveSinceRest(fatigue)}`}
                  >
                    <Navigation size={11} color="rgba(250,246,239,0.3)" aria-hidden="true" />
                    <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(250,246,239,0.35)", letterSpacing: "-0.1px" }}>
                      {formatDriveSinceRest(fatigue)}
                    </span>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
});
