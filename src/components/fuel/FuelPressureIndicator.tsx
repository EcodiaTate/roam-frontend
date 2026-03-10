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
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
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
    bg: "rgba(22,163,74,0.15)",
    text: "#16a34a",
    icon: "#22c55e",
    border: "1px solid rgba(22,163,74,0.25)",
  },
  warn: {
    bg: "rgba(245,158,11,0.18)",
    text: "#d97706",
    icon: "#f59e0b",
    border: "1px solid rgba(245,158,11,0.3)",
  },
  critical: {
    bg: "rgba(239,68,68,0.2)",
    text: "#ef4444",
    icon: "#ef4444",
    border: "1px solid rgba(239,68,68,0.35)",
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

      {/* Inline keyframes for pulse animation */}
      {level === "critical" && (
        <style>{`
          @keyframes roam-fuel-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.85; transform: scale(1.03); }
          }
        `}</style>
      )}
    </div>
  );
}