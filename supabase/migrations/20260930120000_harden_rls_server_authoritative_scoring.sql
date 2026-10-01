-- Security hardening: make the server authoritative over everything a user could otherwise
-- forge by calling the Supabase REST API directly (bypassing the app UI, which is trivial since
-- the anon key ships in every build).
--
-- Before this migration, three things were only "enforced" by client code and were therefore
-- not enforced at all against a direct API call:
--   1. profiles.points / wins / losses / draws / monthly_points / is_developer were writable by
--      the owning user, so anyone could set their own leaderboard score to anything.
--   2. group_results could be inserted/updated by any group member, so a member could rewrite a
--      round's placements to make themselves win, finalize a round early, or clear a dispute.
--   3. groups could be updated by any member, not just the host.
--
-- Fix: clients may no longer write score columns or group_results at all. Every scoring state
-- change goes through a SECURITY DEFINER function below that re-derives points server-side from
-- the placement order (so the host can't inflate them either) and only ever mutates the caller's
-- own row / own entry. Read policies are unchanged — this migration is about write authority.

-- ---------------------------------------------------------------------------
-- 1. profiles: strip client write access to score and privilege columns.
-- ---------------------------------------------------------------------------
-- A table-level UPDATE/INSERT grant covers every column, and a column-level REVOKE does NOT
-- subtract from it (Postgres tracks table- and column-level grants separately). So we remove the
-- table-level grants entirely and re-grant only the columns a user is legitimately allowed to set
-- on their own profile. RLS (auth.uid() = id) still applies on top of these as the row filter.
revoke insert, update on public.profiles from authenticated;

grant insert (id, username, display_name, location, games, preferred_formats, brackets, no_go)
  on public.profiles to authenticated;

-- rival_ids stays client-writable: it's matchmaking data, not score/privilege, and onboarding
-- persists an initial match through it. The daily refresh Edge Function (service_role) remains
-- its real source of truth. Everything omitted here (points, wins, losses, draws, monthly_points,
-- is_developer, last_rival_refresh, monthly_reset_at) is now writable only by SECURITY DEFINER
-- functions / the service role, never by a normal client.
grant update (username, display_name, location, games, preferred_formats, brackets, no_go, rival_ids)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. group_players: a user may only add THEMSELVES to a group.
-- ---------------------------------------------------------------------------
-- The old policy also let any existing member insert a row for any player_id, i.e. force other
-- people into a group. No app flow needs that (create seats the host as self, join seats the
-- joiner as self), so restrict inserts to the caller's own id.
drop policy if exists "group_players_insert_self_or_host" on public.group_players;

create policy "group_players_insert_self"
  on public.group_players for insert
  with check (auth.uid() = player_id);

-- ---------------------------------------------------------------------------
-- 3. groups: only the host may update a group row.
-- ---------------------------------------------------------------------------
drop policy if exists "groups_update_members" on public.groups;

create policy "groups_update_host"
  on public.groups for update
  using (
    exists (
      select 1 from public.group_players
      where group_id = id and player_id = auth.uid() and role = 'Host'
    )
  )
  with check (
    exists (
      select 1 from public.group_players
      where group_id = id and player_id = auth.uid() and role = 'Host'
    )
  );

-- ---------------------------------------------------------------------------
-- 4. group_results: no direct client writes at all. SELECT (members) stays.
-- ---------------------------------------------------------------------------
drop policy if exists "group_results_insert_members" on public.group_results;
drop policy if exists "group_results_update_members" on public.group_results;
-- Defense in depth beyond RLS deny-by-default: remove the base grants too.
revoke insert, update, delete on public.group_results from authenticated;

-- ---------------------------------------------------------------------------
-- 5. Server-authoritative scoring.
-- ---------------------------------------------------------------------------

-- Port of src/utils/scoring-utils.ts computePlacementScores. MUST stay behaviourally identical to
-- that function (there is a unit-test suite pinning the TS version on the unitTests branch); if the
-- scoring rule ever changes, change both. Input: jsonb array of { playerId, placement }. Output:
-- jsonb array of { playerId, placement, outcome, pointsAwarded }.
-- Edge cases: empty or NULL input returns '[]'. Tied placements share a rank, score identically,
-- and are reported 'draw' (even a tie for last). The last distinct rank always scores 0 placement
-- points; a sole first is 'win', a sole last 'loss'; a single-player pod scores a win worth only
-- the participation bonus (no opponent to beat).
create or replace function public.compute_placement_scores(raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  participation_points constant int := 10;  -- flat bonus every player earns
  per_opponent_points  constant int := 10;  -- winner's base pool = 10 * (participants - 1)
  n int;
  winner_base int;
  distinct_ranks int[];
  last_rank int;
  min_rank int;
  result jsonb := '[]'::jsonb;
  elem jsonb;
  pid text;
  plc int;
  idx int;
  tied int;
  rank_pts int;
  outcome text;
begin
  n := jsonb_array_length(raw);
  if n is null or n = 0 then
    return '[]'::jsonb;
  end if;

  winner_base := per_opponent_points * (n - 1);

  select array_agg(distinct (e->>'placement')::int order by (e->>'placement')::int)
    into distinct_ranks
    from jsonb_array_elements(raw) e;

  min_rank := distinct_ranks[1];
  last_rank := distinct_ranks[array_length(distinct_ranks, 1)];

  for elem in select * from jsonb_array_elements(raw) loop
    pid := elem->>'playerId';
    plc := (elem->>'placement')::int;
    idx := array_position(distinct_ranks, plc) - 1;  -- 0-based rank index

    select count(*) into tied
      from jsonb_array_elements(raw) e
      where (e->>'placement')::int = plc;

    if plc = last_rank then
      rank_pts := 0;  -- last distinct rank always scores zero placement points
    else
      rank_pts := round(winner_base::numeric / (2::numeric ^ idx))::int;
    end if;

    if plc = min_rank and tied = 1 then
      outcome := 'win';
    elsif plc = last_rank and tied = 1 and array_length(distinct_ranks, 1) > 1 then
      outcome := 'loss';
    else
      outcome := 'draw';
    end if;

    result := result || jsonb_build_object(
      'playerId', pid,
      'placement', plc,
      'outcome', outcome,
      'pointsAwarded', rank_pts + participation_points
    );
  end loop;

  return result;
end;
$$;

-- Host submits a round. Scores are computed here from the raw placement order, so a host cannot
-- send inflated pointsAwarded. Only the group's host may call this, and every placed player must
-- actually be a member of the group.
-- Edge cases: raises if the caller is unauthenticated, is not the group's host, or if any
-- placement names a non-member. Does not itself prevent duplicate round_number values — the
-- caller passes rounds_played + 1; a retry could create a second row, which the dispute/finalize
-- flow then governs.
create or replace function public.submit_group_result(
  p_group_id uuid,
  p_round_number int,
  p_placements jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.group_players
    where group_id = p_group_id and player_id = caller and role = 'Host'
  ) then
    raise exception 'Only the host may submit a result';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_placements) e
    where (e->>'playerId')::uuid not in (
      select player_id from public.group_players where group_id = p_group_id
    )
  ) then
    raise exception 'A placement refers to a player who is not in this group';
  end if;

  insert into public.group_results (
    group_id, round_number, submitted_by, status, dispute_window_ends_at, placements
  ) values (
    p_group_id, p_round_number, caller, 'pending',
    now() + interval '15 minutes',           -- keep in sync with DISPUTE_WINDOW_MS in group-api.ts
    public.compute_placement_scores(p_placements)
  );
