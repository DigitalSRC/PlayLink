-- Group lifecycle: leaving a group, deleting a group, and transferring host.
--
-- Three problems, all in how roster/ownership changes were authorized (security backlog issue 4):
--   1. `groups` had no DELETE policy, so the client's deleteGroup affected zero rows and reported
--      success. "Delete Posting" and "last player leaves" never actually deleted anything; only
--      the stale-group cron did.
--   2. `group_players` had no UPDATE policy, so setGroupHost affected zero rows. Host transfer
--      never persisted - and a host who left stayed un-replaced, leaving a group nobody could run.
--   3. "group_players_delete_members" let ANY member delete ANY member's row, so a non-host could
--      remove other players (or the host) by calling the REST API directly.
--
-- Fix, consistent with the scoring RPCs in 20260930120000: clients get no direct DELETE on
-- `groups` or UPDATE/DELETE on `group_players`. Each change goes through a SECURITY DEFINER
-- function that checks who is calling and does the whole change in one transaction, so the roster
-- can no longer be left half-changed by a client that drops off between two requests.
--
-- Deliberately NOT added: any way to remove another player. The app has no kick feature; if one
-- is ever wanted it should be its own host-only function, not a broad policy.

-- ---------------------------------------------------------------------------
-- 1. Remove the direct write paths.
-- ---------------------------------------------------------------------------
drop policy if exists "group_players_delete_members" on public.group_players;

-- Defense in depth beyond RLS deny-by-default (no UPDATE/DELETE policy exists on group_players,
-- and no DELETE policy on groups): remove the base grants too, so a forged request fails at the
-- grant before a policy is even consulted. INSERT stays - join/create still insert directly,
-- limited to the caller's own id by "group_players_insert_self" / "groups_insert_self_host".
revoke update, delete on public.group_players from authenticated;
revoke delete on public.groups from authenticated;

-- ---------------------------------------------------------------------------
-- 2. leave_group: the caller leaves a group.
-- ---------------------------------------------------------------------------
-- Removes the caller from the roster. If they were the last member, the group is deleted. If
-- they were the host and others remain, the longest-standing remaining member becomes host in
-- the same transaction, so a group is never left without one. Returns 'left', 'deleted', or
-- 'not_member' so the client can tell what happened.
-- Edge cases: raises if unauthenticated. Returns 'not_member' (no error, no change) if the group
-- doesn't exist or the caller isn't in it - leaving twice, or leaving a group the stale-group
-- cron already removed, is harmless. The group row is locked first, so two members leaving at
-- the same instant are processed one after the other and exactly one of them can be "last". If
-- the roster somehow has no host after the caller is removed (e.g. legacy data), one is
-- appointed. Deleting the group cascades to its results; points from finalized rounds that a
-- participant hasn't applied yet are lost with it, same as when the stale-group cron removes it.
create or replace function public.leave_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  removed int;
  new_host uuid;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  -- Serializes concurrent leave/transfer/delete calls for this group (and blocks a concurrent
  -- join's foreign-key check until this transaction finishes).
  perform 1 from public.groups where id = p_group_id for update;
  if not found then
    return 'not_member';
  end if;

  delete from public.group_players
   where group_id = p_group_id and player_id = caller;
  get diagnostics removed = row_count;
  if removed = 0 then
    return 'not_member';
  end if;

  if not exists (select 1 from public.group_players where group_id = p_group_id) then
    delete from public.groups where id = p_group_id;
    return 'deleted';
  end if;

  if not exists (
    select 1 from public.group_players where group_id = p_group_id and role = 'Host'
  ) then
    select player_id into new_host
      from public.group_players
     where group_id = p_group_id
     order by joined_at asc, player_id asc
     limit 1;
    update public.group_players
       set role = 'Host'
     where group_id = p_group_id and player_id = new_host;
  end if;

  return 'left';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. delete_group: the host deletes a group for everyone.
-- ---------------------------------------------------------------------------
-- Edge cases: raises if unauthenticated or if the caller is not the group's host (including a
-- plain member, or someone not in the group at all). No-op if the group no longer exists, so a
-- repeated tap or a race with the stale-group cron is harmless. Cascades to the roster and
-- results; unapplied points from finalized rounds are lost with it (see leave_group).
create or replace function public.delete_group(p_group_id uuid)
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

  perform 1 from public.groups where id = p_group_id for update;
  if not found then
    return;
  end if;

  if not exists (
    select 1 from public.group_players
    where group_id = p_group_id and player_id = caller and role = 'Host'
  ) then
    raise exception 'Only the host may delete a group';
  end if;

  delete from public.groups where id = p_group_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. transfer_group_host: the host hands the role to another member.
-- ---------------------------------------------------------------------------
-- Promotes the target and demotes every other host in one transaction, so there is exactly one
-- host afterwards (the old two-request client flow could leave two, or - since neither request
-- was actually permitted - change nothing).
-- Edge cases: raises if unauthenticated, if the group doesn't exist, if the caller is not the
-- group's host, or if the target is not a member of the group. No-op if the target is the caller
-- (already host).
create or replace function public.transfer_group_host(p_group_id uuid, p_new_host_id uuid)
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

  perform 1 from public.groups where id = p_group_id for update;
  if not found then
    raise exception 'No such group';
  end if;

  if not exists (
    select 1 from public.group_players
    where group_id = p_group_id and player_id = caller and role = 'Host'
  ) then
    raise exception 'Only the host may transfer the host role';
  end if;

  if p_new_host_id = caller then
    return;
  end if;

  if not exists (
    select 1 from public.group_players
    where group_id = p_group_id and player_id = p_new_host_id
  ) then
    raise exception 'The new host must be a member of this group';
  end if;

  update public.group_players
     set role = 'Member'
   where group_id = p_group_id and role = 'Host' and player_id <> p_new_host_id;

  update public.group_players
     set role = 'Host'
   where group_id = p_group_id and player_id = p_new_host_id;
end;
$$;

-- New functions are executable by PUBLIC by default, and Supabase also grants EXECUTE to anon and
-- authenticated by name, so anon has to be revoked explicitly. Lock to authenticated only.
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.delete_group(uuid) from public, anon;
revoke execute on function public.transfer_group_host(uuid, uuid) from public, anon;

grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.transfer_group_host(uuid, uuid) to authenticated;
