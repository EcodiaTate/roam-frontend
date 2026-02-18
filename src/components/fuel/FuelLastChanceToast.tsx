// src/components/fuel/FuelLastChanceToast.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Fuel, X } from "lucide-react";
import { haptic } from "@/lib/native/haptics";
import type { FuelWarning, FuelTrackingState } from "@/lib/types/fuel";

/* ── Constants ────────────────────────────────────────────────────────── */

/** Show toast when within this many km of a last-chance station */
const TRIGGER_DISTANCE_KM = 5;

/** Auto-dismiss after this many ms (0 = never) */
const AUTO_DISMISS_MS = 0; // user must dismiss manually for safety

/* ── Styles ────────────────────────────────────────────────────────────── */

const toastContainer: React.CSSProperties = {
  position: "absolute",
  top: 60,
  left: 12,
  right: 12,
  zIndex: 30,
  pointerEvents: "auto",
};

const toastCard: React.CSSProperties = {
  background: "rgba(239,68,68,0.95)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "14px 16px",
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  boxShadow: "0 8px 32px rgba(239,68,68,0.35), 0 2px 8px rgba(0,0,0,0.2)",
  animation: "roam-fuel-toast-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
};

const toastIcon: React.CSSProperties = {
  flexShrink: 0,
  marginTop: 1,
  color: "#fff",
};

const toastContent: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const toastTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: "#fff",
  letterSpacing: "-0.3px",
};

const toastSub: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "rgba(255,255,255,0.85)",
  marginTop: 3,
  lineHeight: "1.3",
};

const dismissBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.15)",
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 900,
  color: "#fff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  marginTop: 8,
};

/* ── Component ────────────────────────────────────────────────────────── */

export function FuelLastChanceToast({
  tracking,
  currentKm,
}: {
  tracking: FuelTrackingState | null;
  currentKm: number;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [activeWarning, setActiveWarning] = useState<FuelWarning | null>(null);

  useEffect(() => {
    if (!tracking || !tracking.active_warning) {
      setVisible(false);
      return;
    }

    const w = tracking.active_warning;
    if (w.type !== "last_chance") {
      setVisible(false);
      return;
    }

    // Don't show if already dismissed for this station
    const stationKey = w.station?.place_id ?? `km-${Math.round(w.at_km)}`;
    if (dismissed === stationKey) {
      setVisible(false);
      return;
    }

    // Check if within trigger distance
    if (w.station && Math.abs(currentKm - w.station.km_along_route) <= TRIGGER_DISTANCE_KM) {
      setActiveWarning(w);
      setVisible(true);
      haptic.warning();
    } else {
      setVisible(false);
    }
  }, [tracking, currentKm, dismissed]);

  const handleDismiss = useCallback(() => {
    haptic.selection();
    const stationKey = activeWarning?.station?.place_id ?? `km-${Math.round(activeWarning?.at_km ?? 0)}`;
    setDismissed(stationKey);
    setVisible(false);
  }, [activeWarning]);

  if (!visible || !activeWarning) return null;

  const station = activeWarning.station;
  const gapKm = activeWarning.gap_km ?? 0;

  return (
    <div style={toastContainer}>
      <div style={toastCard}>
        <Fuel size={20} strokeWidth={2.5} style={toastIcon} />
        <div style={toastContent}>
          <div style={toastTitle}>
            LAST FUEL for {Math.round(gapKm)}km
          </div>
          {station && (
            <div style={toastSub}>
              {station.name}
              {" — "}
              {tracking && tracking.km_to_next_fuel !== null
                ? `${Math.round(Math.abs(currentKm - station.km_along_route))}km ahead`
                : "ahead"}
              {station.side !== "on_route" && `, ${station.side}`}
            </div>
          )}
          <button type="button" style={dismissBtn} onClick={handleDismiss}>
            <X size={12} strokeWidth={2.5} />
            Dismiss
          </button>
        </div>
      </div>

      <style>{`
        @keyframes roam-fuel-toast-in {
          0% { opacity: 0; transform: translateY(-20px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}