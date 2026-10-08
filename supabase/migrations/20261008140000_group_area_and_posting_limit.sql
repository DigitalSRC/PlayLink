-- Two things for the Find tab: which area a posting belongs to, and a cap on how many postings
-- one player can have up at once.
--
-- Decided by the developer on 2026-10-08: Find lists only postings from the player's own area
-- (a Reno player should not scroll past Sacramento), and a player may have at most 7 postings up
-- at a time.

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
-- 2. At most 7 postings per player.
-- ---------------------------------------------------------------------------
-- Enforced here because the app's own check is only as good as the groups list it has loaded,
-- and because groups can be inserted through the REST API without the app at all.
--
-- A posting counts against whoever created it for as long as the group exists: until it is
-- deleted, everyone leaves, or the stale-group cleanup removes it 12 hours after its start time.
-- Handing the host role to someone else does not free the slot.
--
-- Edge cases: SECURITY DEFINER, because a signed-in client has no DELETE on groups and the
-- function tidies up before it counts. It first removes the creator's own postings that have no
-- players and are more than a minute old - createGroup inserts the group and then seats the
-- host as a second request, and if that seat is refused (they already have a group that day)
-- the empty group used to be left behind with no way to delete it; here it would also have
-- silently used up one of their 7. A group that is seconds old is left alone, since its host
-- seat may still be on the way. Two posts by the same player at the same instant are taken one
-- at a time (an advisory lock keyed on the player), so both cannot slip under the limit. The
-- message is written for the player: the app shows it as it is. Inserts by the service role
-- (no signed-in creator to protect) are counted the same way.
create or replace function public.groups_enforce_posting_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_postings constant int := 7;  -- MAX_POSTINGS in src/utils/group-utils.ts
  existing int;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.created_by::text, 7));

  delete from public.groups g
   where g.created_by = new.created_by
     and g.created_at < now() - interval '1 minute'
     and not exists (select 1 from public.group_players gp where gp.group_id = g.id);

  select count(*) into existing from public.groups where created_by = new.created_by;
  if existing >= max_postings then
    raise exception 'You already have % postings up, which is the most allowed at once. Delete one, or wait for one to finish.', max_postings;
  end if;

  return new;
end;
$$;

revoke execute on function public.groups_enforce_posting_limit() from public, anon, authenticated;

drop trigger if exists groups_posting_limit_trg on public.groups;
create trigger groups_posting_limit_trg
  before insert on public.groups
  for each row execute function public.groups_enforce_posting_limit();
