"use client";

import React from "react";
import { haptic } from "@/lib/native/haptics";
import { Sun, Moon, Map as MapIcon, Satellite } from "lucide-react";

export type MapBaseMode = "vector" | "hybrid";
export type VectorTheme = "bright" | "dark";

export function MapStyleSwitcher(props: {
  mode: MapBaseMode;
  vectorTheme: VectorTheme;
  onChange: (next: { mode: MapBaseMode; vectorTheme: VectorTheme }) => void;
}) {
  const { mode, vectorTheme, onChange } = props;

  const SegBtn = ({
    active,
    onClick,
    children,
    title,
    ariaLabel,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title?: string;
    ariaLabel?: string;
  }) => (
    <button
      type="button"
      className="trip-interactive"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      aria-label={ariaLabel}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: 40,
        padding: "0 14px",
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: -0.2,
        color: active ? "var(--roam-surface)" : "var(--roam-text)",
        background: active ? "var(--roam-text)" : "transparent",
        WebkitTapHighlightColor: "transparent",
        transition: "background 160ms ease, color 160ms ease, transform 120ms ease",
        transform: active ? "scale(1.02)" : "scale(1)",
      }}
    >
      {children}
    </button>
  );

  const IconBtn = ({
    active,
    onClick,
    children,
    title,
    ariaLabel,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title: string;
    ariaLabel: string;
  }) => (
    <button
      type="button"
      className="trip-interactive"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      aria-label={ariaLabel}
      style={{
        all: "unset",
        cursor: "pointer",
        width: 40,
        height: 40,
        borderRadius: 12,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: active ? "var(--roam-surface)" : "var(--roam-text)",
        background: active ? "var(--roam-text)" : "transparent",
        WebkitTapHighlightColor: "transparent",
        transition: "background 160ms ease, color 160ms ease, transform 120ms ease",
        transform: active ? "scale(1.02)" : "scale(1)",
      }}
    >
      {children}
    </button>
  );

  return (
    <div
      className=""
      role="group"
      aria-label="Map style"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "auto",
      }}
    >
      {/* Main segmented control */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: 4,
          borderRadius: 14,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.16)",
          boxShadow: "0 10px 26px rgba(0,0,0,0.22)",
        }}
      >
        <SegBtn
          active={mode === "vector"}
          onClick={() => {
            haptic.selection();
            onChange({ mode: "vector", vectorTheme });
          }}
          title="Map"
        >
          <MapIcon size={16} />
          Map
        </SegBtn>

        <SegBtn
          active={mode === "hybrid"}
          onClick={() => {
            haptic.selection();
            onChange({ mode: "hybrid", vectorTheme });
          }}
          title="Satellite"
        >
          <Satellite size={16} />
          Sat
        </SegBtn>
      </div>

      {/* Theme toggle (only when in vector) */}
      {mode === "vector" && (
        <div
          style={{
            alignSelf: "flex-end",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: 4,
            borderRadius: 14,
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.16)",
            boxShadow: "0 10px 26px rgba(0,0,0,0.22)",
          }}
        >
          <IconBtn
            active={vectorTheme === "bright"}
            title="Bright"
            ariaLabel="Bright theme"
            onClick={() => {
              haptic.selection();
              onChange({ mode: "vector", vectorTheme: "bright" });
            }}
          >
            <Sun size={16} />
          </IconBtn>

          <IconBtn
            active={vectorTheme === "dark"}
            title="Dark"
            ariaLabel="Dark theme"
            onClick={() => {
              haptic.selection();
              onChange({ mode: "vector", vectorTheme: "dark" });
            }}
          >
            <Moon size={16} />
          </IconBtn>
        </div>
      )}
    </div>
  );
}
