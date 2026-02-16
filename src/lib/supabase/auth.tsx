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

async function sha256Base64Url(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(buf);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback`
            : undefined,
      },
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
      const nonceHash = await sha256Base64Url(nonce);

      // IMPORTANT:
      // The plugin API wants these fields even on iOS (per its README). :contentReference[oaicite:3]{index=3}
      // clientId should be your Apple Services ID (the one you configured for Supabase Apple provider).
      const result = await SignInWithApple.authorize({
        clientId: "com.ecodia.roam", // <-- REPLACE with your Apple Services ID if different
        redirectURI: "https://localhost", // not used for native iOS UI, but required by plugin typing
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
      return { error: asAuthError(e?.message ?? "Apple Sign-In failed.") };
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
