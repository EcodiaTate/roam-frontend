// src/app/plans/PlansClientPage.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Plus,
  Navigation,
  Clock,
  HardDrive,
  Trash2,
  ChevronRight,
  Pencil,
  Check,
  X,
  Star,
  Route,
  Share2,
  Link2,
  Users,
} from "lucide-react";

import type { OfflinePlanRecord } from "@/lib/offline/plansStore";
import {
  deleteOfflinePlan,
  getCurrentPlanId,
  listOfflinePlans,
  renameOfflinePlan,
  setCurrentPlanId,
} from "@/lib/offline/plansStore";
import { haptic } from "@/lib/native/haptics";
import { InviteCodeModal } from "@/components/plans/InviteCodeModal";

/* ── Formatters ──────────────────────────────────────────────────────── */

function fmtBytes(n?: number) {
  if (!n || n <= 0) return "—";
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function fmtKm(m?: number) {
  if (!m) return "—";
  const km = m / 1000;
  return km >= 100 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
}

function fmtDuration(s?: number) {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
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
            fontSize: 15,
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
          size={13}
          style={{ flexShrink: 0, color: "var(--roam-text-muted)", opacity: 0.5 }}
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
          fontSize: 15,
          fontWeight: 700,
          color: "var(--roam-text)",
          background: "var(--roam-surface-raised, var(--roam-surface))",
          border: "1.5px solid var(--brand-sky, #3b82f6)",
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
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "var(--brand-sky, #3b82f6)",
          color: "white",
          flexShrink: 0,
        }}
      >
        <Check size={16} />
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
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "var(--roam-surface)",
          border: "1px solid var(--roam-border)",
          color: "var(--roam-text-muted)",
          flexShrink: 0,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

/* ── Status dot ──────────────────────────────────────────────────────── */

function StatusDot({ status }: { status?: string }) {
  const color =
    status === "ready"
      ? "#22c55e"
      : status === "error"
        ? "#ef4444"
        : "var(--roam-text-muted)";

  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

/* ── Plan Card ───────────────────────────────────────────────────────── */

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
          ? "2px solid var(--brand-sky, #3b82f6)"
          : "1px solid var(--roam-border)",
        overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s",
        boxShadow: isCurrent
          ? "0 0 0 3px rgba(59,130,246,0.12)"
          : "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      {/* ── Main content (tappable to open) ──────────────────── */}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => e.key === "Enter" && onOpen()}
        style={{
          padding: "16px 16px 12px",
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
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {plan.is_shared && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "3px 7px",
                  borderRadius: 6,
                  background: "rgba(168,85,247,0.12)",
                  color: "#a855f7",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                <Users size={9} />
                Shared
              </span>
            )}
            {isCurrent && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "rgba(59,130,246,0.12)",
                  color: "var(--brand-sky, #3b82f6)",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                <Star size={10} fill="currentColor" />
                Active
              </span>
            )}
          </div>
        </div>

        {/* Route summary (when custom label is set) */}
        {plan.label?.trim() ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--roam-text-muted)",
              marginBottom: 8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
        ) : null}

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 12,
            color: "var(--roam-text-muted)",
            fontWeight: 500,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Route size={12} />
            {fmtKm(plan.preview?.distance_m)}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Clock size={12} />
            {fmtDuration(plan.preview?.duration_s)}
          </span>
          {stops > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <MapPin size={12} />
              {stops} stop{stops !== 1 ? "s" : ""}
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <HardDrive size={12} />
            {fmtBytes(plan.zip_bytes)}
          </span>
        </div>

        {/* Bundle readiness row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 10,
            fontSize: 11,
            color: "var(--roam-text-muted)",
            fontWeight: 500,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <StatusDot status={plan.corridor_status} /> Corridor
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <StatusDot status={plan.places_status} /> Places
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <StatusDot status={plan.traffic_status} /> Traffic
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <StatusDot status={plan.hazards_status} /> Hazards
          </span>
          <span style={{ marginLeft: "auto", opacity: 0.6, fontSize: 11 }}>
            {fmtRelativeTime(plan.saved_at)}
          </span>
        </div>
      </div>

      {/* ── Actions bar ──────────────────────────────────────── */}
      <div style={{ display: "flex", borderTop: "1px solid var(--roam-border)" }}>
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
              gap: 6,
              padding: "11px 0",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--brand-sky, #3b82f6)",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.4 : 1,
              borderRight: "1px solid var(--roam-border)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Star size={13} />
            Set Active
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
            gap: 6,
            padding: "11px 0",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--roam-text)",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.4 : 1,
            borderRight: "1px solid var(--roam-border)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Navigation size={13} />
          Open
          <ChevronRight size={14} style={{ opacity: 0.4 }} />
        </button>

        {/* Share button */}
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
            padding: "11px 14px",
            fontSize: 13,
            fontWeight: 700,
            color: "#a855f7",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.4 : 1,
            borderRight: "1px solid var(--roam-border)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Share2 size={14} />
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
            padding: "11px 16px",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--roam-danger, #ef4444)",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.4 : 1,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────── */

