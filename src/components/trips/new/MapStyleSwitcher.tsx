"use client";

import React from "react";

export type MapBaseMode = "vector" | "hybrid";
export type VectorTheme = "bright" | "dark";

export function MapStyleSwitcher(props: {
  mode: MapBaseMode;
  vectorTheme: VectorTheme;
  onChange: (next: { mode: MapBaseMode; vectorTheme: VectorTheme }) => void;
}) {
  const { mode, vectorTheme, onChange } = props;

  return (
    <div className="trip-map-switcher">
      <div className="trip-panel" style={{ padding: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="trip-interactive trip-pill-btn"
            data-active={mode === "vector"}
            onClick={() => onChange({ mode: "vector", vectorTheme })}
            aria-pressed={mode === "vector"}
          >
            Vector
          </button>
          <button
            type="button"
            className="trip-interactive trip-pill-btn"
            data-active={mode === "hybrid"}
            onClick={() => onChange({ mode: "hybrid", vectorTheme })}
            aria-pressed={mode === "hybrid"}
          >
            Hybrid
          </button>
        </div>

        {mode === "vector" && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="trip-interactive trip-pill-btn"
              data-active={vectorTheme === "bright"}
              onClick={() => onChange({ mode: "vector", vectorTheme: "bright" })}
              aria-pressed={vectorTheme === "bright"}
              style={{ flex: 1, textAlign: "center", justifyContent: "center" }}
            >
              Light
            </button>
            <button
              type="button"
              className="trip-interactive trip-pill-btn"
              data-active={vectorTheme === "dark"}
              onClick={() => onChange({ mode: "vector", vectorTheme: "dark" })}
              aria-pressed={vectorTheme === "dark"}
              style={{ flex: 1, textAlign: "center", justifyContent: "center" }}
            >
              Dark
            </button>
          </div>
        )}
      </div>
    </div>
  );
}