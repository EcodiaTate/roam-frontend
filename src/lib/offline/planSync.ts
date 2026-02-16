// src/lib/offline/planSync.ts
"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { networkMonitor } from "./networkMonitor";

import { enqueueSync, getPendingOps, removeOp, markOpFailed, hasQueuedUpsert } from "./syncQueue";
import { getOfflinePlan, type OfflinePlanRecord } from "./plansStore";
import { idbPut, idbDel, idbStores } from "./idb";

/* ── Supabase row shape ──────────────────────────────────────────────── */

type SupaPlanRow = {
  plan_id: string;
  owner_id: string;
  route_key: string;
  label: string | null;
  preview: any | null;
  manifest_meta: any | null;
  created_at: string;
  updated_at: string;
};

/* ── Cloud → Local conversion ────────────────────────────────────────── */

function cloudToLocal(row: SupaPlanRow): Partial<OfflinePlanRecord> {
  return {
    plan_id: row.plan_id,
    route_key: row.route_key,
    label: row.label,
    preview: row.preview ?? undefined,
    created_at: row.created_at,
    saved_at: row.updated_at,

    // Status fields from manifest_meta if present
    corridor_status: row.manifest_meta?.corridor_status,
    places_status: row.manifest_meta?.places_status,
    traffic_status: row.manifest_meta?.traffic_status,
    hazards_status: row.manifest_meta?.hazards_status,

    corridor_key: row.manifest_meta?.corridor_key,
    places_key: row.manifest_meta?.places_key,
    traffic_key: row.manifest_meta?.traffic_key,
    hazards_key: row.manifest_meta?.hazards_key,

    styles: row.manifest_meta?.styles,
    tiles_id: row.manifest_meta?.tiles_id,
  };
}

/* ── Local → Cloud conversion ────────────────────────────────────────── */

