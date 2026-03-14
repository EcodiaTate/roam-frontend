"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import {
  Infinity,
  Download,
  Sparkles,
  Users,
  Fuel,
  ArrowLeft,
  MapPin,
  Compass,
  Signal,
  SignalZero,
} from "lucide-react";
import { haptic } from "@/lib/native/haptics";
import {
  isNativePlatform,
  purchaseUnlimited,
  restorePurchases,
  redirectToStripeCheckout,
} from "@/lib/paywall/tripGate";
import { useAuth } from "@/lib/supabase/auth";

/* ── Features ─────────────────────────────────────────────────────────── */

const FEATURES: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <Infinity size={22} strokeWidth={2.5} />,
    title: "Unlimited trips",
    body: "No caps, no countdowns. Plan as many adventures as the road allows.",
  },
  {
    icon: <Download size={22} strokeWidth={2.5} />,
    title: "Full offline maps",
    body: "Download once, navigate forever. Your maps work without a single bar of signal.",
  },
  {
    icon: <Sparkles size={22} strokeWidth={2.5} />,
    title: "AI co-pilot",
    body: "Smart fuel stops, hazard warnings, and local tips tailored to your exact route.",
  },
  {
    icon: <Users size={22} strokeWidth={2.5} />,
    title: "Trip sharing",
    body: "Send a 6-character code. Your co-pilot sees the whole plan, live.",
  },
  {
    icon: <Fuel size={22} strokeWidth={2.5} />,
    title: "Fuel range alerts",
    body: "Know exactly where the last servo is — before you pass it.",
  },
];

/* ── Topographic SVG pattern ──────────────────────────────────────────── */

function TopoPattern() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.07,
        pointerEvents: "none",
      }}
    >
      <defs>
        <pattern id="topo" x="0" y="0" width="400" height="400" patternUnits="userSpaceOnUse">
          {/* Contour lines evoking outback topo maps */}
          <ellipse cx="200" cy="200" rx="180" ry="140" fill="none" stroke="#fff" strokeWidth="0.8" />
          <ellipse cx="200" cy="200" rx="150" ry="115" fill="none" stroke="#fff" strokeWidth="0.6" />
          <ellipse cx="200" cy="200" rx="120" ry="90" fill="none" stroke="#fff" strokeWidth="0.8" />
          <ellipse cx="200" cy="200" rx="90" ry="65" fill="none" stroke="#fff" strokeWidth="0.6" />
          <ellipse cx="200" cy="200" rx="60" ry="42" fill="none" stroke="#fff" strokeWidth="0.8" />
          <ellipse cx="200" cy="200" rx="30" ry="20" fill="none" stroke="#fff" strokeWidth="0.6" />
          {/* Offset cluster */}
          <ellipse cx="80" cy="340" rx="100" ry="70" fill="none" stroke="#fff" strokeWidth="0.6" />
          <ellipse cx="80" cy="340" rx="70" ry="48" fill="none" stroke="#fff" strokeWidth="0.5" />
          <ellipse cx="80" cy="340" rx="40" ry="26" fill="none" stroke="#fff" strokeWidth="0.6" />
          {/* Another cluster */}
          <ellipse cx="350" cy="80" rx="90" ry="60" fill="none" stroke="#fff" strokeWidth="0.5" />
          <ellipse cx="350" cy="80" rx="60" ry="38" fill="none" stroke="#fff" strokeWidth="0.6" />
          <ellipse cx="350" cy="80" rx="30" ry="18" fill="none" stroke="#fff" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="400" height="400" fill="url(#topo)" />
    </svg>
  );
}

/* ── Animated signal bars ─────────────────────────────────────────────── */

