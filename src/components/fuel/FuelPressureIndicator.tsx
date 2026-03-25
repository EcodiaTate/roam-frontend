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
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)",
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: "-0.2px",
  transition: "all 0.3s ease",
  pointerEvents: "none",
};

/* ── Color schemes ────────────────────────────────────────────────────── */

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
  border: string;
}> = {
  ok: {
    bg: "linear-gradient(160deg, rgba(45,110,64,0.95) 0%, rgba(31,82,54,0.98) 100%)",
    text: "var(--on-color)",
    icon: "var(--on-color)",
    border: "1px solid rgba(45,110,64,0.35)",
  },
  warn: {
    bg: "linear-gradient(160deg, rgba(184,135,42,0.95) 0%, rgba(148,107,30,0.98) 100%)",
    text: "var(--on-color)",
    icon: "var(--on-color)",
    border: "1px solid rgba(184,135,42,0.35)",
  },
  critical: {
    bg: "linear-gradient(160deg, rgba(181,69,46,0.95) 0%, rgba(145,50,30,0.98) 100%)",
    text: "var(--on-color)",
    icon: "var(--on-color)",
    border: "1px solid rgba(181,69,46,0.35)",
  },
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

    let label: string;
    if (tracking.km_to_next_fuel !== null) {
      const km = Math.round(tracking.km_to_next_fuel);
      if (level === "critical") {
        label = `FUEL ${km}km`;
      } else {
        label = `Next fuel ${km}km`;
      }
    } else {
      label = "No fuel ahead";
    }

    return { level, style, label };
  }, [tracking]);

  if (!display) return null;

  const { level, style, label } = display;

  return (
    <div
      style={{
        ...pillBase,
        background: style.bg,
        color: style.text,
        border: style.border,
        // Pulse animation for critical
        animation: level === "critical" ? "roam-fuel-pulse 1.5s ease-in-out infinite" : undefined,
      }}
    >
      <Fuel
        size={level === "critical" ? 15 : 13}
        strokeWidth={2.5}
        style={{ color: style.icon }}
      />
      <span>{label}</span>

    </div>
  );
});