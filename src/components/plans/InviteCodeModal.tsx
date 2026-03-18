"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { usePlanSync } from "@/lib/hooks/usePlanSync";
import { getOfflinePlan, setCurrentPlanId, saveMinimalPlan } from "@/lib/offline/plansStore";
import { navApi } from "@/lib/api/nav";
import { haptic } from "@/lib/native/haptics";
import { toErrorMessage } from "@/lib/utils/errors";
import { hideKeyboard } from "@/lib/native/keyboard";

type Props = {
  open: boolean;
  planId: string | null;
  mode: "create" | "redeem";
  onClose: () => void;
  onRedeemed?: (planId: string) => void;
};

type AnimState = "entering" | "open" | "exiting" | "closed";

/**
 * Invite code modal - portalled to document.body so it always centres
 * in the viewport regardless of parent CSS containment / transforms.
 */
export function InviteCodeModal({ open, planId, mode, onClose, onRedeemed }: Props) {
  const router = useRouter();
  const { createInvite, redeemInvite, online } = usePlanSync();

  const [code, setCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [anim, setAnim] = useState<AnimState>("closed");
  const panelRef = useRef<HTMLDivElement>(null);

  // Track whether we're mounted (needed for portal target + abort stale async)
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    setMounted(true);
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Drive enter/exit animation
  useEffect(() => {
    if (open && (anim === "closed" || anim === "exiting")) {
      setAnim("entering");
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnim("open"));
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!open && anim === "open") {
      setAnim("closed");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    if (anim === "exiting") return;
    haptic.light();
    setAnim("exiting");
    setTimeout(() => {
      setAnim("closed");
      onClose();
    }, 300);
  }, [onClose, anim]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setCode("");
      setGeneratedCode(null);
      setError(null);
      setBusy(false);
      setCopied(false);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
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
    } catch (e: unknown) {
      setError(toErrorMessage(e, "Failed to create invite"));
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
      // 1. Redeem invite → pulls plan stub to IDB (preview with stops/geometry)
      const joinedPlanId = await redeemInvite(trimmed);
      if (!mountedRef.current) return;

      const stub = await getOfflinePlan(joinedPlanId);

      if (!stub) {
        throw new Error("Plan not synced. Check your connection and try again.");
      }
      if (!stub.preview?.stops?.length) {
        throw new Error("Plan has no route. The owner may need to re-share.");
      }

      // 2. Route the plan to get a NavPack (same as /new saveAndGo)
      const profile = stub.preview.profile || "drive";
      const pack = await navApi.route({
        profile,
        stops: stub.preview.stops,
      });
      if (!mountedRef.current) return;

      // 3. Save as minimal plan (navpack in IDB) — enrichment on /trip
      await saveMinimalPlan({
        plan_id: joinedPlanId,
        navPack: pack,
        stops: stub.preview.stops,
        profile,
      });

      // 4. Set current + navigate immediately (enrichment happens in background)
      await setCurrentPlanId(joinedPlanId);
      if (!mountedRef.current) return;

      haptic.success();
      onRedeemed?.(joinedPlanId);
      onClose();
      router.push(`/trip?plan_id=${encodeURIComponent(joinedPlanId)}`);
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setError(toErrorMessage(e, "Failed to join plan"));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [code, redeemInvite, online, onRedeemed, onClose, router]);

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopy = useCallback(() => {
    if (generatedCode) {
      haptic.light();
      navigator.clipboard?.writeText(generatedCode).catch(() => {});
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [generatedCode]);

  // ── Don't render until client-mounted, and not when closed ─────────
  if (!mounted || anim === "closed") return null;

  const isVisible = anim === "open";
  const isExiting = anim === "exiting";

  const modalContent = (
    <div
      onClick={handleClose}
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
        height: "100dvh",
        width: "100vw",
        overflow: "hidden",
        opacity: isVisible ? 1 : isExiting ? 0 : 0,
        transition: "opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--roam-surface, #1a1a1a)",
          borderRadius: 20,
          padding: 24,
          width: "100%",
          maxWidth: 400,
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
          position: "relative",
          maxHeight: "90dvh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
          overscrollBehaviorX: "contain",
          flexShrink: 0,
          transform: isVisible ? "scale(1) translateY(0)" : isExiting ? "scale(0.95) translateY(20px)" : "scale(0.95) translateY(20px)",
          transition: isExiting
            ? "transform 0.28s cubic-bezier(0.4, 0, 1, 1)"
            : "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: "var(--roam-text, #eee)" }}>
            {mode === "create" ? "Share Plan" : "Join Plan"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            style={{
              border: "none",
              margin: 0,
              padding: 0,
              cursor: "pointer",
              width: 32, height: 32,
              borderRadius: "50%",
              background: "var(--roam-surface-raised, #222)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--roam-text, #eee)",
              opacity: 0.6,
              flexShrink: 0,
              boxSizing: "border-box",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: "block" }}>
              <path d="M1.5 1.5L12.5 12.5M12.5 1.5L1.5 12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
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
                    border: copied
                      ? "1px solid var(--brand-eucalypt, #2d6e40)"
                      : "1px solid var(--roam-border)",
                    background: copied
                      ? "rgba(45, 110, 64, 0.12)"
                      : "transparent",
                    fontWeight: 700,
                    cursor: "pointer",
                    color: copied
                      ? "var(--brand-eucalypt, #2d6e40)"
                      : "var(--roam-text, #eee)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {copied ? "Copied!" : "Copy code"}
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
            <div style={{ fontSize: 13, color: "var(--roam-text-muted)", marginBottom: 12 }}>
              Enter the 6-character code from your travel partner
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.trim().length >= 4 && !busy) {
                  handleRedeem();
                }
              }}
              placeholder="e.g. A3BX7K"
              maxLength={6}
              autoFocus
              disabled={busy}
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
              disabled={busy || code.trim().length < 4}
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
                opacity: busy || code.trim().length < 4 ? 0.5 : 1,
                cursor: "pointer",
              }}
            >
              {busy ? "Joining…" : "Join plan"}
            </button>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────── */}
        {error && (
          <div
            className="trip-err-box"
            style={{ marginTop: 16, textAlign: "center" }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Animations handled by roam-spin in globals.css */}
    </div>
  );

  // Portal to document.body - escapes any ancestor transform/contain/filter
  return createPortal(modalContent, document.body);
}