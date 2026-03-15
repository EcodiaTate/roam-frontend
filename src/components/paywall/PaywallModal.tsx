"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { haptic } from "@/lib/native/haptics";
import {
  isNativePlatform,
  purchaseUnlimited,
  restorePurchases,
  redirectToStripeCheckout,
} from "@/lib/paywall/tripGate";
import { useAuth } from "@/lib/supabase/auth";
import {
  Infinity,
  Download,
  Sparkles,
  Users,
  Fuel,
} from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onUnlocked: () => void;
  /** "gate" = user hit the trip limit (default). "upgrade" = user tapped Upgrade voluntarily. */
  variant?: "gate" | "upgrade";
};

const FEATURES: { icon: React.ReactNode; label: string; sub: string }[] = [
  { icon: <Infinity size={18} />, label: "Unlimited trips", sub: "Plan as many adventures as you want" },
  { icon: <Download size={18} />, label: "Permanent offline maps", sub: "Every trip saved forever, works without signal" },
  { icon: <Sparkles size={18} />, label: "AI co-pilot", sub: "Smart fuel stops, hazards & local tips en-route" },
  { icon: <Users size={18} />, label: "Trip sharing", sub: "Share with your co-pilot via a 6-character code" },
  { icon: <Fuel size={18} />, label: "Fuel range alerts", sub: "Never run dry — warnings before the last servo" },

];

const HERO_COPY = {
  gate: {
    heading: <>Ready to go<br />Untethered?</>,
    body: "You\u2019ve used your 2 free trips. Go Untethered for a single one-time payment \u2014 no subscription, ever.",
  },
  upgrade: {
    heading: <>Go Untethered</>,
    body: "Unlock every feature and never worry about trip limits again \u2014 one payment, yours forever.",
  },
};

type AnimState = "entering" | "open" | "exiting" | "closed";

export function PaywallModal({ open, onClose, onUnlocked, variant = "gate" }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anim, setAnim] = useState<AnimState>("closed");
  const isNative = isNativePlatform();
  const { session } = useAuth();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

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
    }, 340);
  }, [onClose, anim]);

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
    setError(null);

    if (isNative) {
      // iOS / Android — RevenueCat native sheet
      setBuying(true);
      try {
        const result = await purchaseUnlimited();
        if (result.success) {
          haptic.success();
          onUnlocked();
        } else if (result.error !== "cancelled") {
          setError(result.error ?? "Purchase failed.");
        }
      } finally {
        setBuying(false);
      }
      return;
    }

    // Web — must be signed in so the payment can be linked to the account
    if (!session) {
      router.push("/login?next=checkout");
      return;
    }

    // Signed in — redirect to Stripe Checkout (does not return on success)
    setBuying(true);
    try {
      const result = await redirectToStripeCheckout();
      if (result.error) setError(result.error);
    } finally {
      setBuying(false);
    }
  }, [isNative, session, onUnlocked, router]);

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

  if (!mounted || anim === "closed") return null;

  const busy = buying || restoring;
  const isVisible = anim === "open";
  const isExiting = anim === "exiting";

  return createPortal(
    <div
      onClick={handleClose}
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
        opacity: isVisible ? 1 : isExiting ? 0 : 0,
        transition: "opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Sheet */}
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "calc(100dvh - 32px)",
          background: "var(--surface-card, #f4efe6)",
          borderRadius: "28px 28px 0 0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          transform: isVisible ? "translateY(0)" : "translateY(100%)",
          transition: isExiting
            ? "transform 0.34s cubic-bezier(0.4, 0, 1, 1)"
            : "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Hero band */}
        <div
          style={{
            background: "linear-gradient(135deg, var(--brand-eucalypt-dark, #1f5236) 0%, var(--brand-eucalypt, #2d6e40) 60%, #3d8f54 100%)",
            padding: "32px 28px 28px",
            position: "relative",
            overflow: "hidden",
            flexShrink: 0,
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
            onClick={handleClose}
            disabled={busy}
            style={{
              position: "absolute", top: 16, right: 16,
              border: "none", margin: 0, padding: 0,
              cursor: "pointer",
              width: 32, height: 32, borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "rgba(255,255,255,0.8)",
              boxSizing: "border-box",
            }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: "block" }}>
              <path d="M1.5 1.5L12.5 12.5M12.5 1.5L1.5 12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,0.15)",
            borderRadius: 999, padding: "4px 12px",
            marginBottom: 14,
        }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "rgba(255,255,255,0.9)", textTransform: "uppercase" }}>
              Roam Untethered
            </span>
          </div>

          <h1 style={{
            margin: "0 0 8px",
            fontSize: 26, fontWeight: 900,
            color: "#fff",
            lineHeight: 1.2,
          }}>
            {HERO_COPY[variant].heading}
          </h1>
          <p style={{
            margin: 0,
            fontSize: 14, fontWeight: 500,
            color: "rgba(255,255,255,0.75)",
            lineHeight: 1.5,
          }}>
            {HERO_COPY[variant].body}
          </p>
        </div>

        {/* Feature list */}
        <div style={{ padding: "20px 28px 8px", overflowY: "auto", flexShrink: 1, minHeight: 0 }}>
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
        <div style={{ padding: "16px 28px 20px", flexShrink: 0 }}>
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
                ? "Unlock Roam Untethered · $19.99"
                : session
                  ? "Pay with Card · $19.99 →"
                  : "Sign in to unlock · $19.99 →"}
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
