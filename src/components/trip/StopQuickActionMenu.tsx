// src/components/trip/StopQuickActionMenu.tsx
// Portal-based quick action menu shown on long-press of a stop pin or list item.
"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Trash2, ChevronsUp, ChevronsDown, StickyNote, Navigation } from "lucide-react";
import { haptic } from "@/lib/native/haptics";
import s from "./StopQuickActionMenu.module.css";

export type StopQuickAction =
  | "delete"
  | "move-to-start"
  | "move-to-end"
  | "add-note"
  | "set-waypoint";

export type QuickActionMenuState = {
  stopId: string;
  stopName: string;
  /** Screen coords for anchoring (px from top-left of viewport). */
  anchorX: number;
  anchorY: number;
  isLocked: boolean;
  isWaypoint: boolean;
};

type Props = {
  state: QuickActionMenuState | null;
  onAction: (action: StopQuickAction, stopId: string) => void;
  onClose: () => void;
};

const ACTIONS: {
  id: StopQuickAction;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  lockedOnly?: boolean;
  hideWhenLocked?: boolean;
}[] = [
  {
    id: "move-to-start",
    label: "Move to Start",
    icon: <ChevronsUp size={15} strokeWidth={2} />,
    hideWhenLocked: true,
  },
  {
    id: "move-to-end",
    label: "Move to End",
    icon: <ChevronsDown size={15} strokeWidth={2} />,
    hideWhenLocked: true,
  },
  {
    id: "add-note",
    label: "Add Note",
    icon: <StickyNote size={15} strokeWidth={2} />,
  },
  {
    id: "set-waypoint",
    label: "Set as Waypoint",
    icon: <Navigation size={15} strokeWidth={2} />,
    hideWhenLocked: true,
  },
  {
    id: "delete",
    label: "Delete",
    icon: <Trash2 size={15} strokeWidth={2} />,
    danger: true,
    hideWhenLocked: true,
  },
];

export function StopQuickActionMenu({ state, onAction, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click / escape
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    // Use capture so we intercept before anything else
    document.addEventListener("pointerdown", onPointer, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, { capture: true });
    };
  }, [state, onClose]);

  if (!state) return null;

  const visibleActions = ACTIONS.filter((a) => {
    if (a.hideWhenLocked && state.isLocked) return false;
    return true;
  });

  // Position menu: prefer below anchor, flip up if close to bottom edge
  const MENU_HEIGHT_ESTIMATE = visibleActions.length * 44 + 12;
  const viewH = typeof window !== "undefined" ? window.innerHeight : 800;
  const placeBelow = state.anchorY + 24 + MENU_HEIGHT_ESTIMATE < viewH;
  const top = placeBelow ? state.anchorY + 24 : state.anchorY - MENU_HEIGHT_ESTIMATE - 8;
  const left = Math.max(12, Math.min(state.anchorX - 80, (typeof window !== "undefined" ? window.innerWidth : 400) - 172));

  const content = (
    <div
      ref={menuRef}
      className={s.menu}
      style={{ top, left }}
      role="menu"
      aria-label={`Actions for ${state.stopName}`}
    >
      <div className={s.header}>{state.stopName}</div>
      {visibleActions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          className={action.danger ? s.itemDanger : s.item}
          onClick={() => {
            haptic.tap();
            onAction(action.id, state.stopId);
            onClose();
          }}
        >
          <span className={s.itemIcon}>{action.icon}</span>
          {action.label}
        </button>
      ))}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={s.overlay} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {content}
    </div>,
    document.body,
  );
}
