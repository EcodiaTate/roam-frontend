// src/lib/offline/planSync.ts
"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { networkMonitor } from "./networkMonitor";
import {
  enqueueSync,
  getPendingOps,
  removeOp,
  markOpFailed,
  hasQueuedUpsert,
} from "./syncQueue";
import {
  getOfflinePlan,
  listOfflinePlans,
  type OfflinePlanRecord,
} from "./plansStore";
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
    corridor_key: row.manifest_meta?.corridor_key,
    places_key: row.manifest_meta?.places_key,
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

type SyncListener = (event: "drain_start" | "drain_end" | "pull_complete" | "error", detail?: any) => void;

class PlanSyncManager {
  private _channel: RealtimeChannel | null = null;
  private _networkUnsub: (() => void) | null = null;
  private _draining = false;
  private _userId: string | null = null;
  private _listeners = new Set<SyncListener>();
  private _started = false;

  /* ── Lifecycle ─────────────────────────────────────────────────────── */

  /**
   * Start the sync manager. Call once after auth confirms a session.
   * Idempotent — safe to call multiple times.
   */
  start(userId: string) {
    if (this._started && this._userId === userId) return;
    this.stop(); // clean up previous user if any

    this._userId = userId;
    this._started = true;

    // 1. Listen for network transitions → drain queue when online
    this._networkUnsub = networkMonitor.subscribe((online) => {
      if (online) this.drainQueue();
    });

    // 2. Subscribe to Supabase Realtime for plans this user owns or is a member of
    this._subscribeRealtime(userId);

    // 3. If already online, do an initial sync
    if (networkMonitor.online) {
      this.pullRemote().then(() => this.drainQueue());
    }
  }

  /** Stop sync (on sign-out or unmount). */
  stop() {
    this._started = false;
    this._userId = null;
    this._networkUnsub?.();
    this._networkUnsub = null;
    if (this._channel) {
      supabase.removeChannel(this._channel);
      this._channel = null;
    }
  }

