// src/app/api/stripe/checkout/route.ts
//
// Creates a Stripe Checkout Session for the Roam Unlimited one-time purchase.
// Called from the browser PaywallModal; the client is redirected to Stripe's
// hosted checkout page, then back to /purchase/success?session_id=...
//
// Required env vars:
//   STRIPE_SECRET_KEY               — Stripe secret key (sk_live_... / sk_test_...)
//   NEXT_PUBLIC_STRIPE_PRICE_ID     — Stripe Price ID for the one-time $19.99 product
//   NEXT_PUBLIC_SUPABASE_URL        — for server-side Supabase admin client
//   SUPABASE_SERVICE_ROLE_KEY       — service role key (write entitlements)

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

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  let userId: string;
  let userEmail: string | undefined;

  if (token) {
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
    userEmail = user.email;
  } else if (process.env.NODE_ENV !== "production") {
    // Dev-only: allow unauthenticated checkout with a placeholder user ID
    // so you can test the Stripe flow without signing in.
    userId = "dev-test-user";
    userEmail = undefined;
  } else {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "Payment not configured." }, { status: 500 });
  }

  const origin = req.headers.get("origin") ?? "https://roam.ecodia.au";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    // Pass user ID through so the webhook can write the entitlement without
    // needing a Stripe customer → Supabase user lookup table
    metadata: { supabase_user_id: userId },
    customer_email: userEmail,
    success_url: `${origin}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/new`,
    // Allow promo codes (optional — remove if not using)
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
