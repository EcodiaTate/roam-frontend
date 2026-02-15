// src/components/new/StopsEditor.tsx
"use client";

import React, { useState, useRef } from "react";
import type { TripStop } from "@/lib/types/trip";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import { StopRow } from "./StopRow";
import { haptic } from "@/lib/native/haptics";
import { hideKeyboard } from "@/lib/native/keyboard";

type OfflineBuildPhase = "idle" | "routing" | "corridor_ensure" | "corridor_get" | "places_corridor" | "traffic_poll" | "hazards_poll" | "bundle_build" | "ready" | "error";

function phaseLabel(p: OfflineBuildPhase) {
  switch (p) {
    case "idle": return "Ready to build";
    case "routing": return "Routing…";
    case "corridor_ensure": return "Building corridor…";
    case "corridor_get": return "Loading corridor…";
    case "places_corridor": return "Scanning places…";
    case "traffic_poll": return "Fetching traffic…";
    case "hazards_poll": return "Fetching hazards…";
    case "bundle_build": return "Building offline bundle…";
    case "ready": return "Ready";
    case "error": return "Error";
    default: return "…";
  }
}

export function StopsEditor(props: {
  profile: string; onProfileChange: (p: string) => void;
  stops: TripStop[]; onAddStop: (type?: "poi" | "via") => void; onRemoveStop: (id: string) => void; onReorderStop: (fromIdx: number, toIdx: number) => void;
  onEditStop: (id: string, patch: Partial<Pick<TripStop, "name" | "lat" | "lng">>) => void; onUseMyLocation: () => void; onSearchStop: (id: string) => void;
  onBuildRoute: () => void; canBuildRoute: boolean; routing: boolean; error: string | null;
  onBuildOffline: () => void; onDownloadOffline: () => void; onSaveOffline: () => void; onResetOffline: () => void;
  offlinePhase: OfflineBuildPhase; offlineError: string | null; offlineManifest: OfflineBundleManifest | null; canDownloadOffline: boolean;
  savingOffline: boolean; savedOffline: boolean;
}) {
  const offlineBusy = props.offlinePhase !== "idle" && props.offlinePhase !== "ready" && props.offlinePhase !== "error";

  // --- Smooth Drag Controller ---
  const [snapState, setSnapState] = useState<"peek" | "expanded">("peek");
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);
  const dragData = useRef({ startY: 0, lastY: 0, lastTime: 0, velocity: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    dragData.current = { startY: e.clientY, lastY: e.clientY, lastTime: Date.now(), velocity: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const currentY = e.clientY;
    const currentTime = Date.now();
    const deltaY = currentY - dragData.current.lastY;
    const deltaTime = currentTime - dragData.current.lastTime;
    if (deltaTime > 0) dragData.current.velocity = deltaY / deltaTime;
    dragData.current.lastY = currentY;
    dragData.current.lastTime = currentTime;
    const totalDelta = currentY - dragData.current.startY;
    if (snapState === "expanded" && totalDelta < 0) setDragOffset(totalDelta * 0.15);
    else if (snapState === "peek" && totalDelta > 0) setDragOffset(totalDelta * 0.15);
    else setDragOffset(totalDelta);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const { velocity } = dragData.current;
    let snapped = false;
    if (snapState === "peek" && (dragOffset < -60 || velocity < -0.5)) { setSnapState("expanded"); snapped = true; }
    if (snapState === "expanded" && (dragOffset > 60 || velocity > 0.5)) { setSnapState("peek"); snapped = true; }
    if (snapped) haptic.tap();
    setDragOffset(0);
  };

  function IconDrive() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6zm2.1-4l-1 3h11.8l-1-3a1 1 0 0 0-.95-.7H8.05a1 1 0 0 0-.95.7zM7 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"
      />
    </svg>
  );
}

function IconWalk() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M13 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm-1 4a2 2 0 0 0-2 2v3l-2 4 1.8.9L12 14l2 4 .9 2 1.8-.9-2-4v-3a2 2 0 0 0-2-2z"
      />
    </svg>
  );
}

