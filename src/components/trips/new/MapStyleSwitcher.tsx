// src/components/map/MapStyleSwitcher.tsx
"use client";

import React from "react";
import { haptic } from "@/lib/native/haptics";

export type MapBaseMode = "vector" | "hybrid";
export type VectorTheme = "bright" | "dark";

export function MapStyleSwitcher(props: {
  mode: MapBaseMode;
  vectorTheme: VectorTheme;
  onChange: (next: { mode: MapBaseMode; vectorTheme: VectorTheme }) => void;
}) {
  const { mode, vectorTheme, onChange } = props;

  return (
    <div className="trip-map-switcher" role="group" aria-label="Map style">
      <div className="trip-map-switcher-row">
        <button
          type="button"
          className="trip-interactive trip-pill-btn"
          data-active={mode === "vector"}
          onClick={() => { haptic.selection(); onChange({ mode: "vector", vectorTheme }); }}
          aria-pressed={mode === "vector"}
        >
          Map
        </button>
        <button
          type="button"
          className="trip-interactive trip-pill-btn"
          data-active={mode === "hybrid"}
          onClick={() => { haptic.selection(); onChange({ mode: "hybrid", vectorTheme }); }}
          aria-pressed={mode === "hybrid"}
        >
          Sat
        </button>
      </div>

      {mode === "vector" && (
        <div className="trip-map-switcher-row trip-map-switcher-sub">
          <button
            type="button"
            className="trip-interactive trip-pill-btn"
            data-active={vectorTheme === "bright"}
            onClick={() => { haptic.selection(); onChange({ mode: "vector", vectorTheme: "bright" }); }}
            aria-pressed={vectorTheme === "bright"}
          >
            ☀
          </button>
          <button
            type="button"
            className="trip-interactive trip-pill-btn"
            data-active={vectorTheme === "dark"}
            onClick={() => { haptic.selection(); onChange({ mode: "vector", vectorTheme: "dark" }); }}
            aria-pressed={vectorTheme === "dark"}
          >
            ⏾
          </button>
        </div>
      )}
    </div>
  );
}
