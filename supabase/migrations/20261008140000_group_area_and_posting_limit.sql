-- Three things for the Find tab and for hosting: which area a posting belongs to, a cap on how
-- many postings one player can host at once, and who is allowed to hold a host seat at all.
--
-- Decided by the developer on 2026-10-08:
--   - Find lists only postings from the player's own area (a Reno player should not scroll past
--     Sacramento).
--   - A player may host at most 7 postings at a time. The slot belongs to whoever is hosting
--     now: handing the host role to someone else frees the old host's slot and uses one of the
--     new host's.
--   - When a host leaves, the role passes to the longest-standing player who still has a free
--     slot. If nobody in the group has one, the posting is deleted.

-- ---------------------------------------------------------------------------
-- 1. groups.area
-- ---------------------------------------------------------------------------
-- The event area (see 20261007120000_event_areas.sql) the host was in when they posted. The app
-- sends it and uses it only to decide which postings to list, so it is a convenience, not a
-- permission: nothing is hidden from anyone by it, a join code still finds a group anywhere, and
-- a host who sent the wrong area would only hide their own posting from their neighbours. The
-- foreign key keeps it to a real area; an area being removed blanks it rather than deleting the
-- group. NULL means "posted before areas were recorded" and is listed everywhere.
alter table public.groups
  add column if not exists area text references public.event_areas (id) on delete set null;

create index if not exists groups_area_idx on public.groups (area) where area is not null;

-- ---------------------------------------------------------------------------
-- 2. Counting, and taking turns.
-- ---------------------------------------------------------------------------
-- How many postings a player is hosting right now. Internal: only the functions below call it.
create or replace function public.hosted_group_count(p_player uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.group_players where player_id = p_player and role = 'Host';
$$;

revoke execute on function public.hosted_group_count(uuid) from public, anon, authenticated;

-- Everything that can add to a player's hosted postings takes this lock first, so two changes
-- for the same player at the same instant are counted one after the other and cannot both slip
-- under the limit. Held to the end of the transaction. Internal.
create or replace function public.lock_hosting_slots(p_player uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_player::text, 7));
$$;

