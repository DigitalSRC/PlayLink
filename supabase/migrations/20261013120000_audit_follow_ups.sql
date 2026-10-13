-- Security audit follow-ups, 2026-10-13. Needs 20261012140000 (it replaces two of that
-- migration's trigger functions and nothing else).
--
-- What the audit still found after 20261012140000, and what this does about each:
--   1. Point farming with throwaway accounts. The winner's points grow with the table
--      (10 * (players - 1) + 10), a group could ask for up to 50 players, and accounts are free
--      to make, so 50 of them paid one winner 500 points a round. A real Commander pod is 4.
--      Now a group asks for 2 to 8 players, and a round with more than 8 in it is refused
--      whatever the group says (a group posted before this limit keeps its old size).
--   2. Postings with no day, or a day years away. Nothing checked scheduled_at, the hourly
--      cleanup only removes groups whose day has passed, and a group with no day escapes the
--      one-group-per-day rule - so each account could leave 7 postings in everyone's Find tab
--      for good. Now a posting needs a day, no more than a day in the past and no more than 90
--      days ahead.
--
-- Safe to run more than once. Works with or without the contest-window migrations: like
-- 20261012140000 it only replaces trigger functions and never touches submit_group_result.

-- ---------------------------------------------------------------------------
-- 1. A posting: a table of 2 to 8, and a real day.
-- ---------------------------------------------------------------------------
-- Replaces the function from 20261012140000; the trigger that calls it is unchanged.
-- Edge cases: on an update only the columns whose value actually changes are checked, so a
-- posting that predates a rule (a table of 20, no day) can still be edited in every other way
-- and only has to comply when that field itself is next changed. The day is checked against
-- the server's clock. "A day in the past" is allowed because the app lets a host post for
-- earlier today, and their today can be the server's yesterday. Raises with a message meant
-- for the player. Applies to every writer, the service role included.
create or replace function public.groups_guard_input()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_insert constant boolean := (tg_op = 'INSERT');
  min_players constant int := 2;   -- MIN_GROUP_PLAYERS in src/utils/group-utils.ts
  max_players constant int := 8;   -- MAX_GROUP_PLAYERS in src/utils/group-utils.ts
  max_days_ahead constant int := 90;
  chk_text boolean := true;
  chk_target boolean := true;
  chk_lists boolean := true;
  chk_day boolean := true;
begin
  if not is_insert then
    chk_text := new.name is distinct from old.name
             or new.location is distinct from old.location
             or new.time is distinct from old.time
             or new.format is distinct from old.format
             or new.game_type is distinct from old.game_type
             or new.join_code is distinct from old.join_code;
    chk_target := new.target_players is distinct from old.target_players;
    chk_lists := new.brackets is distinct from old.brackets
              or new.no_go is distinct from old.no_go;
    chk_day := new.scheduled_at is distinct from old.scheduled_at;
  end if;

  if chk_text and (
       char_length(coalesce(new.name, '')) > 80
    or char_length(coalesce(new.location, '')) > 200
    or char_length(coalesce(new.time, '')) > 60
    or char_length(coalesce(new.format, '')) > 40
    or char_length(coalesce(new.game_type, '')) > 20
    or char_length(coalesce(new.join_code, '')) > 16
  ) then
    raise exception 'That is too long. A group name can be 80 characters and a location 200.';
  end if;
  if chk_target and (new.target_players is null
                     or new.target_players not between min_players and max_players) then
    raise exception 'A group needs between % and % players.', min_players, max_players;
  end if;
  if chk_lists and (
       coalesce(cardinality(new.brackets), 0) > 10
    or coalesce(cardinality(new.no_go), 0) > 30
    or exists (select 1 from unnest(new.no_go) n where char_length(n) > 60)
  ) then
    raise exception 'That posting has more in it than a posting can hold.';
  end if;
  if chk_day and (new.scheduled_at is null
                  or new.scheduled_at < now() - interval '1 day'
                  or new.scheduled_at > now() + make_interval(days => max_days_ahead)) then
    raise exception 'Pick a day for the game within the next % days.', max_days_ahead;
  end if;

  return new;
end;
$$;

revoke execute on function public.groups_guard_input() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A round: at most 8 players.
-- ---------------------------------------------------------------------------
-- Replaces the function from 20261012140000; the trigger that calls it is unchanged. The only
-- change is the upper limit on the players in one round.
-- Edge cases: as before - raises (and so rolls the whole report back: nothing recorded, nobody
-- paid) when the round lists fewer than two players, when its number is above the group's cap,
-- or when any listed player has already been in 12 reported rounds in the last 24 hours - and
-- now also when it lists more than 8 placements. The count is of placements as sent, so the
-- same player listed twice counts twice (submit_group_result refuses that anyway). Each listed
-- player is locked, in id order, before being counted, so two groups reporting the same player
-- at the same instant cannot both slip under the daily limit and cannot deadlock.
create or replace function public.group_results_guard_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  min_players constant int := 2;            -- MIN_ROUND_PLAYERS in src/utils/group-utils.ts
  max_players constant int := 8;            -- MAX_GROUP_PLAYERS in src/utils/group-utils.ts
  max_rounds_per_group constant int := 10;  -- MAX_ROUNDS_PER_GROUP in src/utils/group-utils.ts
  max_rounds_per_day constant int := 12;
  pid uuid;
begin
  if new.placements is null or jsonb_typeof(new.placements) <> 'array'
     or jsonb_array_length(new.placements) < min_players then
    raise exception 'A round needs at least % players.', min_players;
  end if;

  if jsonb_array_length(new.placements) > max_players then
    raise exception 'A round can have at most % players.', max_players;
  end if;

  if new.round_number > max_rounds_per_group then
    raise exception 'This group has reported % rounds, which is the most allowed. Post a new group to keep playing.', max_rounds_per_group;
  end if;

  for pid in
    select distinct (e->>'playerId')::uuid
      from jsonb_array_elements(new.placements) e
     where coalesce(e->>'playerId', '') ~ '^[0-9a-fA-F-]{36}$'
     order by 1
  loop
    if not exists (select 1 from public.profiles p where p.id = pid) then
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(pid::text, 11));

    delete from public.round_report_log
     where player_id = pid and reported_at < now() - interval '2 days';

    if (select count(*) from public.round_report_log
         where player_id = pid and reported_at > now() - interval '24 hours') >= max_rounds_per_day then
      raise exception 'A player in this round has already played % rounds in the last day, which is the most allowed. Try again tomorrow.', max_rounds_per_day;
    end if;

    insert into public.round_report_log (player_id) values (pid);
  end loop;

  return new;
end;
$$;

revoke execute on function public.group_results_guard_round() from public, anon, authenticated;
