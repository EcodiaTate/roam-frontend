// src/components/plans/InviteCodeModal.tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlanSync } from "@/lib/hooks/usePlanSync";
import { useBundleBuilder } from "@/lib/hooks/useBundleBuilder";
import { getOfflinePlan, setCurrentPlanId } from "@/lib/offline/plansStore";

type Props = {
  open: boolean;
  planId: string | null;
  mode: "create" | "redeem";
  onClose: () => void;
  onRedeemed?: (planId: string) => void;
};

/**
 * Modal for creating or redeeming plan invite codes.
 *
 * Create mode: generates a 6-char code for the given planId.
 * Redeem mode: accepts a code → joins plan → builds local bundle → navigates to /trip.
 */
export function InviteCodeModal({ open, planId, mode, onClose, onRedeemed }: Props) {
  const router = useRouter();
  const { createInvite, redeemInvite, online } = usePlanSync();
  const bundle = useBundleBuilder();

  const [code, setCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Create flow ───────────────────────────────────────────────────── */

  const handleCreate = useCallback(async () => {
    if (!planId) return;
    if (!online) {
      setError("You need to be online to create an invite code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const c = await createInvite(planId);
      setGeneratedCode(c);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create invite");
    } finally {
      setBusy(false);
    }
  }, [planId, createInvite, online]);

  /* ── Redeem flow (join → build bundle → navigate) ──────────────────── */

  const handleRedeem = useCallback(async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      setError("Enter a valid invite code");
      return;
    }
    if (!online) {
      setError("You need to be online to redeem an invite code");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // 1. Join the plan via Supabase (adds membership + pulls definition to IDB)
      const joinedPlanId = await redeemInvite(trimmed);

      // 2. Read the plan stub from IDB (planSync.pullRemote just wrote it)
      const stub = await getOfflinePlan(joinedPlanId);

      if (!stub?.preview?.stops?.length) {
        throw new Error("Joined plan has no route data. Ask the owner to re-share.");
      }

      // 3. Build the full offline bundle from the plan definition
      //    This runs the same pipeline as /new: route → corridor → places → bundle → zip
      await bundle.build({
        plan_id: joinedPlanId,
        stops: stub.preview.stops,
        profile: stub.preview.profile || "drive",
        styleId: "roam-basemap-vector-bright",
      });

      // 4. Set as current plan
      await setCurrentPlanId(joinedPlanId);

      // 5. Notify parent + navigate
      onRedeemed?.(joinedPlanId);
      onClose();
      router.push(`/trip?plan_id=${encodeURIComponent(joinedPlanId)}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to join plan");
    } finally {
      setBusy(false);
    }
  }, [code, redeemInvite, online, bundle, onRedeemed, onClose, router]);

  /* ── Copy code ─────────────────────────────────────────────────────── */

  const handleCopy = useCallback(() => {
    if (generatedCode) {
      navigator.clipboard?.writeText(generatedCode).catch(() => {});
    }
  }, [generatedCode]);

  if (!open) return null;

  // Are we in the bundle-building phase of redemption?
  const isBuilding = bundle.building;
  const buildingOrBusy = busy || isBuilding;

  return (
    <div className="trip-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="trip-modal" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="trip-row-between">
          <div className="trip-h2">
            {mode === "create" ? "Share Plan" : "Join Plan"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="trip-interactive trip-btn-icon"
            aria-label="Close"
            disabled={isBuilding}
          >
            ✕
          </button>
        </div>

        {/* ── Create mode ────────────────────────────────────────────── */}
        {mode === "create" ? (
          <>
            {generatedCode ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 13, color: "var(--roam-muted, #888)", marginBottom: 12 }}>
                  Share this code with your travel partner
                </div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    fontFamily: "monospace",
                    padding: "12px 0",
                  }}
                >
                  {generatedCode}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="trip-interactive trip-btn trip-btn-secondary"
                  style={{ marginTop: 8 }}
                >
                  Copy code
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 13, color: "var(--roam-muted, #888)", marginBottom: 16 }}>
                  Generate a 6-character code so your partner can view and edit this trip plan on
                  their device.
                </div>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={busy}
                  className="trip-interactive trip-btn"
                  style={{
                    background: "var(--roam-accent, #3b82f6)",
                    color: "#fff",
                    border: "none",
                    padding: "12px 24px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {busy ? "Generating…" : "Generate invite code"}
                </button>
              </div>
            )}
          </>
        ) : (
          /* ── Redeem mode ───────────────────────────────────────────── */
          <div style={{ padding: "8px 0" }}>
            {/* Bundle build progress replaces the input form */}
            {isBuilding ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                {/* Spinner */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    margin: "0 auto 16px",
                    border: "3px solid var(--roam-border, #333)",
                    borderTop: "3px solid var(--roam-accent, #3b82f6)",
                    borderRadius: "50%",
                    animation: "roam-spin 0.8s linear infinite",
                  }}
                />
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                  Building your offline bundle…
                </div>
                <div style={{ fontSize: 13, color: "var(--roam-muted, #888)" }}>
                  {bundle.statusText}
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--roam-muted, #888)", marginBottom: 12 }}>
                  Enter the 6-character code from your travel partner
                </div>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A3BX7K"
                  maxLength={6}
                  autoFocus
                  disabled={buildingOrBusy}
                  style={{
                    width: "100%",
                    textAlign: "center",
                    fontSize: 24,
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    fontFamily: "monospace",
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--roam-border, #333)",
                    background: "var(--roam-surface, #1a1a1a)",
                    color: "var(--roam-text, #eee)",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={handleRedeem}
                  disabled={buildingOrBusy || code.trim().length < 4}
                  className="trip-interactive trip-btn"
                  style={{
                    width: "100%",
                    marginTop: 12,
                    background: "var(--roam-accent, #3b82f6)",
                    color: "#fff",
                    border: "none",
                    padding: "12px 16px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    opacity: buildingOrBusy || code.trim().length < 4 ? 0.5 : 1,
                  }}
                >
                  {busy && !isBuilding ? "Joining…" : "Join plan"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Error banner ───────────────────────────────────────────── */}
        {(error || bundle.error) && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(239,68,68,0.12)",
              color: "#f87171",
              fontSize: 13,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            {error || bundle.error}
          </div>
        )}
      </div>

      {/* Keyframe for spinner */}
      <style>{`
        @keyframes roam-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}