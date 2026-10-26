-- Security audit, 2026-10-12: close what a signed-in player could still do by calling the API
-- directly instead of using the app.
--
-- What was found, and what this migration does about each:
--   1. Unlimited points. submit_group_result accepted a round with one player in it and had no
--      limit on rounds, so a host could report themselves alone, round after round, and be paid
--      10 points and a win each time. Now a round needs two players, a group holds at most 10
--      rounds, and a player can be in at most 12 reported rounds in any 24 hours (section 1).
--   2. Forgeable group fields. profiles has had column-level grants since 20260930120000, but
--      groups and group_players still had table-level INSERT/UPDATE, so the policies limited
--      WHICH ROW a player could write and not which columns. A host could point their group at
--      any store event (for the bonus), rewrite rounds_played or created_by, and a joiner could
--      backdate joined_at to be first in line for the host role. Now each table grants only the
--      columns the app sends (section 2).
--   3. No limits on text. The username rule and every length limit lived only in the app. Now
--      the database refuses them too, and refuses a seat in a full group (sections 3 and 4).
--   4. is_group_member had no search_path and could be called signed out; the four oldest
--      tables still carried Supabase's default grants to anon (section 5).
--   5. The resolve-area Edge Function could be called without limit. It gets a counter it can
--      ask (section 6).
--
-- Everything here is written to work on a database with or without the contest-window
-- migrations (20261012130000): nothing re-creates submit_group_result, the round rules are a
-- trigger on group_results, which both versions insert into. Safe to run more than once.
--
-- Text rules are triggers that look only at the columns a statement actually changes, and not
-- CHECK constraints, on purpose: a constraint is re-checked on every update of a row, so one
-- old profile with a name the new rule dislikes would make paying that player fail - and with
-- it the whole round's payout for everyone else.

-- ---------------------------------------------------------------------------
-- 1. Rounds: at least two players, a cap per group, a cap per player per day.
-- ---------------------------------------------------------------------------
-- One row per player per reported round. Kept apart from group_results because those rows are
-- deleted with their group: without a record that outlives the group, deleting a posting and
-- posting it again would reset the count. Nothing reads it but the trigger below.
create table if not exists public.round_report_log (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles (id) on delete cascade,
  reported_at timestamptz not null default now()
);

create index if not exists round_report_log_player_idx
  on public.round_report_log (player_id, reported_at);

-- Default-deny: RLS on with no policy, and no grant. Only the trigger function (owner) uses it.
alter table public.round_report_log enable row level security;
revoke all on public.round_report_log from anon, authenticated;

-- Refuses a round that should not be paid, before it is recorded. Runs for every insert into
-- group_results, which only submit_group_result does.
-- Edge cases: raises (and so rolls the whole report back - nothing recorded, nobody paid) when
-- the round lists fewer than two players, when its number is above the group's cap, or when any
-- listed player has already been in 12 reported rounds in the last 24 hours, counted on the
-- server's clock. Each listed player is locked, in id order, before being counted, so two
-- groups reporting the same player at the same instant are counted one after the other and
-- cannot both slip under the limit, and cannot deadlock. A listed id that is not a real profile
-- is skipped here (submit_group_result has already refused it). Rows older than two days are
-- cleared for the players in this round as it goes, so the table stays small. A round the
-- players later vote down still counts: it was reported.
create or replace function public.group_results_guard_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  min_players constant int := 2;            -- MIN_ROUND_PLAYERS in src/utils/group-utils.ts
  max_rounds_per_group constant int := 10;  -- MAX_ROUNDS_PER_GROUP in src/utils/group-utils.ts
  max_rounds_per_day constant int := 12;
  pid uuid;
begin
  if new.placements is null or jsonb_typeof(new.placements) <> 'array'
     or jsonb_array_length(new.placements) < min_players then
    raise exception 'A round needs at least % players.', min_players;
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

drop trigger if exists group_results_guard_round_trg on public.group_results;
create trigger group_results_guard_round_trg
  before insert on public.group_results
  for each row execute function public.group_results_guard_round();

-- ---------------------------------------------------------------------------
-- 2. groups and group_players: only the columns the app sends.
-- ---------------------------------------------------------------------------
-- A table-level grant covers every column and a column-level revoke does not subtract from it,
-- so the table-level grants go and the allowed columns are granted by name (the same shape as
-- profiles in 20260930120000). The row rules are unchanged: groups_insert_self_host,
-- groups_update_host, and group_players_insert_self still decide which rows.
--
-- Not grantable on insert: id, created_at, rounds_played, confirmed. Not updatable at all:
-- created_by, join_code, rounds_played, area, game_type, format, no_go, local_event_id - the
-- app never changes them after posting, and local_event_id is what the store-event bonus hangs
-- on. scheduled_at and play_date stay updatable: moving a group to another day is what
-- 20261008120000's seat-moving trigger was built for, and both the per-day rule and the
-- play-date check still apply to the move. `confirmed` stays updatable by the host: the app
-- sets it directly, and the 30-minute wait before confirming is still only checked by the app.
revoke insert, update on public.groups from anon, authenticated;

