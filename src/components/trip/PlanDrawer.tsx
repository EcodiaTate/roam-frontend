// src/components/trip/PlanDrawer.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock,
  Link2,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  Route,
  Share2,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { InviteCodeModal } from "@/components/plans/InviteCodeModal";
import { haptic } from "@/lib/native/haptics";
import type { OfflinePlanRecord } from "@/lib/offline/plansStore";
import {
  deleteOfflinePlan,
  getCurrentPlanId,
  listOfflinePlans,
  renameOfflinePlan,
  setCurrentPlanId,
} from "@/lib/offline/plansStore";

/* ── Formatters ──────────────────────────────────────────────────────── */


function fmtKm(m?: number) {
  if (!m) return " - ";
  const km = m / 1000;
  return km >= 100 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
}

function fmtDuration(s?: number) {
  if (!s) return " - ";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function routeLabel(p: OfflinePlanRecord): string {
  const stops = p.preview?.stops;
  if (!stops || stops.length === 0) return "Unnamed route";
  const start = stops.find((s) => s.type === "start");
  const end = stops.find((s) => s.type === "end");
  const startName = start?.name?.replace(/^My location$/i, "Current location") || "?";
  const endName = end?.name || "?";
  if (startName === endName) return startName;
  return `${startName} → ${endName}`;
}

function stopCount(p: OfflinePlanRecord): number {
  const stops = p.preview?.stops;
  if (!stops) return 0;
  return stops.filter((s) => s.type !== "start" && s.type !== "end").length;
}

/* ── Inline rename component ─────────────────────────────────────────── */

function InlineRename({
  planId,
  currentLabel,
  fallback,
  onDone,
}: {
  planId: string;
  currentLabel: string | null | undefined;
  fallback: string;
  onDone: (newLabel: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentLabel?.trim() || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = useCallback(async () => {
    const trimmed = value.trim();
    try {
      await renameOfflinePlan(planId, trimmed);
      haptic.light();
      onDone(trimmed || null);
    } catch {
      // revert silently
    }
    setEditing(false);
  }, [planId, value, onDone]);

  const cancel = useCallback(() => {
    setValue(currentLabel?.trim() || "");
    setEditing(false);
  }, [currentLabel]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          haptic.light();
          setValue(currentLabel?.trim() || "");
          setEditing(true);
        }}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          maxWidth: "100%",
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--roam-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {currentLabel?.trim() || fallback}
        </span>
        <Pencil
          size={12}
          style={{
            flexShrink: 0,
            color: "var(--roam-text-muted)",
            opacity: 0.5,
          }}
        />
      </button>
    );
  }

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        maxLength={100}
        placeholder="Trip name…"
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: 700,
          color: "var(--roam-text)",
          background: "var(--roam-surface-raised, var(--roam-surface))",
          border: "1.5px solid var(--brand-sky)",
          borderRadius: 8,
          padding: "6px 10px",
          outline: "none",
          minWidth: 0,
        }}
      />
      <button
        type="button"
        onClick={save}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 6,
          background: "var(--roam-accent)",
          color: "var(--on-color)",
          flexShrink: 0,
        }}
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={cancel}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 6,
          background: "var(--roam-surface)",
          border: "1px solid var(--roam-border)",
          color: "var(--roam-text-muted)",
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/* ── Status dot ──────────────────────────────────────────────────────── */

