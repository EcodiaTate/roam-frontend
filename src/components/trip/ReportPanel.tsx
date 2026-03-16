// src/components/trip/ReportPanel.tsx
"use client";

/**
 * ReportPanel
 *
 * Quick-report overlay for submitting crowd-sourced road observations.
 * Triggered from a FAB on the trip map. Shows a grid of observation
 * type buttons, optional message input, and submit.
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

type ReportPanelProps = {
  position: RoamPosition | null;
  onSubmit: (req: ObservationSubmitRequest) => Promise<unknown>;
  onClose: () => void;
};

const REPORT_OPTIONS: {
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

export function ReportPanel({ position, onSubmit, onClose }: ReportPanelProps) {
  const [selected, setSelected] = useState<ObservationType | null>(null);
  const [message, setMessage] = useState("");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const handleSelect = useCallback((type: ObservationType) => {
    setSelected(type);
    if (isNative && hasPlugin("Haptics")) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selected || !position) return;

    setSubmitting(true);
    const option = REPORT_OPTIONS.find((o) => o.type === selected)!;

    try {
      await onSubmit({
        type: selected,
        severity: option.severity,
        lat: position.lat,
        lng: position.lng,
        heading_deg: position.heading,
        message: message.trim() || null,
        value: value.trim() || null,
      });

      if (isNative && hasPlugin("Haptics")) {
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      }

      setSubmitted(true);
      setTimeout(onClose, 1200);
    } catch {
      setSubmitting(false);
    }
  }, [selected, position, message, value, onSubmit, onClose]);

  if (submitted) {
    return (
      <div className="report-panel" data-mounted>
        <div className="report-success">
          <div className="report-success-icon">
            <CheckCircle size={32} strokeWidth={2} />
          </div>
          <span className="report-success-text">
            Report submitted — thanks for helping fellow roamers!
          </span>
        </div>
        <style>{panelStyles}</style>
      </div>
    );
  }

  return (
    <div className="report-panel" data-mounted={mounted || undefined}>
      <div className="report-header">
        <span className="report-title">Report road intel</span>
        <button onClick={onClose} className="report-close" aria-label="Close">
          <X size={18} strokeWidth={2.5} />
        </button>
      </div>

      <div className="report-grid">
        {REPORT_OPTIONS.map((opt, i) => {
          const isSelected = selected === opt.type;
          const Icon = opt.icon;
          return (
            <button
              key={opt.type}
              onClick={() => handleSelect(opt.type)}
              className={`report-type-btn${isSelected ? " selected" : ""}`}
              style={{
                "--btn-accent": opt.accent,
                animationDelay: `${i * 40}ms`,
              } as React.CSSProperties}
            >
              <div className="report-type-icon">
                <Icon size={20} strokeWidth={isSelected ? 2.2 : 1.8} />
              </div>
              <span className="report-type-label">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="report-details" ref={detailsRef}>
          {selected === "fuel_price" && (
            <input
              type="number"
              placeholder="Price (c/L) e.g. 189.9"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="report-input"
              inputMode="decimal"
            />
          )}
          {selected === "road_condition" && (
            <input
              type="text"
              placeholder="e.g. corrugated, pothole, washed out"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="report-input"
            />
          )}
          <input
            type="text"
            placeholder="Optional note for other roamers..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="report-input"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !position}
            className="report-submit"
          >
            <Send size={16} strokeWidth={2.5} />
            {submitting ? "Sending..." : "Submit report"}
          </button>
        </div>
      )}

      {!position ? (
        <p className="report-no-gps">
          <MapPinOff size={14} strokeWidth={2} />
          Waiting for GPS fix...
        </p>
      ) : (
        <p className="report-marker-hint">
          <MapPin size={14} strokeWidth={2} />
          Tap or drag the pin on the map to set location
        </p>
      )}
      <style>{panelStyles}</style>
    </div>
  );
}

const panelStyles = /* css */ `
  @keyframes report-enter {
    from { opacity: 0; transform: translateY(8px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes report-item-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes report-details-in {
    from { opacity: 0; transform: translateY(4px); height: 0; }
    to { opacity: 1; transform: translateY(0); height: auto; }
  }
  @keyframes report-success-pop {
    0% { opacity: 0; transform: scale(0.6); }
    60% { transform: scale(1.08); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes report-check-draw {
    from { stroke-dashoffset: 60; }
    to { stroke-dashoffset: 0; }
  }
  @keyframes report-pulse-ring {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--brand-eucalypt) 30%, transparent); }
    100% { box-shadow: 0 0 0 12px transparent; }
  }

  .report-panel {
    padding: var(--space-lg);
    background: color-mix(in srgb, var(--surface-card) 92%, transparent);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: var(--r-card);
    box-shadow: var(--shadow-heavy), 0 0 0 1px color-mix(in srgb, var(--roam-border) 40%, transparent);
    max-width: 360px;
    width: 100%;
    opacity: 0;
    transform: translateY(8px) scale(0.97);
    transition: opacity var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--spring);
  }
  .report-panel[data-mounted] {
    opacity: 1;
    transform: translateY(0) scale(1);
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
    padding: 6px;
    border-radius: var(--r-pill);
    display: flex;
    align-items: center;
    justify-content: center;
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
    margin-bottom: var(--space-md);
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
  }

  .report-type-btn.selected {
    background: color-mix(in srgb, var(--btn-accent) 12%, transparent);
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
  .report-type-btn.selected .report-type-icon {
    background: var(--btn-accent);
    color: var(--on-color);
    transform: scale(1.05);
  }

  .report-type-label {
    font-size: var(--font-sm);
    font-weight: 500;
    color: var(--text-main);
    transition: color var(--dur-fast) var(--ease-out);
  }
  .report-type-btn.selected .report-type-label {
    font-weight: 600;
  }

  .report-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    animation: report-details-in var(--dur-slow) var(--ease-out) both;
    overflow: hidden;
  }

  .report-input {
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--r-btn);
    border: 1.5px solid transparent;
    background: color-mix(in srgb, var(--surface-raised) 80%, transparent);
    font-size: var(--font-sm);
    color: var(--text-main);
    outline: none;
    width: 100%;
    transition: border-color var(--dur-normal) var(--ease-out), background var(--dur-normal) var(--ease-out);
  }
  .report-input::placeholder {
    color: var(--text-muted);
    opacity: 0.7;
  }
  .report-input:focus {
    border-color: var(--brand-eucalypt);
    background: var(--surface-raised);
  }

  .report-submit {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--r-btn);
    border: none;
    background: var(--brand-eucalypt);
    color: var(--on-color);
    font-size: var(--font-body);
    font-weight: 700;
    cursor: pointer;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      transform var(--dur-fast) var(--spring),
      box-shadow var(--dur-normal) var(--ease-out);
    margin-top: var(--space-xxs);
  }
  .report-submit:hover:not(:disabled) {
    box-shadow: 0 4px 16px color-mix(in srgb, var(--brand-eucalypt) 35%, transparent);
    transform: translateY(-1px);
  }
  .report-submit:active:not(:disabled) {
    transform: scale(0.98) translateY(0);
  }
  .report-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .report-success {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-2xl) var(--space-lg);
  }
  .report-success-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--brand-eucalypt) 12%, transparent);
    color: var(--brand-eucalypt);
    animation: report-success-pop var(--dur-slow) var(--spring) both, report-pulse-ring 1s var(--ease-out) 0.3s;
  }
  .report-success-text {
    font-size: var(--font-body);
    font-weight: 600;
    color: var(--text-main);
    text-align: center;
    animation: report-item-in var(--dur-slow) var(--ease-out) 0.15s both;
  }

  .report-no-gps {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xxs);
    font-size: var(--font-xs);
    color: var(--text-muted);
    text-align: center;
    margin-top: var(--space-sm);
    animation: report-item-in var(--dur-slow) var(--ease-out) both;
  }

  .report-marker-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xxs);
    font-size: var(--font-xs);
    color: var(--brand-eucalypt);
    text-align: center;
    margin-top: var(--space-sm);
    animation: report-item-in var(--dur-slow) var(--ease-out) both;
    opacity: 0.8;
  }
`;
