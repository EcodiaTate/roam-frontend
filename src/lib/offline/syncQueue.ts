// src/lib/offline/syncQueue.ts
"use client";

import { idbGetAll, idbPut, idbDel, idbStores } from "./idb";

/* ── Types ───────────────────────────────────────────────────────────── */

export type SyncOpType =
  | "plan_upsert"    // push local plan metadata + preview to Supabase
  | "plan_delete"    // delete plan from Supabase
  | "plan_label"     // update label only
  | "invite_create"  // create an invite code for a plan
  | "invite_redeem"; // redeem an invite code to join a plan

export type SyncOp = {
  id?: number;       // auto-incremented by IDB
  op: SyncOpType;
  plan_id: string;
  payload?: any;     // op-specific data
  created_at: number;
  retries: number;
  last_error?: string | null;
};

const STORE = idbStores.syncQueue;
const MAX_RETRIES = 5;

/* ── Queue operations ─────────────────────────────────────────────────── */

/**
 * Enqueue a sync operation. This writes to IDB immediately (offline-safe).
 * The drain loop picks it up when connectivity is available.
 */
export async function enqueueSync(op: SyncOpType, planId: string, payload?: any): Promise<void> {
  const entry: SyncOp = {
    op,
    plan_id: planId,
    payload: payload ?? null,
    created_at: Date.now(),
    retries: 0,
    last_error: null,
  };
  await idbPut(STORE, entry);
}

/**
 * Get all pending sync operations, ordered by created_at (FIFO).
 */
export async function getPendingOps(): Promise<SyncOp[]> {
  const all = await idbGetAll<SyncOp>(STORE);
  return all.sort((a, b) => a.created_at - b.created_at);
}

/**
 * Remove a completed operation from the queue.
 */
export async function removeOp(id: number): Promise<void> {
  await idbDel(STORE, id);
}

/**
 * Mark an operation as failed (increment retries, store error message).
 * If retries exceed MAX_RETRIES, the op is dropped with a console warning.
 */
export async function markOpFailed(op: SyncOp, error: string): Promise<void> {
  if (!op.id) return;

  const next: SyncOp = {
    ...op,
    retries: op.retries + 1,
    last_error: error,
  };

  if (next.retries >= MAX_RETRIES) {
    console.warn(
      `[SyncQueue] Dropping op after ${MAX_RETRIES} retries: ${op.op} plan=${op.plan_id} err=${error}`,
    );
    await idbDel(STORE, op.id);
    return;
  }

  await idbPut(STORE, next);
}

/**
 * Deduplicate: if there's already a plan_upsert for the same plan_id
 * in the queue, we don't need another. This prevents flooding the queue
 * when a user edits stops repeatedly while offline.
 *
 * Call this before enqueueSync for upserts.
 */
export async function hasQueuedUpsert(planId: string): Promise<boolean> {
  const all = await getPendingOps();
  return all.some((o) => o.op === "plan_upsert" && o.plan_id === planId);
}

/**
 * Get count of pending ops (for UI badge).
 */
export async function getPendingCount(): Promise<number> {
  const all = await idbGetAll<SyncOp>(STORE);
  return all.length;
}