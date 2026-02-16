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
  type SyncOp,
} from "./syncQueue";
import {
  getOfflinePlan,
  _putPlanRecordRaw,
  type OfflinePlanRecord,
  type OfflinePlanPreview,
} from "./plansStore";
import { idbGet, idbStores } from "./idb";
import { onPlanEvent, type PlanEventType, type PlanEventPayload } from "./planEvents";

/* ── Supabase row shape ──────────────────────────────────────────────── */

type SupaPlanRow = {
  plan_id: string;
  owner_id: string;
  route_key: string;
  label: string | null;
  preview: OfflinePlanPreview | null;
  manifest_meta: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

/* ── Converters ──────────────────────────────────────────────────────── */

/**
 * Extract the lightweight cloud-safe subset of a local plan.
 * No zip blobs, no huge pack payloads — just the "recipe".
 */
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
    created_at: rec.created_at,
    updated_at: rec.saved_at,
  };
}

/**
 * Merge a cloud row into a local plan record.
 * Preserves local-only fields (zip_blob, zip_bytes, etc).
 */
function cloudToLocal(row: SupaPlanRow): Partial<OfflinePlanRecord> {
  const mm = row.manifest_meta ?? {};
  return {
    plan_id: row.plan_id,
    route_key: row.route_key,
    label: row.label,
    preview: (row.preview as OfflinePlanPreview) ?? undefined,
    created_at: row.created_at,
    saved_at: row.updated_at,
    corridor_status: mm.corridor_status,
    places_status: mm.places_status,
    traffic_status: mm.traffic_status,
    hazards_status: mm.hazards_status,
    corridor_key: mm.corridor_key ?? null,
    places_key: mm.places_key ?? null,
    traffic_key: mm.traffic_key ?? null,
    hazards_key: mm.hazards_key ?? null,
    styles: mm.styles,
    tiles_id: mm.tiles_id,
    is_shared: true,
  };
}

/* ── Sync event types ────────────────────────────────────────────────── */

export type SyncEvent =
  | "drain_start"
  | "drain_end"
  | "pull_complete"
  | "realtime_update"
  | "error";

type SyncListener = (event: SyncEvent, detail?: any) => void;

/* ── PlanSyncManager ─────────────────────────────────────────────────── */

class PlanSyncManager {
  private _started = false;
  private _userId: string | null = null;
  private _draining = false;
  private _channel: RealtimeChannel | null = null;
  private _networkUnsub: (() => void) | null = null;
  private _planEventUnsub: (() => void) | null = null;
  private _listeners = new Set<SyncListener>();

  /* ── Lifecycle ─────────────────────────────────────────────────────── */

  /**
   * Start the sync system. Called by SyncBootstrap when user is authenticated.
   */
  start(userId: string) {
    if (this._started && this._userId === userId) return;
    this.stop(); // clean up any previous session

    this._started = true;
    this._userId = userId;

    // 1. Listen for local plan mutations (from plansStore via planEvents)
    this._planEventUnsub = onPlanEvent(this._handlePlanEvent);

    // 2. Listen for network changes → auto-drain on reconnect
    this._networkUnsub = networkMonitor.subscribe((isOnline) => {
      if (isOnline && this._started) {
        this.pullRemote().then(() => this.drainQueue());
      }
    });

    // 3. Subscribe to Supabase Realtime for shared plan updates
    this._subscribeRealtime(userId);

    // 4. If already online, do an initial sync
    if (networkMonitor.online) {
      this.pullRemote().then(() => this.drainQueue());
    }
  }

  /**
   * Stop sync (on sign-out or unmount).
   */
  stop() {
    this._started = false;
    this._userId = null;

    this._networkUnsub?.();
    this._networkUnsub = null;

    this._planEventUnsub?.();
    this._planEventUnsub = null;

    if (this._channel) {
      supabase.removeChannel(this._channel);
      this._channel = null;
    }
  }

