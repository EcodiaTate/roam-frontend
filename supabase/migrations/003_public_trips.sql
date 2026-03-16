-- Migration: public trip sharing feed
-- Run in Supabase SQL editor or via: supabase db push

-- ── public_trips ──────────────────────────────────────────────────────────────
-- Lightweight snapshot of a trip published by a user for discovery.
-- No map images — just the stop names, coordinates, and route metadata.
-- The full offline bundle is NOT stored here; users who clone a trip
-- get the stop list and must build their own bundle.

create table if not exists public.public_trips (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,

  -- Generated display title (e.g. "Brisbane → Cairns via Townsville")
  title           text not null,

  -- Stops: array of {id, type, name, lat, lng}
  stops           jsonb not null default '[]',

  -- Route summary (from NavRoute)
  distance_m      double precision not null default 0,
  duration_s      double precision not null default 0,

  -- Bounding box for spatial filtering [west, south, east, north]
  bbox_west       double precision,
  bbox_south      double precision,
  bbox_east       double precision,
  bbox_north      double precision,

  -- Encoded route geometry (polyline6) for map preview rendering
  geometry        text,

  -- Profile used (drive / bike / walk)
  profile         text not null default 'drive',

  -- Privacy: false = public/discoverable, true = private
  is_private      boolean not null default true,

  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Spatial index: used for proximity feed queries
-- We store bbox corners separately (no PostGIS dependency) and index center point
create index if not exists public_trips_center_idx
  on public.public_trips (
    (bbox_west + (bbox_east - bbox_west) / 2.0),
    (bbox_south + (bbox_north - bbox_south) / 2.0)
  )
  where is_private = false;

-- Feed index: newest public trips first
create index if not exists public_trips_feed_idx
  on public.public_trips (published_at desc)
  where is_private = false;

-- Owner lookup (my published trips)
create index if not exists public_trips_owner_idx
  on public.public_trips (owner_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.public_trips enable row level security;

-- Anyone can read public trips
create policy "Public trips are visible to all"
  on public.public_trips for select
  using (is_private = false OR auth.uid() = owner_id);

-- Owners manage their own rows
create policy "Owners can insert own trips"
  on public.public_trips for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update own trips"
  on public.public_trips for update
  using (auth.uid() = owner_id);

create policy "Owners can delete own trips"
  on public.public_trips for delete
  using (auth.uid() = owner_id);

-- ── public_trip_clones ────────────────────────────────────────────────────────
-- Tracks who cloned what — deduplicates re-clones, drives a clone count metric.

create table if not exists public.public_trip_clones (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.public_trips(id) on delete cascade,
  cloner_id   uuid not null references auth.users(id) on delete cascade,
  cloned_at   timestamptz not null default now()
);

create unique index if not exists public_trip_clones_unique_idx
  on public.public_trip_clones (trip_id, cloner_id);

alter table public.public_trip_clones enable row level security;

create policy "Cloners can read own clones"
  on public.public_trip_clones for select
  using (auth.uid() = cloner_id);

create policy "Cloners can insert own clones"
  on public.public_trip_clones for insert
  with check (auth.uid() = cloner_id);

-- View: clone counts per trip (used for "X people cloned this")
create or replace view public.public_trip_clone_counts as
  select trip_id, count(*) as clone_count
  from public.public_trip_clones
  group by trip_id;