grant insert (name, join_code, created_by, scheduled_at, play_date, area, target_players,
              brackets, location, time, game_type, format, no_go, local_event_id)
  on public.groups to authenticated;

grant update (name, location, time, target_players, brackets, confirmed, scheduled_at, play_date)
  on public.groups to authenticated;

-- A seat: which group, whose, what role, which bracket. Not joined_at - leave_group hands the
-- host role to the longest-standing player, so a seat that could name its own joined_at could
-- put itself first in line - and not session_date, which a trigger sets.
revoke insert on public.group_players from anon, authenticated;

grant insert (group_id, player_id, role, bracket)
  on public.group_players to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Taking a seat: a real role, a real bracket, and room in the group.
-- ---------------------------------------------------------------------------
-- Until now a full group was only refused by the app, which goes by the roster it last loaded.
-- Edge cases: raises when the role is not one the app uses, the bracket is not 1 to 5, or the
-- group already has as many players as it asked for. The group row is locked first, so two
-- players taking the last seat at the same instant are handled one after the other and only
-- one gets it. A seat in a group that does not exist is left for the foreign key to refuse.
-- SECURITY DEFINER because locking the group row needs more than a joining player is granted.
-- Named to sort before group_players_guard_host_seat_trg, so the group row is locked before
-- any hosting-slot lock - the same order leave_group takes them in.
create or replace function public.group_players_check_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted int;
begin
  if new.role is null or new.role not in ('Host', 'Member', 'Player') then
    raise exception 'That is not a role a player can have.';
  end if;
  if new.bracket is null or new.bracket not between 1 and 5 then
    raise exception 'A bracket is a number from 1 to 5.';
  end if;

  select target_players into wanted from public.groups where id = new.group_id for update;
  if not found then
    return new;
  end if;

  if (select count(*) from public.group_players where group_id = new.group_id) >= wanted then
    raise exception 'This group is full.';
  end if;

  return new;
end;
$$;

revoke execute on function public.group_players_check_seat() from public, anon, authenticated;

drop trigger if exists group_players_check_seat_trg on public.group_players;
create trigger group_players_check_seat_trg
  before insert on public.group_players
  for each row execute function public.group_players_check_seat();

