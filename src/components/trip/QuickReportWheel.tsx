// src/components/trip/QuickReportWheel.tsx
"use client";

/**
 * QuickReportWheel
 *
 * Minimal-distraction road report button for active navigation.
 *
 * CLOSED: Single frosted-glass FAB with a radio icon, bottom-left above the
 * arrival card. Tap to open.
 *
 * OPEN: A frosted pill tray slides up from the FAB showing 8 report types
 * as colored icon buttons in a tight 2×4 grid. Tap any icon to submit
 * instantly (no text input, no confirmation step). The tray auto-closes
 * after selection or after 5s of inactivity.
 *
 * Long-press + drag also works: hold the FAB, tray appears, drag thumb
 * over an option (it highlights), release to submit.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Construction,
  CircleSlash,
  AlertTriangle,
  Fuel,
  Camera,
  CloudRain,
  Tent,
  MessageCircle,
  Megaphone,
  Check,
  X,
} from "lucide-react";
import { haptic } from "@/lib/native/haptics";
import type {
  ObservationType,
  ObservationSeverity,
  ObservationSubmitRequest,
} from "@/lib/types/peer";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { LucideIcon } from "lucide-react";

type QuickReportWheelProps = {
  position: RoamPosition | null;
  onSubmit: (req: ObservationSubmitRequest) => Promise<unknown>;
};

type Option = {
  type: ObservationType;
  label: string;
  icon: LucideIcon;
  severity: ObservationSeverity;
  color: string;
};

const OPTIONS: Option[] = [
  { type: "hazard",         label: "Hazard",  icon: AlertTriangle, severity: "warning", color: "#f59e0b" },
  { type: "road_closure",   label: "Closed",  icon: CircleSlash,   severity: "danger",  color: "#ef4444" },
  { type: "road_condition",  label: "Road",    icon: Construction,  severity: "caution", color: "#f97316" },
  { type: "speed_trap",     label: "Speed",   icon: Camera,        severity: "caution", color: "#a855f7" },
  { type: "weather",        label: "Weather", icon: CloudRain,     severity: "caution", color: "#3b82f6" },
  { type: "fuel_price",     label: "Fuel",    icon: Fuel,          severity: "info",    color: "#06b6d4" },
  { type: "campsite",       label: "Camp",    icon: Tent,          severity: "info",    color: "#22c55e" },
  { type: "general",        label: "Other",   icon: MessageCircle, severity: "info",    color: "#64748b" },
];

const LONG_PRESS_MS = 250;
const AUTO_CLOSE_MS = 5000;

export function QuickReportWheel({ position, onSubmit }: QuickReportWheelProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<Option | null>(null);

  const fabRef = useRef<HTMLButtonElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoClose = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDrag = useRef(false);

  // Auto-close after inactivity
  const resetAutoClose = useCallback(() => {
    if (autoClose.current) clearTimeout(autoClose.current);
    autoClose.current = setTimeout(() => {
      setOpen(false);
      setHovered(null);
    }, AUTO_CLOSE_MS);
  }, []);

  useEffect(() => {
    if (open) resetAutoClose();
    return () => { if (autoClose.current) clearTimeout(autoClose.current); };
  }, [open, resetAutoClose]);

  const close = useCallback(() => {
    setOpen(false);
    setHovered(null);
    if (autoClose.current) clearTimeout(autoClose.current);
  }, []);

  const submitReport = useCallback(
    async (idx: number) => {
      if (!position) return;
      const opt = OPTIONS[idx];
      setSubmitted(opt);
      haptic.medium();

      try {
        await onSubmit({
          type: opt.type,
          severity: opt.severity,
          lat: position.lat,
          lng: position.lng,
          heading_deg: position.heading,
          message: null,
          value: null,
        });
      } catch { /* silent */ }

      setTimeout(() => {
        setSubmitted(null);
        setOpen(false);
        setHovered(null);
      }, 900);
    },
    [position, onSubmit],
  );

  /* ── Pointer handlers for FAB (long-press + drag) ── */
  const onFabDown = useCallback(
    (e: ReactPointerEvent) => {
      if (submitted) return;
      isDrag.current = false;
      longPress.current = setTimeout(() => {
        isDrag.current = true;
        setOpen(true);
        haptic.heavy();
      }, LONG_PRESS_MS);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [submitted],
  );

  const onFabMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!isDrag.current || !open || !trayRef.current) return;
      const trayRect = trayRef.current.getBoundingClientRect();
      const btns = trayRef.current.querySelectorAll<HTMLElement>("[data-idx]");
      let closest: number | null = null;
      let closestDist = Infinity;
      btns.forEach((btn) => {
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2);
        if (d < 36 && d < closestDist) {
          closest = Number(btn.dataset.idx);
          closestDist = d;
        }
      });
      // Also check if pointer is outside tray entirely
      const inTray =
        e.clientX >= trayRect.left - 20 &&
        e.clientX <= trayRect.right + 20 &&
        e.clientY >= trayRect.top - 20 &&
        e.clientY <= trayRect.bottom + 20;
      if (!inTray) closest = null;

      if (closest !== hovered) {
        setHovered(closest);
        if (closest !== null) haptic.selection();
      }
    },
    [open, hovered],
  );

  const onFabUp = useCallback(() => {
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
    if (isDrag.current) {
      isDrag.current = false;
      if (hovered !== null) {
        submitReport(hovered);
      } else {
        // Released without selecting anything — close the tray
        close();
      }
    } else if (!open) {
      setOpen(true);
      haptic.tap();
    } else {
      close();
    }
  }, [open, hovered, submitReport, close]);

  /* ── Tap an icon in tap mode ── */
  const onOptionTap = useCallback(
    (idx: number) => {
      if (isDrag.current || submitted) return;
      resetAutoClose();
      submitReport(idx);
    },
    [submitted, submitReport, resetAutoClose],
  );

  /* ── Close on outside tap ── */
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.PointerEvent) => {
      const t = e.target as HTMLElement;
      if (fabRef.current?.contains(t) || trayRef.current?.contains(t)) return;
      close();
    };
    const tid = setTimeout(() => document.addEventListener("pointerdown", handler), 60);
    return () => { clearTimeout(tid); document.removeEventListener("pointerdown", handler); };
  }, [open, close]);

  return (
    <div className="qr-root">
      {/* ── Tray: slides up above the FAB ── */}
      <div
        ref={trayRef}
        className={`qr-tray${open ? " open" : ""}${submitted ? " done" : ""}`}
      >
        <div className="qr-tray-grid">
          {OPTIONS.map((opt, i) => {
            const Icon = opt.icon;
            const isHot = hovered === i;
            const isChosen = submitted?.type === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                data-idx={i}
                aria-label={opt.label}
                className={`qr-item${isHot ? " hot" : ""}${isChosen ? " chosen" : ""}`}
                style={{ "--c": opt.color, "--d": `${i * 25}ms` } as React.CSSProperties}
                onPointerUp={() => onOptionTap(i)}
              >
                <div className="qr-item-icon">
                  {isChosen ? <Check size={18} strokeWidth={3} /> : <Icon size={18} strokeWidth={2} />}
                </div>
                <span className="qr-item-label">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── FAB ── */}
      <button
        ref={fabRef}
        type="button"
        aria-label="Quick report"
        className={`qr-fab${open ? " open" : ""}${submitted ? " done" : ""}`}
        onPointerDown={onFabDown}
        onPointerMove={onFabMove}
        onPointerUp={onFabUp}
        onPointerCancel={onFabUp}
      >
        {open
          ? <X size={20} strokeWidth={2.5} />
          : <Megaphone size={20} strokeWidth={2.5} />
        }
      </button>

      <style>{styles}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */

const styles = /* css */ `
  /* ── Keyframes ── */
  @keyframes qr-tray-in {
    from { opacity: 0; transform: translateY(12px) scale(0.92); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes qr-item-in {
    from { opacity: 0; transform: scale(0.6) translateY(6px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes qr-chosen-pop {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.25); }
    100% { transform: scale(1); }
  }
  @keyframes qr-ring {
    0%   { box-shadow: 0 0 0 0 var(--c); }
    100% { box-shadow: 0 0 0 10px transparent; }
  }
  @keyframes qr-fab-confirm {
    0%   { box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
    50%  { box-shadow: 0 4px 16px rgba(0,0,0,0.3), 0 0 0 8px rgba(74,108,83,0.3); }
    100% { box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
  }

  /* ── Root: FAB at bottom, tray stacks above ── */
  .qr-root {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  /* ── FAB ── */
  .qr-fab {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    border: none;
    cursor: pointer;
    display: grid;
    place-items: center;
    background: rgba(30, 30, 30, 0.88);
    color: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.15);
    transition:
      transform 0.12s cubic-bezier(0.34,1.56,0.64,1),
      background 0.2s ease,
      border-radius 0.25s ease;
    touch-action: none;
    flex-shrink: 0;
    position: relative;
    z-index: 2;
  }
  .qr-fab:active { transform: scale(0.9); }
  .qr-fab.open {
    background: rgba(50, 50, 50, 0.95);
    border-radius: 14px;
  }
  .qr-fab.done {
    animation: qr-fab-confirm 0.6s ease;
  }

  /* ── Tray ── */
  .qr-tray {
    border-radius: 18px;
    background: rgba(22, 22, 22, 0.92);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow:
      0 8px 40px rgba(0,0,0,0.45),
      0 1px 3px rgba(0,0,0,0.2),
      inset 0 0.5px 0 rgba(255,255,255,0.06);
    padding: 10px;
    opacity: 0;
    transform: translateY(12px) scale(0.92);
    pointer-events: none;
    transform-origin: bottom right;
    transition: opacity 0.15s ease, transform 0.15s ease;
    position: relative;
    z-index: 1;
  }
  .qr-tray.open {
    opacity: 1;
    pointer-events: auto;
    animation: qr-tray-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  /* ── Grid: 4 cols × 2 rows ── */
  .qr-tray-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }

  /* ── Each item ── */
  .qr-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px 6px;
    border: none;
    border-radius: 14px;
    cursor: pointer;
    background: transparent;
    touch-action: none;
    opacity: 0;
    transition: background 0.12s ease;
  }
  .qr-tray.open .qr-item {
    animation: qr-item-in 0.22s cubic-bezier(0.34,1.56,0.64,1) var(--d) both;
  }
  .qr-item:active {
    background: rgba(255,255,255,0.06);
  }
  .qr-item.hot {
    background: color-mix(in srgb, var(--c) 15%, transparent);
  }

  /* Icon circle */
  .qr-item-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: rgba(255,255,255,0.07);
    color: var(--c);
    transition:
      background 0.15s ease,
      color 0.12s ease,
      transform 0.15s cubic-bezier(0.34,1.56,0.64,1),
      box-shadow 0.15s ease;
  }
  .qr-item.hot .qr-item-icon {
    background: var(--c);
    color: white;
    transform: scale(1.08);
    box-shadow: 0 2px 16px color-mix(in srgb, var(--c) 45%, transparent);
  }
  .qr-item.chosen .qr-item-icon {
    background: var(--c);
    color: white;
    animation: qr-chosen-pop 0.3s cubic-bezier(0.34,1.56,0.64,1), qr-ring 0.5s ease 0.1s both;
  }

  /* Label */
  .qr-item-label {
    font-size: 9px;
    font-weight: 700;
    color: rgba(255,255,255,0.45);
    text-transform: uppercase;
    letter-spacing: 0.2px;
    white-space: nowrap;
    transition: color 0.12s ease;
  }
  .qr-item.hot .qr-item-label,
  .qr-item.chosen .qr-item-label {
    color: var(--c);
  }
`;
