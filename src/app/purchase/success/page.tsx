// src/app/purchase/success/page.tsx
//
// Landing page after Stripe Checkout completes.
// Polls Supabase until the webhook has written the entitlement row,
// then redirects to /new so the user can create their next trip.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const MAX_POLLS = 12;       // 12 × 2.5 s = 30 s max wait
const POLL_INTERVAL = 2500;

export default function PurchaseSuccessPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"polling" | "unlocked" | "timeout">("polling");

  useEffect(() => {
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      attempts++;
      try {
        // Refresh session — the Stripe redirect can leave the token stale
        await supabase.auth.refreshSession();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/login"); return; }

        const { data } = await supabase
          .from("user_entitlements")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          // Webhook has written the row — also seed local cache
          localStorage.setItem("roam_unlimited_unlocked", "1");
          setStatus("unlocked");
          timer = setTimeout(() => router.replace("/trip"), 1800);
          return;
        }
      } catch {
        // ignore, keep polling
      }

      if (attempts >= MAX_POLLS) {
        setStatus("timeout");
        return;
      }

      timer = setTimeout(poll, POLL_INTERVAL);
    }

    timer = setTimeout(poll, POLL_INTERVAL);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
      padding: "0 24px",
      background: "var(--roam-bg, #0a0a0a)",
      color: "var(--roam-text-on-dark, #f4efe6)",
      textAlign: "center",
      fontFamily: "inherit",
    }}>
      {status === "polling" && (
        <>
          <div style={{ fontSize: 48 }}>✓</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Payment confirmed!</h1>
          <p style={{ margin: 0, opacity: 0.6, fontSize: 15 }}>
            Activating your Roam Untethered…
          </p>
          {/* Simple spinner */}
          <div style={{
            width: 32, height: 32,
            border: "3px solid rgba(255,255,255,0.15)",
            borderTopColor: "var(--brand-eucalypt, #2d6e40)",
            borderRadius: "50%",
            animation: "roam-spin 0.7s linear infinite",
          }} />
        </>
      )}

      {status === "unlocked" && (
        <>
          <div style={{ fontSize: 56 }}>🎉</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Welcome, Nomad!</h1>
          <p style={{ margin: 0, opacity: 0.7, fontSize: 15 }}>
            Roam Untethered is active. Taking you to your trips…
          </p>
        </>
      )}

      {status === "timeout" && (
        <>
          <div style={{ fontSize: 48 }}>⏱</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Still processing…</h1>
          <p style={{ margin: 0, opacity: 0.7, fontSize: 14, maxWidth: 300 }}>
            Your payment went through. It can take a moment to activate — close this page and reopen the app.
          </p>
          <button
            onClick={() => router.replace("/trip")}
            style={{
              marginTop: 8,
              padding: "12px 28px",
              borderRadius: 12,
              background: "var(--brand-eucalypt, #2d6e40)",
              color: "#fff",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              fontSize: 15,
            }}
          >
            Go to Roam
          </button>
        </>
      )}
    </div>
  );
}
