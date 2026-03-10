// src/lib/offline/planEvents.ts
//
// Tiny typed event bus that decouples plansStore (emitter) from planSync (listener).
// This avoids circular imports: plansStore emits events, planSync subscribes.
"use client";

export type PlanEventType =
  | "plan:saved"     // after saveOfflinePlan / updateOfflinePlan
  | "plan:deleted"   // after deleteOfflinePlan
  | "plan:labeled";  // after label-only update

export type PlanEventPayload = {
  planId: string;
  label?: string | null;
};

type Listener = (type: PlanEventType, payload: PlanEventPayload) => void;

const _listeners = new Set<Listener>();

export function onPlanEvent(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function emitPlanEvent(type: PlanEventType, payload: PlanEventPayload): void {
  for (const fn of _listeners) {
    try {
      fn(type, payload);
    } catch (e) {
      console.error("[planEvents] listener error", e);
    }
  }
}