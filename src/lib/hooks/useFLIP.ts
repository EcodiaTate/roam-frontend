// src/lib/hooks/useFLIP.ts
// Shared FLIP (First-Last-Invert-Play) animation hook.
// Used by TripView (stop reorder) and PlanDrawer (plan card reorder).
"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

type FLIPOpts = {
  /** Duration in ms for standard items. Default 280. */
  duration?: number;
  /** CSS easing for standard items. */
  easing?: string;
  /** Duration in ms for the "moved" (highlighted) item. Default 320. */
  movedDuration?: number;
  /** CSS easing for the moved item (slight overshoot). */
  movedEasing?: string;
  /** Enable entrance animation for newly added items. Default false. */
  entrance?: boolean;
};

const DEFAULTS: Required<FLIPOpts> = {
  duration: 280,
  easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
  movedDuration: 320,
  movedEasing: "cubic-bezier(0.34, 1.4, 0.64, 1)",
  entrance: false,
};

export function useFLIP<T>(items: T[], opts?: FLIPOpts) {
  const o = { ...DEFAULTS, ...opts };
  const elsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const snapshotRef = useRef<Map<string, DOMRect>>(new Map());
  const movedIdRef = useRef<string | null>(null);
  const addedIdRef = useRef<string | null>(null);

  /** Call before mutating state to snapshot current positions. */
  const capturePositions = useCallback(() => {
    const snap = new Map<string, DOMRect>();
    elsRef.current.forEach((el, id) => snap.set(id, el.getBoundingClientRect()));
    snapshotRef.current = snap;
  }, []);

  /** Mark which item was actively moved (gets highlight effect). */
  const setMovedId = useCallback((id: string | null) => {
    movedIdRef.current = id;
  }, []);

  /** Mark which item was just added (gets entrance animation). */
  const setAddedId = useCallback((id: string | null) => {
    addedIdRef.current = id;
  }, []);

  /** Ref callback factory - use as ref={(el) => registerEl(id, el)} */
  const registerEl = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) elsRef.current.set(id, el);
    else elsRef.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const prev = snapshotRef.current;
    const movedId = movedIdRef.current;
    const addedId = addedIdRef.current;
    movedIdRef.current = null;
    addedIdRef.current = null;

    // Entrance animation for newly added item
    if (o.entrance && addedId) {
      const el = elsRef.current.get(addedId);
      if (el) {
        el.style.transition = "none";
        el.style.opacity = "0";
        el.style.transform = "translateY(-12px) scale(0.96)";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = `opacity ${o.duration}ms ease, transform ${o.movedDuration}ms ${o.movedEasing}`;
            el.style.opacity = "1";
            el.style.transform = "";
            const cleanup = () => { el.style.transition = ""; };
            el.addEventListener("transitionend", cleanup, { once: true });
            setTimeout(cleanup, o.movedDuration + 50);
          });
        });
      }
    }

    if (prev.size === 0) return;

    elsRef.current.forEach((el, id) => {
      if (id === addedId) return;
      const oldRect = prev.get(id);
      if (!oldRect) return;
      const newRect = el.getBoundingClientRect();
      const dy = oldRect.top - newRect.top;
      if (Math.abs(dy) < 1) return;

      const isMoved = id === movedId;
      // Invert: snap to old position
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)${isMoved ? " scale(1.03)" : ""}`;
      if (isMoved) {
        el.style.zIndex = "10";
        el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
      }

      // Play: animate to final position
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const dur = isMoved ? `${o.movedDuration}ms` : `${o.duration}ms`;
          const ease = isMoved ? o.movedEasing : o.easing;
          el.style.transition = [
            `transform ${dur} ${ease}`,
            isMoved ? `box-shadow ${dur} ${ease}` : "",
          ].filter(Boolean).join(", ");
          el.style.transform = "";
          if (isMoved) el.style.boxShadow = "";
          const cleanup = () => {
            el.style.zIndex = "";
            el.style.transition = "";
          };
          el.addEventListener("transitionend", cleanup, { once: true });
          setTimeout(cleanup, (isMoved ? o.movedDuration : o.duration) + 50);
        });
      });
    });
    snapshotRef.current = new Map();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- items is the trigger
  }, [items]);

  /** Get a registered element by id (useful for exit animations). */
  const getEl = useCallback((id: string) => elsRef.current.get(id) ?? null, []);

  return { registerEl, capturePositions, setMovedId, setAddedId, getEl };
}
