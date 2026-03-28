// src/lib/paywall/tripGate.ts
//
// Trip usage gate - tracks how many trips the user has created and whether
// they have purchased Roam Untethered.
//
// SOURCE OF TRUTH (anti-cheat):
//   - Unlock status  → Supabase `user_entitlements` (written by webhook, read by client)
//   - Trip count     → Supabase `user_trip_counts`   (written by /api/trips/increment)
//   - localStorage is an offline-only cache. /new requires auth (AuthGate), so
//     the server count is always authoritative. On sign-in, mergeLocalTripsToServer()
//     pushes max(server, local) to the server so pre-auth trips are never lost.
//
// PLATFORM ROUTING:
//   - Native (iOS/Android Capacitor) → RevenueCat purchase flow
//   - Web browser                    → Stripe Checkout redirect
//
// Tier logic:
//   trips_used == 0  → first launch → show welcome modal
//   trips_used == 1  → trip 2 in progress → show "make it count" banner
//   trips_used >= 2  → show full paywall (must purchase before creating)
//   unlocked == true → skip gate entirely

import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase/client";
import { api } from "@/lib/api";

// Lazy-loaded to keep RevenueCat (~120KB) out of the initial bundle.
// Only loaded on native platforms when actually needed.
async function getPurchases() {
  const mod = await import("@revenuecat/purchases-capacitor");
  return mod;
}

const KEY_TRIPS_USED = "roam_trips_used";
const KEY_UNLOCKED   = "roam_unlimited_unlocked";

const RC_ENTITLEMENT_ID = "roam_unlimited";
const RC_PRODUCT_ID     = "roam_unlimited_lifetime";

/* ── Platform helper ─────────────────────────────────────────────── */

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/* ── Local cache helpers (localStorage) ─────────────────────────── */
// Used only as offline fallback - never the primary source of truth.

function localGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

function localSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
}

/* ── Supabase: unlock status ─────────────────────────────────────── */

/** Returns true if the authenticated user has an entitlement row in Supabase. */
async function fetchUnlockFromSupabase(): Promise<boolean | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null; // not logged in - can't check

    const { data, error } = await supabase
      .from("user_entitlements")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return data !== null;
  } catch {
    return null;
  }
}

/* ── Supabase: trip count ────────────────────────────────────────── */

async function fetchTripCountFromSupabase(): Promise<number | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("user_trip_counts")
      .select("trips_used")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return null;
    return data?.trips_used ?? 0;
  } catch {
    return null;
  }
}

/* ── RevenueCat ──────────────────────────────────────────────────── */

let _rcReady = false;
let _rcInitPromise: Promise<void> | null = null;

export async function initRevenueCat(apiKey: string): Promise<void> {
  if (!isNativePlatform() || _rcReady) return;
  if (_rcInitPromise) return _rcInitPromise;

  _rcInitPromise = (async () => {
    try {
      const { Purchases, LOG_LEVEL } = await getPurchases();
      await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR });
      await Purchases.configure({ apiKey });
      _rcReady = true;
    } catch (e) {
      console.warn("[tripGate] RevenueCat init failed:", e);
      _rcInitPromise = null; // allow retry
    }
  })();

  return _rcInitPromise;
}

/** Wait for RC to be ready, with a timeout. Returns true if ready. */
async function ensureRCReady(): Promise<boolean> {
  if (_rcReady) return true;
  if (_rcInitPromise) {
    await Promise.race([_rcInitPromise, new Promise((r) => setTimeout(r, 5000))]);
  }
  return _rcReady;
}

/** Native only: check RC entitlement and persist to Supabase + local cache. */
async function syncUnlockFromRC(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  await ensureRCReady();
  if (!_rcReady) return false;
  try {
    const { Purchases } = await getPurchases();
    const { customerInfo } = await Purchases.getCustomerInfo();
    const unlocked = RC_ENTITLEMENT_ID in customerInfo.entitlements.active;
    if (unlocked) {
      // Persist to server so it's visible on web too
      await markEntitlementInSupabase("revenuecat");
      localSet(KEY_UNLOCKED, "1");
    }
    return unlocked;
  } catch {
    return false;
  }
}

async function markEntitlementInSupabase(source: "revenuecat" | "stripe" | "manual"): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_entitlements").upsert(
      { user_id: user.id, source },
      { onConflict: "user_id,source" }
    );
  } catch {
    // Non-fatal: webhook will also write this
  }
}

/* ── Public: purchase / restore (native) ────────────────────────── */

export async function purchaseUnlimited(): Promise<{ success: boolean; error?: string }> {
  if (!isNativePlatform()) {
    return { success: false, error: "Use Stripe on web." };
  }

  const ready = await ensureRCReady();
  if (!ready) {
    return { success: false, error: "Payment service is still loading. Please wait a moment and try again." };
  }

  try {
    const { Purchases } = await getPurchases();

    const { products } = await Purchases.getProducts({
      productIdentifiers: [RC_PRODUCT_ID],
    });
    const product = products.find((p) => p.identifier === RC_PRODUCT_ID);
    if (!product) {
      return { success: false, error: "Product not available. Please check your internet connection and try again." };
    }

    const { customerInfo } = await Purchases.purchaseStoreProduct({ product });
    const unlocked = RC_ENTITLEMENT_ID in customerInfo.entitlements.active;
    if (unlocked) {
      await markEntitlementInSupabase("revenuecat");
      localSet(KEY_UNLOCKED, "1");
      return { success: true };
    }
    return { success: false, error: "Purchase completed but entitlement not found. Please tap Restore purchase." };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "1") return { success: false, error: "cancelled" };
    return { success: false, error: err?.message ?? "Purchase failed. Please try again." };
  }
}

