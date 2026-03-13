-- Migration: user entitlements + trip usage counter
-- Run in Supabase SQL editor or via: supabase db push

-- ── user_entitlements ────────────────────────────────────────────────────────
-- Source of truth for whether a user has purchased Roam Unlimited.
-- Populated by:
--   - Stripe webhook (source = 'stripe')
--   - RevenueCat webhook (source = 'revenuecat')
--   - Manual grants (source = 'manual')

create table if not exists public.user_entitlements (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  source           text not null check (source in ('stripe', 'revenuecat', 'manual')),
  unlocked_at      timestamptz not null default now(),
  stripe_customer_id    text,
  stripe_payment_intent text,
  rc_app_user_id        text,
  created_at       timestamptz not null default now()
);

-- One entitlement row per source per user is enough; upsert key
create unique index if not exists user_entitlements_user_source_idx
  on public.user_entitlements (user_id, source);

-- RLS: users can only read their own row; writes are server-only (service role)
alter table public.user_entitlements enable row level security;

create policy "Users can read own entitlement"
  on public.user_entitlements for select
  using (auth.uid() = user_id);

-- ── user_trip_counts ─────────────────────────────────────────────────────────
-- Server-side trip counter — prevents localStorage-clearing cheats.
-- Incremented by the /api/trips/increment endpoint (called after successful save).

create table if not exists public.user_trip_counts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  trips_used integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_trip_counts enable row level security;

create policy "Users can read own trip count"
  on public.user_trip_counts for select
  using (auth.uid() = user_id);

-- Server-side upsert function (called from API route with service role key)
-- so users cannot directly increment their own counter via client.
create or replace function public.increment_trip_count(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count integer;
begin
  insert into public.user_trip_counts (user_id, trips_used, updated_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update
    set trips_used = user_trip_counts.trips_used + 1,
        updated_at = now()
  returning trips_used into v_new_count;
  return v_new_count;
end;
$$;
