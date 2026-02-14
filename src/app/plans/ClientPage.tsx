// src/app/plans/ClientPage.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { OfflinePlanRecord } from "@/lib/offline/plansStore";
import { deleteOfflinePlan, getCurrentPlanId, listOfflinePlans, setCurrentPlanId } from "@/lib/offline/plansStore";

function fmtBytes(n?: number) {
  if (!n || n <= 0) return "—";
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function PlansClientPage() {
  const router = useRouter();

  const [plans, setPlans] = useState<OfflinePlanRecord[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const [p, cur] = await Promise.all([listOfflinePlans(), getCurrentPlanId()]);
    setPlans(p);
    setCurrentId(cur);
  }

  useEffect(() => {
    refresh().catch((e: any) => setErr(e?.message ?? "Failed to load plans"));
  }, []);

  const hasPlans = plans.length > 0;

  const sorted = useMemo(() => {
    // current first, then newest saved
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

  return (
    <div style={wrap}>
      <div style={header}>
        <div>
          <div style={h1}>Plans</div>
          <div style={muted}>Offline bundles saved on this device</div>
        </div>
        <button type="button" style={btn} onClick={() => router.push("/new")}>
          + New
        </button>
      </div>

      {err ? <div style={errBox}>{err}</div> : null}

      {!hasPlans ? (
        <div style={empty}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>No offline plans saved yet.</div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Build a route in <b>New</b>, then <b>Build offline</b> → <b>Save offline</b>.
          </div>
        </div>
      ) : null}

      <div style={grid}>
        {sorted.map((p) => {
          const isCurrent = p.plan_id === currentId;
          const busy = busyId === p.plan_id;

          return (
            <div key={p.plan_id} style={{ ...card, outline: isCurrent ? "2px solid rgba(46,124,246,0.55)" : "none" }}>
              <div style={rowBetween}>
                <div>
                  <div style={cardTitle}>
                    {p.label?.trim?.() ? p.label : "Offline Plan"}
                    {isCurrent ? <span style={pill}>Current</span> : null}
                  </div>
                  <div style={small}>
                    {new Date(p.saved_at).toLocaleString()} · {fmtBytes(p.zip_bytes)}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={small}>route_key</div>
                  <div style={mono}>{p.route_key.slice(0, 10)}…</div>
                </div>
              </div>

              <div style={statusRow}>
                <span style={statusPill(p.corridor_status)}>corridor: {p.corridor_status ?? "—"}</span>
                <span style={statusPill(p.places_status)}>places: {p.places_status ?? "—"}</span>
                <span style={statusPill(p.traffic_status)}>traffic: {p.traffic_status ?? "—"}</span>
                <span style={statusPill(p.hazards_status)}>hazards: {p.hazards_status ?? "—"}</span>
              </div>

              <div style={actions}>
                <button
                  type="button"
                  style={{ ...btnSmall, opacity: busy ? 0.6 : 1 }}
                  disabled={busy}
                  onClick={async () => {
                    setBusyId(p.plan_id);
                    setErr(null);
                    try {
                      await setCurrentPlanId(p.plan_id);
                      setCurrentId(p.plan_id);
                    } catch (e: any) {
                      setErr(e?.message ?? "Failed to set current");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  Set current
                </button>

                <button
                  type="button"
                  style={{ ...btnSmall, opacity: busy ? 0.6 : 1 }}
                  disabled={busy}
                  onClick={() => {
                    // UX choice: opening doesn’t implicitly set current.
                    // We pass a query param for “load this plan” behavior.
                    router.push(`/trip?plan_id=${encodeURIComponent(p.plan_id)}`);
                  }}
                >
                  Open in Trip
                </button>

                <button
                  type="button"
                  style={{ ...btnDanger, opacity: busy ? 0.6 : 1 }}
                  disabled={busy}
                  onClick={async () => {
                    const ok = window.confirm("Delete this offline plan from this device?");
                    if (!ok) return;
                    setBusyId(p.plan_id);
                    setErr(null);
                    try {
                      await deleteOfflinePlan(p.plan_id);
                      await refresh();
                    } catch (e: any) {
                      setErr(e?.message ?? "Failed to delete");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 120 }} />
    </div>
  );
}

const wrap: React.CSSProperties = {
  padding: 14,
  paddingBottom: 120,
  maxWidth: 860,
  margin: "0 auto",
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 12,
  marginBottom: 12,
};

const h1: React.CSSProperties = { fontSize: 22, fontWeight: 900, lineHeight: 1.1 };
const muted: React.CSSProperties = { fontSize: 13, opacity: 0.72 };

const grid: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const card: React.CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(10,14,22,0.80)",
  backdropFilter: "blur(14px)",
  padding: 12,
  display: "grid",
  gap: 10,
};

const rowBetween: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
};

const cardTitle: React.CSSProperties = { fontSize: 16, fontWeight: 900, display: "flex", gap: 8, alignItems: "center" };

const pill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(46,124,246,0.40)",
  background: "rgba(46,124,246,0.14)",
};

const small: React.CSSProperties = { fontSize: 12, opacity: 0.75 };
const mono: React.CSSProperties = { fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", opacity: 0.9 };

const statusRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };

function statusPill(status?: string): React.CSSProperties {
  const ok = status === "ready";
  const bad = status === "error";
  return {
    fontSize: 11,
    fontWeight: 850,
    padding: "4px 8px",
    borderRadius: 999,
    border: `1px solid ${ok ? "rgba(34,197,94,0.40)" : bad ? "rgba(239,68,68,0.40)" : "rgba(255,255,255,0.14)"}`,
    background: ok
      ? "rgba(34,197,94,0.12)"
      : bad
        ? "rgba(239,68,68,0.12)"
        : "rgba(255,255,255,0.06)",
    opacity: 0.95,
  };
}

const actions: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 10,
  marginTop: 2,
};

const btnSmall: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  padding: "10px 10px",
  fontWeight: 800,
};

const btnDanger: React.CSSProperties = {
  ...btnSmall,
  border: "1px solid rgba(239,68,68,0.35)",
  background: "rgba(239,68,68,0.12)",
};

const btn: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.08)",
  color: "inherit",
  padding: "10px 12px",
  fontWeight: 900,
};

const empty: React.CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  padding: 14,
  marginTop: 8,
};

const errBox: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,90,90,0.30)",
  background: "rgba(255,90,90,0.10)",
  padding: 12,
  fontSize: 12,
  marginBottom: 12,
};
