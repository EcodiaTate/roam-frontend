// src/components/nav/NavigationBar.tsx
"use client";

import type { ActiveNavState } from "@/lib/nav/activeNav";
import type { FuelTrackingState } from "@/lib/types/fuel";
import { formatDistance, formatDuration, formatETA } from "@/lib/nav/instructions";
import { formatDriveSinceRest, fatigueColor } from "@/lib/nav/fatigue";
import { Fuel, Clock, MapPin, Navigation } from "lucide-react";

type Props = {
  nav: ActiveNavState;
  fuelTracking?: FuelTrackingState | null;
  visible: boolean;
  onTap?: () => void;
};

export function NavigationBar({ nav, fuelTracking, visible, onTap }: Props) {
  if (!visible) return null;

  const eta = nav.etaTimestamp > 0 ? formatETA(nav.etaTimestamp) : "--:--";
  const distRemaining = formatDistance(nav.distRemaining_m);
  const timeRemaining = formatDuration(nav.durationRemaining_s);
  const fatigue = nav.fatigue;
  const fColor = fatigueColor(fatigue.warningLevel);

  // Fuel: distance to next station or range info
  const fuelText = fuelTracking
    ? fuelTracking.km_to_next_fuel !== null
      ? `${Math.round(fuelTracking.km_to_next_fuel)} km`
      : "--"
    : null;

    const fuelUrgent = !!fuelTracking?.is_critical;
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + var(--roam-tab-h, 64px) + 8px)",
        left: 12,
        right: 12,
        zIndex: 30,
        pointerEvents: "auto",
        transform: visible ? "translateY(0)" : "translateY(150%)",
        transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}
      onClick={onTap}
    >
      <div
        style={{
          background: "linear-gradient(135deg, rgba(30,30,30,0.94), rgba(20,20,20,0.97))",
          borderRadius: 18,
          padding: "14px 18px",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        {/* Top row: ETA + distance + time */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          {/* ETA — prominent */}
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 950,
                color: "white",
                letterSpacing: "-0.5px",
                lineHeight: 1,
              }}
            >
              {eta}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginTop: 2,
              }}
            >
              ETA
            </div>
          </div>

          {/* Distance remaining */}
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={13} color="rgba(255,255,255,0.5)" />
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: "rgba(255,255,255,0.85)",
                  letterSpacing: "-0.3px",
                }}
              >
                {distRemaining}
              </span>
            </div>
          </div>

          {/* Time remaining */}
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={13} color="rgba(255,255,255,0.5)" />
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: "rgba(255,255,255,0.85)",
                  letterSpacing: "-0.3px",
                }}
              >
                {timeRemaining}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom row: fuel + fatigue indicators */}
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          {/* Fuel indicator */}
          {fuelText && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Fuel
                size={14}
                color={fuelUrgent ? "#ef4444" : "#d97706"}
                style={fuelUrgent ? { animation: "fuel-blink 1s ease-in-out infinite" } : undefined}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 850,
                  color: fuelUrgent ? "#ef4444" : "rgba(255,255,255,0.65)",
                  letterSpacing: "-0.2px",
                }}
              >
                {fuelUrgent ? "Fuel!" : ""} {fuelText}
              </span>
            </div>
          )}

          {/* Fatigue indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Navigation
              size={13}
              color={fColor}
              style={{
                opacity: fatigue.warningLevel === "none" ? 0.5 : 1,
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 850,
                color: fColor,
                letterSpacing: "-0.2px",
              }}
            >
              {formatDriveSinceRest(fatigue)}
            </span>
          </div>

          {/* Speed (if available) */}
          {nav.speed_mps != null && nav.speed_mps > 0.5 && (
            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: "rgba(255,255,255,0.6)",
                letterSpacing: "-0.2px",
              }}
            >
              {Math.round(nav.speed_mps * 3.6)} km/h
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fuel-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}