  /**
   * Subscribe to sync events (for UI indicators like spinner/badge).
   */
  subscribe(fn: SyncListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /* ── Plan event handler (from plansStore) ──────────────────────────── */

  private _handlePlanEvent = async (type: PlanEventType, payload: PlanEventPayload) => {
    if (!this._userId) return;

    switch (type) {
      case "plan:saved": {
        const already = await hasQueuedUpsert(payload.planId);
        if (!already) {
          await enqueueSync("plan_upsert", payload.planId);
        }
        break;
      }
      case "plan:deleted": {
        await enqueueSync("plan_delete", payload.planId);
        break;
      }
      case "plan:labeled": {
        await enqueueSync("plan_label", payload.planId, { label: payload.label });
        break;
      }
    }

    // Try to drain immediately if online
    if (networkMonitor.online) {
      this.drainQueue();
    }
  };

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
        if (!networkMonitor.online) break;

        try {
          await this._executeOp(op);
          if (op.id != null) await removeOp(op.id);
        } catch (e: any) {
          const msg = e?.message ?? "Unknown sync error";
          console.warn(`[PlanSync] op ${op.op} failed:`, msg);
          if (op.id != null) await markOpFailed(op.id, msg);
        }
      }
    } catch (e) {
      console.error("[PlanSync] drainQueue error", e);
      this._emit("error", e);
    } finally {
      this._draining = false;
      this._emit("drain_end");
    }
  }

  /* ── Pull remote plans to local ────────────────────────────────────── */

  async pullRemote(): Promise<void> {
    if (!this._userId) return;
    if (!networkMonitor.online) return;

    try {
      // Get all plans this user is a member of
      const { data: memberships, error: mErr } = await supabase
        .from("roam_plan_members")
        .select("plan_id")
        .eq("user_id", this._userId);

      if (mErr) throw mErr;

      const planIds = (memberships ?? []).map((m: any) => m.plan_id);
      if (planIds.length === 0) {
        this._emit("pull_complete");
        return;
      }

      // Fetch those plans
      const { data: rows, error: pErr } = await supabase
        .from("roam_plans")
        .select("*")
        .in("plan_id", planIds);

      if (pErr) throw pErr;

      // Merge into local IDB
      for (const row of (rows ?? []) as SupaPlanRow[]) {
        const local = await getOfflinePlan(row.plan_id);

        if (!local) {
          // Plan exists in cloud but not locally → create local stub
          // (no zip blob — user's device will need to build bundle)
          const newRec: OfflinePlanRecord = {
            ...cloudToLocal(row),
            plan_id: row.plan_id,
            route_key: row.route_key,
            created_at: row.created_at,
            saved_at: row.updated_at,
            is_shared: true,
          };
          await _putPlanRecordRaw(newRec);
        } else {
          // Both exist → last-write-wins by updated_at / saved_at
          const remoteTime = new Date(row.updated_at).getTime();
          const localTime = new Date(local.saved_at).getTime();

          if (remoteTime > localTime) {
            // Remote is newer → merge cloud fields onto local
            // Preserve local-only fields (zip_blob, zip_bytes, etc)
            const merged: OfflinePlanRecord = {
              ...local,
              ...cloudToLocal(row),
            };
            await _putPlanRecordRaw(merged);
          }
          // If local is newer, do nothing — drain will push it
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
    if (!networkMonitor.online) throw new Error("Must be online to create invite");

    // First ensure the plan is pushed to Supabase
    const rec = await getOfflinePlan(planId);
    if (rec) {
      const row = localToCloud(rec, this._userId);
      await supabase.from("roam_plans").upsert(row, { onConflict: "plan_id" });

      // Ensure owner membership
      await supabase.from("roam_plan_members").upsert(
        { plan_id: planId, user_id: this._userId, role: "owner" },
        { onConflict: "plan_id,user_id" },
      );
    }

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

    // Store the share code on the local plan record
    const existing = await getOfflinePlan(planId);
    if (existing) {
      await _putPlanRecordRaw({
        ...existing,
        share_code: code,
        is_shared: true,
      });
    }

    return code;
  }

  /**
   * Redeem an invite code to join a shared plan.
   * Returns the plan_id of the joined plan.
   */
  async redeemInviteCode(code: string): Promise<string> {
    if (!this._userId) throw new Error("Not authenticated");
    if (!networkMonitor.online) throw new Error("Must be online to redeem invite");

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

    // 2. Add self as editor member
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
      .eq("code", code.toUpperCase().trim());

    // 4. Pull the plan definition to local IDB
    await this.pullRemote();

    return invite.plan_id;
  }

  /* ── Private: execute a single sync op ─────────────────────────────── */

  private async _executeOp(op: SyncOp): Promise<void> {
    if (!this._userId) throw new Error("No userId");

    switch (op.op) {
      case "plan_upsert": {
        const rec = await getOfflinePlan(op.plan_id);
        if (!rec) {
          // Plan was deleted locally before sync drained — skip silently
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
        // Only the owner can delete. If not owner, this is a no-op on the server.
        const { error } = await supabase
          .from("roam_plans")
          .delete()
          .eq("plan_id", op.plan_id)
          .eq("owner_id", this._userId);

        if (error) throw new Error(`plan_delete: ${error.message}`);
        break;
      }

      case "plan_label": {
        const { error } = await supabase
          .from("roam_plans")
          .update({
            label: op.payload?.label ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("plan_id", op.plan_id);

        if (error) throw new Error(`plan_label: ${error.message}`);
        break;
      }

      default:
        console.warn(`[PlanSync] Unknown op type: ${(op as any).op}`);
    }
  }

  /* ── Private: Supabase Realtime subscription ───────────────────────── */

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
          const row = (payload.new ?? payload.old) as SupaPlanRow | undefined;
          if (!row?.plan_id) return;

          if (payload.eventType === "DELETE") {
            // A plan we're subscribed to was deleted by its owner
            // We could remove it locally, but for safety just mark it
            console.info("[PlanSync] Plan deleted remotely:", row.plan_id);
            this._emit("realtime_update", { type: "delete", planId: row.plan_id });
            return;
          }

          // INSERT or UPDATE — check if we're a member
          const { data: membership } = await supabase
            .from("roam_plan_members")
            .select("plan_id")
            .eq("plan_id", row.plan_id)
            .eq("user_id", userId)
            .maybeSingle();

          if (!membership) return; // not our plan

          // Merge into local IDB
          const local = await getOfflinePlan(row.plan_id);
          const remoteRow = payload.new as SupaPlanRow;

          if (!local) {
            // New plan from a share — create local stub
            const newRec: OfflinePlanRecord = {
              ...cloudToLocal(remoteRow),
              plan_id: remoteRow.plan_id,
              route_key: remoteRow.route_key,
              created_at: remoteRow.created_at,
              saved_at: remoteRow.updated_at,
              is_shared: true,
            };
            await _putPlanRecordRaw(newRec);
          } else {
            // Merge if remote is newer
            const remoteTime = new Date(remoteRow.updated_at).getTime();
            const localTime = new Date(local.saved_at).getTime();

            if (remoteTime > localTime) {
              const merged: OfflinePlanRecord = {
                ...local,
                ...cloudToLocal(remoteRow),
              };
              await _putPlanRecordRaw(merged);
            }
          }

          this._emit("realtime_update", { type: payload.eventType, planId: row.plan_id });
        },
      )
      .subscribe();
  }

  /* ── Private: generate share code ──────────────────────────────────── */

  private _generateCode(): string {
    // Exclude ambiguous characters: I, O, 0, 1
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    const arr = crypto.getRandomValues(new Uint8Array(6));
    for (let i = 0; i < 6; i++) {
      code += chars[arr[i] % chars.length];
    }
    return code;
  }

  /* ── Private: emit sync event ──────────────────────────────────────── */

  private _emit(event: SyncEvent, detail?: any) {
    for (const fn of this._listeners) {
      try {
        fn(event, detail);
      } catch (e) {
        console.error("[PlanSync] listener error", e);
      }
    }
  }
}

/** Singleton — imported by usePlanSync hook and SyncBootstrap */
export const planSync = new PlanSyncManager();