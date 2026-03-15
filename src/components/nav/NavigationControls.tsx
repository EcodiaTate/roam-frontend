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

function FloatingBtn({
  icon,
  label,
  onClick,
  danger,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        haptic.selection();
        onClick();
      }}
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        border: "none",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        background: danger
          ? "rgba(239,68,68,0.9)"
          : active
          ? "rgba(74,108,83,0.9)"
          : "rgba(30,30,30,0.88)",
        color: "white",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.15)",
        transition: "transform 0.1s ease, background 0.2s ease",
      }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(0.92)";
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
        top: "calc(env(safe-area-inset-top, 0px) + 180px)",
        right: 12,
        zIndex: 30,
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 10,
      }}
    >
      {/* Mute / unmute */}
      <FloatingBtn
        icon={isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        label={isMuted ? "Unmute voice" : "Mute voice"}
        onClick={onToggleMute}
        active={!isMuted}
      />

      {/* Overview - zoom out to see full route */}
      <FloatingBtn
        icon={<Maximize2 size={20} />}
        label="Route overview"
        onClick={onOverview}
      />

      {/* Recenter on user */}
      <FloatingBtn
        icon={<Crosshair size={20} />}
        label="Recenter"
        onClick={onRecenter}
      />

      {/* End navigation — confirm menu opens left, anchored to right edge */}
      <div style={{ position: "relative" }}>
        <FloatingBtn
          icon={<X size={20} />}
          label="End navigation"
          onClick={() => setConfirmEnd((v) => !v)}
          danger
        />

        {/* Confirm popover — positioned to the left of the X button */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 52,
            opacity: confirmEnd ? 1 : 0,
            transform: confirmEnd ? "translateX(0) scale(1)" : "translateX(8px) scale(0.9)",
            pointerEvents: confirmEnd ? "auto" : "none",
            transition: "opacity 0.15s ease, transform 0.15s ease",
            display: "flex",
            flexDirection: "row",
            gap: 6,
            background: "rgba(30,30,30,0.95)",
            borderRadius: 14,
            padding: 6,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
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
              padding: "8px 14px",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 950,
              color: "white",
              background: "#ef4444",
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
              padding: "8px 14px",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 950,
              color: "rgba(255,255,255,0.7)",
              background: "rgba(255,255,255,0.1)",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
