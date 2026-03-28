// src/components/nav/NavigationControls.tsx

import { useState, useEffect } from "react";
import { Volume2, VolumeX, Maximize2, Crosshair, Layers, Megaphone, X } from "lucide-react";
import { haptic } from "@/lib/native/haptics";

type Props = {
  visible: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onOverview: () => void;
  onRecenter: () => void;
  onEnd: () => void;
  layerFilterActive?: boolean;
  onLayerToggle?: () => void;
  onReport?: () => void;
  reportOpen?: boolean;
  reportTray?: React.ReactNode;
  simple?: boolean;
};

/* ── Unified circular button - all styles inline ─────────────────── */

function NavBtn({
  icon,
  label,
  onClick,
  variant = "default",
  animClass,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "active" | "danger";
  animClass?: string;
}) {
  const isDefault = variant === "default";
  const isDanger = variant === "danger";
  const isActive = variant === "active";

  return (
    <button
      type="button"
      aria-label={label}
      className={animClass}
      onClick={() => { haptic.selection(); onClick(); }}
      style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        background: isDanger
          ? "var(--brand-ochre)"
          : isActive
          ? "var(--brand-eucalypt)"
          : "var(--nav-card-bg, #f0e9dc)",
        color: isDefault
          ? "var(--roam-text, #1a1613)"
          : "var(--on-color, #faf6ef)",
        boxShadow: isDanger
          ? "0 0 16px rgba(181,69,46,0.35), 0 4px 12px rgba(181,69,46,0.2)"
          : isActive
          ? "0 0 16px rgba(45,110,64,0.35), 0 4px 12px rgba(45,110,64,0.2)"
          : "0 4px 14px rgba(40,32,20,0.10), 0 1px 3px rgba(0,0,0,0.06)",
        transition: "transform 0.12s cubic-bezier(0.34,1.56,0.64,1), background 0.2s ease, box-shadow 0.2s ease",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.88)"; }}
      onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
      onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
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
  layerFilterActive,
  onLayerToggle,
  onReport,
  reportOpen,
  reportTray,
  simple,
}: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    if (!confirmEnd) return;
    const t = setTimeout(() => setConfirmEnd(false), 4000);
    return () => clearTimeout(t);
  }, [confirmEnd]);

  if (!visible) return null;

  let idx = 0;

  // Position: sits below the HUD card, right-aligned
  // HUD card is ~82-90px from top, so controls start below that
  return (
    <div style={{
      position: "absolute",
      top: "calc(env(safe-area-inset-top, 0px) + 120px)",
      right: 12,
      zIndex: 40,
      pointerEvents: "auto",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
    }}>
      {onLayerToggle && (
        <NavBtn
          animClass={`nav-ctrl-enter-${++idx}`}
          icon={<Layers size={17} strokeWidth={2.2} />}
          label="Map layers"
          onClick={onLayerToggle}
          variant={layerFilterActive ? "active" : "default"}
        />
      )}

      <NavBtn
        animClass={`nav-ctrl-enter-${++idx}`}
        icon={isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        label={isMuted ? "Unmute voice" : "Mute voice"}
        onClick={onToggleMute}
        variant={!isMuted ? "active" : "default"}
      />

      <NavBtn
        animClass={`nav-ctrl-enter-${++idx}`}
        icon={<Maximize2 size={17} />}
        label="Route overview"
        onClick={onOverview}
      />

      <NavBtn
        animClass={`nav-ctrl-enter-${++idx}`}
        icon={<Crosshair size={17} />}
        label="Recenter"
        onClick={onRecenter}
      />

      {!simple && onReport && (
        <div style={{ position: "relative" }} className={`nav-ctrl-enter-${++idx}`}>
          <NavBtn
            icon={reportOpen ? <X size={17} /> : <Megaphone size={17} />}
            label="Report road condition"
            onClick={onReport}
            variant={reportOpen ? "active" : "default"}
          />
          {reportTray && (
            <div style={{ position: "absolute", top: 0, right: 50, zIndex: 50 }}>
              {reportTray}
            </div>
          )}
        </div>
      )}

      <div style={{ position: "relative" }} className={`nav-ctrl-enter-${++idx}`}>
        <NavBtn
          icon={<X size={17} />}
          label="End navigation"
          onClick={() => setConfirmEnd((v) => !v)}
          variant="danger"
        />

        <div style={{
          position: "absolute",
          top: 0,
          right: 50,
          opacity: confirmEnd ? 1 : 0,
          transform: confirmEnd ? "translateX(0) scale(1)" : "translateX(10px) scale(0.92)",
          pointerEvents: confirmEnd ? "auto" : "none",
          transition: "opacity 0.18s ease, transform 0.18s cubic-bezier(0.34,1.56,0.64,1)",
          display: "flex",
          gap: 5,
          borderRadius: "var(--r-card)",
          padding: "4px",
          whiteSpace: "nowrap",
          background: "var(--nav-card-bg, #f0e9dc)",
          boxShadow: "var(--shadow-heavy)",
          border: "1px solid var(--roam-border)",
        }}>
          <button
            type="button"
            onClick={() => { haptic.medium(); setConfirmEnd(false); onEnd(); }}
            style={{
              padding: "10px 16px",
              minHeight: 44,
              border: "none",
              borderRadius: "var(--r-card)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 950,
              color: "var(--on-color, #faf6ef)",
              background: "var(--brand-ochre)",
              letterSpacing: "-0.1px",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            End nav
          </button>
          <button
            type="button"
            onClick={() => { haptic.selection(); setConfirmEnd(false); }}
            style={{
              padding: "10px 14px",
              minHeight: 44,
              border: "1px solid var(--roam-border-strong)",
              borderRadius: "var(--r-card)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 950,
              color: "var(--roam-text-muted)",
              background: "transparent",
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
