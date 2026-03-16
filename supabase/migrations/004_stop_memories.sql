-- Migration: per-stop memories (notes + photos) — UGC foundation
-- Run in Supabase SQL editor or via: supabase db push

-- ── stop_memories ────────────────────────────────────────────────────────────
-- Each row = one memory entry attached to a specific stop within a plan.
-- Users can leave a free-text note and up to 5 photos per stop.
-- Photos are stored in Supabase Storage bucket "memories".

create table if not exists public.stop_memories (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  plan_id         text not null,            -- matches OfflinePlanRecord.plan_id
  stop_id         text not null,            -- matches TripStop.id within the plan
  stop_name       text,                     -- denormalized for timeline display

  -- Free-text journal note
  note            text,

  -- Photo paths in Supabase Storage (bucket: memories)
  -- Array of up to 5 storage paths, e.g. ["user-id/plan-id/stop-id/1.jpg", ...]
  photo_paths     text[] not null default '{}',

  -- When the user arrived at this stop (GPS-triggered or manual)
  arrived_at      timestamptz,

  -- Stop coordinates (denormalized for map rendering in timeline)
  lat             double precision,
  lng             double precision,

  -- Stop index in the trip (for ordering in timeline)
  stop_index      smallint not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Plan lookup (all memories for a trip, ordered by stop)
create index if not exists stop_memories_plan_idx
  on public.stop_memories (owner_id, plan_id, stop_index);

-- Unique: one memory per stop per plan per user
create unique index if not exists stop_memories_unique_idx
  on public.stop_memories (owner_id, plan_id, stop_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.stop_memories enable row level security;

create policy "Users can read own memories"
  on public.stop_memories for select
  using (auth.uid() = owner_id);

create policy "Users can insert own memories"
  on public.stop_memories for insert
  with check (auth.uid() = owner_id);

create policy "Users can update own memories"
  on public.stop_memories for update
  using (auth.uid() = owner_id);

create policy "Users can delete own memories"
  on public.stop_memories for delete
  using (auth.uid() = owner_id);

-- ── Storage bucket ──────────────────────────────────────────────────────────
-- Create via Supabase dashboard or:
-- insert into storage.buckets (id, name, public) values ('memories', 'memories', false);
--
-- Storage policies (run in SQL editor):
-- create policy "Users can upload own memory photos"
--   on storage.objects for insert
--   with check (bucket_id = 'memories' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- create policy "Users can read own memory photos"
--   on storage.objects for select
--   using (bucket_id = 'memories' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- create policy "Users can delete own memory photos"
--   on storage.objects for delete
--   using (bucket_id = 'memories' and auth.uid()::text = (storage.foldername(name))[1]);
