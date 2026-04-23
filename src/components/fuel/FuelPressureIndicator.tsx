// src/components/fuel/FuelPressureIndicator.tsx

import { memo, useMemo } from "react";
import { Fuel } from "lucide-react";
import type { FuelTrackingState } from "@/lib/types/fuel";

/* ── Styles ────────────────────────────────────────────────────────────── */

const pillBase: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(var(--roam-tab-h, 72px) + 14px)",
  left: 14,
  zIndex: 25,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px",
  borderRadius: 999,
  boxShadow: "var(--shadow-soft)",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: "-0.2px",
  transition: "background 0.3s ease, color 0.3s ease",
  pointerEvents: "none",
};

/* ── Color schemes ────────────────────────────────────────────────────── */
// Flat single-colour backgrounds (no gradient, no border, no pulse) so
// the pill reads as ambient status, not an alarm. Colour alone carries
// the level; the critical state used to also animate, which fought for
// attention with everything else on the map.

type PressureLevel = "ok" | "warn" | "critical";

function getLevel(pressure: number): PressureLevel {
  if (pressure >= 0.7) return "critical";
  if (pressure >= 0.3) return "warn";
  return "ok";
}

const LEVEL_STYLES: Record<PressureLevel, {
  bg: string;
  text: string;
  icon: string;
}> = {
  ok:       { bg: "var(--roam-success)", text: "var(--on-color)", icon: "var(--on-color)" },
  warn:     { bg: "var(--roam-warn)",    text: "var(--on-color)", icon: "var(--on-color)" },
  critical: { bg: "var(--roam-danger)",  text: "var(--on-color)", icon: "var(--on-color)" },
};

/* ── Component ────────────────────────────────────────────────────────── */

export const FuelPressureIndicator = memo(function FuelPressureIndicator({
  tracking,
}: {
  tracking: FuelTrackingState | null;
}) {
  const display = useMemo(() => {
    if (!tracking) return null;

    const level = getLevel(tracking.fuel_pressure);
    const style = LEVEL_STYLES[level];

    const label =
      tracking.km_to_next_fuel !== null
        ? `Fuel ${Math.round(tracking.km_to_next_fuel)} km`
        : "No fuel ahead";

    return { style, label };
  }, [tracking]);

  if (!display) return null;

  const { style, label } = display;

  return (
    <div
      className="trip-fuel-pressure"
      style={{
        ...pillBase,
        background: style.bg,
        color: style.text,
      }}
    >
      <Fuel size={13} strokeWidth={2.5} style={{ color: style.icon }} />
      <span>{label}</span>
    </div>
  );
});