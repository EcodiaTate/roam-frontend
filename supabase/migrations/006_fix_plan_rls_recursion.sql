-- Migration: fix infinite recursion in plan_sync RLS policies (idempotent)
--
-- Safe to re-run. Drops ALL policies on all three plan tables, then recreates
-- them with non-recursive patterns.

-- ── Drop ALL existing policies ─────────────────────────────────────────────────

-- roam_plans
drop policy if exists "Owner can manage own plans" on public.roam_plans;
drop policy if exists "Members can read shared plans" on public.roam_plans;
drop policy if exists "Editors can update shared plans" on public.roam_plans;

-- roam_plan_members
drop policy if exists "Members can read plan memberships" on public.roam_plan_members;
drop policy if exists "Users can read own memberships" on public.roam_plan_members;
drop policy if exists "Owners can read all plan members" on public.roam_plan_members;
drop policy if exists "Users can join plans" on public.roam_plan_members;
drop policy if exists "Owners can manage members" on public.roam_plan_members;

-- roam_plan_invites
drop policy if exists "Authenticated users can read invites" on public.roam_plan_invites;
drop policy if exists "Creator can create invites" on public.roam_plan_invites;
drop policy if exists "Authenticated users can update invite uses" on public.roam_plan_invites;

-- ── Helper: check membership without triggering RLS ────────────────────────────

drop function if exists public.is_plan_member(text, uuid);
drop function if exists public.is_plan_member(uuid, uuid);

create function public.is_plan_member(p_plan_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.roam_plan_members
    where plan_id = p_plan_id
      and user_id = p_user_id
  );
end;
$$;

-- ── roam_plans policies ────────────────────────────────────────────────────────

create policy "Owner can manage own plans"
  on public.roam_plans for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Members can read shared plans"
  on public.roam_plans for select
  using (public.is_plan_member(plan_id, auth.uid()));

create policy "Editors can update shared plans"
  on public.roam_plans for update
  using (public.is_plan_member(plan_id, auth.uid()));

-- ── roam_plan_members policies ─────────────────────────────────────────────────

create policy "Users can read own memberships"
  on public.roam_plan_members for select
  using (auth.uid() = user_id);

create policy "Owners can read all plan members"
  on public.roam_plan_members for select
  using (
    exists (
      select 1 from public.roam_plans
      where roam_plans.plan_id = roam_plan_members.plan_id
        and roam_plans.owner_id = auth.uid()
    )
  );

create policy "Users can join plans"
  on public.roam_plan_members for insert
  with check (auth.uid() = user_id);

create policy "Owners can manage members"
  on public.roam_plan_members for delete
  using (
    exists (
      select 1 from public.roam_plans
      where roam_plans.plan_id = roam_plan_members.plan_id
        and roam_plans.owner_id = auth.uid()
    )
  );

-- ── roam_plan_invites policies ─────────────────────────────────────────────────

create policy "Authenticated users can read invites"
  on public.roam_plan_invites for select
  using (auth.uid() is not null);

create policy "Creator can create invites"
  on public.roam_plan_invites for insert
  with check (auth.uid() = created_by);

create policy "Authenticated users can update invite uses"
  on public.roam_plan_invites for update
  using (auth.uid() is not null);
