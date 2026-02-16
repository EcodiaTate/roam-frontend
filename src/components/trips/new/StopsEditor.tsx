"use client";

import React, { useMemo, useRef, useState } from "react";
import type { TripStop } from "@/lib/types/trip";
import type { OfflineBundleManifest } from "@/lib/types/bundle";
import { StopRow } from "./StopRow";
import { haptic } from "@/lib/native/haptics";
import { hideKeyboard } from "@/lib/native/keyboard";

import { Car, PersonStanding, Bike, Save } from "lucide-react";

type OfflineBuildPhase =
  | "idle"
  | "routing"
  | "corridor_ensure"
  | "corridor_get"
  | "places_corridor"
  | "traffic_poll"
  | "hazards_poll"
  | "bundle_build"
  | "ready"
  | "error";

function simpleStatusLabel(p: OfflineBuildPhase, saved: boolean, saving: boolean, err: string | null) {
  if (err) return err;
  if (saved) return "Saved. Offline ready.";
  if (saving) return "Saving…";
  switch (p) {
    case "idle":
      return "Ready";
    case "routing":
      return "Building route…";
    case "corridor_ensure":
    case "corridor_get":
      return "Preparing offline corridor…";
    case "places_corridor":
      return "Caching places…";
    case "traffic_poll":
      return "Fetching traffic…";
    case "hazards_poll":
      return "Fetching warnings…";
    case "bundle_build":
      return "Packaging offline bundle…";
    case "ready":
      return "Offline ready.";
    case "error":
      return err ?? "Something went wrong";
    default:
      return "Working…";
  }
}

function ProfileOptionIcon({ value }: { value: string }) {
  if (value === "walk") return <PersonStanding size={16} />;
  if (value === "bike") return <Bike size={16} />;
  return <Car size={16} />;
}

export function StopsEditor(props: {
  profile: string;
  onProfileChange: (p: string) => void;

  stops: TripStop[];
  onAddStop: (type?: "poi" | "via") => void;
  onRemoveStop: (id: string) => void;
  onReorderStop: (fromIdx: number, toIdx: number) => void;

  onEditStop: (id: string, patch: Partial<Pick<TripStop, "name" | "lat" | "lng">>) => void;
  onUseMyLocation: () => void;
  onSearchStop: (id: string) => void;

  // Route button is intentionally not used in this simplified UI
  onBuildRoute: () => void;
  canBuildRoute: boolean;
  routing: boolean;
  error: string | null;

  // We repurpose onBuildOffline as "Save trip (offline-ready)".
  onBuildOffline: () => void;

  // Legacy (no longer shown in UI)
  onDownloadOffline: () => void;
  onSaveOffline: () => void;
  onResetOffline: () => void;

  offlinePhase: OfflineBuildPhase;
  offlineError: string | null;
  offlineManifest: OfflineBundleManifest | null;
  canDownloadOffline: boolean;

  savingOffline: boolean;
  savedOffline: boolean;
}) {
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
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    const { velocity } = dragData.current;
    let snapped = false;

    if (snapState === "peek" && (dragOffset < -60 || velocity < -0.5)) {
      setSnapState("expanded");
      snapped = true;
    }
    if (snapState === "expanded" && (dragOffset > 60 || velocity > 0.5)) {
      setSnapState("peek");
      snapped = true;
    }
    if (snapped) haptic.tap();
    setDragOffset(0);
  };

  const peekOffsetStr = `calc(100% - 260px - var(--roam-safe-bottom))`;
  const baseTransform = snapState === "peek" ? peekOffsetStr : "0px";
  const finalTransform = `translateY(calc(${baseTransform} + ${dragOffset}px))`;

  const statusText = useMemo(
    () => simpleStatusLabel(props.offlinePhase, props.savedOffline, props.savingOffline, props.offlineError),
    [props.offlinePhase, props.savedOffline, props.savingOffline, props.offlineError],
  );

  const canSave = props.canBuildRoute && !props.savingOffline;

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
              <div className="trip-muted" style={{ marginTop: 2 }}>
                Add stops. Tap save. Done.
              </div>
            </div>

            {/* Profile selector (no emojis; lucide icon + label) */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 12,
                background: "var(--roam-surface-hover)",
              }}
            >
              <ProfileOptionIcon value={props.profile} />
              <select
                value={props.profile}
                onChange={(e) => {
                  haptic.selection();
                  props.onProfileChange(e.currentTarget.value);
                }}
                className="trip-interactive"
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "0.95rem",
                  fontWeight: 850,
                  color: "var(--roam-text)",
                  outline: "none",
                }}
                aria-label="Routing profile"
              >
                <option value="drive">Drive</option>
                <option value="walk">Walk</option>
                <option value="bike">Bike</option>
              </select>
            </div>
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="trip-sheet-content">
          <div className="trip-flex-col">
            {props.stops.map((s, idx) => (
              <StopRow
                key={s.id ?? `${idx}`}
                stop={s}
                idx={idx}
                count={props.stops.length}
                onEdit={(patch) => {
                  if (s.id) props.onEditStop(s.id, patch);
                }}
                onSearch={() => {
                  if (s.id) {
                    haptic.tap();
                    props.onSearchStop(s.id);
                  }
                }}
                onRemove={() => {
                  if (s.id) {
                    haptic.medium();
                    props.onRemoveStop(s.id);
                  }
                }}
                onMoveUp={() => {
                  haptic.selection();
                  props.onReorderStop(idx, idx - 1);
                }}
                onMoveDown={() => {
                  haptic.selection();
                  props.onReorderStop(idx, idx + 1);
                }}
                onUseMyLocation={s.type === "start" ? props.onUseMyLocation : undefined}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="trip-actions" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                props.onAddStop("poi");
              }}
              className="trip-interactive trip-btn trip-btn-secondary"
            >
              + Add Stop
            </button>

            <button
              type="button"
              onClick={() => {
                haptic.medium();
                hideKeyboard();
                props.onBuildOffline(); // <-- THE ONLY PRIMARY ACTION NOW
              }}
              disabled={!canSave}
              className="trip-interactive trip-btn trip-btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Save size={16} />
              {props.savingOffline ? "Planning trip" : "Lets do It"}
            </button>
          </div>

          {/* Simple status (no nerd steps, no manifest junk) */}
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: "var(--r-card)",
              background: "var(--roam-surface-hover)",
              color: "var(--roam-text)",
              fontSize: 13,
              fontWeight: 850,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >

            {props.savedOffline && (
              <span
                className="trip-badge trip-badge-ok"
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                Saved
              </span>
            )}
          </div>

          {/* Route errors (still possible) */}
          {props.error && <div className="trip-err-box">{props.error}</div>}
        </div>
      </div>
    </div>
  );
}
