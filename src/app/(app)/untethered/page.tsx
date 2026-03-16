"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import {
  Infinity,
  Download,
  Sparkles,
  Users,
  Fuel,
  ArrowLeft,
  CheckCircle2,
  Mail,
} from "lucide-react";
import { haptic } from "@/lib/native/haptics";
import {
  isNativePlatform,
  purchaseUnlimited,
  restorePurchases,
  redirectToStripeCheckout,
  isUnlocked,
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
          <ellipse cx="200" cy="200" rx="180" ry="140" fill="none" stroke="#fff" strokeWidth="0.8" />
          <ellipse cx="200" cy="200" rx="150" ry="115" fill="none" stroke="#fff" strokeWidth="0.6" />
          <ellipse cx="200" cy="200" rx="120" ry="90" fill="none" stroke="#fff" strokeWidth="0.8" />
          <ellipse cx="200" cy="200" rx="90" ry="65" fill="none" stroke="#fff" strokeWidth="0.6" />
          <ellipse cx="200" cy="200" rx="60" ry="42" fill="none" stroke="#fff" strokeWidth="0.8" />
          <ellipse cx="200" cy="200" rx="30" ry="20" fill="none" stroke="#fff" strokeWidth="0.6" />
          <ellipse cx="80" cy="340" rx="100" ry="70" fill="none" stroke="#fff" strokeWidth="0.6" />
          <ellipse cx="80" cy="340" rx="70" ry="48" fill="none" stroke="#fff" strokeWidth="0.5" />
          <ellipse cx="80" cy="340" rx="40" ry="26" fill="none" stroke="#fff" strokeWidth="0.6" />
          <ellipse cx="350" cy="80" rx="90" ry="60" fill="none" stroke="#fff" strokeWidth="0.5" />
          <ellipse cx="350" cy="80" rx="60" ry="38" fill="none" stroke="#fff" strokeWidth="0.6" />
          <ellipse cx="350" cy="80" rx="30" ry="18" fill="none" stroke="#fff" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="400" height="400" fill="url(#topo)" />
    </svg>
  );
}

/* ── Unlocked account page ────────────────────────────────────────────── */

