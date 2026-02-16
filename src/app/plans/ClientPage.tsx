"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { OfflinePlanRecord } from "@/lib/offline/plansStore";
import { deleteOfflinePlan, getCurrentPlanId, listOfflinePlans, setCurrentPlanId } from "@/lib/offline/plansStore";
import { Map } from "lucide-react"
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

  function getStatusClass(status?: string) {
    if (status === "ready") return "trip-badge-ok";
    if (status === "error") return "trip-badge-bad";
    return "trip-badge-soft";
  }

  return (
    <div className="trip-app-container" style={{ overflowY: "auto" }}>
      <div style={{ padding: "24px 20px", paddingBottom: "calc(var(--bottom-nav-height) + 40px)", maxWidth: 600, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        
        {/* Header */}
        <div className="trip-row-between" style={{ alignItems: "flex-end" }}>
          <div>
            <h1 className="trip-h1">Plans</h1>
            <div className="trip-muted" style={{ marginTop: 4 }}>Offline bundles on this device</div>
          </div>
          <button 
            type="button" 
            className="trip-interactive trip-btn-icon" 
            style={{ background: "var(--roam-accent)", color: "white" }} 
            onClick={() => router.push("/new")}
            aria-label="New Plan"
          >
            +
          </button>
        </div>

        {err && <div className="trip-err-box">{err}</div>}

        {/* Empty State */}
        {!hasPlans && (
          <div className="trip-card" style={{ maxWidth: "100%", textAlign: "center", padding: 32, alignItems: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}><Map/></div>
            <div className="trip-h2">No offline plans yet</div>
            <div className="trip-muted" style={{ marginTop: 8 }}>
              Build a route in <b>New</b>, then hit <b>Build offline</b> followed by <b>Save</b> to store it here.
            </div>
          </div>
        )}

        {/* Plans List */}
        <div className="trip-flex-col" style={{ gap: 16 }}>
          {sorted.map((p) => {
            const isCurrent = p.plan_id === currentId;
            const busy = busyId === p.plan_id;

            return (
              <div 
                key={p.plan_id} 
                className="trip-card" 
                style={{ 
                  maxWidth: "100%", 
                  padding: 20, 
                  outline: isCurrent ? "3px solid var(--brand-sky)" : "none",
                  outlineOffset: isCurrent ? "-3px" : "0"
                }}
              >
                <div className="trip-row-between" style={{ alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0, paddingRight: 12 }}>
                    <div className="trip-title trip-truncate" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {p.label?.trim?.() ? p.label : "Offline Plan"}
                      {isCurrent && <span className="trip-badge trip-badge-blue">Current</span>}
                    </div>
                    <div className="trip-muted-small" style={{ marginTop: 4 }}>
                      {new Date(p.saved_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} · {fmtBytes(p.zip_bytes)}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div className="trip-muted-small" style={{ textTransform: "uppercase", fontSize: "0.65rem", letterSpacing: 0.5 }}>ID</div>
                    <div className="trip-muted-small" style={{ fontFamily: "monospace", fontWeight: 800, color: "var(--roam-text)" }}>{p.route_key.slice(0, 8)}</div>
                  </div>
                </div>

                <div className="trip-cat-row">
                  <span className={`trip-badge ${getStatusClass(p.corridor_status)}`}>Corridor</span>
                  <span className={`trip-badge ${getStatusClass(p.places_status)}`}>Places</span>
                  <span className={`trip-badge ${getStatusClass(p.traffic_status)}`}>Traffic</span>
                  <span className={`trip-badge ${getStatusClass(p.hazards_status)}`}>Hazards</span>
                </div>

                <div className="trip-actions" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 4 }}>
                  <button
                    type="button"
                    className="trip-interactive trip-btn-sm"
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
                    Set Active
                  </button>

                  <button
                    type="button"
                    className="trip-interactive trip-btn-sm"
                    style={{ background: "var(--roam-surface)", border: "1px solid var(--roam-border)" }}
                    disabled={busy}
                    onClick={() => router.push(`/trip?plan_id=${encodeURIComponent(p.plan_id)}`)}
                  >
                    Open
                  </button>

                  <button
                    type="button"
                    className="trip-interactive trip-btn-sm"
                    style={{ color: "var(--roam-danger)", background: "var(--roam-surface)" }}
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm("Delete this offline plan from this device?")) return;
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

      </div>
    </div>
  );
}