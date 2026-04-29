// src/app/purchase/success/page.tsx
//
// Landing page after Stripe Checkout completes.
// Strategy:
//   1. On first poll, call /stripe/confirm (session_id from URL) to grant the
//      entitlement immediately - this handles webhook latency / dev tunnels.
//   2. Continue polling user_entitlements until it appears (max 12 × 2.5s).
//   3. Timeout screen if still not visible after 30 s.


import { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase/client";
import { haptic } from "@/lib/native/haptics";
import { api } from "@/lib/api";
import { Compass, MapPin, ArrowRight, Infinity, Download, Sparkles, Users, Fuel } from "lucide-react";

const MAX_POLLS = 12;
const POLL_INTERVAL = 2500;

/* ── Confetti ─────────────────────────────────────────────────────────── */

type Particle = {
  id: number;
  x: number;
  rotation: number;
  scale: number;
  color: string;
  delay: number;
  drift: number;
  shape: "rect" | "circle" | "diamond";
  endY: number;
};

const CONFETTI_COLORS = [
  "#b5452e", "#c9633e", "#d98a5c",
  "#2d6e40", "#42b159", "#5cc974",
  "#e8b84d", "#f0c95c",
  "#1a6fa6", "#4db8f0",
  "#faf6ef",
];

function makeConfetti(n: number): Particle[] {
  const shapes: Particle["shape"][] = ["rect", "circle", "diamond"];
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: 5 + Math.random() * 90,
    rotation: Math.random() * 1080 - 540,
    scale: 0.5 + Math.random() * 0.9,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 0.8,
    drift: (Math.random() - 0.5) * 100,
    shape: shapes[Math.floor(Math.random() * shapes.length)],
    endY: 95 + Math.random() * 25,
  }));
}

function ConfettiBurst({ active }: { active: boolean }) {
  const [particles] = useState(() => makeConfetti(60));
  if (!active) return null;

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 100, overflow: "hidden" }}>
      {particles.map((p) => {
        const w = p.shape === "circle" ? 8 * p.scale : 7 * p.scale;
        const h = p.shape === "circle" ? 8 * p.scale : 11 * p.scale;
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: 0,
              width: w,
              height: h,
              background: p.color,
              borderRadius: p.shape === "circle" ? "50%" : p.shape === "diamond" ? 2 : 1,
              opacity: 0,
              transform: p.shape === "diamond" ? "rotate(45deg)" : undefined,
              animation: `confetti-fall 2.6s cubic-bezier(0.22, 0.61, 0.36, 1) ${p.delay}s forwards`,
              // @ts-expect-error custom properties
              "--c-drift": `${p.drift}px`,
              "--c-rot": `${p.rotation}deg`,
              "--c-end": `${p.endY}vh`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ── Pulse rings ──────────────────────────────────────────────────────── */

function PulseRings() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 100,
            height: 100,
            borderRadius: "50%",
            border: `2px solid ${i % 2 === 0 ? "rgba(255,255,255,0.5)" : "rgba(232,184,77,0.4)"}`,
            opacity: 0,
            animation: `pulse-ring 2.4s cubic-bezier(0, 0.55, 0.45, 1) ${i * 0.35}s forwards`,
          }}
        />
      ))}
    </>
  );
}

/* ── Feature pills (unlocked state) ───────────────────────────────────── */

const UNLOCK_FEATURES = [
  { icon: <Infinity size={14} strokeWidth={2.5} />, label: "Unlimited trips", color: "#42b159" },
  { icon: <Download size={14} strokeWidth={2.5} />, label: "Offline maps", color: "#4db8f0" },
  { icon: <Sparkles size={14} strokeWidth={2.5} />, label: "AI co-pilot", color: "#e8b84d" },
  { icon: <Users size={14} strokeWidth={2.5} />, label: "Trip sharing", color: "#b087db" },
  { icon: <Fuel size={14} strokeWidth={2.5} />, label: "Fuel alerts", color: "#c9633e" },
];

/* ── Main page ────────────────────────────────────────────────────────── */