function SignalCrossout() {
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <SignalZero size={40} strokeWidth={2} style={{ color: "rgba(255,255,255,0.6)" }} />
      <Signal
        size={40}
        strokeWidth={2}
        style={{
          position: "absolute",
          inset: 0,
          color: "rgba(255,255,255,0.15)",
        }}
      />
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function UntetheredPage() {
  const router = useRouter();
  const { session } = useAuth();
  const isNative = useMemo(() => Capacitor.isNativePlatform(), []);

  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  const busy = buying || restoring;

  // Entrance animation
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const handlePurchase = useCallback(async () => {
    haptic.medium();
    setError(null);

    if (isNative) {
      setBuying(true);
      try {
        const result = await purchaseUnlimited();
        if (result.success) {
          haptic.success();
          router.replace("/trip");
        } else if (result.error !== "cancelled") {
          setError(result.error ?? "Purchase failed.");
        }
      } finally {
        setBuying(false);
      }
      return;
    }

    if (!session) {
      router.push("/login?next=checkout");
      return;
    }

    setBuying(true);
    try {
      const result = await redirectToStripeCheckout(session.access_token);
      if (result.error) setError(result.error);
    } finally {
      setBuying(false);
    }
  }, [isNative, session, router]);

  const handleRestore = useCallback(async () => {
    haptic.light();
    setRestoring(true);
    setError(null);
    try {
      const result = await restorePurchases();
      if (result.success) {
        haptic.success();
        router.replace("/trip");
      } else {
        setError(result.error ?? "No previous purchase found.");
      }
    } finally {
      setRestoring(false);
    }
  }, [router]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        bottom: "var(--bottom-nav-height, 80px)",
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch" as const,
        background: "var(--roam-bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ================================================================
          HERO — full-bleed burnt ochre, tall, dramatic
          ================================================================ */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(165deg, #6b2518 0%, var(--brand-ochre, #b5452e) 35%, #c9633e 65%, #d98a5c 100%)",
          padding: "0 0 52px",
          flexShrink: 0,
          minHeight: 380,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        {/* Topo contour pattern overlay */}
        <TopoPattern />

        {/* Noise texture for grit */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url(/img/noise.png)",
            backgroundRepeat: "repeat",
            backgroundSize: "200px",
            opacity: 0.04,
            pointerEvents: "none",
            mixBlendMode: "overlay",
          }}
        />

        {/* Radial glow from bottom-left */}
        <div
          style={{
            position: "absolute",
            bottom: -80,
            left: -80,
            width: 360,
            height: 360,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(217,138,92,0.35) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Back button */}
        <button
          type="button"
          onClick={() => { haptic.light(); router.back(); }}
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 5,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(0,0,0,0.15)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            color: "rgba(255,255,255,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Hero content */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            padding: "0 28px",
            opacity: entered ? 1 : 0,
            transform: entered ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* Signal icon */}
          <div style={{ marginBottom: 20 }}>
            <SignalCrossout />
          </div>

          {/* Badge pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              borderRadius: 999,
              padding: "5px 14px",
              marginBottom: 18,
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <Compass size={12} style={{ color: "rgba(255,255,255,0.8)" }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.9)",
                textTransform: "uppercase",
              }}
            >
              Roam Untethered
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              margin: "0 0 14px",
              fontSize: 34,
              fontWeight: 950,
              color: "#fff",
              lineHeight: 1.08,
              letterSpacing: "-0.5px",
            }}
          >
            No signal?
            <br />
            No problem.
          </h1>

          {/* Sub */}
          <p
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 500,
              color: "rgba(255,255,255,0.72)",
              lineHeight: 1.55,
              maxWidth: 320,
            }}
          >
            One payment. Yours forever. Full offline maps, unlimited trips, and
            an AI co-pilot — even when you're 500km from the nearest tower.
          </p>
        </div>

        {/* Bottom curve mask */}
        <div
          style={{
            position: "absolute",
            bottom: -1,
            left: 0,
            right: 0,
            height: 32,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: "120%",
              height: 64,
              marginLeft: "-10%",
              borderRadius: "50% 50% 0 0",
              background: "var(--roam-bg)",
            }}
          />
        </div>
      </div>

      {/* ================================================================
          FEATURES — staggered cards with ochre icon circles
          ================================================================ */}
      <div
        style={{
          padding: "4px 20px 0",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "14px 16px",
              borderRadius: 16,
              background: "var(--roam-surface, #f4efe6)",
              opacity: entered ? 1 : 0,
              transform: entered ? "translateY(0)" : "translateY(16px)",
              transition: `opacity 0.5s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.07}s, transform 0.5s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.07}s`,
            }}
          >
            {/* Icon circle */}
            <div
              style={{
                width: 46,
                height: 46,
                flexShrink: 0,
                borderRadius: 14,
                background: "linear-gradient(135deg, var(--brand-ochre, #b5452e) 0%, #c9633e 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                boxShadow: "0 2px 8px rgba(181,69,46,0.20)",
              }}
            >
              {f.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 750,
                  color: "var(--roam-text, #1a1613)",
                  marginBottom: 2,
                }}
              >
                {f.title}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--roam-text-muted, #7a7067)",
                  lineHeight: 1.4,
                }}
              >
                {f.body}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ================================================================
          SOCIAL PROOF / PROMISE STRIP
          ================================================================ */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 6,
          padding: "24px 20px 4px",
          flexWrap: "wrap",
        }}
      >
        {["No subscription", "One-time payment", "Yours forever"].map(
          (t) => (
            <div
              key={t}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: "var(--roam-text-muted, #7a7067)",
                background: "var(--roam-surface, #f4efe6)",
                borderRadius: 999,
                padding: "6px 14px",
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, var(--brand-ochre, #b5452e), #c9633e)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {t}
            </div>
          ),
        )}
      </div>

      {/* ================================================================
          PRICE + CTA — sticky-feeling bottom section
          ================================================================ */}
      <div
        style={{
          padding: "24px 24px 20px",
          marginTop: "auto",
          flexShrink: 0,
        }}
      >
        {/* Price lockup */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 8,
            marginBottom: 18,
          }}
        >
          <span
            style={{
              fontSize: 48,
              fontWeight: 950,
              color: "var(--roam-text, #1a1613)",
              lineHeight: 1,
              letterSpacing: "-1px",
            }}
          >
            $19.99
          </span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--roam-text-muted, #7a7067)",
                lineHeight: 1.3,
              }}
            >
              one-time
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--roam-text-muted, #7a7067)",
                opacity: 0.7,
                lineHeight: 1.3,
              }}
            >
              yours forever
            </span>
          </div>
        </div>

        {/* CTA button — dramatic ochre */}
        <button
          type="button"
          onClick={handlePurchase}
          disabled={busy}
          className="trip-interactive"
          style={{
            position: "relative",
            width: "100%",
            background: buying
              ? "var(--brand-ochre, #b5452e)"
              : "linear-gradient(135deg, #6b2518 0%, var(--brand-ochre, #b5452e) 45%, #c9633e 100%)",
            color: "#fff",
            border: "none",
            padding: "18px 20px",
            borderRadius: "var(--r-btn, 14px)",
            fontSize: 17,
            fontWeight: 800,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
            letterSpacing: "0.01em",
            boxShadow: busy
              ? "none"
              : "0 6px 24px rgba(181,69,46,0.35), 0 2px 8px rgba(181,69,46,0.20)",
            transition: "opacity 0.15s, box-shadow 0.15s, transform 0.15s",
            WebkitTapHighlightColor: "transparent",
            overflow: "hidden",
          }}
        >
          {/* Subtle noise on button */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "url(/img/noise.png)",
              backgroundRepeat: "repeat",
              backgroundSize: "200px",
              opacity: 0.06,
              pointerEvents: "none",
              borderRadius: "inherit",
              mixBlendMode: "overlay",
            }}
          />
          <span style={{ position: "relative" }}>
            {buying
              ? isNative
                ? "Processing..."
                : "Redirecting to checkout..."
              : isNative
                ? "Go Untethered · $19.99"
                : session
                  ? "Go Untethered · $19.99"
                  : "Go Untethered · $19.99"}
          </span>
        </button>

        {/* Secondary note for web users who aren't signed in */}
        {!isNative && !session && (
          <div
            style={{
              textAlign: "center",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--roam-text-muted, #7a7067)",
              marginTop: 8,
              opacity: 0.7,
            }}
          >
            You'll sign in or create an account at checkout
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--bg-error, #fae5e2)",
              color: "var(--text-error, #922018)",
              fontSize: 13,
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* Restore + legal */}
        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "center",
            gap: 16,
          }}
        >
          {isNativePlatform() && (
            <>
              <button
                type="button"
                onClick={handleRestore}
                disabled={busy}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--roam-text-muted, #7a7067)",
                  opacity: busy ? 0.4 : 0.7,
                }}
              >
                {restoring ? "Restoring..." : "Restore purchase"}
              </button>
              <span style={{ color: "var(--roam-border-strong)", fontSize: 12 }}>·</span>
            </>
          )}
          <a href="/privacy" style={legalLink}>Privacy</a>
          <a href="/terms" style={legalLink}>Terms</a>
        </div>
      </div>
    </div>
  );
}

const legalLink: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--roam-text-muted, #7a7067)",
  opacity: 0.7,
  textDecoration: "none",
};
