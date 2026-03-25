-- Migration 008: emergency_contacts table + RLS, atomic invite increment,
-- tighten invite update policy.

-- ── emergency_contacts ──────────────────────────────────────────────────────
-- Cloud-synced emergency contacts per user (SOS page).

create table if not exists public.emergency_contacts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  phone         text not null,
  relationship  text,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists emergency_contacts_owner_idx
  on public.emergency_contacts (owner_id);

alter table public.emergency_contacts enable row level security;

create policy "Users can read own emergency contacts"
  on public.emergency_contacts for select
  using (auth.uid() = owner_id);

create policy "Users can insert own emergency contacts"
  on public.emergency_contacts for insert
  with check (auth.uid() = owner_id);

create policy "Users can update own emergency contacts"
  on public.emergency_contacts for update
  using (auth.uid() = owner_id);

create policy "Users can delete own emergency contacts"
  on public.emergency_contacts for delete
  using (auth.uid() = owner_id);

-- ── Atomic invite uses increment ────────────────────────────────────────────
-- Prevents race condition when multiple users redeem concurrently.
-- Returns the new uses count; caller can check against max_uses.

create or replace function public.increment_invite_uses(p_code text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_uses integer;
begin
  update public.roam_plan_invites
    set uses = uses + 1
    where code = p_code
      and (max_uses = 0 or uses < max_uses)
      and (expires_at is null or expires_at > now())
  returning uses into v_new_uses;

  if v_new_uses is null then
    raise exception 'Invite code is expired, at max uses, or does not exist';
  end if;

  return v_new_uses;
end;
$$;

-- ── Tighten invite update policy ────────────────────────────────────────────
-- The old policy let any authenticated user update any invite's fields.
-- Now only the creator or plan owner can update invites (uses increment
-- goes through the security-definer RPC above, bypassing RLS).

drop policy if exists "Authenticated users can update invite uses" on public.roam_plan_invites;

create policy "Invite creator or plan owner can update invite"
  on public.roam_plan_invites for update
  using (
    auth.uid() = created_by
    or exists (
      select 1 from public.roam_plans
      where roam_plans.plan_id = roam_plan_invites.plan_id
        and roam_plans.owner_id = auth.uid()
    )
  );
