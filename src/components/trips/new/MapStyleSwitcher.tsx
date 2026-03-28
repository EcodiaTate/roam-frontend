import React from "react";
import { haptic } from "@/lib/native/haptics";
import { Sun, Moon, Map as MapIcon, Satellite } from "lucide-react";

export type MapBaseMode = "vector" | "hybrid";
export type VectorTheme = "bright" | "dark";

/* ── Shared pill button style (matches TripMap nav-mode aesthetic) ──── */

const pillBase: React.CSSProperties = {
  all: "unset",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  height: 44,
  padding: "0 14px",
  borderRadius: "var(--r-card)",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--on-color)",
  WebkitTapHighlightColor: "transparent",
  transition: "background 140ms ease, color 140ms ease, transform 100ms ease",
};

const iconPillBase: React.CSSProperties = {
  ...pillBase,
  width: 44,
  padding: 0,
};

function SegBtn({
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
}) {
  return (
    <button
      type="button"
      className="trip-interactive"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      aria-label={ariaLabel}
      style={{
        ...pillBase,
        background: active ? "rgba(255,255,255,0.22)" : "transparent",
        transform: active ? "scale(1.02)" : "scale(1)",
      }}
    >
      {children}
    </button>
  );
}

function IconBtn({
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
}) {
  return (
    <button
      type="button"
      className="trip-interactive"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      aria-label={ariaLabel}
      style={{
        ...iconPillBase,
        background: active ? "rgba(255,255,255,0.22)" : "transparent",
        transform: active ? "scale(1.02)" : "scale(1)",
      }}
    >
      {children}
    </button>
  );
}

/* ── Shared glass container style ──────────────────────────────────── */

const glassBox: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  padding: 3,
  borderRadius: "var(--r-card)",
  background: "rgba(0,0,0,0.45)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid var(--roam-border)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.28)",
};

export function MapStyleSwitcher(props: {
  mode: MapBaseMode;
  vectorTheme: VectorTheme;
  onChange: (next: { mode: MapBaseMode; vectorTheme: VectorTheme }) => void;
}) {
  const { mode, vectorTheme, onChange } = props;

  return (
    <div
      role="group"
      aria-label="Map style"
      style={{
        position: "absolute",
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        right: 10,
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        pointerEvents: "auto",
      }}
    >
      {/* Map / Sat toggle */}
      <div style={glassBox}>
        <SegBtn
          active={mode === "vector"}
          onClick={() => {
            haptic.selection();
            onChange({ mode: "vector", vectorTheme });
          }}
          title="Map"
        >
          <MapIcon size={13} />
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
          <Satellite size={13} />
          Sat
        </SegBtn>
      </div>

      {/* Bright / Dark toggle (only when in vector mode) */}
      {mode === "vector" && (
        <div style={{ ...glassBox, alignSelf: "flex-end" }}>
          <IconBtn
            active={vectorTheme === "bright"}
            title="Bright"
            ariaLabel="Bright theme"
            onClick={() => {
              haptic.selection();
              onChange({ mode: "vector", vectorTheme: "bright" });
            }}
          >
            <Sun size={14} />
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
            <Moon size={14} />
          </IconBtn>
        </div>
      )}
    </div>
  );
}
