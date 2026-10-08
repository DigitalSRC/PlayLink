-- One group per player per day, by the day the host actually picked.
--
-- Two things were out of step (GitHub issue #10):
--   1. The migrations on the feature branches still carried 20260706120000's rule - one group per
--      player, ever - while the live database had already been loosened to one group per day by
--      a migration from the shelved calendar-system work that no current branch contains.
--   2. That per-day rule buckets a group by the UTC date of scheduled_at. For a player in the
--      western US, 7:00 PM on Friday and 1:00 PM on Saturday are the same UTC date, so the second
--      was refused, while 1:00 PM and 7:00 PM on the same Saturday are different UTC dates and
--      were both allowed.
--
-- This migration makes every database end up in the same place whichever of those it started
-- from, and adds groups.play_date: the calendar day the host chose, as they saw it on their own
-- phone. The per-day rule now uses that day. It is written to be safe to run more than once.
--
-- Decided by the developer on 2026-10-08: a player may be in one group per day, and may have a
-- group on every day if they want.

-- ---------------------------------------------------------------------------
-- 1. groups.play_date
-- ---------------------------------------------------------------------------
alter table public.groups add column if not exists play_date date;

-- Groups posted before this column existed keep the day they were already bucketed under.
update public.groups
   set play_date = (scheduled_at at time zone 'utc')::date
 where play_date is null and scheduled_at is not null;

-- The client sends play_date, so it is not trusted to be anything: it must sit within a day of
-- the scheduled time. Every real time zone puts a local date within one day of the UTC date, so
-- this never refuses an honest value, and it stops a far-off date being used to dodge the rule.
alter table public.groups drop constraint if exists groups_play_date_near_schedule;
alter table public.groups
  add constraint groups_play_date_near_schedule check (
    play_date is null or scheduled_at is null
    or abs(play_date - (scheduled_at at time zone 'utc')::date) <= 1
  );

-- ---------------------------------------------------------------------------
-- 2. group_players.session_date mirrors the group's day.
-- ---------------------------------------------------------------------------
drop index if exists public.group_players_one_group_per_player;
alter table public.group_players add column if not exists session_date date;

-- Stamps a new seat with its group's day. A unique index can't look at another table, so the
-- day is copied onto the seat and kept in step by the trigger below.
-- Edge cases: a group with neither play_date nor scheduled_at gives NULL, which the unique index
-- treats as never colliding - the app cannot create such a group, and the stale-group cleanup
-- never removes one, so they are left unrestricted rather than guessed at. A client cannot set
-- session_date itself: this trigger overwrites whatever an insert supplies.
create or replace function public.group_players_set_session_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select coalesce(g.play_date, (g.scheduled_at at time zone 'utc')::date)
    into new.session_date
    from public.groups g
   where g.id = new.group_id;
  return new;
end;
$$;

drop trigger if exists group_players_session_date_trg on public.group_players;
create trigger group_players_session_date_trg
  before insert or update of group_id on public.group_players
  for each row execute function public.group_players_set_session_date();

-- Moves every seat when a group's day changes. SECURITY DEFINER because a signed-in client has
-- had no UPDATE on group_players since 20261006140000: without it, a host changing their own
-- group's day would be refused by a table they are not meant to write to directly.
-- Edge cases: if the new day collides with another group one of the members is already in, the
-- unique index refuses and the whole change is rolled back, so a host cannot double-book a
-- member by rescheduling. Does nothing when neither day column changed.
create or replace function public.groups_propagate_session_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.play_date is distinct from old.play_date
     or new.scheduled_at is distinct from old.scheduled_at then
    update public.group_players
       set session_date = coalesce(new.play_date, (new.scheduled_at at time zone 'utc')::date)
     where group_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.groups_propagate_session_date() from public, anon, authenticated;

drop trigger if exists groups_session_date_propagate_trg on public.groups;
create trigger groups_session_date_propagate_trg
  after update of scheduled_at, play_date on public.groups
  for each row execute function public.groups_propagate_session_date();

-- Bring existing seats in line before the rule is (re)built on them.
update public.group_players gp
   set session_date = coalesce(g.play_date, (g.scheduled_at at time zone 'utc')::date)
  from public.groups g
 where g.id = gp.group_id
   and gp.session_date is distinct from coalesce(g.play_date, (g.scheduled_at at time zone 'utc')::date);

-- ---------------------------------------------------------------------------
-- 3. The rule itself.
-- ---------------------------------------------------------------------------
create unique index if not exists group_players_one_per_day
  on public.group_players (player_id, session_date);
