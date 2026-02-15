// src/components/new/StopRow.tsx
"use client";

import { useState } from "react";
import type { TripStop } from "@/lib/types/trip";
import { haptic } from "@/lib/native/haptics";
import { getCurrentPosition } from "@/lib/native/geolocation";

function badgeForType(type?: string) {
  switch (type) {
    case "start": return "Start";
    case "end": return "End";
    case "via": return "Via";
    default: return "Stop";
  }
}

export function StopRow(props: {
  stop: TripStop;
  idx: number;
  count: number;
  onEdit: (patch: Partial<Pick<TripStop, "name" | "lat" | "lng">>) => void;
  onSearch: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUseMyLocation?: () => void;
}) {
  const s = props.stop;
  const [locating, setLocating] = useState(false);

  const canMoveUp = props.idx > 0 && s.type !== "start" && s.type !== "end";
  const canMoveDown = props.idx < props.count - 1 && s.type !== "start" && s.type !== "end";
  const canRemove = s.type !== "start" && s.type !== "end";
  const isLocked = s.type === "start" || s.type === "end";

  const handleUseMyLocation = async () => {
    if (props.onUseMyLocation) {
      // Parent provides its own handler (legacy compat)
      haptic.tap();
      props.onUseMyLocation();
      return;
    }

    // Native geolocation: get current position and update stop
    setLocating(true);
    haptic.tap();
    try {
      const pos = await getCurrentPosition();
      props.onEdit({ lat: pos.lat, lng: pos.lng, name: s.name || "My Location" });
      haptic.success();
    } catch (e: any) {
      haptic.error();
      console.warn("[StopRow] geolocation failed:", e?.message);
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="trip-stop-row">
      <div style={{ display: "grid", placeItems: "center" }}>
        <div className={`trip-badge ${isLocked ? 'trip-badge-blue' : 'trip-badge-soft'}`}>
          {badgeForType(s.type)}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={s.name ?? ""}
            onChange={(e) => props.onEdit({ name: e.target.value })}
            placeholder="Tap to name..."
            className="trip-input"
          />
          <button type="button" onClick={() => { haptic.tap(); props.onSearch(); }} className="trip-interactive trip-btn-icon" aria-label="Search place">
            🔍
          </button>
        </div>

        <div className="trip-row-between">
          <span className="trip-muted-small trip-truncate">
            {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
          </span>
          {(props.onUseMyLocation || s.type === "start") && (
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={locating}
              className="trip-interactive trip-muted-small"
              style={{ background: "none", border: "none", color: "var(--roam-accent)", fontWeight: 600, padding: 0, opacity: locating ? 0.5 : 1 }}
            >
              {locating ? "Locating…" : "Use My Location"}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {canMoveUp && (
          <button type="button" onClick={() => { haptic.selection(); props.onMoveUp(); }} className="trip-interactive trip-btn-icon" style={{ height: 24, width: 32 }} aria-label="Move up">↑</button>
        )}
        {canMoveDown && (
          <button type="button" onClick={() => { haptic.selection(); props.onMoveDown(); }} className="trip-interactive trip-btn-icon" style={{ height: 24, width: 32 }} aria-label="Move down">↓</button>
        )}
        {canRemove && (
          <button type="button" onClick={() => { haptic.medium(); props.onRemove(); }} className="trip-interactive trip-btn-icon" style={{ height: 24, width: 32, color: "var(--roam-danger)" }} aria-label="Remove stop">✕</button>
        )}
      </div>
    </div>
  );
}