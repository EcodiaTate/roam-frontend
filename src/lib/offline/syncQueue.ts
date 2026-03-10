// src/lib/offline/syncQueue.ts
"use client";

import { idbGetAll, idbPut, idbDel, idbStores } from "./idb";

/* ── Types ────────────────────────────────────────────────────────────── */

export type SyncOpType =
  | "plan_upsert"   // push local plan metadata + preview to Supabase
  | "plan_delete"   // delete plan from Supabase
  | "plan_label";   // update label only (lightweight)

export type SyncOp = {
  id?: number;       // auto-incremented by IDB
  op: SyncOpType;
  plan_id: string;
  payload?: any;     // op-specific data (e.g. { label } for plan_label)
  created_at: number;
  retries: number;
  last_error?: string | null;
};

const STORE = idbStores.syncQueue;
const MAX_RETRIES = 5;

/* ── Queue operations ─────────────────────────────────────────────────── */

/**
 * Enqueue a sync operation. Writes to IDB immediately (offline-safe).
 * The drain loop picks it up when connectivity is available.
 */
export async function enqueueSync(
  op: SyncOpType,
  planId: string,
  payload?: any,
): Promise<void> {
  const row: SyncOp = {
    op,
    plan_id: planId,
    payload,
    created_at: Date.now(),
    retries: 0,
    last_error: null,
  };
  await idbPut(STORE, row);
}

/**
 * Get all pending operations, sorted FIFO (oldest first).
 */
export async function getPendingOps(): Promise<SyncOp[]> {
  const all = await idbGetAll<SyncOp>(STORE);
  return all
    .filter((o) => o.retries < MAX_RETRIES)
    .sort((a, b) => a.created_at - b.created_at);
}

/**
 * Remove a completed operation by its IDB auto-increment id.
 */
export async function removeOp(id: number): Promise<void> {
  await idbDel(STORE, id);
}

/**
 * Mark an operation as failed (increment retries, store error message).
 */
export async function markOpFailed(id: number, error: string): Promise<void> {
  const all = await idbGetAll<SyncOp>(STORE);
  const op = all.find((o) => o.id === id);
  if (!op) return;
  op.retries += 1;
  op.last_error = error;
  await idbPut(STORE, op);
}

/**
 * Check if there's already a queued plan_upsert for this planId.
 * Prevents flooding the queue when a user edits stops repeatedly offline.
 */
export async function hasQueuedUpsert(planId: string): Promise<boolean> {
  const all = await getPendingOps();
  return all.some((o) => o.op === "plan_upsert" && o.plan_id === planId);
}

/**
 * Get count of pending ops (for UI badge / sync indicator).
 */
export async function getPendingCount(): Promise<number> {
  const all = await idbGetAll<SyncOp>(STORE);
  return all.filter((o) => o.retries < MAX_RETRIES).length;
}

/**
 * Purge dead-letter ops (retries >= MAX_RETRIES).
 * Call periodically or on user action.
 */
export async function purgeDeadLetterOps(): Promise<number> {
  const all = await idbGetAll<SyncOp>(STORE);
  const dead = all.filter((o) => o.retries >= MAX_RETRIES);
  for (const op of dead) {
    if (op.id != null) await idbDel(STORE, op.id);
  }
  return dead.length;
}