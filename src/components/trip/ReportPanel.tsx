// src/components/trip/ReportPanel.tsx
"use client";

/**
 * ReportPanel - Two-phase crowd-sourced road observation reporter.
 *
 * Phase 1 (type picker): Full overlay grid of observation types.
 *   User taps a type → fires onTypeSelected, panel disappears, map zooms
 *   in with a draggable marker (managed by ClientPage).
 *
 * Phase 2 (placement bar): Compact frosted bar at the bottom of the map.
 *   Shows selected type, optional detail inputs, submit/cancel.
 *   The marker position is passed in via `position`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { hasPlugin, isNative } from "@/lib/native/platform";
import {
    Construction,
    CircleSlash,
    AlertTriangle,
    Fuel,
    Camera,
    CloudRain,
    Tent,
    MessageCircle,
    X,
    Send,
    CheckCircle,
    MapPinOff,
    MapPin,
} from "lucide-react";
import type {
    ObservationType,
    ObservationSeverity,
    ObservationSubmitRequest,
} from "@/lib/types/peer";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { LucideIcon } from "lucide-react";

/* ── Shared option definitions ── */

export const REPORT_OPTIONS: {
  type: ObservationType;
  label: string;
  icon: LucideIcon;
  severity: ObservationSeverity;
  accent: string;
}[] = [
  { type: "road_condition", label: "Road condition", icon: Construction, severity: "caution", accent: "var(--brand-amber)" },
  { type: "road_closure", label: "Road closed", icon: CircleSlash, severity: "danger", accent: "var(--brand-ochre)" },
  { type: "hazard", label: "Hazard", icon: AlertTriangle, severity: "warning", accent: "var(--brand-amber)" },
  { type: "fuel_price", label: "Fuel price", icon: Fuel, severity: "info", accent: "var(--brand-sky)" },
  { type: "speed_trap", label: "Speed check", icon: Camera, severity: "caution", accent: "var(--brand-amber)" },
  { type: "weather", label: "Weather", icon: CloudRain, severity: "caution", accent: "var(--brand-sky)" },
  { type: "campsite", label: "Campsite update", icon: Tent, severity: "info", accent: "var(--brand-eucalypt)" },
  { type: "general", label: "General", icon: MessageCircle, severity: "info", accent: "var(--text-muted)" },
];

/* ═══════════════════════════════════════════════════════════════
   Phase 1 - Type Picker
   ═══════════════════════════════════════════════════════════════ */

type TypePickerProps = {
  onTypeSelected: (type: ObservationType) => void;
  onClose: () => void;
};

