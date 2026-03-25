// src/components/trip/ExchangePanel.tsx

/**
 * ExchangePanel
 *
 * Full-screen modal for ultrasonic peer-to-peer data exchange.
 * Two roamers stop near each other, each opens this panel,
 * one taps "Share", the other taps "Listen". Data flows
 * both ways automatically.
 */

import { useEffect, useRef, useState } from "react";
import { X, Volume2, Mic, ArrowRightLeft, CheckCircle, AlertTriangle, Radio, Navigation } from "lucide-react";
import { useRoamExchange, type ExchangePhase } from "@/lib/peer/useRoamExchange";
import { estimateTransferSeconds } from "@/lib/peer/ultrasonicTransfer";
import { haptic } from "@/lib/native/haptics";
import type { NearbyRoamer } from "@/lib/types/peer";
import { cardinalDir } from "@/lib/nav/geo";

type ExchangePanelProps = {
  open: boolean;
  onClose: () => void;
  nearbyRoamers?: NearbyRoamer[];
};

const PHASE_CONFIG: Record<ExchangePhase, { color: string; icon: "radio" | "volume" | "mic" | "switch" | "check" | "alert" }> = {
  idle: { color: "var(--text-muted)", icon: "radio" },
  preparing: { color: "var(--brand-amber)", icon: "radio" },
  sending: { color: "var(--brand-eucalypt)", icon: "volume" },
  listening: { color: "var(--brand-sky)", icon: "mic" },
  receiving: { color: "var(--brand-sky)", icon: "mic" },
  processing: { color: "var(--brand-amber)", icon: "radio" },
  switching: { color: "var(--brand-amber)", icon: "switch" },
  complete: { color: "var(--brand-eucalypt)", icon: "check" },
  error: { color: "var(--brand-ochre)", icon: "alert" },
};

function PhaseIcon({ phase, size = 32 }: { phase: ExchangePhase; size?: number }) {
  const cfg = PHASE_CONFIG[phase];
  const props = { size, strokeWidth: 2 };
  switch (cfg.icon) {
    case "radio": return <Radio {...props} />;
    case "volume": return <Volume2 {...props} />;
    case "mic": return <Mic {...props} />;
    case "switch": return <ArrowRightLeft {...props} />;
    case "check": return <CheckCircle {...props} />;
    case "alert": return <AlertTriangle {...props} />;
  }
}

function confidenceColor(c: string): string {
  if (c === "high") return "var(--brand-eucalypt, #2d6e40)";
  if (c === "medium") return "var(--brand-amber, #c8973a)";
  return "var(--text-muted, #7a7067)";
}

