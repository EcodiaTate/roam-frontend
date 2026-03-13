"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { haptic } from "@/lib/native/haptics";
import {
  isNativePlatform,
  purchaseUnlimited,
  restorePurchases,
  redirectToStripeCheckout,
} from "@/lib/paywall/tripGate";
import { useAuth } from "@/lib/supabase/auth";

type Props = {
  open: boolean;
  onClose: () => void;
  onUnlocked: () => void;
};

const FEATURES = [
  { icon: "∞", label: "Unlimited trips", sub: "Plan as many adventures as you want" },
  { icon: "⬇", label: "Permanent offline maps", sub: "Every trip saved forever, works without signal" },
  { icon: "✦", label: "AI co-pilot", sub: "Smart fuel stops, hazards & local tips en-route" },
  { icon: "↗", label: "Trip sharing", sub: "Share with your co-pilot via a 6-character code" },
];

export function PaywallModal({ open, onClose, onUnlocked }: Props) {
  const [mounted, setMounted] = useState(false);
  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNative = isNativePlatform();
  const { session } = useAuth();

  useEffect(() => { setMounted(true); }, []);

  // Lock scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) { setError(null); setBuying(false); setRestoring(false); }
  }, [open]);

  const handlePurchase = useCallback(async () => {
    haptic.medium();
    setBuying(true);
    setError(null);
    try {
      if (isNative) {
        // iOS / Android — RevenueCat native sheet
        const result = await purchaseUnlimited();
        if (result.success) {
          haptic.success();
          onUnlocked();
        } else if (result.error !== "cancelled") {
          setError(result.error ?? "Purchase failed.");
        }
      } else {
        // Web — redirect to Stripe Checkout (does not return on success)
        const result = await redirectToStripeCheckout(session?.access_token);
        if (result.error) setError(result.error);
      }
    } finally {
      setBuying(false);
    }
  }, [isNative, onUnlocked]);

  const handleRestore = useCallback(async () => {
    haptic.light();
    setRestoring(true);
    setError(null);
    try {
      const result = await restorePurchases();
      if (result.success) {
        haptic.success();
        onUnlocked();
      } else {
        setError(result.error ?? "No previous purchase found.");
      }
    } finally {
      setRestoring(false);
    }
  }, [onUnlocked]);

  if (!mounted || !open) return null;

  const busy = buying || restoring;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(10, 8, 6, 0.82)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Sheet */}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--surface-card, #f4efe6)",
          borderRadius: "28px 28px 0 0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Hero band */}
        <div
          style={{
            background: "linear-gradient(135deg, var(--brand-eucalypt-dark, #1f5236) 0%, var(--brand-eucalypt, #2d6e40) 60%, #3d8f54 100%)",
            padding: "32px 28px 28px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Decorative rings */}
          <div style={{
            position: "absolute", top: -60, right: -60,
            width: 200, height: 200, borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.08)",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", top: -30, right: -30,
            width: 130, height: 130, borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.10)",
            pointerEvents: "none",
          }} />

          {/* Close pill */}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              position: "absolute", top: 16, right: 16,
              all: "unset", cursor: "pointer",
              width: 32, height: 32, borderRadius: 999,
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, color: "rgba(255,255,255,0.8)",
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>

          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,0.15)",
            borderRadius: 999, padding: "4px 12px",
            marginBottom: 14,
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>
              Roam Unlimited
            </span>
          </div>

          <h1 style={{
            margin: "0 0 8px",
            fontSize: 26, fontWeight: 900,
            color: "#fff",
            lineHeight: 1.2,
          }}>
            Ready for unlimited<br />adventures?
          </h1>
          <p style={{
            margin: 0,
            fontSize: 14, fontWeight: 500,
            color: "rgba(255,255,255,0.75)",
            lineHeight: 1.5,
          }}>
            You've used your 2 free trips. Unlock Roam forever for a single one-time payment — no subscription, ever.
          </p>
        </div>

        {/* Feature list */}
        <div style={{ padding: "20px 28px 8px" }}>
          {FEATURES.map((f) => (
            <div
              key={f.label}
              style={{
                display: "flex", alignItems: "flex-start", gap: 14,
                padding: "10px 0",
                borderBottom: "1px solid var(--roam-border, rgba(26,22,19,0.08))",
              }}
            >
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                borderRadius: 10,
                background: "var(--accent-tint, rgba(51,120,74,0.10))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, color: "var(--brand-eucalypt, #2d6e40)",
              }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--roam-text, #1a1613)", marginBottom: 2 }}>
                  {f.label}
                </div>
                <div style={{ fontSize: 12, color: "var(--roam-text-muted, #7a7067)", lineHeight: 1.4 }}>
                  {f.sub}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Price + CTA */}
        <div style={{ padding: "16px 28px 20px" }}>
          {/* Price callout */}
          <div style={{
            display: "flex", alignItems: "baseline", gap: 8,
            marginBottom: 14,
            justifyContent: "center",
          }}>
            <span style={{ fontSize: 40, fontWeight: 900, color: "var(--roam-text, #1a1613)", lineHeight: 1 }}>
              $19.99
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--roam-text-muted, #7a7067)" }}>
              one-time · yours forever
            </span>
          </div>

          {/* Buy button */}
          <button
            type="button"
            onClick={handlePurchase}
            disabled={busy}
            style={{
              width: "100%",
              background: buying
                ? "var(--brand-eucalypt-dark, #1f5236)"
                : "linear-gradient(135deg, var(--brand-eucalypt-dark, #1f5236) 0%, var(--brand-eucalypt, #2d6e40) 100%)",
              color: "var(--on-color, #faf6ef)",
              border: "none",
              padding: "16px",
              borderRadius: "var(--r-btn, 14px)",
              fontSize: 16,
              fontWeight: 800,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.7 : 1,
              letterSpacing: "0.01em",
              boxShadow: busy ? "none" : "0 4px 16px rgba(31,82,54,0.35)",
              transition: "opacity 0.15s, box-shadow 0.15s",
            }}
          >
            {buying
              ? (isNative ? "Processing…" : "Redirecting to checkout…")
              : isNative
                ? "Unlock Roam Unlimited · $19.99"
                : "Pay with Card · $19.99 →"}
          </button>

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 10,
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--bg-error, #fae5e2)",
              color: "var(--text-error, #922018)",
              fontSize: 13, fontWeight: 600,
              textAlign: "center",
            }}>
              {error}
            </div>
          )}

          {/* Restore + legal */}
          <div style={{
            marginTop: 12,
            display: "flex", justifyContent: "center", gap: 16,
          }}>
            {isNative && (
              <>
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={busy}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    fontSize: 12, fontWeight: 600,
                    color: "var(--roam-text-muted, #7a7067)",
                    opacity: busy ? 0.4 : 0.8,
                  }}
                >
                  {restoring ? "Restoring…" : "Restore purchase"}
                </button>
                <span style={{ color: "var(--roam-border-strong)", fontSize: 12 }}>·</span>
              </>
            )}
            <a
              href="/privacy"
              style={{ fontSize: 12, fontWeight: 600, color: "var(--roam-text-muted, #7a7067)", opacity: 0.8 }}
            >
              Privacy
            </a>
            <a
              href="/terms"
              style={{ fontSize: 12, fontWeight: 600, color: "var(--roam-text-muted, #7a7067)", opacity: 0.8 }}
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
