"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { haptic } from "@/lib/native/haptics";
import { Map, Route, Download, AudioLines, Fuel, Sparkles } from "lucide-react";

type Props = {
  open: boolean;
  /** Trip 2 warning: "this is your last free trip" */
  lastFreeTrip?: boolean;
  onClose: () => void;
};

export function WelcomeModal({ open, lastFreeTrip = false, onClose }: Props) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!mounted || !open) return null;

  const handleStart = () => {
    haptic.medium();
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(10, 8, 6, 0.75)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--surface-card, #f4efe6)",
          borderRadius: "28px 28px 0 0",
          overflow: "hidden",
          paddingBottom: "var(--bottom-nav-height, calc(80px + env(safe-area-inset-bottom, 0px)))",
        }}
      >
        {/* Hero */}
        <div
          style={{
            background: lastFreeTrip
              ? "linear-gradient(135deg, #7a3d00 0%, var(--brand-amber, #b8872a) 100%)"
              : "linear-gradient(135deg, #0d3a5e 0%, var(--brand-sky, #1a6fa6) 100%)",
            padding: "36px 28px 32px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Decorative ring */}
          <div style={{
            position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)",
            width: 280, height: 280, borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.07)",
            pointerEvents: "none",
          }} />

          <div style={{ marginBottom: 14, color: "rgba(255,255,255,0.9)" }}>
            {lastFreeTrip ? <Route size={48} strokeWidth={1.5} /> : <Map size={48} strokeWidth={1.5} />}
          </div>

          <h1 style={{
            margin: "0 0 10px",
            fontSize: 24, fontWeight: 900,
            color: "#fff", lineHeight: 1.2,
          }}>
            {lastFreeTrip
              ? "Make this one count"
              : "Welcome to Roam"}
          </h1>

          <p style={{
            margin: 0,
            fontSize: 15, fontWeight: 500,
            color: "rgba(255,255,255,0.80)",
            lineHeight: 1.55,
          }}>
            {lastFreeTrip
              ? "This is your last free trip. Explore every feature - offline maps, the AI guide, turn-by-turn nav. If you love it, Roam Untethered is $19.99, one-time."
              : "Your first two trips are completely free. No credit card needed - just tap, plan, and go."}
          </p>
        </div>

        {/* Bullets */}
        {!lastFreeTrip && (
          <div style={{ padding: "20px 28px 4px" }}>
            {([
              [<Download size={18} key="dl" />, "Beautiful offline maps that work without signal"],
              [<AudioLines size={18} key="audio" />, "Turn-by-turn navigation with voice guidance"],
              [<Fuel size={18} key="fuel" />, "Fuel range alerts so you never run dry in the outback"],
              [<Sparkles size={18} key="ai" />, "AI co-pilot - fuel stops, hazards & local knowledge"],
            ] as const).map(([icon, text]) => (
              <div key={text} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 0",
                borderBottom: "1px solid var(--roam-border, rgba(26,22,19,0.07))",
              }}>
                <span style={{ width: 28, textAlign: "center", flexShrink: 0, color: "var(--brand-eucalypt, #2d6e40)", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--roam-text, #1a1613)", lineHeight: 1.4 }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div style={{ padding: "20px 28px 24px" }}>
          <button
            type="button"
            onClick={handleStart}
            style={{
              width: "100%",
              background: lastFreeTrip
                ? "linear-gradient(135deg, #7a3d00 0%, var(--brand-amber, #b8872a) 100%)"
                : "linear-gradient(135deg, var(--brand-eucalypt-dark, #1f5236) 0%, var(--brand-eucalypt, #2d6e40) 100%)",
              color: "var(--on-color, #faf6ef)",
              border: "none",
              padding: "16px",
              borderRadius: "var(--r-btn, 14px)",
              fontSize: 16,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: lastFreeTrip
                ? "0 4px 16px rgba(122,61,0,0.30)"
                : "0 4px 16px rgba(31,82,54,0.30)",
            }}
          >
            {lastFreeTrip ? "Plan my last free trip →" : "Let's go →"}
          </button>

          {!lastFreeTrip && (
            <p style={{
              margin: "12px 0 0",
              textAlign: "center",
              fontSize: 12, fontWeight: 500,
              color: "var(--roam-text-muted, #7a7067)",
              lineHeight: 1.5,
            }}>
              After 2 free trips, go Untethered for $19.99 - one-time, no subscription.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
