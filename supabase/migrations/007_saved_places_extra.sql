-- Migration: add extra jsonb column to saved_places
-- Stores enriched place metadata (phone, website, hours, facilities, etc.)
-- so saved places retain their full data across the app.

alter table public.saved_places
  add column if not exists extra jsonb;
