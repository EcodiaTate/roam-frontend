// src/components/nav/NavigationControls.tsx
"use client";

import { useState, useEffect } from "react";
import { Volume2, VolumeX, Maximize2, Crosshair, X } from "lucide-react";
import { haptic } from "@/lib/native/haptics";

type Props = {
  visible: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onOverview: () => void;
  onRecenter: () => void;
  onEnd: () => void;
};

/* ── Single floating pill button ─────────────────────────────────── */

function FloatingBtn({
  icon,
  label,
  onClick,
  danger,
  active,
  animClass,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  animClass?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={animClass}
      onClick={() => {
        haptic.selection();
        onClick();
      }}
      style={{
        width: 46,
        height: 46,
        borderRadius: 16,
        border: danger
          ? "1px solid rgba(212,102,74,0.35)"
          : active
          ? "1px solid rgba(66,177,89,0.30)"
          : "1px solid rgba(255,255,255,0.09)",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        background: danger
          ? "linear-gradient(160deg, rgba(181,69,46,0.95) 0%, rgba(145,50,30,0.98) 100%)"
          : active
          ? "linear-gradient(160deg, rgba(45,110,64,0.95) 0%, rgba(31,82,54,0.98) 100%)"
          : "linear-gradient(160deg, rgba(26,21,16,0.96) 0%, rgba(16,13,10,0.98) 100%)",
        color: "var(--on-color)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: danger
          ? "0 4px 16px rgba(181,69,46,0.35), 0 1px 4px rgba(0,0,0,0.2)"
          : active
          ? "0 4px 16px rgba(45,110,64,0.30), 0 1px 4px rgba(0,0,0,0.2)"
          : "0 4px 16px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.15)",
        transition: "transform 0.1s ease, background 0.2s ease, box-shadow 0.2s ease",
      }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(0.90)";
      }}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
      }}
      onPointerCancel={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
      }}
    >
      {icon}
    </button>
  );
}

/* ── Main component ───────────────────────────────────────────────── */

export function NavigationControls({
  visible,
  isMuted,
  onToggleMute,
  onOverview,
  onRecenter,
  onEnd,
}: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Auto-dismiss confirm after 4 seconds
  useEffect(() => {
    if (!confirmEnd) return;
    const t = setTimeout(() => setConfirmEnd(false), 4000);
    return () => clearTimeout(t);
  }, [confirmEnd]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(env(safe-area-inset-top, 0px) + 168px)",
        right: 12,
        zIndex: 40,
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      {/* Mute / unmute */}
      <FloatingBtn
        animClass="nav-ctrl-enter-1"
        icon={isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        label={isMuted ? "Unmute voice" : "Mute voice"}
        onClick={onToggleMute}
        active={!isMuted}
      />

      {/* Route overview */}
      <FloatingBtn
        animClass="nav-ctrl-enter-2"
        icon={<Maximize2 size={18} />}
        label="Route overview"
        onClick={onOverview}
      />

      {/* Recenter */}
      <FloatingBtn
        animClass="nav-ctrl-enter-3"
        icon={<Crosshair size={18} />}
        label="Recenter"
        onClick={onRecenter}
      />

      {/* End navigation — confirm popover */}
      <div style={{ position: "relative" }} className="nav-ctrl-enter-4">
        <FloatingBtn
          icon={<X size={18} />}
          label="End navigation"
          onClick={() => setConfirmEnd((v) => !v)}
          danger
        />

        {/* Confirm popover — slides left from button */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 54,
            opacity: confirmEnd ? 1 : 0,
            transform: confirmEnd ? "translateX(0) scale(1)" : "translateX(10px) scale(0.92)",
            pointerEvents: confirmEnd ? "auto" : "none",
            transition: "opacity 0.18s ease, transform 0.18s cubic-bezier(0.34,1.56,0.64,1)",
            display: "flex",
            flexDirection: "row",
            gap: 6,
            background: "linear-gradient(160deg, rgba(26,21,16,0.98) 0%, rgba(16,13,10,0.99) 100%)",
            borderRadius: 16,
            padding: "6px",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2)",
            border: "1px solid rgba(255,255,255,0.08)",
            whiteSpace: "nowrap",
          }}
        >
          <button
            type="button"
            onClick={() => {
              haptic.medium();
              setConfirmEnd(false);
              onEnd();
            }}
            style={{
              padding: "12px 18px",
              minHeight: 44,
              border: "1px solid rgba(212,102,74,0.35)",
              borderRadius: 12,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 950,
              color: "var(--on-color)",
              background: "linear-gradient(160deg, rgba(181,69,46,0.95) 0%, rgba(145,50,30,0.98) 100%)",
              letterSpacing: "-0.1px",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            End nav
          </button>
          <button
            type="button"
            onClick={() => {
              haptic.selection();
              setConfirmEnd(false);
            }}
            style={{
              padding: "12px 16px",
              minHeight: 44,
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 12,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 950,
              color: "rgba(250,246,239,0.65)",
              background: "rgba(255,255,255,0.06)",
              letterSpacing: "-0.1px",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
