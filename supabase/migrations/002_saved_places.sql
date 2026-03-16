-- Migration: user saved places (bookmarks)
-- Run in Supabase SQL editor or via: supabase db push

-- ── saved_places ──────────────────────────────────────────────────────────────
-- Stores a user's bookmarked POIs.  The place_id is the OSM/Mapbox id from the
-- PlaceItem type; coordinates are denormalised for fast map rendering without
-- joining to an external dataset.

create table if not exists public.saved_places (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  place_id        text not null,               -- PlaceItem.id (OSM / geocoder id)
  name            text not null,
  lat             double precision not null,
  lng             double precision not null,
  category        text not null,               -- PlaceCategory value
  note            text,                        -- optional personal note (max 500 chars)
  saved_at        timestamptz not null default now()
);

-- One bookmark per user per place (prevents duplicates)
create unique index if not exists saved_places_user_place_idx
  on public.saved_places (user_id, place_id);

-- Fast lookup: all places for a user, sorted by saved_at
create index if not exists saved_places_user_saved_at_idx
  on public.saved_places (user_id, saved_at desc);

-- RLS: users can only read / write their own rows
alter table public.saved_places enable row level security;

create policy "Users can select own saved places"
  on public.saved_places for select
  using (auth.uid() = user_id);

create policy "Users can insert own saved places"
  on public.saved_places for insert
  with check (auth.uid() = user_id);

create policy "Users can update own saved places"
  on public.saved_places for update
  using (auth.uid() = user_id);

create policy "Users can delete own saved places"
  on public.saved_places for delete
  using (auth.uid() = user_id);