export function PlansClientPage() {
  const router = useRouter();

  const [plans, setPlans] = useState<OfflinePlanRecord[]>([]);
  const [currentId, setCurrentIdLocal] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"create" | "redeem">("redeem");
  const [invitePlanId, setInvitePlanId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, cur] = await Promise.all([listOfflinePlans(), getCurrentPlanId()]);
      setPlans(p);
      setCurrentIdLocal(cur);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load plans");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasPlans = plans.length > 0;

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
    } catch (e: any) {
      setErr(e?.message ?? "Failed to set active");
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
      } catch (e: any) {
        setErr(e?.message ?? "Failed to delete");
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
      router.push(`/trip?plan_id=${encodeURIComponent(planId)}`);
    },
    [router],
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

  const handleLabelChanged = useCallback((planId: string, label: string | null) => {
    setPlans((prev) => prev.map((p) => (p.plan_id === planId ? { ...p, label } : p)));
  }, []);

  return (
    <div className="trip-app-container" style={{ overflowY: "auto" }}>
      <div
        style={{
          padding: "20px 16px",
          paddingBottom: "calc(var(--bottom-nav-height, 80px) + 40px)",
          maxWidth: 480,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 900,
                color: "var(--roam-text)",
                margin: 0,
                letterSpacing: -0.5,
              }}
            >
              Plans
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "var(--roam-text-muted)",
                margin: "4px 0 0",
                fontWeight: 500,
              }}
            >
              {hasPlans
                ? `${plans.length} saved trip${plans.length !== 1 ? "s" : ""}`
                : "No offline plans yet"}
            </p>
          </div>

          {/* Header action buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            {/* Join Plan button */}
            <button
              type="button"
              onClick={handleJoin}
              aria-label="Join Plan"
              style={{
                all: "unset",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                height: 40,
                padding: "0 14px",
                borderRadius: 12,
                background: "var(--roam-surface)",
                border: "1px solid var(--roam-border)",
                color: "var(--roam-text)",
                fontSize: 13,
                fontWeight: 700,
                WebkitTapHighlightColor: "transparent",
                transition: "transform 0.1s",
              }}
            >
              <Link2 size={15} />
              Join
            </button>

            {/* New Plan button */}
            <button
              type="button"
              onClick={() => {
                haptic.light();
                router.push("/new");
              }}
              aria-label="New Plan"
              style={{
                all: "unset",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "var(--brand-sky, #3b82f6)",
                color: "white",
                boxShadow: "0 2px 8px rgba(59,130,246,0.3)",
                WebkitTapHighlightColor: "transparent",
                transition: "transform 0.1s",
              }}
            >
              <Plus size={22} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* ── Error banner ───────────────────────────────────── */}
        {err && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "var(--roam-danger, #ef4444)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {err}
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────── */}
        {loaded && !hasPlans && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "48px 24px",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                background: "var(--roam-surface)",
                border: "1px solid var(--roam-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Navigation size={28} style={{ color: "var(--roam-text-muted)", opacity: 0.5 }} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: "var(--roam-text)",
                  marginBottom: 6,
                }}
              >
                No trips saved yet
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--roam-text-muted)",
                  lineHeight: 1.5,
                  maxWidth: 260,
                }}
              >
                Build a route in <strong>New</strong>, then hit{" "}
                <strong>Build Offline</strong> to save it here. Or{" "}
                <strong>join a shared plan</strong> from your travel partner.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => router.push("/new")}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 20px",
                  borderRadius: 10,
                  background: "var(--brand-sky, #3b82f6)",
                  color: "white",
                  fontSize: 14,
                  fontWeight: 700,
                  boxShadow: "0 2px 8px rgba(59,130,246,0.25)",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <Plus size={16} />
                Plan a trip
              </button>
              <button
                type="button"
                onClick={handleJoin}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 20px",
                  borderRadius: 10,
                  background: "var(--roam-surface)",
                  border: "1px solid var(--roam-border)",
                  color: "var(--roam-text)",
                  fontSize: 14,
                  fontWeight: 700,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <Link2 size={16} />
                Join plan
              </button>
            </div>
          </div>
        )}

        {/* ── Plans list ─────────────────────────────────────── */}
        {sorted.map((p) => (
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
        ))}
      </div>

      {/* ── Invite modal (create or redeem) ──────────────────────────── */}
      <InviteCodeModal
        open={inviteOpen}
        planId={invitePlanId}
        mode={inviteMode}
        onClose={() => {
          setInviteOpen(false);
          setInvitePlanId(null);
        }}
        onRedeemed={(joinedPlanId) => {
          setInviteOpen(false);
          setInvitePlanId(null);
          // Refresh the list to show the newly joined plan
          refresh();
        }}
      />
    </div>
  );
}