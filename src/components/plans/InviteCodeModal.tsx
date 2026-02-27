"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { usePlanSync } from "@/lib/hooks/usePlanSync";
import { X } from "lucide-react";
import { useBundleBuilder } from "@/lib/hooks/useBundleBuilder";
import { getOfflinePlan, setCurrentPlanId } from "@/lib/offline/plansStore";
import { haptic } from "@/lib/native/haptics";
import { hideKeyboard } from "@/lib/native/keyboard";

type Props = {
  open: boolean;
  planId: string | null;
  mode: "create" | "redeem";
  onClose: () => void;
  onRedeemed?: (planId: string) => void;
};

/**
 * Invite code modal - portalled to document.body so it always centres
 * in the viewport regardless of parent CSS containment / transforms.
 */
export function InviteCodeModal({ open, planId, mode, onClose, onRedeemed }: Props) {
  const router = useRouter();
  const { createInvite, redeemInvite, online } = usePlanSync();
  const bundle = useBundleBuilder();

  const [code, setCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether we're mounted (needed for portal target)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setCode("");
      setGeneratedCode(null);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  // Lock body scroll and hide keyboard while open
  useEffect(() => {
    if (!open) return;

    // Hide the keyboard to prevent viewport resize pushing modal up
    hideKeyboard().catch(() => {});

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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
      haptic.success();
      setGeneratedCode(c);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create invite");
    } finally {
      setBusy(false);
    }
  }, [planId, createInvite, online]);

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
      const joinedPlanId = await redeemInvite(trimmed);
      const stub = await getOfflinePlan(joinedPlanId);

      if (!stub?.preview?.stops?.length) {
        throw new Error("Joined plan has no route data. Ask the owner to re-share.");
      }

      await bundle.build({
        plan_id: joinedPlanId,
        stops: stub.preview.stops,
        profile: stub.preview.profile || "drive",
        styleId: "roam-basemap-vector-bright",
      });

      await setCurrentPlanId(joinedPlanId);
      haptic.success();
      
      onRedeemed?.(joinedPlanId);
      onClose();
      router.push(`/trip?plan_id=${encodeURIComponent(joinedPlanId)}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to join plan");
    } finally {
      setBusy(false);
    }
  }, [code, redeemInvite, online, bundle, onRedeemed, onClose, router]);

  const handleCopy = useCallback(() => {
    if (generatedCode) {
      haptic.light();
      navigator.clipboard?.writeText(generatedCode).catch(() => {});
    }
  }, [generatedCode]);

  // ── Don't render until client-mounted, and not when closed ─────────
  if (!open || !mounted) return null;

  const isBuilding = bundle.building;
  const buildingOrBusy = busy || isBuilding;

  const modalContent = (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
        /* Use dvh to handle virtual keyboard correctly */
        height: "100dvh",
        width: "100vw",
        overflow: "hidden",
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--roam-surface, #1a1a1a)",
          borderRadius: 20,
          padding: 24,
          width: "100%",
          maxWidth: 400,
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
          position: "relative",
          /* Constrain height to prevent overflow and keyboard push */
          maxHeight: "90dvh",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--roam-text, #eee)" }}>
            {mode === "create" ? "Share Plan" : "Join Plan"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isBuilding}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: 8,
              opacity: 0.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              color: "var(--roam-text, #eee)",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Create mode ─────────────────────────────────────────── */}
        {mode === "create" ? (
          <>
            {generatedCode ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 13, color: "var(--roam-text-muted)", marginBottom: 12 }}>
                  Share this code with your travel partner
                </div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    fontFamily: "monospace",
                    padding: "12px 0",
                    color: "var(--brand-sky, #3b82f6)",
                  }}
                >
                  {generatedCode}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 12,
                    border: "1px solid var(--roam-border)",
                    background: "transparent",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: "var(--roam-text, #eee)",
                  }}
                >
                  Copy code
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 13, color: "var(--roam-text-muted)", marginBottom: 16 }}>
                  Generate a 6-character code so your partner can view and edit this trip plan on their device.
                </div>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={busy}
                  style={{
                    width: "100%",
                    background: "var(--brand-sky, #3b82f6)",
                    color: "#fff",
                    border: "none",
                    padding: "14px",
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy ? "Generating…" : "Generate invite code"}
                </button>
              </div>
            )}
          </>
        ) : (
          /* ── Redeem mode ────────────────────────────────────────── */
          <div style={{ padding: "8px 0" }}>
            {isBuilding ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    margin: "0 auto 16px",
                    border: "3px solid var(--roam-border, #333)",
                    borderTop: "3px solid var(--brand-sky, #3b82f6)",
                    borderRadius: "50%",
                    animation: "roam-spin 0.6s linear infinite",
                  }}
                />
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "var(--roam-text, #eee)" }}>
                  Building offline bundle…
                </div>
                <div style={{ fontSize: 13, color: "var(--roam-text-muted)" }}>
                  {bundle.statusText}
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--roam-text-muted)", marginBottom: 12 }}>
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
                    boxSizing: "border-box",
                    textAlign: "center",
                    fontSize: 24,
                    fontWeight: 700,
                    letterSpacing: "0.2em",
                    fontFamily: "monospace",
                    padding: "14px",
                    borderRadius: 12,
                    border: "1.5px solid var(--roam-border, #333)",
                    background: "var(--roam-surface-raised, #222)",
                    color: "var(--roam-text, #eee)",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={handleRedeem}
                  disabled={buildingOrBusy || code.trim().length < 4}
                  style={{
                    width: "100%",
                    marginTop: 16,
                    background: "var(--brand-sky, #3b82f6)",
                    color: "#fff",
                    border: "none",
                    padding: "14px",
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 700,
                    opacity: buildingOrBusy || code.trim().length < 4 ? 0.5 : 1,
                    cursor: "pointer",
                  }}
                >
                  {busy && !isBuilding ? "Joining…" : "Join plan"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────── */}
        {(error || bundle.error) && (
          <div
            className="trip-err-box"
            style={{ marginTop: 16, textAlign: "center" }}
          >
            {error || bundle.error}
          </div>
        )}
      </div>

      {/* Animations handled by roam-spin in globals.css */}
    </div>
  );

  // Portal to document.body - escapes any ancestor transform/contain/filter
  return createPortal(modalContent, document.body);
}