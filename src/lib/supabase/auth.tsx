// src/lib/supabase/auth.tsx

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "./client";
import { api } from "@/lib/api";
import { planSync } from "@/lib/offline/planSync";
import { mergeLocalTripsToServer } from "@/lib/paywall/tripGate";

import { Capacitor } from "@capacitor/core";

export type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** True when signed in via the App Review demo account — no real Supabase session. */
  isDemoMode: boolean;

  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signInWithAppleNative: () => Promise<{ error: AuthError | null }>;

  signInWithEmail: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
};

// App Review demo credentials — allows Apple reviewers to access all features
// without requiring a real Supabase account to be set up.
const DEMO_EMAIL = "apple@ecodia.au";
const DEMO_PASSWORD = "appleecodia";

const AuthContext = createContext<AuthState | null>(null);

function randomNonce(len = 32): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function asAuthError(message: string): AuthError {
  return { name: "AuthError", message } as AuthError;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(() => {
    // Persist demo mode across reloads so reviewers don't get logged out
    // when the app restarts. Cleared on sign-out.
    try { return localStorage.getItem("roam_demo_mode") === "1"; } catch { return false; }
  });

  useEffect(() => {
    // Race getSession() against a short timeout so the app never hangs on
    // cold start when there is no network. Supabase persists the session in
    // localStorage so this resolves instantly from cache in the happy path;
    // the timeout only fires when the SDK tries to reach the server and stalls.
    const sessionTimeout = new Promise<{ data: { session: Session | null } }>(
      (resolve) => setTimeout(() => resolve({ data: { session: null } }), 2500),
    );

    Promise.race([supabase.auth.getSession(), sessionTimeout]).then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setLoading(false);

      // On sign-in, merge any pre-auth localStorage trips into the server
      // so the counter is never lost/reset when creating an account.
      if (event === "SIGNED_IN" && newSession) {
        mergeLocalTripsToServer();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // START/STOP SYNC BASED ON AUTH
  useEffect(() => {
    const uid = session?.user?.id ?? null;

    if (uid) {
      planSync.start(uid);
    } else {
      planSync.stop();
    }

    return () => {
      planSync.stop();
    };
  }, [session?.user?.id]);

  const signInWithGoogle = useCallback(async () => {
    // On web, derive the callback URL from the current origin so localhost dev
    // redirects back to localhost instead of the live domain.
    const redirectTo = Capacitor.isNativePlatform()
      ? "https://roam.ecodia.au/auth/callback"
      : `${window.location.origin}/auth/callback`;

    if (Capacitor.isNativePlatform()) {
      // skipBrowserRedirect prevents Supabase from calling window.location.href,
      // which would navigate the WebView off roam.ecodia.au into Safari.
      // Instead we open the OAuth URL in SFSafariViewController / Chrome Custom Tab.
      // After Google auth, Supabase redirects to /auth/callback which detects the
      // in-app browser context, redirects to au.ecodia.roam:// custom scheme,
      // and the OS intercepts it → closes the browser → fires appUrlOpen.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) return { error };
      if (data?.url) {
        const { Browser } = await import("@capacitor/browser");

        // Safety timeout: if the browser never closes (user gets stuck,
        // deep-link fails, etc.) close it after 120s so the app isn't hung.
        let settled = false;
        const timeout = setTimeout(async () => {
          if (!settled) {
            settled = true;
            Browser.close().catch(() => {});
          }
        }, 120_000);

        const closeHandler = await Browser.addListener("browserFinished", async () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          closeHandler.remove();
          // Give the deep-link handler a moment to route to /auth/callback
          // which triggers the Supabase code exchange via detectSessionInUrl.
          setTimeout(async () => {
            const { data: sess } = await supabase.auth.getSession();
            if (!sess.session) {
              await supabase.auth.getSession();
            }
          }, 1000);
        });
        // On iPad, "fullscreen" stretches a phone-sized OAuth page over the entire
        // iPad screen and fails Apple's "screen was not optimized" review criterion.
        // "popover" presents a proper sheet/popover on iPad while remaining
        // full-screen on iPhone.
        const isIpad =
          /iPad/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        await Browser.open({
          url: data.url,
          presentationStyle: isIpad ? "popover" : "fullscreen",
        });
      }
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    return { error };
  }, []);

  /**
   * Native (in-app) Apple Sign-In
   * Uses @capacitor-community/apple-sign-in -> SignInWithApple.authorize()
   * Then exchanges the returned identityToken with Supabase via signInWithIdToken.
   */
  const signInWithAppleNative = useCallback(async () => {
    try {
      if (!Capacitor.isNativePlatform()) {
        return { error: asAuthError("Apple Sign-In is only available in the installed app.") };
      }

      // Raw nonce for Supabase, hashed nonce for Apple request
      const nonce = randomNonce(32);
      const nonceHash = await sha256Hex(nonce);

      // clientId is ignored by the native iOS plugin (ASAuthorizationAppleIDProvider
      // has no client ID concept) - Apple always sets aud = Bundle ID in the JWT.
      // Supabase must have au.ecodia.roam listed under Apple provider → Authorized Client IDs.
      const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
      const result = await SignInWithApple.authorize({
        clientId: "au.ecodia.roam",
        redirectURI: "https://roam.ecodia.au/auth/callback", // unused on native, required by plugin types
        scopes: "email name",
        state: `roam-${Date.now()}`,
        nonce: nonceHash,
      });

      const identityToken = (result as { response?: { identityToken?: string }; identityToken?: string })?.response?.identityToken ?? (result as { identityToken?: string })?.identityToken;
      if (!identityToken) {
        return { error: asAuthError("Apple Sign-In failed: missing identity token.") };
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: identityToken,
        nonce, // raw nonce
      });

      if (error) {
        console.error("[Apple SSO] signInWithIdToken error:", error.message);
      }
      return { error };
    } catch (e: unknown) {
      // 1001 = ASAuthorizationErrorCanceled - user dismissed the sheet, not an error
      // 1000 = ASAuthorizationError.unknown - often a provisioning / capability issue
      // 1004 = ASAuthorizationErrorNotHandled - system could not handle the request
      const msg: string = e instanceof Error ? e.message : String(e);
      const code: string = typeof (e as { code?: unknown })?.code === "string"
        ? (e as { code: string }).code
        : typeof (e as { code?: unknown })?.code === "number"
          ? String((e as { code: number }).code)
          : "";
      console.error("[Apple SSO] authorize error:", JSON.stringify(e), msg, "code:", code);

      if (code === "1001" || msg.includes("1001") || msg.toLowerCase().includes("cancel")) {
        return { error: null };
      }
      if (code === "1000" || msg.includes("1000")) {
        console.error("[Apple SSO] Error 1000 - check: (1) Sign in with Apple capability in Xcode, (2) Supabase Apple provider has au.ecodia.roam in Authorized Client IDs, (3) Apple Services ID config");
        return {
          error: asAuthError(
            "Apple Sign-In is temporarily unavailable. Please try again, or use another sign-in method.",
          ),
        };
      }
      if (code === "1004" || msg.includes("1004") || msg.toLowerCase().includes("not handled")) {
        return {
          error: asAuthError(
            "Apple Sign-In could not be completed. Please try again.",
          ),
        };
      }
      return { error: asAuthError(msg || "Apple Sign-In failed. Please try again or use another sign-in method.") };
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    // App Review demo account: bypass Supabase and enter demo mode so the
    // reviewer can access all features without a real account.
    if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
      try { localStorage.setItem("roam_demo_mode", "1"); } catch {}
      setIsDemoMode(true);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    try { localStorage.removeItem("roam_demo_mode"); } catch {}
    setIsDemoMode(false);
    await supabase.auth.signOut();
    setSession(null);
    planSync.stop();
  }, []);

  const deleteAccount = useCallback(async (): Promise<{ error: string | null }> => {
    try {
      await api.delete("/account");
      // Server deleted the auth user — sign out locally
      planSync.stop();
      await supabase.auth.signOut();
      setSession(null);
      // Clear local storage caches
      localStorage.removeItem("roam_trips_used");
      localStorage.removeItem("roam_unlimited_unlocked");
      return { error: null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete account.";
      return { error: msg };
    }
  }, []);

  const user = session?.user ?? null;

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user,
      isDemoMode,
      signInWithGoogle,
      signInWithAppleNative,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      deleteAccount,
    }),
    [
      loading,
      session,
      user,
      isDemoMode,
      signInWithGoogle,
      signInWithAppleNative,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