export function ReportTypePicker({ onTypeSelected, onClose }: TypePickerProps) {
  const [mounted, setMounted] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); };
  }, []);

  const handleClose = useCallback(() => {
    setMounted(false);
    closeTimerRef.current = setTimeout(onClose, 370);
  }, [onClose]);

  const handleSelect = useCallback(
    (type: ObservationType) => {
      if (isNative && hasPlugin("Haptics")) {
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      }
      onTypeSelected(type);
    },
    [onTypeSelected],
  );

  return (
    <div
      className="report-backdrop"
      data-mounted={mounted || undefined}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="report-panel" onClick={(e) => e.stopPropagation()}>
        <div className="report-header">
          <span className="report-title">Report road intel</span>
          <button onClick={handleClose} className="report-close" aria-label="Close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="report-grid">
          {REPORT_OPTIONS.map((opt, i) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.type}
                onClick={() => handleSelect(opt.type)}
                className="report-type-btn"
                style={{
                  "--btn-accent": opt.accent,
                  animationDelay: `${i * 40}ms`,
                } as React.CSSProperties}
              >
                <div className="report-type-icon">
                  <Icon size={20} strokeWidth={1.8} />
                </div>
                <span className="report-type-label">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <p className="report-marker-hint">
          <MapPin size={14} strokeWidth={2} />
          Select a type, then place it on the map
        </p>
      </div>

      <style>{pickerStyles}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Phase 2 - Placement Bar (compact, floats at bottom of map)
   ═══════════════════════════════════════════════════════════════ */

type PlacementBarProps = {
  type: ObservationType;
  position: RoamPosition | null;
  onSubmit: (req: ObservationSubmitRequest) => Promise<unknown>;
  onCancel: () => void;
};

export function ReportPlacementBar({ type, position, onSubmit, onCancel }: PlacementBarProps) {
  const [message, setMessage] = useState("");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const option = REPORT_OPTIONS.find((o) => o.type === type)!;
  const Icon = option.icon;

  const handleSubmit = useCallback(async () => {
    if (!position) return;

    // Optimistic: show success immediately, submit in background
    if (isNative && hasPlugin("Haptics")) {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    }
    setSubmitted(true);
    setTimeout(onCancel, 1200);

    // Fire-and-forget - submit in background
    onSubmit({
      type,
      severity: option.severity,
      lat: position.lat,
      lng: position.lng,
      heading_deg: position.heading,
      message: message.trim() || null,
      value: value.trim() || null,
    }).catch(() => {
      // Silent - observation will be retried or lost. Better UX than blocking.
    });
  }, [type, option.severity, position, message, value, onSubmit, onCancel]);

  if (submitted) {
    return (
      <div className="rp-bar" data-mounted>
        <div className="rp-bar-success">
          <CheckCircle size={20} strokeWidth={2} />
          <span>Report submitted</span>
        </div>
        <style>{barStyles}</style>
      </div>
    );
  }

  return (
    <div className="rp-bar" data-mounted={mounted || undefined}>
      {/* Type indicator + hint */}
      <div className="rp-bar-top">
        <div className="rp-bar-type" style={{ "--btn-accent": option.accent } as React.CSSProperties}>
          <div className="rp-bar-type-icon">
            <Icon size={16} strokeWidth={2} />
          </div>
          <span className="rp-bar-type-label">{option.label}</span>
        </div>

        <span className="rp-bar-hint">
          <MapPin size={12} strokeWidth={2} />
          Tap or drag pin to set location
        </span>

        <button onClick={onCancel} className="rp-bar-cancel" aria-label="Cancel">
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* Optional inputs */}
      <div className="rp-bar-inputs">
        {type === "fuel_price" && (
          <input
            type="number"
            placeholder="Price (c/L)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rp-bar-input"
            inputMode="decimal"
          />
        )}
        {type === "road_condition" && (
          <input
            type="text"
            placeholder="e.g. corrugated, pothole"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rp-bar-input"
          />
        )}
        <input
          type="text"
          placeholder="Optional note..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="rp-bar-input rp-bar-input-msg"
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || !position}
        className="rp-bar-submit"
      >
        <Send size={14} strokeWidth={2.5} />
        {submitting ? "Sending..." : "Submit report"}
      </button>

      {!position && (
        <p className="rp-bar-no-gps">
          <MapPinOff size={12} strokeWidth={2} />
          Waiting for GPS fix...
        </p>
      )}

      <style>{barStyles}</style>
    </div>
  );
}

/* ── Legacy wrapper (unused, kept for compat) ── */
export function ReportPanel(props: {
  position: RoamPosition | null;
  onSubmit: (req: ObservationSubmitRequest) => Promise<unknown>;
  onClose: () => void;
}) {
  return <ReportTypePicker onTypeSelected={() => {}} onClose={props.onClose} />;
}

/* ═══════════════════════════════════════════════════════════════
   Styles - Phase 1 (Type Picker)
   ═══════════════════════════════════════════════════════════════ */

const pickerStyles = /* css */ `
  @keyframes report-item-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .report-backdrop {
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
  .report-backdrop[data-mounted] {
    opacity: 1;
  }
  @media (prefers-color-scheme: dark) {
    .report-backdrop {
      background: rgba(10, 8, 6, 0.55);
    }
  }

  .report-panel {
    padding: var(--space-lg);
    background: var(--surface-card);
    border-radius: var(--r-card);
    box-shadow: 0 12px 40px rgba(40,32,20,0.13), 0 0 0 1px color-mix(in srgb, var(--roam-border) 40%, transparent);
    width: 100%;
    max-width: 380px;
    min-height: 320px;
    max-height: calc(100dvh - 100px);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    transform: translateY(10px) scale(0.97);
    transition: transform var(--dur-slow) var(--spring);
  }
  .report-backdrop[data-mounted] .report-panel {
    transform: translateY(0) scale(1);
  }
  @media (prefers-color-scheme: dark) {
    .report-panel {
      box-shadow: 0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px color-mix(in srgb, var(--roam-border) 40%, transparent);
    }
  }

  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }
  .report-title {
    font-size: var(--font-title);
    font-weight: 700;
    color: var(--text-main);
    letter-spacing: -0.01em;
  }
  .report-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  }
  .report-close:hover {
    background: color-mix(in srgb, var(--text-muted) 12%, transparent);
    color: var(--text-main);
  }
  .report-close:active {
    transform: scale(0.92);
  }

  .report-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-xs);
    margin-bottom: var(--space-sm);
    flex: 1;
    align-content: start;
  }

  .report-type-btn {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--r-btn);
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition:
      background var(--dur-normal) var(--ease-out),
      transform var(--dur-fast) var(--spring);
    animation: report-item-in var(--dur-slow) var(--ease-out) both;
  }
  .report-type-btn:hover {
    background: color-mix(in srgb, var(--btn-accent) 8%, transparent);
  }
  .report-type-btn:active {
    transform: scale(0.97);
    background: color-mix(in srgb, var(--btn-accent) 16%, transparent);
  }

  .report-type-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--btn-accent) 12%, transparent);
    color: var(--btn-accent);
    flex-shrink: 0;
    transition:
      background var(--dur-normal) var(--ease-out),
      color var(--dur-normal) var(--ease-out),
      transform var(--dur-fast) var(--spring);
  }

  .report-type-label {
    font-size: var(--font-sm);
    font-weight: 500;
    color: var(--text-main);
  }

  .report-marker-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xxs);
    font-size: var(--font-xs);
    color: var(--text-muted);
    text-align: center;
    margin-top: var(--space-xs);
    animation: report-item-in var(--dur-slow) var(--ease-out) both;
    opacity: 0.7;
  }
`;

