// src/components/ui/UIModePickerModal.tsx

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { haptic } from "@/lib/native/haptics";
import { useUIMode, type UIMode } from "@/lib/hooks/useUIMode";
import { Map, Compass } from "lucide-react";

const CHOSEN_KEY = "roam:ui_mode_chosen";

/** Returns true once the user has made a choice (persists across sessions). */
export function hasChosenUIMode(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(CHOSEN_KEY) === "1";
}

/** Mark the choice as made. */
function markChosen() {
  localStorage.setItem(CHOSEN_KEY, "1");
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function UIModePickerModal({ open, onClose }: Props) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const { setUIMode } = useUIMode();

  if (!mounted || !open) return null;

  const pick = (mode: UIMode) => {
    haptic.medium();
    setUIMode(mode);
    markChosen();
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(10, 8, 6, 0.80)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "roam-fadeIn 200ms ease-out both",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Choose your view"
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--surface-card, #f4efe6)",
          borderRadius: "var(--r-card)",
          overflow: "hidden",
          animation: "roam-pop 280ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #0d3a5e 0%, var(--brand-sky, #1a6fa6) 100%)",
            padding: "32px 28px 28px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Decorative ring */}
          <div style={{
            position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)",
            width: 240, height: 240, borderRadius: "50%",
            border: "1px solid var(--roam-border)",
            pointerEvents: "none",
          }} />

          <h1 style={{
            margin: "0 0 10px",
            fontSize: 24, fontWeight: 900,
            color: "var(--on-color)", lineHeight: 1.2,
          }}>
            How do you like your maps?
          </h1>

          <p style={{
            margin: 0,
            fontSize: 15, fontWeight: 500,
            color: "rgba(255,255,255,0.80)",
            lineHeight: 1.55,
          }}>
            Pick the view that suits you best. You can always change this later in Plans.
          </p>
        </div>

        {/* Options */}
        <div style={{ padding: "20px 20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Simple option */}
          <button
            type="button"
            onClick={() => pick("simple")}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "18px 18px",
              minHeight: 48,
              borderRadius: "var(--r-card)",
              background: "var(--roam-surface-hover, rgba(26,22,19,0.04))",
              border: "2px solid var(--brand-eucalypt, #2d6e40)",
              boxShadow: "0 2px 8px rgba(45,110,64,0.12)",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              transition: "transform 0.1s ease",
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.97)"; }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: "var(--r-card)",
              background: "rgba(45,110,64,0.10)",
              display: "grid", placeItems: "center", flexShrink: 0,
            }}>
              <Compass size={28} strokeWidth={1.8} style={{ color: "var(--brand-eucalypt, #2d6e40)" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 18, fontWeight: 900,
                color: "var(--roam-text, #1a1613)",
                marginBottom: 3,
              }}>
                Simple
              </div>
              <div style={{
                fontSize: 14, fontWeight: 500,
                color: "var(--roam-text-muted, #7a7067)",
                lineHeight: 1.4,
              }}>
                Big text, fewer buttons. Just the map, your stops, and the road ahead.
              </div>
            </div>
          </button>

          {/* Full option */}
          <button
            type="button"
            onClick={() => pick("full")}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "18px 18px",
              minHeight: 48,
              borderRadius: "var(--r-card)",
              background: "var(--roam-surface-hover, rgba(26,22,19,0.04))",
              border: "2px solid transparent",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              transition: "transform 0.1s ease",
            }}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.97)"; }}
            onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
            onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: "var(--r-card)",
              background: "rgba(26,111,166,0.10)",
              display: "grid", placeItems: "center", flexShrink: 0,
            }}>
              <Map size={28} strokeWidth={1.8} style={{ color: "var(--brand-sky, #1a6fa6)" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 18, fontWeight: 900,
                color: "var(--roam-text, #1a1613)",
                marginBottom: 3,
              }}>
                Everything
              </div>
              <div style={{
                fontSize: 14, fontWeight: 500,
                color: "var(--roam-text-muted, #7a7067)",
                lineHeight: 1.4,
              }}>
                All overlays, reports, trip sharing, fuel intel, and every tool Roam offers.
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
