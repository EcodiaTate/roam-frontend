// src/components/trip/PlanDrawer.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFLIP } from "@/lib/hooks/useFLIP";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock,
  Image as ImageIcon,
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
import { TripShareModal } from "@/components/share/TripShareModal";
import type { ShareCardData } from "@/components/share/TripShareCard";
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
    const prevLabel = currentLabel?.trim() || null;

    // Optimistic: update UI immediately and close editor
    haptic.light();
    onDone(trimmed || null);
    setEditing(false);

    // Persist in background — revert on failure
    try {
      await renameOfflinePlan(planId, trimmed);
    } catch {
      onDone(prevLabel);
      haptic.error();
    }
  }, [planId, value, onDone, currentLabel]);

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
  onInvite,
  onLabelChanged,
}: {
  plan: OfflinePlanRecord;
  isCurrent: boolean;
  busy: boolean;
  onOpen: () => void;
  onSetActive: () => void;
  onDelete: () => void;
  onShare: () => void;
  onInvite: () => void;
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
        flexShrink: 0,
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
            gap: 4,
            padding: "12px 11px",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--brand-amber)",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.4 : 1,
            borderRight: "1px solid var(--roam-border)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <ImageIcon size={12} />
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onInvite();
          }}
          style={{
            all: "unset",
            flex: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 11px",
            fontSize: 11,
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
  onNewTrip,
}: {
  open: boolean;
  onClose: () => void;
  currentPlanId?: string | null;
  /** Called when "New" is tapped. If provided, replaces the default router.push("/new"). */
  onNewTrip?: () => void;
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

  // Share card state
  const [shareCardData, setShareCardData] = useState<ShareCardData | null>(null);

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

  /* ── FLIP animation for plan card reorder ────────────────────────── */
  const { registerEl: registerPlanEl, capturePositions: capturePlanPositions, getEl: getPlanEl } = useFLIP(sorted, { duration: 300 });

  const handleSetActive = useCallback(async (planId: string) => {
    haptic.medium();
    setErr(null);

    // Optimistic: update UI immediately
    const prevId = currentId;
    capturePlanPositions();
    setCurrentIdLocal(planId);

    // Persist in background — revert on failure
    try {
      await setCurrentPlanId(planId);
    } catch (e) {
      // Revert
      capturePlanPositions();
      setCurrentIdLocal(prevId);
      const err = e instanceof Error ? e.message : String(e);
      setErr(err || "Failed to set active");
      haptic.error();
    }
  }, [capturePlanPositions, currentId]);

  const handleDelete = useCallback(
    async (planId: string) => {
      if (!window.confirm("Delete this plan and all its offline data from this device?")) return;
      haptic.medium();
      setErr(null);

      // Snapshot for rollback
      const prevPlans = plans;
      const prevCurrentId = currentId;

      // Animate the card out before removing from state
      const el = getPlanEl(planId);
      if (el) {
        el.style.transition = "opacity 180ms ease, transform 180ms ease";
        el.style.opacity = "0";
        el.style.transform = "scale(0.96)";
        await new Promise((r) => setTimeout(r, 180));
      }

      // Optimistic: remove from list immediately
      capturePlanPositions();
      setPlans((prev) => prev.filter((p) => p.plan_id !== planId));
      if (currentId === planId) setCurrentIdLocal(null);
      haptic.success();

      // Persist in background — revert on failure
      try {
        await deleteOfflinePlan(planId);
      } catch (e) {
        // Revert
        capturePlanPositions();
        setPlans(prevPlans);
        setCurrentIdLocal(prevCurrentId);
        const err = e instanceof Error ? e.message : String(e);
        setErr(err || "Failed to delete");
        haptic.error();
      }
    },
    [plans, currentId, capturePlanPositions, getPlanEl],
  );

  const handleOpen = useCallback(
    (planId: string) => {
      haptic.light();
      onClose();
      router.push(`/trip?plan_id=${encodeURIComponent(planId)}`);
    },
    [router, onClose],
  );

  const handleShare = useCallback(
    (planId: string) => {
      haptic.medium();
      const plan = plans.find((p) => p.plan_id === planId);
      if (!plan?.preview) return;
      setShareCardData({
        stops: plan.preview.stops,
        geometry: plan.preview.geometry,
        distance_m: plan.preview.distance_m,
        duration_s: plan.preview.duration_s,
        label: plan.label,
      });
    },
    [plans],
  );

  const handleInvite = useCallback((planId: string) => {
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
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 16px 12px",
            paddingTop: "max(16px, env(safe-area-inset-top, 0px) + 16px)",
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
                if (onNewTrip) { onNewTrip(); } else { router.push("/new"); }
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
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div
            className="roam-scroll"
            style={{
              height: "100%",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              padding: "12px",
              paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px) + 12px)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              boxSizing: "border-box",
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
                <div
                  key={p.plan_id}
                  ref={(el) => registerPlanEl(p.plan_id, el)}
                >
                  <PlanCard
                    plan={p}
                    isCurrent={p.plan_id === currentId}
                    busy={busyId === p.plan_id}
                    onOpen={() => handleOpen(p.plan_id)}
                    onSetActive={() => handleSetActive(p.plan_id)}
                    onDelete={() => handleDelete(p.plan_id)}
                    onShare={() => handleShare(p.plan_id)}
                    onInvite={() => handleInvite(p.plan_id)}
                    onLabelChanged={(label) => handleLabelChanged(p.plan_id, label)}
                  />
                </div>
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

      {/* Share card modal */}
      <TripShareModal
        open={shareCardData !== null}
        data={shareCardData}
        onClose={() => setShareCardData(null)}
      />

      {/* fadeIn animation now handled by roam-fade-in in globals.css */}
    </>
  );
}