function IconBike() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 16a3 3 0 1 1 0 2 3 3 0 0 1 0-2zm14 0a3 3 0 1 1 0 2 3 3 0 0 1 0-2zM10 5h3l2 4h2v2h-3l-2-4h-2l-1 2H7l1-3a2 2 0 0 1 2-1z"
      />
    </svg>
  );
}

  const peekOffsetStr = `calc(100% - 260px - var(--roam-safe-bottom))`;
  const baseTransform = snapState === "peek" ? peekOffsetStr : "0px";
  const finalTransform = `translateY(calc(${baseTransform} + ${dragOffset}px))`;

  return (
    <div
      className="trip-bottom-sheet-wrap"
      style={{
        transform: finalTransform,
        transition: isDragging.current ? "none" : "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <div className="trip-bottom-sheet">
        {/* DRAG HEADER */}
        <div
          className="trip-sheet-header trip-interactive"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="trip-drag-handle" />
          <div className="trip-row-between">
            <div>
              <h1 className="trip-h1">Plan Trip</h1>
              <div className="trip-muted" style={{ marginTop: 2 }}>Route your next adventure</div>
            </div>
            <select
              value={props.profile}
              onChange={(e) => { haptic.selection(); props.onProfileChange(e.currentTarget.value); }}
              className="trip-interactive"
              style={{ padding: "10px 14px", borderRadius: "12px", border: "none", background: "var(--roam-surface-hover)", fontSize: "0.95rem", fontWeight: 800, color: "var(--roam-text)" }}
              aria-label="Routing profile"
            >
              <option value="drive">🚗 Drive</option>
              <option value="walk">🚶 Walk</option>
              <option value="bike">🚲 Bike</option>
            </select>
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="trip-sheet-content">
          <div className="trip-flex-col">
            {props.stops.map((s, idx) => (
              <StopRow
                key={s.id ?? `${idx}`} stop={s} idx={idx} count={props.stops.length}
                onEdit={(patch) => { if (s.id) props.onEditStop(s.id, patch); }}
                onSearch={() => { if (s.id) { haptic.tap(); props.onSearchStop(s.id); } }}
                onRemove={() => { if (s.id) { haptic.medium(); props.onRemoveStop(s.id); } }}
                onMoveUp={() => { haptic.selection(); props.onReorderStop(idx, idx - 1); }}
                onMoveDown={() => { haptic.selection(); props.onReorderStop(idx, idx + 1); }}
                onUseMyLocation={s.type === "start" ? props.onUseMyLocation : undefined}
              />
            ))}
          </div>

          <div className="trip-actions" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
            <button type="button" onClick={() => { haptic.tap(); props.onAddStop("poi"); }} className="trip-interactive trip-btn trip-btn-secondary">
              + Add Stop
            </button>
            <button type="button" onClick={() => { haptic.medium(); hideKeyboard(); props.onBuildRoute(); }} disabled={!props.canBuildRoute || props.routing} className="trip-interactive trip-btn trip-btn-primary">
              {props.routing ? "Routing…" : "Build Route"}
            </button>
          </div>

          {/* Offline Bundle Section */}
          <div className="trip-flex-col" style={{ marginTop: 16, padding: 20, background: "var(--roam-surface-hover)", borderRadius: "var(--r-card)" }}>
            <div className="trip-row-between" style={{ marginBottom: 8 }}>
              <div>
                <div className="trip-h2">Offline Bundle</div>
                <div className="trip-muted-small" style={{ marginTop: 4 }}>
                  Status: <span style={{ fontWeight: 800, color: "var(--roam-text)" }}>{phaseLabel(props.offlinePhase)}</span>
                  {props.savedOffline && <span className="trip-badge trip-badge-ok" style={{ marginLeft: 6 }}>Saved ✅</span>}
                </div>
              </div>
              <button type="button" onClick={() => { haptic.tap(); props.onResetOffline(); }} disabled={offlineBusy || props.savingOffline} className="trip-interactive trip-btn-icon" aria-label="Reset">
                ⟳
              </button>
            </div>

            <div className="trip-actions" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <button type="button" onClick={() => { haptic.medium(); props.onBuildOffline(); }} disabled={!props.canBuildRoute || offlineBusy || props.savingOffline} className="trip-interactive trip-btn trip-btn-secondary" style={{ padding: "8px" }}>
                {offlineBusy ? "Wait…" : "Build"}
              </button>
              <button type="button" onClick={() => { haptic.tap(); props.onSaveOffline(); }} disabled={!props.canDownloadOffline || props.savingOffline} className="trip-interactive trip-btn trip-btn-secondary" style={{ padding: "8px" }}>
                {props.savingOffline ? "Saving…" : props.savedOffline ? "Saved" : "Save"}
              </button>
              <button type="button" onClick={() => { haptic.tap(); props.onDownloadOffline(); }} disabled={!props.canDownloadOffline || props.savingOffline} className="trip-interactive trip-btn trip-btn-primary" style={{ padding: "8px" }}>
                ZIP
              </button>
            </div>

            {props.offlineManifest && (
              <div className="trip-kv-row" style={{ marginTop: 16 }}>
                <div className="trip-kv"><div className="trip-kv-k">plan_id</div><div className="trip-kv-v">{props.offlineManifest.plan_id.substring(0, 8)}…</div></div>
                <div className="trip-kv"><div className="trip-kv-k">route_key</div><div className="trip-kv-v">{props.offlineManifest.route_key.substring(0, 8)}…</div></div>
                <div className="trip-kv"><div className="trip-kv-k">corridor</div><div className="trip-kv-v">{props.offlineManifest.corridor_status ?? "—"}</div></div>
                <div className="trip-kv"><div className="trip-kv-k">places</div><div className="trip-kv-v">{props.offlineManifest.places_status ?? "—"}</div></div>
              </div>
            )}

            {props.offlineError && <div className="trip-err-box" style={{ marginTop: 12 }}>{props.offlineError}</div>}
          </div>

          {props.error && <div className="trip-err-box">{props.error}</div>}
        </div>
      </div>
    </div>
  );
}