function UnlockedPage({ email, entered }: { email: string; entered: boolean }) {
  const router = useRouter();
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
      {/* Hero */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(165deg, #6b2518 0%, var(--brand-ochre, #b5452e) 35%, #c9633e 65%, #d98a5c 100%)",
          padding: "0 0 52px",
          flexShrink: 0,
          minHeight: 300,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <TopoPattern />

        {/* Noise texture */}
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

        {/* Radial glow */}
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
          {/* Active badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              borderRadius: 999,
              padding: "6px 14px",
              marginBottom: 20,
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <CheckCircle2 size={13} style={{ color: "rgba(255,255,255,0.95)" }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.95)",
                textTransform: "uppercase",
              }}
            >
              Active · Roam Untethered
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              margin: "0 0 12px",
              fontSize: 32,
              fontWeight: 950,
              color: "#fff",
              lineHeight: 1.08,
              letterSpacing: "-0.5px",
            }}
          >
            You&apos;re
            <br />
            Untethered.
          </h1>

          {/* Email row */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "rgba(0,0,0,0.18)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              borderRadius: 999,
              padding: "7px 14px",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <Mail size={13} style={{ color: "rgba(255,255,255,0.7)", flexShrink: 0 }} />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                maxWidth: 260,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {email}
            </span>
          </div>
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

      {/* Plan label */}
      <div
        style={{
          padding: "20px 20px 8px",
          opacity: entered ? 1 : 0,
          transition: "opacity 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--roam-text-muted, #7a7067)",
          }}
        >
          Your plan
        </span>
      </div>

      {/* Features */}
      <div
        style={{
          padding: "0 20px",
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
            {/* Check + icon */}
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
                position: "relative",
              }}
            >
              {f.icon}
              {/* Tiny check badge */}
              <div
                style={{
                  position: "absolute",
                  bottom: -3,
                  right: -3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#22c55e",
                  border: "2px solid var(--roam-surface, #f4efe6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5.5L4 7.5L8 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
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

      {/* One-time payment pill */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "20px 20px 0",
          opacity: entered ? 1 : 0,
          transition: "opacity 0.5s cubic-bezier(0.16,1,0.3,1) 0.5s",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--roam-text-muted, #7a7067)",
            background: "var(--roam-surface, #f4efe6)",
            borderRadius: 999,
            padding: "8px 16px",
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
          One-time payment · yours forever
        </div>
      </div>

      {/* Footer links */}
      <div
        style={{
          padding: "20px 24px 28px",
          marginTop: "auto",
          flexShrink: 0,
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: "4px 0",
          opacity: entered ? 1 : 0,
          transition: "opacity 0.5s cubic-bezier(0.16,1,0.3,1) 0.55s",
        }}
      >
        {[
          { label: "Contact", href: "/contact" },
          { label: "Privacy", href: "/privacy" },
          { label: "Terms", href: "/terms" },
          { label: "Attributions", href: "/attributions" },
        ].map((link, i, arr) => (
          <span key={link.href} style={{ display: "inline-flex", alignItems: "center" }}>
            <a href={link.href} style={footerLink}>{link.label}</a>
            {i < arr.length - 1 && (
              <span style={{ color: "var(--roam-text-muted, #7a7067)", opacity: 0.35, fontSize: 12, margin: "0 8px" }}>·</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Purchase page (not yet unlocked) ────────────────────────────────── */

function PurchasePage({
  entered,
  buying,
  restoring,
  error,
  isNative,
  session,
  onPurchase,
  onRestore,
}: {
  entered: boolean;
  buying: boolean;
  restoring: boolean;
  error: string | null;
  isNative: boolean;
  session: boolean;
  onPurchase: () => void;
  onRestore: () => void;
}) {
  const router = useRouter();
  const busy = buying || restoring;

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
      {/* Hero */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(165deg, #6b2518 0%, var(--brand-ochre, #b5452e) 35%, #c9633e 65%, #d98a5c 100%)",
          padding: "0 0 52px",
          flexShrink: 0,
          minHeight: 360,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <TopoPattern />

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
          <div style={{ marginBottom: 20 }}>
            {/* Signal crossed icon using SVG */}
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="2.5" />
            </svg>
          </div>

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
            an AI co-pilot — even when you&apos;re 500km from the nearest tower.
          </p>
        </div>

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

      {/* Features */}
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
              <div style={{ fontSize: 15, fontWeight: 750, color: "var(--roam-text, #1a1613)", marginBottom: 2 }}>
                {f.title}
              </div>
              <div style={{ fontSize: 13, color: "var(--roam-text-muted, #7a7067)", lineHeight: 1.4 }}>
                {f.body}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Proof strip */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 6,
          padding: "24px 20px 4px",
          flexWrap: "wrap",
        }}
      >
        {["No subscription", "One-time payment", "Yours forever"].map((t) => (
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
        ))}
      </div>

      {/* Price + CTA */}
      <div
        style={{
          padding: "24px 24px 20px",
          marginTop: "auto",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 8,
            marginBottom: 18,
          }}
        >
          <span style={{ fontSize: 48, fontWeight: 950, color: "var(--roam-text, #1a1613)", lineHeight: 1, letterSpacing: "-1px" }}>
            $19.99
          </span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--roam-text-muted, #7a7067)", lineHeight: 1.3 }}>
              one-time
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--roam-text-muted, #7a7067)", opacity: 0.7, lineHeight: 1.3 }}>
              yours forever
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onPurchase}
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
            boxShadow: busy ? "none" : "0 6px 24px rgba(181,69,46,0.35), 0 2px 8px rgba(181,69,46,0.20)",
            transition: "opacity 0.15s, box-shadow 0.15s",
            WebkitTapHighlightColor: "transparent",
            overflow: "hidden",
          }}
        >
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
            {buying ? (isNative ? "Processing..." : "Redirecting to checkout...") : "Go Untethered · $19.99"}
          </span>
        </button>

        {!isNative && !session && (
          <div style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "var(--roam-text-muted, #7a7067)", marginTop: 8, opacity: 0.7 }}>
            You&apos;ll sign in or create an account at checkout
          </div>
        )}

        {error && (
          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: "var(--bg-error, #fae5e2)", color: "var(--text-error, #922018)", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 16 }}>
          {isNativePlatform() && (
            <>
              <button
                type="button"
                onClick={onRestore}
                disabled={busy}
                style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--roam-text-muted, #7a7067)", opacity: busy ? 0.4 : 0.7 }}
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

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function UntetheredPage() {
  const router = useRouter();
  const { user, session } = useAuth();
  const isNative = useMemo(() => Capacitor.isNativePlatform(), []);

  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  // Entrance animation
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Check unlock status
  useEffect(() => {
    isUnlocked().then(setUnlocked);
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
          setUnlocked(true);
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
      const result = await redirectToStripeCheckout();
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
        setUnlocked(true);
      } else {
        setError(result.error ?? "No previous purchase found.");
      }
    } finally {
      setRestoring(false);
    }
  }, []);

  // Show unlocked account page when user has the plan
  if (unlocked === true) {
    return (
      <UnlockedPage
        email={user?.email ?? ""}
        entered={entered}
      />
    );
  }

  // Loading state — show nothing until we know
  if (unlocked === null) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--roam-bg)",
        }}
      />
    );
  }

  return (
    <PurchasePage
      entered={entered}
      buying={buying}
      restoring={restoring}
      error={error}
      isNative={isNative}
      session={!!session}
      onPurchase={handlePurchase}
      onRestore={handleRestore}
    />
  );
}

const legalLink: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--roam-text-muted, #7a7067)",
  opacity: 0.7,
  textDecoration: "none",
};

const footerLink: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--roam-text-muted, #7a7067)",
  opacity: 0.7,
  textDecoration: "none",
};