-- ---------------------------------------------------------------------------
-- 4. Limits on what a player can type.
-- ---------------------------------------------------------------------------
-- The same rules the app applies (USERNAME_RE and the fields' maxLength), so the app never
-- trips them; they exist for a request that did not come from the app.
-- Edge cases: on an update only the columns whose value actually changes are checked, so a row
-- that predates a rule can still be updated in every other way (being paid for a round, a
-- rival refresh) and only has to comply when that field itself is next edited. Raises with a
-- message meant for the player. Applies to every writer, the service role included.
create or replace function public.profiles_guard_input()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_insert constant boolean := (tg_op = 'INSERT');
  chk_username boolean := true;
  chk_display boolean := true;
  chk_location boolean := true;
  chk_lists boolean := true;
begin
  if not is_insert then
    chk_username := new.username is distinct from old.username;
    chk_display := new.display_name is distinct from old.display_name;
    chk_location := new.location is distinct from old.location;
    chk_lists := new.games is distinct from old.games
              or new.brackets is distinct from old.brackets
              or new.no_go is distinct from old.no_go
              or new.rival_ids is distinct from old.rival_ids
              or new.preferred_formats is distinct from old.preferred_formats;
  end if;

  if chk_username and (new.username is null or new.username !~ '^[A-Za-z0-9_]{1,20}$') then
    raise exception 'A username is 1 to 20 letters, numbers, or underscores.';
  end if;
  if chk_display and new.display_name is not null and char_length(new.display_name) > 32 then
    raise exception 'A display name can be at most 32 characters.';
  end if;
  if chk_location and char_length(coalesce(new.location, '')) > 100 then
    raise exception 'A location can be at most 100 characters.';
  end if;
  if chk_lists and (
       coalesce(cardinality(new.games), 0) > 10
    or coalesce(cardinality(new.brackets), 0) > 10
    or coalesce(cardinality(new.no_go), 0) > 30
    or coalesce(cardinality(new.rival_ids), 0) > 10
    or char_length(coalesce(new.preferred_formats::text, '')) > 2000
    or exists (select 1 from unnest(new.games) g where char_length(g) > 20)
    or exists (select 1 from unnest(new.no_go) n where char_length(n) > 60)
  ) then
    raise exception 'That profile has more in it than a profile can hold.';
  end if;

  return new;
end;
$$;

revoke execute on function public.profiles_guard_input() from public, anon, authenticated;

drop trigger if exists profiles_guard_input_trg on public.profiles;
create trigger profiles_guard_input_trg
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_input();

-- The same for a posting. The limits are generous on purpose - a store event's venue and
-- address go into `location` - and exist to stop a megabyte of text reaching every player's
-- Find tab, not to police wording.
-- Edge cases: as profiles_guard_input - on an update only changed columns are checked.
create or replace function public.groups_guard_input()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_insert constant boolean := (tg_op = 'INSERT');
  chk_text boolean := true;
  chk_target boolean := true;
  chk_lists boolean := true;
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
  if chk_target and (new.target_players is null or new.target_players not between 2 and 50) then
    raise exception 'A group needs between 2 and 50 players.';
  end if;
  if chk_lists and (
       coalesce(cardinality(new.brackets), 0) > 10
    or coalesce(cardinality(new.no_go), 0) > 30
    or exists (select 1 from unnest(new.no_go) n where char_length(n) > 60)
  ) then
    raise exception 'That posting has more in it than a posting can hold.';
  end if;

  return new;
end;
$$;

revoke execute on function public.groups_guard_input() from public, anon, authenticated;

drop trigger if exists groups_guard_input_trg on public.groups;
create trigger groups_guard_input_trg
  before insert or update on public.groups
  for each row execute function public.groups_guard_input();

-- ---------------------------------------------------------------------------
-- 5. Loose ends from the first migrations.
-- ---------------------------------------------------------------------------
-- The one SECURITY DEFINER function without a pinned search_path (its body is already fully
-- qualified), and the only one a signed-out caller could run: it answered "is this player in
-- this group?" for anyone. `authenticated` keeps EXECUTE - the RLS policies on group_results
-- and group_result_ballots call it as the player doing the reading.
alter function public.is_group_member(uuid, uuid) set search_path = '';
revoke execute on function public.is_group_member(uuid, uuid) from public, anon;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;

-- A signed-out caller already read nothing from these (every policy requires a signed-in
-- player), but that was the policies alone. Take the grants away as well, as the newer tables
-- do, so a mistake in a future policy cannot open them.
revoke all on public.profiles from anon;
revoke all on public.groups from anon;
revoke all on public.group_players from anon;
revoke all on public.group_results from anon;

-- ---------------------------------------------------------------------------
-- 6. A counter the Edge Functions can ask before doing something costly.
-- ---------------------------------------------------------------------------
create table if not exists public.edge_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (bucket ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  window_start timestamptz not null default now(),
  hits integer not null default 1,
  primary key (user_id, bucket)
);

alter table public.edge_rate_limits enable row level security;
revoke all on public.edge_rate_limits from anon, authenticated;

-- Counts one use of `p_bucket` by `p_user` and says whether it is still within `p_max` uses
-- per `p_window`. A fixed window: the count starts again once the window has passed.
-- Parameters: p_user (the signed-in caller), p_bucket (what is being limited, e.g.
-- 'resolve-area'), p_max (uses allowed per window), p_window (how long a window lasts).
-- Returns: true if this use is allowed, false if the caller is over the limit.
-- Edge cases: returns false, never an error, for a null user, a blank bucket, or a limit below
-- one, so a caller that forgets a value is refused and not waved through. The count is one
-- statement, so two requests at the same instant are both counted. A refused use still counts,
-- which keeps a caller who hammers the endpoint locked out until they stop. Callable only by
-- the service role (the Edge Functions).
create or replace function public.take_rate_limit(
  p_user uuid,
  p_bucket text,
  p_max integer,
  p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if p_user is null or coalesce(btrim(p_bucket), '') = '' or p_max is null or p_max < 1
     or p_window is null then
    return false;
  end if;

  insert into public.edge_rate_limits as r (user_id, bucket)
  values (p_user, p_bucket)
  on conflict (user_id, bucket) do update set
    hits = case when r.window_start <= now() - p_window then 1 else r.hits + 1 end,
    window_start = case when r.window_start <= now() - p_window then now() else r.window_start end
  returning r.hits into n;

  return n <= p_max;
end;
$$;

revoke execute on function public.take_rate_limit(uuid, text, integer, interval) from public, anon, authenticated;
grant execute on function public.take_rate_limit(uuid, text, integer, interval) to service_role;
