// src/app/login/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

  const isNative = useMemo(() => Capacitor.isNativePlatform(), []);

  // If already authenticated, go to /trip
  useEffect(() => {
    if (!loading && session) router.replace("/trip");
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
      // success -> session updates -> redirect effect fires
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

      const e1 = email.trim();
      if (!e1 || !password) {
        setError("Email and password are required");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }

      setBusy(true);
      try {
        if (mode === "login") {
          const { error: err } = await signInWithEmail(e1, password);
          if (err) setError(err.message);
        } else {
          const { error: err } = await signUpWithEmail(e1, password);
          if (err) setError(err.message);
          else setSignupSuccess(true);
        }
      } finally {
        setBusy(false);
      }
    },
    [email, password, mode, signInWithEmail, signUpWithEmail],
  );

  if (loading) {
    return (
      <div className="trip-wrap-center">
        <span className="trip-muted">Loading…</span>
      </div>
    );
  }

  return (
    <div className="trip-wrap-center">
      <div className="trip-card" style={{ gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
          <img
            src="/roam-logo.png"
            alt="Roam"
            style={{
              width: 72,
              height: 72,
              borderRadius: "16px",
              objectFit: "contain",
            }}
          />
        </div>
        <div className="trip-muted" style={{ textAlign: "center", marginBottom: 4 }}>
          Navigate anywhere. Even offline.
        </div>

        {/* Apple Sign-In (native only - true system UI, must be black bg per Apple HIG) */}
        {isNative && (
          <button
            type="button"
            onClick={handleApple}
            disabled={busy}
            className="trip-interactive"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              width: "100%",
              minHeight: 52,
              padding: "0 16px",
              borderRadius: "var(--r-btn)",
              border: "none",
              background: "#000",
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              opacity: busy ? 0.55 : 1,
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
              letterSpacing: "-0.01em",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
              userSelect: "none",
            }}
          >
            <AppleMark />
            <span style={{ lineHeight: 1, transform: "translateY(0.5px)" }}>
              Sign in with Apple
            </span>
          </button>
        )}

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="trip-btn trip-btn-secondary"
          style={{ opacity: busy ? 0.55 : 1 }}
        >
          <GoogleG />
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: "var(--roam-border)" }} />
          <span className="trip-muted-small">or</span>
          <div style={{ flex: 1, height: 1, background: "var(--roam-border)" }} />
        </div>

        <form onSubmit={handleEmailSubmit} style={{ display: "contents" }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            inputMode="email"
            style={{
              width: "100%",
              height: 52,
              padding: "0 16px",
              borderRadius: "var(--r-btn)",
              border: "none",
              background: "var(--roam-surface-hover)",
              color: "var(--roam-text)",
              fontSize: 15,
              fontWeight: 600,
              outline: "none",
              boxSizing: "border-box",
              transition: "box-shadow 0.15s ease",
            }}
            onFocus={(e) => { e.currentTarget.style.boxShadow = "inset 0 0 0 2px var(--roam-info)"; }}
            onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
            disabled={busy}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            style={{
              width: "100%",
              height: 52,
              padding: "0 16px",
              borderRadius: "var(--r-btn)",
              border: "none",
              background: "var(--roam-surface-hover)",
              color: "var(--roam-text)",
              fontSize: 15,
              fontWeight: 600,
              outline: "none",
              boxSizing: "border-box",
              transition: "box-shadow 0.15s ease",
            }}
            onFocus={(e) => { e.currentTarget.style.boxShadow = "inset 0 0 0 2px var(--roam-info)"; }}
            onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy}
            className="trip-btn trip-btn-primary"
            style={{ opacity: busy ? 0.55 : 1 }}
          >
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {error && <div className="trip-err-box">{error}</div>}

        {signupSuccess && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "var(--r-btn)",
              background: "var(--accent-tint)",
              color: "var(--roam-accent)",
              fontSize: "0.875rem",
              fontWeight: 700,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
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
          className="trip-interactive"
          style={{
            background: "none",
            border: "none",
            color: "var(--roam-accent)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            textAlign: "center",
            padding: "8px 0",
            width: "100%",
          }}
          disabled={busy}
        >
          {mode === "login"
            ? "Don't have an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

function AppleMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.48 2.22-1.26 3.06-.81.87-2.14 1.55-3.31 1.46-.15-1.1.43-2.27 1.19-3.07.84-.89 2.24-1.54 3.38-1.45ZM20.39 17.13c-.54 1.24-.8 1.8-1.5 2.9-.98 1.52-2.36 3.41-4.06 3.43-1.51.02-1.9-.99-3.96-.98-2.06.01-2.49 1.0-4 .98-1.7-.02-3-1.73-3.98-3.25-2.74-4.24-3.03-9.22-1.34-11.82 1.2-1.86 3.1-2.96 4.89-2.96 1.83 0 2.98 1.0 4.49 1.0 1.47 0 2.36-1.0 4.47-1.0 1.6 0 3.3.87 4.5 2.36-3.95 2.16-3.31 7.78.49 9.34Z"
      />
    </svg>
  );
}

function GoogleG() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