function localToCloud(rec: OfflinePlanRecord, userId: string): Partial<SupaPlanRow> {
  return {
    plan_id: rec.plan_id,
    owner_id: userId,
    route_key: rec.route_key,
    label: rec.label ?? null,
    preview: rec.preview ?? null,
    manifest_meta: {
      corridor_status: rec.corridor_status,
      places_status: rec.places_status,
      traffic_status: rec.traffic_status,
      hazards_status: rec.hazards_status,
      corridor_key: rec.corridor_key,
      places_key: rec.places_key,
      traffic_key: rec.traffic_key,
      hazards_key: rec.hazards_key,
      styles: rec.styles,
      tiles_id: rec.tiles_id,
    },
    updated_at: new Date().toISOString(),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   PlanSyncManager — singleton
   ═══════════════════════════════════════════════════════════════════════ */

type SyncListener = (
  event: "drain_start" | "drain_end" | "pull_complete" | "error",
  detail?: any,
) => void;

class PlanSyncManager {
  private _ownedChannel: RealtimeChannel | null = null;
  private _memberChannel: RealtimeChannel | null = null;

  private _networkUnsub: (() => void) | null = null;
  private _pullInterval: any = null;

  private _draining = false;
  private _userId: string | null = null;
  private _listeners = new Set<SyncListener>();
  private _started = false;

  private _memberPlanIds = new Set<string>();

  // Persisted sync visibility (UI can read these from idbStores.meta)
  private static META_LAST_ERROR = "plans_last_sync_error";
  private static META_LAST_OK_AT = "plans_last_sync_ok_at";
  private static META_LAST_ATTEMPT_AT = "plans_last_sync_attempt_at";

  /* ── Lifecycle ─────────────────────────────────────────────────────── */

  /**
   * Start the sync manager. Call once after auth confirms a session.
   * Idempotent — safe to call multiple times.
   */
  start(userId: string) {
    if (this._started && this._userId === userId) return;
    this.stop();

    this._userId = userId;
    this._started = true;

    // 1) Network transitions → pull + drain when online
    this._networkUnsub = networkMonitor.subscribe((online) => {
      if (online) {
        this.pullRemote().finally(() => this.drainQueue());
      }
    });

    // 2) Realtime (cheap filters)
    this._subscribeRealtimeOwned(userId);
    this._subscribeRealtimeMemberships(userId);

    // 3) Periodic pull while online (covers partner edits on shared plans)
    this._pullInterval = setInterval(() => {
      if (!this._started) return;
      if (!this._userId) return;
      if (!networkMonitor.online) return;
      this.pullRemote().catch(() => {});
    }, 15_000);

    // 4) Initial sync
    if (networkMonitor.online) {
      this.pullRemote().then(() => this.drainQueue());
    }
  }

  /** Stop sync (on sign-out or unmount). */
  stop() {
    this._started = false;
    this._userId = null;
    this._memberPlanIds.clear();

    this._networkUnsub?.();
    this._networkUnsub = null;

    if (this._pullInterval) {
      clearInterval(this._pullInterval);
      this._pullInterval = null;
    }

    if (this._ownedChannel) {
      supabase.removeChannel(this._ownedChannel);
      this._ownedChannel = null;
    }
    if (this._memberChannel) {
      supabase.removeChannel(this._memberChannel);
      this._memberChannel = null;
    }
  }

  /** Subscribe to sync events (for UI indicators). */
  subscribe(fn: SyncListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /* ── Enqueue helpers ──────────────────────────────────────────────── */

  async enqueuePlanUpsert(planId: string): Promise<void> {
    const already = await hasQueuedUpsert(planId);
    if (!already) await enqueueSync("plan_upsert", planId);
    if (networkMonitor.online) this.drainQueue();
  }

  async enqueuePlanDelete(planId: string): Promise<void> {
    await enqueueSync("plan_delete", planId);
    if (networkMonitor.online) this.drainQueue();
  }

  /* ── Drain queue (FIFO) ────────────────────────────────────────────── */

  async drainQueue(): Promise<void> {
    if (this._draining) return;
    if (!this._userId) return;
    if (!networkMonitor.online) return;

    this._draining = true;
    this._emit("drain_start");

    // new drain attempt
    await idbPut(idbStores.meta, new Date().toISOString(), PlanSyncManager.META_LAST_ATTEMPT_AT);

    try {
      const ops = await getPendingOps();

      // optimistic: clear last error at start of a new drain attempt
      await idbPut(idbStores.meta, null, PlanSyncManager.META_LAST_ERROR);

      for (const op of ops) {
        if (!networkMonitor.online) break;

        try {
          await this._executeOp(op);
          if (op.id != null) await removeOp(op.id);
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          console.error(`[PlanSync] op failed: ${op.op} plan=${op.plan_id}`, msg);

          // IMPORTANT:
          // - keep op in queue (authoritative)
          // - STOP on first failure to preserve ordering (FIFO)
          // - persist error so UI can show "sync error" instead of failing silently
          await markOpFailed(op, msg);

          await idbPut(idbStores.meta, msg, PlanSyncManager.META_LAST_ERROR);
          this._emit("error", { op, message: msg });

          // Preserve ordering: do not attempt later ops until this one succeeds.
          break;
        }
      }

      // If we got here without throwing, and queue is empty, we mark last ok timestamp.
      // (If there are ops left, either we broke on error or went offline mid-drain.)
      const remaining = await getPendingOps();
      if (remaining.length === 0) {
        await idbPut(idbStores.meta, new Date().toISOString(), PlanSyncManager.META_LAST_OK_AT);
      }
    } catch (e) {
      this._emit("error", e);

      try {
        const msg = (e as any)?.message ?? String(e);
        await idbPut(idbStores.meta, msg, PlanSyncManager.META_LAST_ERROR);
      } catch {}
    } finally {
      this._draining = false;
      this._emit("drain_end");
    }
  }

  /* ── Online-first creation ────────────────────────────────────────── */

  /**
   * Plans can only be created while online. This helper enforces that invariant.
   *
   * Creates the cloud row FIRST (stamping owner_id), then returns the plan_id.
   * Callers should then create the local OfflinePlanRecord using that id.
   */
  async createPlanOnline(args: {
    plan_id?: string;
    route_key: string;
    label?: string | null;
    preview?: any | null;
    manifest_meta?: any | null;
  }): Promise<string> {
    if (!this._userId) throw new Error("Not authenticated");
    if (!networkMonitor.online) throw new Error("You need to be online to create a plan");

    const planId = args.plan_id ?? (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
    const now = new Date().toISOString();

    const row: Partial<SupaPlanRow> = {
      plan_id: planId,
      owner_id: this._userId,
      route_key: args.route_key,
      label: args.label ?? null,
      preview: args.preview ?? null,
      manifest_meta: args.manifest_meta ?? null,
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabase.from("roam_plans").insert(row);
    if (error) throw new Error(`createPlanOnline: ${error.message}`);

    // Ensure owner membership exists (uniform access for shared-plan flows)
    const { error: e2 } = await supabase.from("roam_plan_memberships").upsert(
      { plan_id: planId, user_id: this._userId, role: "admin" },
      { onConflict: "plan_id,user_id" },
    );
    if (e2) throw new Error(`createPlanOnline memberships: ${e2.message}`);

    return planId;
  }

  /* ── Pull remote plans → local IDB ─────────────────────────────────── */

  async pullRemote(): Promise<void> {
    if (!this._userId) return;
    if (!networkMonitor.online) return;

    try {
      // Owned
      const { data: owned, error: e1 } = await supabase
        .from("roam_plans")
        .select("*")
        .eq("owner_id", this._userId);

      if (e1) throw new Error(`pullRemote owned: ${e1.message}`);

      // Memberships (shared plans)
      const { data: memberships, error: e2 } = await supabase
        .from("roam_plan_memberships")
        .select("plan_id")
        .eq("user_id", this._userId);

      if (e2) throw new Error(`pullRemote memberships: ${e2.message}`);

      const memberPlanIds = (memberships ?? []).map((m: any) => String(m.plan_id));
      this._memberPlanIds = new Set(memberPlanIds);

      let shared: SupaPlanRow[] = [];
      if (memberPlanIds.length > 0) {
        const { data, error: e3 } = await supabase
          .from("roam_plans")
          .select("*")
          .in("plan_id", memberPlanIds);

        if (e3) throw new Error(`pullRemote shared: ${e3.message}`);
        shared = data ?? [];
      }

      // Merge: owned + shared, dedupe by plan_id
      const all = new Map<string, SupaPlanRow>();
      for (const row of [...(owned ?? []), ...shared]) all.set(row.plan_id, row);

      // Upsert to local IDB when remote newer
      for (const row of all.values()) {
        const local = await getOfflinePlan(row.plan_id);
        const remoteTs = new Date(row.updated_at).getTime();
        const localTs = local?.saved_at ? new Date(local.saved_at).getTime() : 0;

        if (remoteTs > localTs) {
          const merged: OfflinePlanRecord = {
            ...(local ?? ({} as any)),
            ...cloudToLocal(row),
          };
          await idbPut(idbStores.plans, merged);
        }
      }

      this._emit("pull_complete");
    } catch (e) {
      console.error("[PlanSync] pullRemote failed", e);
      this._emit("error", e);
    }
  }

  /* ── Invite code management (RPC) ──────────────────────────────────── */

  /**
   * Create an invite code for a plan (online-only).
   * Returns the 6-char code.
   */
  async createInviteCode(planId: string): Promise<string> {
    if (!this._userId) throw new Error("Not authenticated");
    if (!networkMonitor.online) throw new Error("You need to be online to create an invite code");

    const { data, error } = await supabase.rpc("create_plan_invite", {
      p_plan_id: planId,
      p_expires_minutes: 10080, // 7 days
      p_max_uses: 5,
    });

    if (error) throw new Error(error.message);
    return String(data);
  }

  /**
   * Redeem an invite code to join a shared plan.
   * Returns the plan_id.
   */
  async redeemInviteCode(code: string): Promise<string> {
    if (!this._userId) throw new Error("Not authenticated");
    if (!networkMonitor.online) throw new Error("You need to be online to redeem an invite code");

    const trimmed = code.toUpperCase().trim();
    if (!trimmed) throw new Error("Invalid invite code");

    const { data, error } = await supabase.rpc("redeem_plan_invite", {
      p_code: trimmed,
    });

    if (error) throw new Error(error.message);

    const planId = String(data);

    // Immediately pull now that membership changed
    await this.pullRemote();

    return planId;
  }

  /* ── Private ───────────────────────────────────────────────────────── */

  private async _executeOp(op: import("./syncQueue").SyncOp): Promise<void> {
    if (!this._userId) throw new Error("No userId");

    switch (op.op) {
      case "plan_upsert": {
        const rec = await getOfflinePlan(op.plan_id);
        if (!rec) return;

        const row = localToCloud(rec, this._userId);

        const { error } = await supabase.from("roam_plans").upsert(row, { onConflict: "plan_id" });
        if (error) throw new Error(`plan_upsert: ${error.message}`);

        // Ensure membership exists for owner (so other queries can treat uniformly)
        await supabase.from("roam_plan_memberships").upsert(
          { plan_id: op.plan_id, user_id: this._userId, role: "admin" },
          { onConflict: "plan_id,user_id" },
        );

        break;
      }

      case "plan_delete": {
        const { error } = await supabase
          .from("roam_plans")
          .delete()
          .eq("plan_id", op.plan_id)
          .eq("owner_id", this._userId);

        if (error) throw new Error(`plan_delete: ${error.message}`);
        break;
      }

      // (Optional legacy op)
      case "plan_label": {
        const { error } = await supabase
          .from("roam_plans")
          .update({ label: op.payload?.label ?? null, updated_at: new Date().toISOString() })
          .eq("plan_id", op.plan_id)
          .eq("owner_id", this._userId);

        if (error) throw new Error(`plan_label: ${error.message}`);
        break;
      }

      default:
        console.warn(`[PlanSync] Unknown op type: ${(op as any).op}`);
    }
  }

  private _subscribeRealtimeOwned(userId: string) {
    // Only listen to owned plan changes (server-side filter)
    this._ownedChannel = supabase
      .channel("roam_plans_owned_sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "roam_plans",
          filter: `owner_id=eq.${userId}`,
        },
        async (payload) => {
          const row = (payload.new ?? payload.old) as SupaPlanRow | null;
          if (!row) return;

          if (payload.eventType === "DELETE") {
            try {
              await idbDel(idbStores.plans, row.plan_id);
            } catch {}
            return;
          }

          const local = await getOfflinePlan(row.plan_id);
          const remoteTs = new Date(row.updated_at).getTime();
          const localTs = local?.saved_at ? new Date(local.saved_at).getTime() : 0;

          if (remoteTs > localTs) {
            const merged: OfflinePlanRecord = {
              ...(local ?? ({} as any)),
              ...cloudToLocal(row),
            };
            await idbPut(idbStores.plans, merged);
          }
        },
      )
      .subscribe();
  }

  private _subscribeRealtimeMemberships(userId: string) {
    // When your memberships change (redeem invite, removed, etc) → pullRemote
    this._memberChannel = supabase
      .channel("roam_plan_memberships_sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "roam_plan_memberships",
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          // membership changed; refresh plan list
          if (!networkMonitor.online) return;
          await this.pullRemote();
        },
      )
      .subscribe();
  }

  private _emit(event: string, detail?: any) {
    for (const fn of this._listeners) {
      try {
        fn(event as any, detail);
      } catch {}
    }
  }
}

/** Singleton */
export const planSync = new PlanSyncManager();
