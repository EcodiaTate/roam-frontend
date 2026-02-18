// src/components/fuel/VehicleFuelSettings.tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import { X, Fuel, Zap, Flame, PlugZap } from "lucide-react";
import { haptic } from "@/lib/native/haptics";
import { getVehicleFuelProfile, setVehicleFuelProfile } from "@/lib/offline/fuelProfileStore";
import { DEFAULT_FUEL_PROFILE, type VehicleFuelProfile, type FuelType } from "@/lib/types/fuel";

/* ── Styles ────────────────────────────────────────────────────────────── */

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  background: "rgba(0,0,0,0.5)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  display: "grid",
  placeItems: "center",
  padding: 20,
};

const panel: React.CSSProperties = {
  width: "100%",
  maxWidth: 380,
  maxHeight: "80vh",
  overflowY: "auto",
  background: "var(--roam-surface)",
  borderRadius: 20,
  padding: "20px 20px 24px",
  boxShadow: "0 16px 64px rgba(0,0,0,0.25)",
  animation: "roam-fuel-settings-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 20,
};

const titleText: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 950,
  color: "var(--roam-text)",
  letterSpacing: "-0.3px",
};

const closeBtn: React.CSSProperties = {
  background: "var(--roam-surface-hover)",
  border: "none",
  borderRadius: 999,
  width: 36,
  height: 36,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  color: "var(--roam-text-muted)",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "var(--roam-text-muted)",
  marginBottom: 8,
  marginTop: 18,
  letterSpacing: "0.3px",
  textTransform: "uppercase" as const,
};

const segmentRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap" as const,
};

const segmentBtn = (active: boolean): React.CSSProperties => ({
  flex: 1,
  minWidth: 70,
  padding: "10px 12px",
  borderRadius: 12,
  border: active ? "2px solid var(--roam-accent)" : "2px solid transparent",
  background: active ? "rgba(59,130,246,0.1)" : "var(--roam-surface-hover)",
  color: active ? "var(--roam-accent)" : "var(--roam-text-muted)",
  fontWeight: 900,
  fontSize: 12,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  gap: 4,
  transition: "all 0.15s ease",
});

const sliderGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
};

const sliderLabel: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 13,
  fontWeight: 800,
  color: "var(--roam-text)",
};

const sliderValue: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "var(--roam-accent)",
};

const sliderInput: React.CSSProperties = {
  width: "100%",
  accentColor: "var(--roam-accent, #3b82f6)",
  height: 6,
};

const saveButton: React.CSSProperties = {
  width: "100%",
  marginTop: 24,
  padding: "12px 20px",
  borderRadius: 12,
  background: "var(--roam-accent)",
  color: "#fff",
  border: "none",
  fontWeight: 950,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "var(--shadow-button)",
};

/* ── Fuel type configs ────────────────────────────────────────────────── */

const FUEL_TYPES: Array<{ type: FuelType; label: string; icon: React.ReactNode }> = [
  { type: "unleaded", label: "Unleaded", icon: <Fuel size={16} strokeWidth={2.5} /> },
  { type: "diesel", label: "Diesel", icon: <Flame size={16} strokeWidth={2.5} /> },
  { type: "lpg", label: "LPG", icon: <Zap size={16} strokeWidth={2.5} /> },
  { type: "ev", label: "EV", icon: <PlugZap size={16} strokeWidth={2.5} /> },
];

/* ── Component ────────────────────────────────────────────────────────── */

export function VehicleFuelSettings({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (profile: VehicleFuelProfile) => void;
}) {
  const [profile, setProfile] = useState<VehicleFuelProfile>({ ...DEFAULT_FUEL_PROFILE });
  const [loaded, setLoaded] = useState(false);

  // Load current profile from IDB on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getVehicleFuelProfile().then((p) => {
      if (!cancelled) { setProfile(p); setLoaded(true); }
    });
    return () => { cancelled = true; };
  }, [open]);

  const updateField = useCallback(<K extends keyof VehicleFuelProfile>(
    key: K,
    value: VehicleFuelProfile[K],
  ) => {
    haptic.selection();
    setProfile((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    haptic.medium();
    try {
      await setVehicleFuelProfile(profile);
      onSaved?.(profile);
      onClose();
      haptic.success();
    } catch (e) {
      console.error("[FuelSettings] save failed:", e);
      haptic.error();
    }
  }, [profile, onSaved, onClose]);

  if (!open) return null;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerRow}>
          <div style={titleText}>Vehicle Fuel Settings</div>
          <button type="button" style={closeBtn} onClick={onClose}>
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Fuel type */}
        <div style={sectionLabel}>Fuel Type</div>
        <div style={segmentRow}>
          {FUEL_TYPES.map(({ type, label, icon }) => (
            <button
              key={type}
              type="button"
              style={segmentBtn(profile.fuel_type === type)}
              onClick={() => updateField("fuel_type", type)}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Tank range */}
        <div style={sectionLabel}>Tank Range</div>
        <div style={sliderGroup}>
          <div style={sliderLabel}>
            <span>Full tank range</span>
            <span style={sliderValue}>{profile.tank_range_km} km</span>
          </div>
          <input
            type="range"
            min={100}
            max={1500}
            step={10}
            value={profile.tank_range_km}
            onChange={(e) => updateField("tank_range_km", Number(e.target.value))}
            style={sliderInput}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, color: "var(--roam-text-muted)" }}>
            <span>100 km</span>
            <span>1500 km</span>
          </div>
        </div>

        {/* Reserve warning */}
        <div style={sectionLabel}>Reserve Warning</div>
        <div style={sliderGroup}>
          <div style={sliderLabel}>
            <span>Warning threshold</span>
            <span style={sliderValue}>{profile.reserve_warn_km} km</span>
          </div>
          <input
            type="range"
            min={30}
            max={Math.min(300, profile.tank_range_km - 20)}
            step={5}
            value={Math.min(profile.reserve_warn_km, profile.tank_range_km - 20)}
            onChange={(e) => updateField("reserve_warn_km", Number(e.target.value))}
            style={sliderInput}
          />
        </div>

        <div style={{ ...sliderGroup, marginTop: 10 }}>
          <div style={sliderLabel}>
            <span>Critical threshold</span>
            <span style={{ ...sliderValue, color: "#ef4444" }}>{profile.reserve_critical_km} km</span>
          </div>
          <input
            type="range"
            min={10}
            max={Math.min(200, profile.reserve_warn_km - 10)}
            step={5}
            value={Math.min(profile.reserve_critical_km, profile.reserve_warn_km - 10)}
            onChange={(e) => updateField("reserve_critical_km", Number(e.target.value))}
            style={sliderInput}
          />
        </div>

        {/* Summary */}
        <div style={{
          marginTop: 18,
          padding: "10px 14px",
          borderRadius: 12,
          background: "var(--roam-surface-hover)",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--roam-text-muted)",
          lineHeight: "1.5",
        }}>
          Roam will warn at {profile.reserve_warn_km}km remaining range and alert critically at{" "}
          {profile.reserve_critical_km}km. Fuel gaps longer than {profile.tank_range_km}km will be
          flagged as impassable.
        </div>

        {/* Save */}
        <button type="button" style={saveButton} onClick={handleSave}>
          Save Settings
        </button>
      </div>

      <style>{`
        @keyframes roam-fuel-settings-in {
          0% { opacity: 0; transform: scale(0.95) translateY(10px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}