function PurchaseSuccessInner() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const sessionId = sp.get("session_id") ?? "";
  const [status, setStatus] = useState<"polling" | "unlocked" | "timeout">("polling");
  const [entered, setEntered] = useState(false);
  const celebratedRef = useRef(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => { haptic.success(); }, []);

  useEffect(() => {
    if (status !== "unlocked" || celebratedRef.current) return;
    celebratedRef.current = true;
    const run = async () => {
      await haptic.heavy();
      await new Promise((r) => setTimeout(r, 200));
      await haptic.success();
      await new Promise((r) => setTimeout(r, 300));
      await haptic.success();
    };
    run();
  }, [status]);

  useEffect(() => {
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    let confirmOk = false;

    // Fire /stripe/confirm separately so an auth/network failure in the poll
    // body can never prevent the confirm call from being attempted.
    async function tryConfirm(token: string | undefined) {
      if (confirmOk || !sessionId) return;
      try {
        await api.post<{ unlocked: boolean }>(
          "/stripe/confirm",
          { session_id: sessionId },
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        confirmOk = true;
      } catch {
        // Will retry on next poll cycle
      }
    }

    async function poll() {
      attempts++;

      // 1. Try to get a valid session + user
      const { data: { session } } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
      const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

      // 2. Always attempt confirm - even without a session, the backend logs will
      //    tell us what's wrong (401 = auth lost after Stripe redirect)
      await tryConfirm(session?.access_token ?? undefined);

      if (!user) {
        if (attempts >= MAX_POLLS) {
          setStatus("timeout");
          haptic.warning();
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL);
        return;
      }

      // 3. Check entitlement
      try {
        const { data } = await supabase
          .from("user_entitlements")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          localStorage.setItem("roam_unlimited_unlocked", "1");
          setStatus("unlocked");
          timer = setTimeout(() => navigate("/trip", { replace: true }), 4000);
          return;
        }
      } catch {
        // Supabase query failed - keep polling
      }

      if (attempts >= MAX_POLLS) { setStatus("timeout"); haptic.warning(); return; }
      timer = setTimeout(poll, POLL_INTERVAL);
    }

    timer = setTimeout(poll, POLL_INTERVAL);
    return () => clearTimeout(timer);
  }, [navigate, sessionId]);

  const isUnlocked = status === "unlocked";

  // The whole page is always ochre-forward.
  // Polling = warm ochre wash. Unlocked = deeper, richer ochre.
  // Both work in light and dark because we don't rely on --roam-bg.

  return (
    <div
      className="purchase-success-root"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 28px",
        textAlign: "center",
        fontFamily: "inherit",
        overflow: "hidden",
        position: "relative",
        // Polling: warm ochre gradient. Unlocked: deeper, richer.
        background: isUnlocked
          ? "linear-gradient(165deg, #3a1208 0%, #6b2518 20%, var(--brand-ochre, #b5452e) 50%, #c9633e 75%, #d98a5c 100%)"
          : "var(--ps-bg)",
        transition: "background 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
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

      {/* Topo contour lines - white on ochre, always */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: isUnlocked ? 0.07 : 0.05,
          transition: "opacity 1s ease",
          pointerEvents: "none",
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="topo-s" x="0" y="0" width="400" height="400" patternUnits="userSpaceOnUse">
              <ellipse cx="200" cy="200" rx="180" ry="140" fill="none" stroke="#fff" strokeWidth="0.8" />
              <ellipse cx="200" cy="200" rx="140" ry="108" fill="none" stroke="#fff" strokeWidth="0.6" />
              <ellipse cx="200" cy="200" rx="100" ry="76" fill="none" stroke="#fff" strokeWidth="0.8" />
              <ellipse cx="200" cy="200" rx="60" ry="44" fill="none" stroke="#fff" strokeWidth="0.6" />
              <ellipse cx="80" cy="340" rx="90" ry="60" fill="none" stroke="#fff" strokeWidth="0.5" />
              <ellipse cx="80" cy="340" rx="50" ry="32" fill="none" stroke="#fff" strokeWidth="0.6" />
              <ellipse cx="340" cy="70" rx="80" ry="50" fill="none" stroke="#fff" strokeWidth="0.5" />
              <ellipse cx="340" cy="70" rx="45" ry="26" fill="none" stroke="#fff" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="400" height="400" fill="url(#topo-s)" />
        </svg>
      </div>

      {/* Warm radial glow - top center */}
      <div
        style={{
          position: "absolute",
          top: "-10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "80vmin",
          height: "80vmin",
          borderRadius: "50%",
          background: isUnlocked
            ? "radial-gradient(circle, rgba(217,138,92,0.35) 0%, transparent 65%)"
            : "radial-gradient(circle, rgba(232,184,77,0.20) 0%, transparent 65%)",
          pointerEvents: "none",
          transition: "background 1s ease",
          animation: "orb-breathe 8s ease-in-out infinite alternate",
        }}
      />

      {/* Bottom glow */}
      <div
        style={{
          position: "absolute",
          bottom: "-15%",
          left: "30%",
          transform: "translateX(-50%)",
          width: "70vmin",
          height: "70vmin",
          borderRadius: "50%",
          background: isUnlocked
            ? "radial-gradient(circle, rgba(107,37,24,0.30) 0%, transparent 60%)"
            : "radial-gradient(circle, rgba(181,69,46,0.15) 0%, transparent 60%)",
          pointerEvents: "none",
          transition: "background 1s ease",
          animation: "orb-breathe 10s ease-in-out 2s infinite alternate",
        }}
      />

      <ConfettiBurst active={isUnlocked} />

      {/* ── POLLING ───────────────────────────────────────────────── */}
      {status === "polling" && (
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
            opacity: entered ? 1 : 0,
            transform: entered ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 0.7s ease, transform 0.7s ease",
          }}
        >
          {/* Compass in frosted circle */}
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid var(--roam-border-strong)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "var(--shadow-heavy)",
            }}
          >
            <Compass
              size={38}
              strokeWidth={1.6}
              style={{
                color: "var(--on-color)",
                animation: "roam-spin 3s ease-in-out infinite",
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))",
              }}
            />
          </div>

          <div>
            <h1 style={{
              fontSize: 28, fontWeight: 950, margin: "0 0 8px",
              color: "var(--on-color)", letterSpacing: "-0.4px",
            }}>
              Payment confirmed!
            </h1>
            <p style={{
              margin: 0, fontSize: 15, fontWeight: 500,
              color: "rgba(255,255,255,0.70)", lineHeight: 1.5,
            }}>
              Activating Roam Untethered...
            </p>
          </div>

          {/* Shimmer bar - ochre tones */}
          <div style={{
            width: 200, height: 4, borderRadius: "var(--r-pill)",
            background: "rgba(255,255,255,0.10)", overflow: "hidden",
          }}>
            <div style={{
              width: "100%", height: "100%", borderRadius: "var(--r-pill)",
              background: "linear-gradient(90deg, #d98a5c, #faf6ef, #e8b84d, #d98a5c)",
              backgroundSize: "200% 100%",
              animation: "shimmer-bar 2s ease-in-out infinite",
            }} />
          </div>

          {/* Inline escape - lets impatient users bail before the 30s timeout */}
          <button
            type="button"
            onClick={() => { haptic.tap(); navigate("/", { replace: true }); }}
            className="trip-interactive"
            style={{
              marginTop: 8,
              background: "transparent",
              border: "none",
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(255,255,255,0.55)",
              cursor: "pointer",
              textDecoration: "underline",
              textDecorationColor: "rgba(255,255,255,0.25)",
              textUnderlineOffset: 3,
              WebkitTapHighlightColor: "transparent",
              letterSpacing: "0.01em",
            }}
            aria-label="Take me home"
          >
            Take me home
          </button>
        </div>
      )}

      {/* ── UNLOCKED ──────────────────────────────────────────────── */}
      {status === "unlocked" && (
        <div style={{
          position: "relative", zIndex: 2,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          {/* Pulse rings + checkmark */}
          <div style={{
            position: "relative",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 20,
          }}>
            <PulseRings />

            <div style={{
              width: 100, height: 100, borderRadius: "50%",
              background: "linear-gradient(145deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 100%)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "2px solid rgba(255,255,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "success-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
              boxShadow: "var(--shadow-heavy)",
            }}>
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <path
                  d="M11 22L18.5 29.5L33 14.5"
                  stroke="#fff"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: 44,
                    strokeDashoffset: 44,
                    animation: "check-draw 0.5s ease 0.3s forwards",
                    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
                  }}
                />
              </svg>
            </div>
          </div>

          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
            borderRadius: 999, padding: "5px 16px", marginBottom: 8,
            border: "1px solid var(--roam-border-strong)",
            animation: "fade-up 0.5s ease 0.4s both",
          }}>
            <MapPin size={12} style={{ color: "rgba(255,255,255,0.85)" }} />
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.95)", textTransform: "uppercase",
            }}>
              Roam Untethered
            </span>
          </div>

          <h1 style={{
            fontSize: 34, fontWeight: 950, margin: 0, color: "var(--on-color)",
            lineHeight: 1.08, letterSpacing: "-0.5px",
            animation: "fade-up 0.5s ease 0.5s both",
          }}>
            You&apos;re untethered.
          </h1>

          <p style={{
            margin: "8px 0 0", fontSize: 16, fontWeight: 500,
            color: "rgba(255,255,255,0.75)", lineHeight: 1.5, maxWidth: 290,
            animation: "fade-up 0.5s ease 0.65s both",
          }}>
            Every feature unlocked. Every road ahead is yours.
          </p>

          {/* Feature pills */}
          <div style={{
            display: "flex", flexWrap: "wrap", justifyContent: "center",
            gap: 8, marginTop: 24, maxWidth: 340,
            animation: "fade-up 0.6s ease 0.85s both",
          }}>
            {UNLOCK_FEATURES.map((f, i) => (
              <div
                key={f.label}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
                  borderRadius: 999, padding: "6px 14px 6px 10px",
                  border: "1px solid var(--roam-border)",
                  animation: `pill-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) ${0.9 + i * 0.1}s both`,
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: f.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--on-color)", flexShrink: 0,
                  boxShadow: `0 2px 6px ${f.color}44`,
                }}>
                  {f.icon}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--on-color)", whiteSpace: "nowrap" }}>
                  {f.label}
                </span>
              </div>
            ))}
          </div>

          {/* Redirect note */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            marginTop: 28, fontSize: 13, fontWeight: 600,
            color: "rgba(255,255,255,0.5)",
            animation: "fade-up 0.5s ease 1.4s both",
          }}>
            <span>Taking you to your trips</span>
            <ArrowRight size={14} style={{ animation: "nudge-right 1.2s ease-in-out infinite" }} />
          </div>
        </div>
      )}

      {/* ── TIMEOUT ───────────────────────────────────────────────── */}
      {status === "timeout" && (
        <div style={{
          position: "relative", zIndex: 2,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--roam-border-strong)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "var(--shadow-heavy)",
          }}>
            <Compass size={34} strokeWidth={1.8} style={{ color: "rgba(255,255,255,0.8)" }} />
          </div>

          <div>
            <h1 style={{
              fontSize: 24, fontWeight: 900, margin: "0 0 8px",
              color: "var(--on-color)", letterSpacing: "-0.3px",
            }}>
              Still processing...
            </h1>
            <p style={{
              margin: 0, fontSize: 14, fontWeight: 500,
              color: "rgba(255,255,255,0.65)", lineHeight: 1.5, maxWidth: 300,
            }}>
              Your payment went through. It can take a moment to activate - close this page and reopen the app.
            </p>
          </div>

          <button
            type="button"
            onClick={() => { haptic.tap(); navigate("/trip", { replace: true }); }}
            className="trip-interactive"
            style={{
              marginTop: 4, padding: "14px 32px",
              borderRadius: "var(--r-btn, 14px)",
              background: "rgba(255,255,255,0.15)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid var(--roam-border-strong)",
              color: "var(--on-color)", fontWeight: 700,
              cursor: "pointer", fontSize: 15,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            Go to Roam
          </button>
        </div>
      )}

      {/* ── Keyframes + CSS custom properties ─────────────────────── */}
      <style>{`
        .purchase-success-root {
          --ps-bg: linear-gradient(165deg, #b5452e 0%, #c9633e 40%, #d98a5c 70%, #e8b84d 100%);
        }
        [data-theme="tactical-night"] {
          .purchase-success-root {
            --ps-bg: linear-gradient(165deg, #3a1208 0%, #6b2518 25%, #b5452e 55%, #c9633e 80%, #8b5a3a 100%);
          }
        }
        @keyframes confetti-fall {
          0%   { opacity: 1; transform: translateY(-30px) translateX(0) rotate(0deg) scale(0.2); }
          12%  { opacity: 1; transform: translateY(8vh) translateX(calc(var(--c-drift) * 0.3)) rotate(calc(var(--c-rot) * 0.2)) scale(1.1); }
          100% { opacity: 0; transform: translateY(var(--c-end)) translateX(calc(var(--c-drift) * 1.6)) rotate(var(--c-rot)) scale(0.5); }
        }
        @keyframes shimmer-bar {
          0%   { background-position: 0% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes success-pop {
          0%   { opacity: 0; transform: scale(0.2); }
          60%  { opacity: 1; transform: scale(1.1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes check-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes nudge-right {
          0%, 100% { transform: translateX(0); }
          50%      { transform: translateX(5px); }
        }
        @keyframes pill-pop {
          0%   { opacity: 0; transform: scale(0.6); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse-ring {
          0%   { opacity: 0.6; transform: scale(0.7); }
          100% { opacity: 0; transform: scale(3.5); }
        }
        @keyframes orb-breathe {
          0%   { transform: translateX(-50%) scale(1); opacity: 0.8; }
          100% { transform: translateX(-50%) scale(1.15); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
          /* Keep essential state visible - skip to final frame */
          @keyframes fade-up {
            from { opacity: 1; transform: none; }
            to   { opacity: 1; transform: none; }
          }
          @keyframes success-pop {
            from { opacity: 1; transform: scale(1); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes check-draw {
            to { stroke-dashoffset: 0; }
          }
          @keyframes pill-pop {
            from { opacity: 1; transform: scale(1); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes confetti-fall {
            0%, 100% { opacity: 0; transform: none; }
          }
          @keyframes pulse-ring {
            0%, 100% { opacity: 0; transform: none; }
          }
        }
      `}</style>
    </div>
  );
}

export default function PurchaseSuccessPage() {
  return (
    <Suspense>
      <PurchaseSuccessInner />
    </Suspense>
  );
}