export function ExchangePanel({ open, onClose, nearbyRoamers = [] }: ExchangePanelProps) {
  const { state, startGive, startListen, cancel, reset } = useRoamExchange();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
    } else {
      setMounted(false);
      closeTimerRef.current = setTimeout(() => setVisible(false), 370);
    }
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); };
  }, [open]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => setMounted(true));
    else setMounted(false);
  }, [visible]);

  if (!visible) return null;

  const isActive = state.phase !== "idle" && state.phase !== "complete" && state.phase !== "error";
  const cfg = PHASE_CONFIG[state.phase];

  const handleClose = () => {
    if (isActive) cancel();
    else reset();
    onClose();
  };

  return (
    <div
      className="exchange-backdrop"
      data-mounted={mounted || undefined}
      onClick={(e) => { if (e.target === e.currentTarget && !isActive) handleClose(); }}
    >
      <div className="exchange-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="exchange-header">
          <span className="exchange-title">Roam Exchange</span>
          <button onClick={handleClose} className="exchange-close" aria-label="Close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Visualization */}
        <div className="exchange-viz">
          <div className="exchange-icon-ring" style={{ "--ring-color": cfg.color } as React.CSSProperties}>
            <div className="exchange-icon-inner" style={{ color: cfg.color }}>
              <PhaseIcon phase={state.phase} size={40} />
            </div>
            {(state.phase === "sending" || state.phase === "receiving" || state.phase === "listening") && (
              <div className="exchange-pulse-rings">
                <div className="exchange-pulse-ring" style={{ animationDelay: "0s" }} />
                <div className="exchange-pulse-ring" style={{ animationDelay: "0.6s" }} />
                <div className="exchange-pulse-ring" style={{ animationDelay: "1.2s" }} />
              </div>
            )}
          </div>

          {/* Progress bar */}
          {(state.phase === "sending" || state.phase === "receiving") && (
            <div className="exchange-progress-track">
              <div
                className="exchange-progress-bar"
                style={{ width: `${Math.max(2, state.progress)}%`, background: cfg.color }}
              />
            </div>
          )}

          <p className="exchange-message">{state.message}</p>

          {/* Stats */}
          {(state.itemsSent > 0 || state.itemsReceived > 0) && (
            <div className="exchange-stats">
              {state.itemsSent > 0 && (
                <div className="exchange-stat">
                  <Volume2 size={14} strokeWidth={2} />
                  <span>{state.itemsSent} sent ({state.bytesSent}b)</span>
                </div>
              )}
              {state.itemsReceived > 0 && (
                <div className="exchange-stat">
                  <Mic size={14} strokeWidth={2} />
                  <span>{state.itemsReceived} received ({state.bytesReceived}b)</span>
                </div>
              )}
            </div>
          )}

          {/* Round indicators */}
          {state.roundsComplete > 0 && (
            <div className="exchange-rounds">
              <div className={`exchange-round-dot${state.roundsComplete >= 1 ? " done" : ""}`} />
              <div className="exchange-round-line" />
              <div className={`exchange-round-dot${state.roundsComplete >= 2 ? " done" : ""}`} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="exchange-actions">
          {state.phase === "idle" && (
            <>
              {/* Nearby roamers list */}
              {nearbyRoamers.length > 0 && (
                <div className="exchange-roamers">
                  <div className="exchange-roamers-header">
                    <span className="exchange-roamers-badge">{nearbyRoamers.length}</span>
                    <span className="exchange-roamers-label">
                      roamer{nearbyRoamers.length > 1 ? "s" : ""} nearby
                    </span>
                  </div>
                  <div className="exchange-roamers-list">
                    {nearbyRoamers.map((r) => (
                      <div key={r.user_id} className="exchange-roamer-row">
                        <div className="exchange-roamer-dist">
                          <Navigation size={12} strokeWidth={2.5} style={{
                            transform: `rotate(${r.heading_deg}deg)`,
                            color: confidenceColor(r.confidence),
                            flexShrink: 0,
                          }} />
                          <span>~{r.distance_km}km</span>
                        </div>
                        <span className="exchange-roamer-detail">
                          {cardinalDir(r.heading_deg)} &middot; {Math.round(r.speed_kmh)}km/h
                        </span>
                        <span
                          className="exchange-roamer-conf"
                          style={{ background: confidenceColor(r.confidence) }}
                          title={`Confidence: ${r.confidence}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="exchange-hint">
                {nearbyRoamers.length > 0
                  ? "Pull over nearby, then one taps Share and the other taps Listen."
                  : "Both roamers open this panel. One taps Share, the other taps Listen."}
              </p>
              <div className="exchange-btn-row">
                <button
                  className="exchange-btn exchange-btn-give"
                  onClick={() => { haptic.medium(); startGive(); }}
                >
                  <Volume2 size={20} strokeWidth={2.5} />
                  Share first
                </button>
                <button
                  className="exchange-btn exchange-btn-listen"
                  onClick={() => { haptic.medium(); startListen(); }}
                >
                  <Mic size={20} strokeWidth={2.5} />
                  Listen first
                </button>
              </div>
            </>
          )}

          {isActive && (
            <button className="exchange-btn exchange-btn-cancel" onClick={() => { haptic.light(); cancel(); }}>
              Cancel
            </button>
          )}

          {state.phase === "complete" && (
            <button className="exchange-btn exchange-btn-done" onClick={handleClose}>
              Done
            </button>
          )}

          {state.phase === "error" && (
            <div className="exchange-error-actions">
              <p className="exchange-error-msg">{state.error}</p>
              <button className="exchange-btn exchange-btn-retry" onClick={() => { reset(); }}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{panelStyles}</style>
    </div>
  );
}

const panelStyles = /* css */ `
  .exchange-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(120, 110, 95, 0.35);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    opacity: 0;
    transition: opacity var(--dur-slow, 350ms) var(--ease-out, ease-out);
  }
  .exchange-backdrop[data-mounted] {
    opacity: 1;
  }
  @media (prefers-color-scheme: dark) {
    .exchange-backdrop {
      background: rgba(10, 8, 6, 0.55);
    }
  }

  .exchange-panel {
    width: 100%;
    max-width: 380px;
    min-height: 320px;
    max-height: calc(100dvh - 100px);
    display: flex;
    flex-direction: column;
    background: var(--surface-card, #f4efe6);
    border-radius: var(--r-card, 24px);
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(40,32,20,0.13), 0 0 0 1px rgba(0,0,0,0.06);
    transform: translateY(10px) scale(0.97);
    transition: transform var(--dur-slow, 350ms) var(--spring, cubic-bezier(0.34,1.56,0.64,1));
  }
  .exchange-backdrop[data-mounted] .exchange-panel {
    transform: translateY(0) scale(1);
  }
  @media (prefers-color-scheme: dark) {
    .exchange-panel {
      box-shadow: 0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06);
    }
  }

  .exchange-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 20px 0;
  }
  .exchange-title {
    font-size: 20px;
    font-weight: 800;
    color: var(--text-main, #1a1613);
    letter-spacing: -0.02em;
  }
  .exchange-close {
    background: none;
    border: none;
    color: var(--text-muted, #7a7067);
    cursor: pointer;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s ease;
  }
  .exchange-close:active {
    background: rgba(0, 0, 0, 0.08);
  }

  .exchange-viz {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 20px 20px;
    gap: 16px;
    flex: 1;
  }

  .exchange-icon-ring {
    position: relative;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--ring-color) 10%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .exchange-icon-inner {
    z-index: 1;
    transition: color var(--dur-normal, 200ms) var(--ease-out, ease-out);
  }

  .exchange-pulse-rings {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .exchange-pulse-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid var(--ring-color);
    opacity: 0;
    animation: exchange-pulse 1.8s var(--ease-out, ease-out) infinite;
  }
  @keyframes exchange-pulse {
    0% { transform: scale(1); opacity: 0.5; }
    100% { transform: scale(2); opacity: 0; }
  }

  .exchange-progress-track {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: var(--roam-border, rgba(26,22,19,0.08));
    overflow: hidden;
  }
  .exchange-progress-bar {
    height: 100%;
    border-radius: 2px;
    transition: width 200ms linear;
  }

  .exchange-message {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-main, #1a1613);
    text-align: center;
    margin: 0;
    min-height: 20px;
  }

  .exchange-stats {
    display: flex;
    gap: 16px;
  }
  .exchange-stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted, #7a7067);
  }

  .exchange-rounds {
    display: flex;
    align-items: center;
    gap: 0;
    margin-top: 4px;
  }
  .exchange-round-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--roam-border, rgba(26,22,19,0.08));
    transition: background var(--dur-normal, 200ms) var(--ease-out, ease-out);
  }
  .exchange-round-dot.done {
    background: var(--brand-eucalypt, #2d6e40);
  }
  .exchange-round-line {
    width: 40px;
    height: 2px;
    background: var(--roam-border, rgba(26,22,19,0.08));
  }

  .exchange-roamers {
    margin-bottom: 12px;
    width: 100%;
  }
  .exchange-roamers-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .exchange-roamers-badge {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    background: var(--brand-eucalypt, #2d6e40);
    color: #fff;
    font-size: 12px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .exchange-roamers-label {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-main, #1a1613);
  }
  .exchange-roamers-list {
    background: var(--surface-muted, #e3dccf);
    border-radius: var(--r-btn, 14px);
    overflow: hidden;
  }
  .exchange-roamer-row {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    gap: 8px;
  }
  .exchange-roamer-row + .exchange-roamer-row {
    border-top: 1px solid var(--roam-border, rgba(26,22,19,0.08));
  }
  .exchange-roamer-dist {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-main, #1a1613);
    min-width: 64px;
  }
  .exchange-roamer-detail {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted, #7a7067);
  }
  .exchange-roamer-conf {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .exchange-hint {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted, #7a7067);
    text-align: center;
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .exchange-actions {
    padding: 0 20px 24px;
  }

  .exchange-btn-row {
    display: flex;
    gap: 8px;
  }

  .exchange-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px;
    border-radius: var(--r-btn, 14px);
    border: none;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: transform var(--dur-fast, 120ms) var(--spring, ease), opacity var(--dur-fast, 120ms) var(--ease-out, ease-out);
  }
  .exchange-btn:active {
    transform: scale(0.97);
  }

  .exchange-btn-give {
    background: var(--brand-eucalypt, #2d6e40);
    color: var(--on-color, #faf6ef);
  }
  .exchange-btn-listen {
    background: var(--brand-sky, #1a6fa6);
    color: var(--on-color, #faf6ef);
  }
  .exchange-btn-cancel {
    background: var(--surface-muted, #e3dccf);
    color: var(--text-main, #1a1613);
  }
  .exchange-btn-done {
    background: var(--brand-eucalypt, #2d6e40);
    color: var(--on-color, #faf6ef);
    width: 100%;
  }
  .exchange-btn-retry {
    background: var(--brand-ochre, #b5452e);
    color: var(--on-color, #faf6ef);
    width: 100%;
  }

  .exchange-error-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .exchange-error-msg {
    font-size: 13px;
    font-weight: 600;
    color: var(--brand-ochre, #b5452e);
    text-align: center;
    margin: 0;
    line-height: 1.4;
  }
`;