/* ═══════════════════════════════════════════════════════════════
   Styles - Phase 2 (Placement Bar)
   ═══════════════════════════════════════════════════════════════ */

const barStyles = /* css */ `
  @keyframes rp-bar-in {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes rp-bar-success-pop {
    0% { opacity: 0; transform: scale(0.8); }
    60% { transform: scale(1.04); }
    100% { opacity: 1; transform: scale(1); }
  }

  .rp-bar {
    padding: 12px 14px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-radius: 18px;
    box-shadow:
      0 8px 40px rgba(0,0,0,0.12),
      0 1px 3px rgba(0,0,0,0.08),
      inset 0 0.5px 0 rgba(255,255,255,0.8);
    width: 100%;
    max-width: 400px;
    opacity: 0;
    transform: translateY(12px);
    transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
  }
  .rp-bar[data-mounted] {
    opacity: 1;
    transform: translateY(0);
  }
  @media (prefers-color-scheme: dark) {
    .rp-bar {
      background: rgba(22, 22, 22, 0.92);
      box-shadow:
        0 8px 40px rgba(0,0,0,0.45),
        0 1px 3px rgba(0,0,0,0.2),
        inset 0 0.5px 0 rgba(255,255,255,0.06);
    }
  }

  .rp-bar-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .rp-bar-type {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .rp-bar-type-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: var(--btn-accent);
    color: white;
  }
  .rp-bar-type-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-main, #1a1613);
    white-space: nowrap;
  }

  .rp-bar-hint {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--text-muted, #7a7067);
    flex: 1;
    justify-content: center;
    white-space: nowrap;
  }

  .rp-bar-cancel {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: none;
    background: rgba(0,0,0,0.06);
    color: var(--text-muted, #7a7067);
    display: grid;
    place-items: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease;
  }
  .rp-bar-cancel:active {
    background: rgba(0,0,0,0.12);
  }
  @media (prefers-color-scheme: dark) {
    .rp-bar-cancel {
      background: rgba(255,255,255,0.08);
    }
    .rp-bar-cancel:active {
      background: rgba(255,255,255,0.15);
    }
  }

  .rp-bar-inputs {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .rp-bar-input {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border-radius: 10px;
    border: 1px solid rgba(0,0,0,0.08);
    background: rgba(0,0,0,0.04);
    font-size: 13px;
    color: var(--text-main, #1a1613);
    outline: none;
    transition: border-color 0.15s ease;
  }
  .rp-bar-input::placeholder {
    color: var(--text-muted, #7a7067);
    opacity: 0.7;
  }
  .rp-bar-input:focus {
    border-color: rgba(74,108,83,0.6);
  }
  @media (prefers-color-scheme: dark) {
    .rp-bar-input {
      border-color: rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.06);
    }
  }
  .rp-bar-input-msg {
    flex: 2;
  }

  .rp-bar-submit {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 12px 14px;
    min-height: 44px;
    box-sizing: border-box;
    border-radius: 12px;
    border: none;
    background: var(--brand-eucalypt, #2d6e40);
    color: var(--on-color, #faf6ef);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition:
      opacity 0.12s ease,
      transform 0.12s cubic-bezier(0.34,1.56,0.64,1);
  }
  .rp-bar-submit:active:not(:disabled) {
    transform: scale(0.97);
  }
  .rp-bar-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .rp-bar-success {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 4px 0;
    color: var(--brand-eucalypt, #2d6e40);
    font-size: 14px;
    font-weight: 700;
    animation: rp-bar-success-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
  }

  .rp-bar-no-gps {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 11px;
    color: var(--text-muted, #7a7067);
    opacity: 0.6;
    margin-top: 6px;
  }
`;