function StatusDot({ status }: { status?: string }) {
  const color =
    status === "ready"
      ? "var(--roam-success)"
      : status === "error"
        ? "var(--roam-danger)"
        : "var(--roam-text-muted)";

  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

/* ── Plan Card (Drawer variant - compact) ────────────────────────────── */

function PlanCard({
  plan,
  isCurrent,
  busy,
  onOpen,
  onSetActive,
  onDelete,
  onShare,
  onLabelChanged,
}: {
  plan: OfflinePlanRecord;
  isCurrent: boolean;
  busy: boolean;
  onOpen: () => void;
  onSetActive: () => void;
  onDelete: () => void;
  onShare: () => void;
  onLabelChanged: (label: string | null) => void;
}) {
  const stops = stopCount(plan);
  const label = routeLabel(plan);

  return (
    <div
      style={{
        background: "var(--roam-card-bg, var(--roam-surface))",
        borderRadius: 16,
        border: isCurrent
          ? "2px solid var(--brand-sky)"
          : "1px solid var(--roam-border)",
        overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s",
        boxShadow: isCurrent
          ? "0 0 0 3px rgba(59,130,246,0.12)"
          : "var(--shadow-soft, 0 1px 3px rgba(0,0,0,0.06))",
        display: "flex",
      }}
    >
      {/* Accent stripe */}
      <div
        style={{
          width: 4,
          flexShrink: 0,
          background: isCurrent ? "var(--brand-sky)" : "var(--roam-border)",
          borderRadius: "16px 0 0 16px",
        }}
      />
      {/* ── Main content ──────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => e.key === "Enter" && onOpen()}
        style={{
          padding: "12px 14px",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {/* Top row: label + badges */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineRename
              planId={plan.plan_id}
              currentLabel={plan.label}
              fallback={label}
              onDone={onLabelChanged}
            />
          </div>
          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {plan.is_shared && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "var(--accent-tint)",
                  color: "var(--brand-shared)",
                  fontSize: 10,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                <Users size={8} />
              </span>
            )}
            {isCurrent && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(59,130,246,0.12)",
                  color: "var(--brand-sky)",
                  fontSize: 10,
                  fontWeight: 800,
                }}
              >
                <Star size={8} fill="currentColor" />
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 11,
            color: "var(--roam-text-muted)",
            fontWeight: 600,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <Route size={11} />
            {fmtKm(plan.preview?.distance_m)}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <Clock size={11} />
            {fmtDuration(plan.preview?.duration_s)}
          </span>
          {stops > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <MapPin size={11} />
              {stops}
            </span>
          )}
        </div>

        {/* Bundle readiness row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
            fontSize: 10,
            color: "var(--roam-text-muted)",
            fontWeight: 500,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <StatusDot status={plan.corridor_status} /> Corridor
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <StatusDot status={plan.places_status} /> Places
          </span>
        </div>
      </div>

      {/* ── Actions bar ──────────────────────────────── */}
      <div style={{ display: "flex", borderTop: "1px solid var(--roam-border)" }} className="trip-interactive">
        {!isCurrent && (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onSetActive();
            }}
            style={{
              all: "unset",
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              padding: "12px 0",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--brand-sky)",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.4 : 1,
              borderRight: "1px solid var(--roam-border)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Star size={12} />
            Active
          </button>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          style={{
            all: "unset",
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "12px 0",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--roam-text)",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.4 : 1,
            borderRight: "1px solid var(--roam-border)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Navigation size={12} />
          Open
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
          style={{
            all: "unset",
            flex: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 12px",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--brand-shared)",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.4 : 1,
            borderRight: "1px solid var(--roam-border)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Share2 size={12} />
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            all: "unset",
            flex: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 12px",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--roam-danger)",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.4 : 1,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      </div>
    </div>
  );
}

/* ── Plan Drawer Component ──────────────────────────────────────────── */

export function PlanDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  currentPlanId?: string | null;
}) {
  const router = useRouter();
  const [plans, setPlans] = useState<OfflinePlanRecord[]>([]);
  const [currentId, setCurrentIdLocal] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"create" | "redeem">("redeem");
  const [invitePlanId, setInvitePlanId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, cur] = await Promise.all([
        listOfflinePlans(),
        getCurrentPlanId(),
      ]);
      setPlans(p);
      setCurrentIdLocal(cur);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setErr(err || "Failed to load plans");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh]);

  const sorted = useMemo(() => {
    const cur = currentId;
    const copy = [...plans];
    copy.sort((a, b) => {
      const ac = a.plan_id === cur ? -1 : 0;
      const bc = b.plan_id === cur ? -1 : 0;
      if (ac !== bc) return ac - bc;
      return (b.saved_at ?? "").localeCompare(a.saved_at ?? "");
    });
    return copy;
  }, [plans, currentId]);

  const handleSetActive = useCallback(async (planId: string) => {
    haptic.medium();
    setBusyId(planId);
    setErr(null);
    try {
      await setCurrentPlanId(planId);
      setCurrentIdLocal(planId);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setErr(err || "Failed to set active");
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleDelete = useCallback(
    async (planId: string) => {
      if (!window.confirm("Delete this plan and all its offline data from this device?")) return;
      haptic.medium();
      setBusyId(planId);
      setErr(null);
      try {
        await deleteOfflinePlan(planId);
        haptic.success();
        await refresh();
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        setErr(err || "Failed to delete");
        haptic.error();
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const handleOpen = useCallback(
    (planId: string) => {
      haptic.light();
      onClose();
      router.push(`/trip?plan_id=${encodeURIComponent(planId)}`);
    },
    [router, onClose],
  );

  const handleShare = useCallback((planId: string) => {
    haptic.light();
    setInvitePlanId(planId);
    setInviteMode("create");
    setInviteOpen(true);
  }, []);

  const handleJoin = useCallback(() => {
    haptic.light();
    setInvitePlanId(null);
    setInviteMode("redeem");
    setInviteOpen(true);
  }, []);

  const handleLabelChanged = useCallback(
    (planId: string, label: string | null) => {
      setPlans((prev) =>
        prev.map((p) => (p.plan_id === planId ? { ...p, label } : p)),
      );
    },
    [],
  );

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-bg, rgba(0,0,0,0.3))",
            zIndex: 39,
            animation: "roam-fade-in 0.2s ease",
            WebkitTapHighlightColor: "transparent",
          }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(100%, 360px)",
          background: "var(--roam-surface)",
          zIndex: 40,
          boxShadow: open ? "-4px 0 16px rgba(0,0,0,0.2)" : "none",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid var(--roam-border)",
            background: "var(--roam-surface)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 900,
                color: "var(--roam-text)",
                margin: 0,
              }}
            >
              Plans
            </h2>
            <button
              type="button"
              onClick={onClose}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--roam-surface-hover)",
                color: "var(--roam-text)",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Join + New buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleJoin}
              style={{
                all: "unset",
                cursor: "pointer",
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                height: 42,
                borderRadius: 10,
                background: "var(--roam-surface-hover)",
                border: "1px solid var(--roam-border)",
                color: "var(--roam-text)",
                fontSize: 13,
                fontWeight: 700,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Link2 size={14} />
              Join
            </button>
            <button
              type="button"
              onClick={() => {
                haptic.light();
                onClose();
                router.push("/new");
              }}
              style={{
                all: "unset",
                cursor: "pointer",
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                height: 42,
                borderRadius: 10,
                background: "var(--roam-accent)",
                color: "var(--on-color)",
                fontSize: 13,
                fontWeight: 700,
                boxShadow: "var(--shadow-button)",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Plus size={16} />
              New
            </button>
          </div>
        </div>

        {/* Error banner */}
        {err && (
          <div
            className="trip-err-box"
            style={{
              margin: "12px 12px 0",
            }}
          >
            {err}
          </div>
        )}

        {/* Plans list */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div
            className="roam-scroll"
            style={{
              height: "100%",
              overflowY: "auto",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {sorted.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: "24px 12px",
                  color: "var(--roam-text-muted)",
                  fontSize: 13,
                }}
              >
                <Navigation size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                No plans yet. Create one in New.
              </div>
            ) : (
              sorted.map((p) => (
                <PlanCard
                  key={p.plan_id}
                  plan={p}
                  isCurrent={p.plan_id === currentId}
                  busy={busyId === p.plan_id}
                  onOpen={() => handleOpen(p.plan_id)}
                  onSetActive={() => handleSetActive(p.plan_id)}
                  onDelete={() => handleDelete(p.plan_id)}
                  onShare={() => handleShare(p.plan_id)}
                  onLabelChanged={(label) => handleLabelChanged(p.plan_id, label)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Invite modal */}
      <InviteCodeModal
        open={inviteOpen}
        planId={invitePlanId}
        mode={inviteMode}
        onClose={() => {
          setInviteOpen(false);
          setInvitePlanId(null);
        }}
        onRedeemed={() => {
          setInviteOpen(false);
          setInvitePlanId(null);
          refresh();
        }}
      />

      {/* fadeIn animation now handled by roam-fade-in in globals.css */}
    </>
  );
}
