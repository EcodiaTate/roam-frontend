// src/lib/supabase/auth.tsx
"use client";

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
import { planSync } from "@/lib/offline/planSync";

import { Capacitor } from "@capacitor/core";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";

export type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;

  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signInWithAppleNative: () => Promise<{ error: AuthError | null }>;

  signInWithEmail: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
};

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
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
    const redirectTo = "https://roam.ecodia.au/auth/callback";

    if (Capacitor.isNativePlatform()) {
      // skipBrowserRedirect prevents Supabase from calling window.location.href,
      // which would navigate the WebView off roam.ecodia.au into Safari.
      // Instead we open the OAuth URL in SFSafariViewController (in-app sheet).
      // After Google auth, Supabase redirects to /auth/callback which loads inside
      // the sheet - that page calls Browser.close() and the main WebView's
      // onAuthStateChange fires via shared localStorage.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) return { error };
      if (data?.url) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: data.url, presentationStyle: "popover" });
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
      const result = await SignInWithApple.authorize({
        clientId: "au.ecodia.roam",
        redirectURI: "https://roam.ecodia.au/auth/callback", // unused on native, required by plugin types
        scopes: "email name",
        state: `roam-${Date.now()}`,
        nonce: nonceHash,
      });

      const identityToken = (result as any)?.response?.identityToken ?? (result as any)?.identityToken;
      if (!identityToken) {
        return { error: asAuthError("Apple Sign-In failed: missing identity token.") };
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: identityToken,
        nonce, // raw nonce
      });

      return { error };
    } catch (e: any) {
      // 1001 = ASAuthorizationErrorCanceled - user dismissed the sheet, not an error
      const msg: string = e?.message ?? "";
      if (msg.includes("1001") || msg.toLowerCase().includes("cancel")) {
        return { error: null };
      }
      return { error: asAuthError(msg || "Apple Sign-In failed.") };
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    planSync.stop();
  }, []);

  const user = session?.user ?? null;

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user,
      signInWithGoogle,
      signInWithAppleNative,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    }),
    [
      loading,
      session,
      user,
      signInWithGoogle,
      signInWithAppleNative,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
