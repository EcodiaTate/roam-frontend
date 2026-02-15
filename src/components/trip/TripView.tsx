// components/trip/TripView.tsx
"use client";

import { useState, useEffect } from "react";
import type { NavPack, CorridorGraphPack } from "@/lib/types/navigation";
import type { TripStop } from "@/lib/types/trip";
import { haptic } from "@/lib/native/haptics";

export function TripView({
  planId,
  navpack,
  corridor,
  focusedStopId,
  onFocusStop,
}: {
  planId: string;
  navpack: NavPack | null;
  corridor: CorridorGraphPack | null;
  focusedStopId: string | null;
  onFocusStop: (id: string | null) => void;
}) {
  const [stops, setStops] = useState<TripStop[]>([]);

  useEffect(() => {
    if (navpack?.req?.stops) setStops(navpack.req.stops);
  }, [navpack]);

  if (!navpack) {
    return (
      <div style={{ color: "var(--roam-text-muted)", fontWeight: 700, fontSize: 14 }}>
        No route active.
      </div>
    );
  }

  const moveStop = (index: number, direction: 1 | -1) => {
    haptic.selection();
    const next = [...stops];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;

    [next[index], next[target]] = [next[target], next[index]];
    setStops(next);
    // TODO: Trigger actual rebuild via prop callback here
  };

  const distance = (navpack.primary?.distance_m ?? 0) / 1000;
  const duration = (navpack.primary?.duration_s ?? 0) / 60 / 60;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Route Summary */}
      <div
        style={{
          padding: 16,
          background: "var(--roam-surface-hover)",
          borderRadius: "16px",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--roam-text)" }}>
          Route Overview
        </h3>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--roam-text-muted)", fontWeight: 700 }}>
          {distance.toFixed(1)} km total · {duration.toFixed(1)} hours driving
        </p>
      </div>

      {/* Stops List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {stops.map((stop, index) => {
          const isFocused = focusedStopId === stop.id;
          const isLocked = stop.type === "start" || stop.type === "end";

          return (
            <div
              key={stop.id ?? index}
              onClick={() => {
                haptic.selection();
                onFocusStop(stop.id ?? null);
              }}
              className="trip-interactive"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                borderRadius: 20,
                cursor: "pointer",
                background: isFocused ? "var(--roam-surface-hover)" : "var(--roam-surface)",
                boxShadow: isFocused ? "var(--shadow-heavy)" : "var(--shadow-soft)",
                outline: isFocused ? "3px solid var(--brand-eucalypt)" : "3px solid transparent",
                outlineOffset: -3,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: isLocked ? "var(--brand-eucalypt)" : "var(--tab-inactive-color)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                  fontWeight: 900,
                  flexShrink: 0,
                }}
                title={isLocked ? "Locked stop" : "Stop"}
              >
                {index + 1}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    color: "var(--roam-text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {stop.name || `Stop ${index + 1}`}
                </div>
                {typeof stop.lat === "number" && typeof stop.lng === "number" && (
                  <div style={{ fontSize: 12, color: "var(--roam-text-muted)", marginTop: 3, fontWeight: 700 }}>
                    {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                  </div>
                )}
              </div>

              {/* Reorder Controls */}
              {!isLocked && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveStop(index, -1);
                    }}
                    className="trip-interactive"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      border: "none",
                      background: "var(--roam-surface-hover)",
                      color: "var(--roam-text-muted)",
                      fontSize: 16,
                      fontWeight: 900,
                      boxShadow: "var(--shadow-button)",
                    }}
                    aria-label="Move up"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveStop(index, 1);
                    }}
                    className="trip-interactive"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      border: "none",
                      background: "var(--roam-surface-hover)",
                      color: "var(--roam-text-muted)",
                      fontSize: 16,
                      fontWeight: 900,
                      boxShadow: "var(--shadow-button)",
                    }}
                    aria-label="Move down"
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