end;
$$;

-- Any member may dispute a pending round, with a required reason. Only appends the caller's own id
-- and reason; cannot touch placements or another member's entry.
-- Edge cases: raises if unauthenticated, the result doesn't exist, the caller isn't a group
-- member, the reason is blank/whitespace, or the round is already finalized. No-op (keeps the
-- original reason) if the caller already disputed it.
create or replace function public.dispute_group_result(p_result_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  r public.group_results;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.group_results where id = p_result_id;
  if not found then
    raise exception 'No such result';
  end if;
  if not public.is_group_member(r.group_id, caller) then
    raise exception 'Not a member of this group';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A dispute reason is required';
  end if;
  if r.status = 'finalized' then
    raise exception 'Cannot dispute a finalized round';
  end if;
  if caller = any(r.disputed_by) then
    return;  -- already disputed; keep their original reason
  end if;

  update public.group_results
     set disputed_by = array_append(disputed_by, caller),
         dispute_reasons = dispute_reasons || jsonb_build_object(caller::text, p_reason),
         status = 'disputed'
   where id = p_result_id;
end;
$$;

-- Lazily finalizes a pending, undisputed round once its dispute window has elapsed, and bumps the
-- group's rounds_played atomically. Any member may trigger it (the time check is what gates it).
-- Edge cases: raises if unauthenticated, the result doesn't exist, or the caller isn't a group
-- member. No-op if the round isn't still pending or its window hasn't elapsed. The guarded UPDATE
-- (status = 'pending') means a dispute landing from another device in the same instant wins —
-- rounds_played is only bumped when this call actually flips the row (row_count = 1).
create or replace function public.finalize_group_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  r public.group_results;
  updated_count int;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.group_results where id = p_result_id;
  if not found then
    raise exception 'No such result';
  end if;
  if not public.is_group_member(r.group_id, caller) then
    raise exception 'Not a member of this group';
  end if;
  if r.status <> 'pending' or now() < r.dispute_window_ends_at then
    return;  -- not ready (already finalized/disputed, or window still open)
  end if;

  update public.group_results
     set status = 'finalized', finalized_at = now()
   where id = p_result_id and status = 'pending';
  get diagnostics updated_count = row_count;

  if updated_count = 1 then
    update public.groups set rounds_played = rounds_played + 1 where id = r.group_id;
  end if;
end;
$$;

-- Applies the CALLER'S OWN share of a finalized round to their profile exactly once. Points and
-- win/loss/draw come from the server-computed placements, not from anything the client sends, and
-- this is the only path that can write those locked profile columns for a normal user.
-- Edge cases: raises if unauthenticated, the result doesn't exist, or the round isn't finalized.
-- No-op if the caller already applied it (idempotent via applied_by, so a reload never
-- double-awards) or didn't participate in the round.
create or replace function public.apply_group_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  r public.group_results;
  mine jsonb;
  pts int;
  oc text;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.group_results where id = p_result_id;
  if not found then
    raise exception 'No such result';
  end if;
  if r.status <> 'finalized' then
    raise exception 'Round is not finalized';
  end if;
  if caller = any(r.applied_by) then
    return;  -- already applied for this caller; idempotent
  end if;

  select e into mine
    from jsonb_array_elements(r.placements) e
    where (e->>'playerId')::uuid = caller
    limit 1;
  if mine is null then
    return;  -- caller didn't participate in this round
  end if;

  pts := (mine->>'pointsAwarded')::int;
  oc  := mine->>'outcome';

  update public.profiles
     set points = points + pts,
         monthly_points = monthly_points + pts,
         wins = wins + (case when oc = 'win' then 1 else 0 end),
         losses = losses + (case when oc = 'loss' then 1 else 0 end),
         draws = draws + (case when oc = 'draw' then 1 else 0 end)
   where id = caller;

  update public.group_results
     set applied_by = array_append(applied_by, caller)
   where id = p_result_id;
end;
$$;

-- Host-only cancel of a non-finalized round so a disputed round can be resubmitted. Also closes a
-- latent gap: group_results never had a DELETE policy, so the old client-side cancelGroupResult
-- (a direct .delete()) silently affected zero rows.
-- Edge cases: raises if unauthenticated, the caller isn't the group's host, or the round is
-- already finalized (finalized rounds are permanent — points may already be applied). No-op if
-- the result no longer exists.
create or replace function public.cancel_group_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  r public.group_results;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.group_results where id = p_result_id;
  if not found then
    return;
  end if;
  if not exists (
    select 1 from public.group_players
    where group_id = r.group_id and player_id = caller and role = 'Host'
  ) then
    raise exception 'Only the host may cancel a result';
  end if;
  if r.status = 'finalized' then
    raise exception 'Cannot cancel a finalized round';
  end if;

  delete from public.group_results where id = p_result_id;
end;
$$;

-- New functions are granted EXECUTE to PUBLIC by default, which would include the anon role.
-- Lock each to authenticated only. compute_placement_scores is internal (called by the definer
-- functions, which run as owner) so it is not exposed to clients at all.
revoke execute on function public.compute_placement_scores(jsonb) from public;
revoke execute on function public.submit_group_result(uuid, int, jsonb) from public;
revoke execute on function public.dispute_group_result(uuid, text) from public;
revoke execute on function public.finalize_group_result(uuid) from public;
revoke execute on function public.apply_group_result(uuid) from public;
revoke execute on function public.cancel_group_result(uuid) from public;

grant execute on function public.submit_group_result(uuid, int, jsonb) to authenticated;
grant execute on function public.dispute_group_result(uuid, text) to authenticated;
grant execute on function public.finalize_group_result(uuid) to authenticated;
grant execute on function public.apply_group_result(uuid) to authenticated;
grant execute on function public.cancel_group_result(uuid) to authenticated;
