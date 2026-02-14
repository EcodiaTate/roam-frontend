"use client";

import type { TripStop } from "@/lib/types/trip";

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

  const canMoveUp = props.idx > 0 && s.type !== "start" && s.type !== "end";
  const canMoveDown = props.idx < props.count - 1 && s.type !== "start" && s.type !== "end";
  const canRemove = s.type !== "start" && s.type !== "end";
  const isLocked = s.type === "start" || s.type === "end";

  return (
    <div className="trip-stop-row">
      <div style={{ display: "grid", placeItems: "center" }}>
        <div className={`trip-badge ${isLocked ? 'trip-badge-blue' : 'trip-badge-soft'}`} style={{ padding: "6px 10px" }}>
          {badgeForType(s.type)}
        </div>
      </div>

      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={s.name ?? ""}
            onChange={(e) => props.onEdit({ name: e.target.value })}
            placeholder="Name"
            className="trip-input"
          />
          <button type="button" onClick={props.onSearch} className="trip-interactive trip-btn-icon" aria-label="Search place">
            🔎
          </button>
        </div>

        <div className="trip-row-between" style={{ fontSize: 12 }}>
          <span className="trip-truncate" style={{ opacity: 0.75 }}>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</span>
          {props.onUseMyLocation ? (
            <button type="button" onClick={props.onUseMyLocation} className="trip-interactive trip-btn-sm" style={{ padding: "4px 8px", minHeight: "auto" }}>
              Use my location
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        <button type="button" onClick={props.onMoveUp} disabled={!canMoveUp} className="trip-interactive trip-btn-icon" aria-label="Move up">↑</button>
        <button type="button" onClick={props.onMoveDown} disabled={!canMoveDown} className="trip-interactive trip-btn-icon" aria-label="Move down">↓</button>
        <button type="button" onClick={props.onRemove} disabled={!canRemove} className="trip-interactive trip-btn-icon" aria-label="Remove stop">✕</button>
      </div>
    </div>
  );
}