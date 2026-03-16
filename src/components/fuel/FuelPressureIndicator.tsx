// src/components/fuel/FuelPressureIndicator.tsx
"use client";

import { useMemo } from "react";
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
  padding: "6px 12px",
  borderRadius: 999,
  boxShadow: "0 4px 16px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.1)",
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
    bg: "#16a34a",
    text: "#ffffff",
    icon: "#ffffff",
    border: "none",
  },
  warn: {
    bg: "#d97706",
    text: "#ffffff",
    icon: "#ffffff",
    border: "none",
  },
  critical: {
    bg: "#ef4444",
    text: "#ffffff",
    icon: "#ffffff",
    border: "none",
  },
};

/* ── Component ────────────────────────────────────────────────────────── */

export function FuelPressureIndicator({
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
}