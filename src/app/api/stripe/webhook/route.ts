// src/app/api/stripe/webhook/route.ts
//
// Handles Stripe webhook events. Writes the user_entitlements row in Supabase
// when a checkout session completes.
//
// Also handles RevenueCat webhooks at the same endpoint — RC sends a different
// Authorization header so we distinguish them before parsing.
//
// Stripe dashboard: add webhook endpoint pointing at /api/stripe/webhook
//   Events to send: checkout.session.completed
//
// RevenueCat dashboard: add webhook pointing at /api/stripe/webhook
//   Header: Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
//   Events: INITIAL_PURCHASE, NON_RENEWING_PURCHASE
//
// Required env vars:
//   STRIPE_WEBHOOK_SECRET      — whsec_... from Stripe dashboard
//   SUPABASE_SERVICE_ROLE_KEY  — for writing entitlements
//   NEXT_PUBLIC_SUPABASE_URL
//   REVENUECAT_WEBHOOK_SECRET  — shared secret you set in RC dashboard (optional)

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-11-17.clover",
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Must use raw body for Stripe signature verification
export const dynamic = "force-dynamic";

async function upsertEntitlement(
  userId: string,
  source: "stripe" | "revenuecat",
  extra?: { stripe_customer_id?: string; stripe_payment_intent?: string; rc_app_user_id?: string }
) {
  await supabaseAdmin.from("user_entitlements").upsert(
    {
      user_id: userId,
      source,
      unlocked_at: new Date().toISOString(),
      ...extra,
    },
    { onConflict: "user_id,source" }
  );
}

/* ── Stripe ──────────────────────────────────────────────────────── */

async function handleStripe(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("[stripe/webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // We embed supabase_user_id in metadata at checkout creation time
    const userId = session.metadata?.supabase_user_id;
    if (!userId) {
      console.error("[stripe/webhook] No supabase_user_id in session metadata", session.id);
      return NextResponse.json({ error: "No user ID in metadata" }, { status: 400 });
    }

    await upsertEntitlement(userId, "stripe", {
      stripe_customer_id: typeof session.customer === "string" ? session.customer : undefined,
      stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
    });

    console.log(`[stripe/webhook] Unlocked user ${userId} via Stripe`);
  }

  return NextResponse.json({ received: true });
}

/* ── RevenueCat ──────────────────────────────────────────────────── */

async function handleRevenueCat(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization")?.replace("Bearer ", "");
    if (auth !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json();
  const eventType: string = body?.event?.type ?? "";

  // Only care about one-time purchase events
  if (eventType !== "INITIAL_PURCHASE" && eventType !== "NON_RENEWING_PURCHASE") {
    return NextResponse.json({ received: true });
  }

  // RC sends the app user ID — we need to look up the Supabase user.
  // Convention: when you configure RC, set the app user ID to the Supabase user ID
  // (call Purchases.logIn(supabaseUserId) after auth — see NativeBootstrap).
  const rcUserId: string = body?.event?.app_user_id ?? "";
  if (!rcUserId) {
    return NextResponse.json({ error: "No app_user_id" }, { status: 400 });
  }

  // If RC user ID looks like a UUID it IS the Supabase user ID
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(rcUserId)) {
    console.warn("[rc/webhook] app_user_id is not a UUID — skipping:", rcUserId);
    return NextResponse.json({ received: true });
  }

  await upsertEntitlement(rcUserId, "revenuecat", { rc_app_user_id: rcUserId });
  console.log(`[rc/webhook] Unlocked user ${rcUserId} via RevenueCat`);

  return NextResponse.json({ received: true });
}

/* ── Router ──────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  // Stripe sends a stripe-signature header; RC does not
  const isStripe = req.headers.has("stripe-signature");
  return isStripe ? handleStripe(req) : handleRevenueCat(req);
}