export async function restorePurchases(): Promise<{ success: boolean; error?: string }> {
  if (!isNativePlatform()) {
    return { success: false, error: "Restore is only available in the app." };
  }

  const ready = await ensureRCReady();
  if (!ready) {
    return { success: false, error: "Payment service is still loading. Please wait a moment and try again." };
  }

  try {
    const { Purchases } = await getPurchases();
    const { customerInfo } = await Purchases.restorePurchases();
    const unlocked = RC_ENTITLEMENT_ID in customerInfo.entitlements.active;
    if (unlocked) {
      await markEntitlementInSupabase("revenuecat");
      localSet(KEY_UNLOCKED, "1");
    }
    return { success: unlocked, error: unlocked ? undefined : "No previous purchase found." };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Restore failed." };
  }
}

/* ── Public: web Stripe redirect ─────────────────────────────────── */

/** Redirects browser to Stripe Checkout. Does not return on success. */
export async function redirectToStripeCheckout(): Promise<{ error: string }> {
  try {
    // Always refresh to avoid sending a stale/expired access_token that causes 401s
    const { data: { session } } = await supabase.auth.refreshSession();
    const token = session?.access_token;
    const { url } = await api.post<{ url: string }>("/stripe/checkout", undefined, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    window.location.href = url;
    return { error: "" }; // unreachable
  } catch (err: unknown) {
    const e = err as { details?: { error?: string }; message?: string };
    return { error: e?.details?.error ?? e?.message ?? "Could not connect to payment service. Please try again." };
  }
}

/* ── Trip counter ────────────────────────────────────────────────── */

async function getTripsUsed(): Promise<number> {
  // Server is authoritative - local is fallback when offline / unauthenticated
  const serverCount = await fetchTripCountFromSupabase();
  if (serverCount !== null) {
    localSet(KEY_TRIPS_USED, String(serverCount));
    return serverCount;
  }
  const raw = localGet(KEY_TRIPS_USED);
  const n = parseInt(raw ?? "0", 10);
  return isNaN(n) ? 0 : n;
}

/** Called after a trip is successfully saved. Increments server counter via API. */
export async function incrementTripsUsed(): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    // Auth is required on /new - this should not be reachable.
    // If it somehow is, refuse to count locally to prevent cheating.
    throw new Error("Cannot increment trips: not authenticated");
  }

  try {
    const { trips_used } = await api.post<{ trips_used: number }>("/trips/increment", undefined, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    localSet(KEY_TRIPS_USED, String(trips_used));
    return trips_used;
  } catch {
    // Offline - fall back to local increment so the paywall still triggers
  }
  const current = parseInt(localGet(KEY_TRIPS_USED) ?? "0", 10);
  const next = (isNaN(current) ? 0 : current) + 1;
  localSet(KEY_TRIPS_USED, String(next));
  return next;
}

export async function isUnlocked(): Promise<boolean> {
  const server = await fetchUnlockFromSupabase();
  if (server !== null) return server;
  return localGet(KEY_UNLOCKED) === "1";
}

/**
 * Merge localStorage trip count into the server after sign-in.
 * Ensures pre-auth trips are never lost and can't be replayed by clearing storage.
 * Should be called exactly once per SIGNED_IN event.
 */
export async function mergeLocalTripsToServer(): Promise<void> {
  try {
    // Skip merge entirely for entitled users - trip count is irrelevant
    const unlocked = await isUnlocked();
    if (unlocked) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const raw = localGet(KEY_TRIPS_USED);
    const localCount = parseInt(raw ?? "0", 10);
    // Only merge if there's a meaningful local count
    if (isNaN(localCount) || localCount <= 0) return;

    const { trips_used } = await api.post<{ trips_used: number }>("/trips/merge", { local_count: localCount }, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    // Sync local cache to the authoritative merged value
    localSet(KEY_TRIPS_USED, String(trips_used));
  } catch {
    // Non-fatal - server count is still authoritative
  }
}

/* ── Gate check - call before creating a new trip ────────────────── */

export type GateResult =
  | { allowed: true;  tripsUsed: number; unlocked: boolean }
  | { allowed: false; reason: "paywall" | "welcome"; tripsUsed: number; unlocked: boolean };

export async function checkTripGate(): Promise<GateResult> {
  // Dev shortcut: ?paywall=1 forces paywall, ?welcome=1 forces welcome modal
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    const p = new URLSearchParams(window.location.search);
    if (p.get("paywall") === "1") return { allowed: false, reason: "paywall", tripsUsed: 2, unlocked: false };
    if (p.get("welcome") === "1") return { allowed: false, reason: "welcome", tripsUsed: 0, unlocked: false };
  }

  // On native: also sync RC entitlements in case they purchased on another device
  if (isNativePlatform()) {
    await syncUnlockFromRC();
  }

  // Check unlock first - skip trip count query entirely for entitled users
  const unlocked = await isUnlocked();
  if (unlocked) return { allowed: true, tripsUsed: 0, unlocked: true };

  const tripsUsed = await getTripsUsed();

  if (tripsUsed >= 2) return { allowed: false, reason: "paywall", tripsUsed, unlocked: false };

  if (tripsUsed === 0) return { allowed: false, reason: "welcome", tripsUsed, unlocked: false };

  return { allowed: true, tripsUsed, unlocked: false };
}