revoke execute on function public.lock_hosting_slots(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Posting a group: refused when the creator has no slot left.
-- ---------------------------------------------------------------------------
-- Enforced here because the app's own check is only as good as the groups list it has loaded,
-- and because groups can be inserted through the REST API without the app at all.
--
-- createGroup inserts the group and then seats the host as a second request, so at this moment
-- the new group has no host yet. What is counted is the postings the creator is hosting, plus
-- any group they created that still has no players (a posting whose host seat is on its way).
--
-- Edge cases: SECURITY DEFINER, because a signed-in client has no DELETE on groups and the
-- function tidies up before it counts. It first removes the creator's own postings that have no
-- players and are more than a minute old - if the host seat was refused (they already have a
-- group that day) the empty group used to be left behind with no way to delete it, and would
-- now also silently use up a slot. A group that is seconds old is left alone, since its host
-- seat may still be on the way, and it counts, so a flood of empty groups is capped too. The
-- message is written for the player: the app shows it as it is.
create or replace function public.groups_enforce_posting_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_postings constant int := 7;  -- MAX_POSTINGS in src/utils/group-utils.ts
  pending int;
begin
  perform public.lock_hosting_slots(new.created_by);

  delete from public.groups g
   where g.created_by = new.created_by
     and g.created_at < now() - interval '1 minute'
     and not exists (select 1 from public.group_players gp where gp.group_id = g.id);

  select count(*) into pending
    from public.groups g
   where g.created_by = new.created_by
     and not exists (select 1 from public.group_players gp where gp.group_id = g.id);

  if public.hosted_group_count(new.created_by) + pending >= max_postings then
    raise exception 'You already have % postings up, which is the most allowed at once. Delete one, hand one to another host, or wait for one to finish.', max_postings;
  end if;

  return new;
end;
$$;

revoke execute on function public.groups_enforce_posting_limit() from public, anon, authenticated;

drop trigger if exists groups_posting_limit_trg on public.groups;
create trigger groups_posting_limit_trg
  before insert on public.groups
  for each row execute function public.groups_enforce_posting_limit();

-- ---------------------------------------------------------------------------
-- 4. Taking a host seat: only the player who posted the group, only once, only with a slot.
-- ---------------------------------------------------------------------------
-- A seat is inserted directly by the client (join and create), and the insert policy only checks
-- that the seat is the caller's own. Nothing checked the role. So anyone could join any group
-- with role 'Host' through the REST API and then do what a host can: report rounds (and so hand
-- out points), delete the posting, or reassign the host role. This closes that.
--
-- Edge cases: only inserts with role 'Host' are looked at; every other role passes untouched,
-- and the host role still moves between players through transfer_group_host and leave_group,
-- which update the row rather than insert one. Raises if the group doesn't exist, the caller
-- didn't create it, it already has a host, or the player is already hosting the maximum. A
-- refusal leaves no seat behind.
create or replace function public.group_players_guard_host_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_postings constant int := 7;
  creator uuid;
begin
  if new.role is distinct from 'Host' then
    return new;
  end if;

  select created_by into creator from public.groups where id = new.group_id;
  if creator is null or creator <> new.player_id then
    raise exception 'Only the player who posted a group can take its host seat';
  end if;

  perform public.lock_hosting_slots(new.player_id);

  if exists (select 1 from public.group_players where group_id = new.group_id and role = 'Host') then
    raise exception 'This group already has a host';
  end if;

  if public.hosted_group_count(new.player_id) >= max_postings then
    raise exception 'You already have % postings up, which is the most allowed at once. Delete one, hand one to another host, or wait for one to finish.', max_postings;
  end if;

  return new;
end;
$$;

revoke execute on function public.group_players_guard_host_seat() from public, anon, authenticated;

drop trigger if exists group_players_guard_host_seat_trg on public.group_players;
create trigger group_players_guard_host_seat_trg
  before insert on public.group_players
  for each row execute function public.group_players_guard_host_seat();

-- ---------------------------------------------------------------------------
-- 5. leave_group: the host role passes to the next player who has a free slot.
-- ---------------------------------------------------------------------------
-- Same function as 20261006140000, with one change in who becomes host when the host leaves: it
-- used to be the longest-standing remaining member, whoever they were. Now it is the
-- longest-standing remaining member who is hosting fewer than the maximum; and if no remaining
-- member has a free slot, the posting is deleted, because a group with nobody able to run it
-- cannot confirm a game or report a round.
-- Edge cases: raises if unauthenticated. Returns 'not_member' (no error, no change) if the group
-- doesn't exist or the caller isn't in it - leaving twice, or leaving a group the stale-group
-- cron already removed, is harmless. The group row is locked first, so two members leaving at
-- the same instant are processed one after the other. Returns 'deleted' both when the caller was
-- the last member and when nobody left could host; either way the group, its roster, and its
-- recorded rounds are gone (points already paid for those rounds stay paid). Each candidate's
-- slots are locked before being counted, so a player cannot be made host of two groups at once
-- past the limit. A member leaving a group that still has its host changes nothing else.
create or replace function public.leave_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_postings constant int := 7;
  caller uuid := auth.uid();
  removed int;
  candidate uuid;
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
    for candidate in
      select player_id
        from public.group_players
       where group_id = p_group_id
       order by joined_at asc, player_id asc
    loop
      perform public.lock_hosting_slots(candidate);
      if public.hosted_group_count(candidate) < max_postings then
        new_host := candidate;
        exit;
      end if;
    end loop;

    if new_host is null then
      delete from public.groups where id = p_group_id;
      return 'deleted';
    end if;

    update public.group_players
       set role = 'Host'
     where group_id = p_group_id and player_id = new_host;
  end if;

  return 'left';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. transfer_group_host: refused when the new host has no free slot.
-- ---------------------------------------------------------------------------
-- Same function as 20261006140000, plus the slot check. Handing a posting on frees one of the
-- old host's slots and uses one of the new host's.
-- Edge cases: raises if unauthenticated, if the group doesn't exist, if the caller is not the
-- group's host, if the target is not a member of the group, or if the target is already hosting
-- the maximum - an explicit handoff is refused rather than passed along to someone the host did
-- not choose. No-op if the target is the caller (already host). Nothing changes on a refusal.
create or replace function public.transfer_group_host(p_group_id uuid, p_new_host_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_postings constant int := 7;
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

  perform public.lock_hosting_slots(p_new_host_id);
  if public.hosted_group_count(p_new_host_id) >= max_postings then
    raise exception 'That player is already hosting % postings, which is the most allowed at once.', max_postings;
  end if;

  update public.group_players
     set role = 'Member'
   where group_id = p_group_id and role = 'Host' and player_id <> p_new_host_id;

  update public.group_players
     set role = 'Host'
   where group_id = p_group_id and player_id = p_new_host_id;
end;
$$;

revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.transfer_group_host(uuid, uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.transfer_group_host(uuid, uuid) to authenticated;
