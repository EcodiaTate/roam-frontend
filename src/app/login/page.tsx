// src/app/login/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/lib/supabase/auth";

export default function LoginPage() {
  const {
    session,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInWithAppleNative,
  } = useAuth();

  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  // If already authenticated, go to /trip
  useEffect(() => {
    if (!loading && session) {
      router.replace("/trip");
    }
  }, [loading, session, router]);

  const handleGoogle = useCallback(async () => {
    setError(null);
    setBusy(true);
    const { error: err } = await signInWithGoogle();
    if (err) setError(err.message);
    setBusy(false);
  }, [signInWithGoogle]);

  const handleApple = useCallback(async () => {
    setError(null);
    setBusy(true);

    try {
      const { error: err } = await signInWithAppleNative();
      if (err) setError(err.message);
      // On success, auth listener updates session → redirect effect fires
    } catch (e: any) {
      setError(e?.message ?? "Apple Sign-In failed");
    } finally {
      setBusy(false);
    }
  }, [signInWithAppleNative]);

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSignupSuccess(false);

      if (!email.trim() || !password) {
        setError("Email and password are required");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }

      setBusy(true);

      if (mode === "login") {
        const { error: err } = await signInWithEmail(email.trim(), password);
        if (err) setError(err.message);
      } else {
        const { error: err } = await signUpWithEmail(email.trim(), password);
        if (err) setError(err.message);
        else setSignupSuccess(true);
      }

      setBusy(false);
    },
    [email, password, mode, signInWithEmail, signUpWithEmail],
  );

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={{ color: "var(--roam-muted, #888)" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.title}>Roam</div>
        <div style={styles.subtitle}>Navigate anywhere. Even offline.</div>

        {/* Apple (native only, in-app) */}
        {isNative && (
          <button
            type="button"
            onClick={handleApple}
            disabled={busy}
            style={styles.appleBtn}
          >
            <AppleIcon />
            Continue with Apple
          </button>
        )}

        {/* Google OAuth (browser-based) */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          style={styles.googleBtn}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: 8, flexShrink: 0 }}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>

        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <div style={styles.dividerLine} />
        </div>

        <div onSubmit={handleEmailSubmit} style={{ display: "contents" }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            style={styles.input}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            style={styles.input}
          />

          <button
            type="button"
            onClick={handleEmailSubmit as any}
            disabled={busy}
            style={styles.primaryBtn}
          >
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {signupSuccess && (
          <div style={styles.success}>
            Check your email for a confirmation link, then sign in.
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setSignupSuccess(false);
          }}
          style={styles.toggleBtn}
        >
          {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: 8, flexShrink: 0 }} aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.48 2.22-1.26 3.06-.81.87-2.14 1.55-3.31 1.46-.15-1.1.43-2.27 1.19-3.07.84-.89 2.24-1.54 3.38-1.45ZM20.39 17.13c-.54 1.24-.8 1.8-1.5 2.9-.98 1.52-2.36 3.41-4.06 3.43-1.51.02-1.9-.99-3.96-.98-2.06.01-2.49 1.0-4 .98-1.7-.02-3-1.73-3.98-3.25-2.74-4.24-3.03-9.22-1.34-11.82 1.2-1.86 3.1-2.96 4.89-2.96 1.83 0 2.98 1.0 4.49 1.0 1.47 0 2.36-1.0 4.47-1.0 1.6 0 3.3.87 4.5 2.36-3.95 2.16-3.31 7.78.49 9.34Z"
      />
    </svg>
  );
}

/* ── Inline styles ─────────────────────── */

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 20,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "100%",
    maxWidth: 360,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    textAlign: "center",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    color: "var(--roam-muted, #888)",
    marginBottom: 8,
  },

  appleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "#0b0d10",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },

  googleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid var(--roam-border, #333)",
    background: "var(--roam-surface, #1a1a1a)",
    color: "var(--roam-text, #eee)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },

  divider: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "4px 0",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "var(--roam-border, #333)",
  },
  dividerText: {
    fontSize: 12,
    color: "var(--roam-muted, #888)",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--roam-border, #333)",
    background: "var(--roam-surface, #1a1a1a)",
    color: "var(--roam-text, #eee)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  primaryBtn: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "var(--roam-accent, #3b82f6)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(239,68,68,0.12)",
    color: "#f87171",
    fontSize: 13,
    textAlign: "center",
  },
  success: {
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(34,197,94,0.12)",
    color: "#4ade80",
    fontSize: 13,
    textAlign: "center",
  },
  toggleBtn: {
    background: "none",
    border: "none",
    color: "var(--roam-accent, #3b82f6)",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "center",
    padding: "8px 0",
  },
};