  /** Subscribe to sync events (for UI indicators). */
  subscribe(fn: SyncListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /* ── Enqueue helpers (called by plansStore wrappers) ───────────────── */

  async enqueuePlanUpsert(planId: string): Promise<void> {
    // Deduplicate: don't flood queue with repeated upserts for same plan
    const already = await hasQueuedUpsert(planId);
    if (!already) {
      await enqueueSync("plan_upsert", planId);
    }
    // Try to drain immediately if online
    if (networkMonitor.online) this.drainQueue();
  }

  async enqueuePlanDelete(planId: string): Promise<void> {
    await enqueueSync("plan_delete", planId);
    if (networkMonitor.online) this.drainQueue();
  }

  async enqueueInviteCreate(planId: string): Promise<void> {
    await enqueueSync("invite_create", planId);
    if (networkMonitor.online) this.drainQueue();
  }

  /* ── Drain queue (FIFO) ────────────────────────────────────────────── */

  async drainQueue(): Promise<void> {
    if (this._draining) return;
    if (!this._userId) return;
    if (!networkMonitor.online) return;

    this._draining = true;
    this._emit("drain_start");

    try {
      const ops = await getPendingOps();

      for (const op of ops) {
        if (!networkMonitor.online) break; // stop if we lose connection mid-drain

        try {
          await this._executeOp(op);
          if (op.id != null) await removeOp(op.id);
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          console.error(`[PlanSync] op failed: ${op.op} plan=${op.plan_id}`, msg);
          await markOpFailed(op, msg);
        }
      }
    } catch (e) {
      this._emit("error", e);
    } finally {
      this._draining = false;
      this._emit("drain_end");
    }
  }

  /* ── Pull remote plans → local IDB ─────────────────────────────────── */

  async pullRemote(): Promise<void> {
    if (!this._userId) return;
    if (!networkMonitor.online) return;

    try {
      // Get plans where user is owner
      const { data: owned, error: e1 } = await supabase
        .from("roam_plans")
        .select("*")
        .eq("owner_id", this._userId);

      if (e1) throw new Error(`pullRemote owned: ${e1.message}`);

      // Get plans where user is a member (shared plans)
      const { data: memberships, error: e2 } = await supabase
        .from("roam_plan_members")
        .select("plan_id")
        .eq("user_id", this._userId);

      if (e2) throw new Error(`pullRemote memberships: ${e2.message}`);

      const memberPlanIds = (memberships ?? []).map((m: any) => m.plan_id);

      let shared: SupaPlanRow[] = [];
      if (memberPlanIds.length > 0) {
        const { data, error: e3 } = await supabase
          .from("roam_plans")
          .select("*")
          .in("plan_id", memberPlanIds);
        if (e3) throw new Error(`pullRemote shared: ${e3.message}`);
        shared = data ?? [];
      }

      // Merge: owned + shared, deduplicate by plan_id
      const all = new Map<string, SupaPlanRow>();
      for (const row of [...(owned ?? []), ...shared]) {
        all.set(row.plan_id, row);
      }

      // Upsert to local IDB (only if remote is newer)
      for (const row of all.values()) {
        const local = await getOfflinePlan(row.plan_id);
        const remoteTs = new Date(row.updated_at).getTime();
        const localTs = local?.saved_at ? new Date(local.saved_at).getTime() : 0;

        if (remoteTs > localTs) {
          // Remote is newer → merge into local (preserve local-only fields like zip_blob)
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

  /* ── Invite code management ────────────────────────────────────────── */

  /**
   * Create an invite code for a plan (online-only).
   * Returns the 6-char code.
   */
  async createInviteCode(planId: string): Promise<string> {
    if (!this._userId) throw new Error("Not authenticated");

    const code = this._generateCode();

    const { error } = await supabase.from("roam_plan_invites").insert({
      code,
      plan_id: planId,
      created_by: this._userId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      max_uses: 5,
      uses: 0,
    });

    if (error) throw new Error(`Failed to create invite: ${error.message}`);
    return code;
  }

  /**
   * Redeem an invite code to join a shared plan.
   * Returns the plan_id.
   */
  async redeemInviteCode(code: string): Promise<string> {
    if (!this._userId) throw new Error("Not authenticated");

    // 1. Look up the invite
    const { data: invite, error: e1 } = await supabase
      .from("roam_plan_invites")
      .select("*")
      .eq("code", code.toUpperCase().trim())
      .single();

    if (e1 || !invite) throw new Error("Invalid invite code");

    // Check expiry
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      throw new Error("Invite code has expired");
    }
    // Check uses
    if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
      throw new Error("Invite code has reached its usage limit");
    }

    // 2. Add user as member
    const { error: e2 } = await supabase.from("roam_plan_members").upsert(
      {
        plan_id: invite.plan_id,
        user_id: this._userId,
        role: "editor",
      },
      { onConflict: "plan_id,user_id" },
    );

    if (e2) throw new Error(`Failed to join plan: ${e2.message}`);

    // 3. Increment invite uses
    await supabase
      .from("roam_plan_invites")
      .update({ uses: invite.uses + 1 })
      .eq("code", code);

    // 4. Pull the plan data to local
    await this.pullRemote();

    return invite.plan_id;
  }

  /* ── Private ───────────────────────────────────────────────────────── */

  private async _executeOp(op: import("./syncQueue").SyncOp): Promise<void> {
    if (!this._userId) throw new Error("No userId");

    switch (op.op) {
      case "plan_upsert": {
        const rec = await getOfflinePlan(op.plan_id);
        if (!rec) {
          // Plan was deleted locally before sync — skip silently
          return;
        }
        const row = localToCloud(rec, this._userId);

        const { error } = await supabase
          .from("roam_plans")
          .upsert(row, { onConflict: "plan_id" });

        if (error) throw new Error(`plan_upsert: ${error.message}`);

        // Also ensure we're an owner-member
        await supabase.from("roam_plan_members").upsert(
          { plan_id: op.plan_id, user_id: this._userId, role: "owner" },
          { onConflict: "plan_id,user_id" },
        );
        break;
      }

      case "plan_delete": {
        const { error } = await supabase
          .from("roam_plans")
          .delete()
          .eq("plan_id", op.plan_id)
          .eq("owner_id", this._userId); // only owner can delete

        if (error) throw new Error(`plan_delete: ${error.message}`);
        break;
      }

      case "plan_label": {
        const { error } = await supabase
          .from("roam_plans")
          .update({ label: op.payload?.label ?? null, updated_at: new Date().toISOString() })
          .eq("plan_id", op.plan_id);

        if (error) throw new Error(`plan_label: ${error.message}`);
        break;
      }

      case "invite_create": {
        await this.createInviteCode(op.plan_id);
        break;
      }

      case "invite_redeem": {
        await this.redeemInviteCode(op.payload?.code ?? "");
        break;
      }

      default:
        console.warn(`[PlanSync] Unknown op type: ${(op as any).op}`);
    }
  }

  private _subscribeRealtime(userId: string) {
    this._channel = supabase
      .channel("roam_plans_sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "roam_plans",
        },
        async (payload) => {
          // Only process changes for plans we're a member of
          const row = (payload.new ?? payload.old) as SupaPlanRow | null;
          if (!row) return;

          // Check membership
          const { data: member } = await supabase
            .from("roam_plan_members")
            .select("plan_id")
            .eq("plan_id", row.plan_id)
            .eq("user_id", userId)
            .maybeSingle();

          // Also check ownership
          const isMember = !!member || row.owner_id === userId;
          if (!isMember) return;

          if (payload.eventType === "DELETE") {
            // Remote delete → remove from local IDB
            try {
              await idbDel(idbStores.plans, row.plan_id);
            } catch {}
          } else {
            // INSERT or UPDATE → merge to local
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
        },
      )
      .subscribe();
  }

  private _generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
    let code = "";
    const arr = crypto.getRandomValues(new Uint8Array(6));
    for (let i = 0; i < 6; i++) {
      code += chars[arr[i] % chars.length];
    }
    return code;
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