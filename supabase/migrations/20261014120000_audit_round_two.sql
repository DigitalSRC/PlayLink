-- Second security audit, 2026-10-14. Needs 20261012140000 and 20261013120000 first.
--
-- What the second audit found, and what this does about each:
--   1. The wait before a game can be confirmed was only checked by the app. A host could set
--      `confirmed` through the API the moment they posted, and `submit_group_result` never
--      looked at `confirmed` at all - so a script could post a group, seat a second account,
--      and be paid for a round within a second. Now confirming needs the group to be 29
--      minutes old with two players seated, and a round can only be recorded for a confirmed
--      group. (GitHub #18.)
--   2. Privileges nobody uses. Supabase grants every privilege on a new table to the client
--      roles, and the earlier migrations took back only the ones that mattered at the time.
--      TRUNCATE and TRIGGER on the game tables and DELETE on profiles were left with signed-in
--      players. Row-level security and the API stood in the way of all three, so this is not a
--      hole today; it is one careless policy away from being one.
--   3. Two functions and one table that no migration in this repo creates but the live
--      database has (`rls_auto_enable`, `set_updated_at`, `game_stores`). They are tightened
--      here only if they exist, so this file also runs on a database without them.
--
-- Safe to run more than once. Works with or without the contest-window migrations: it adds
-- triggers and never touches submit_group_result.

-- ---------------------------------------------------------------------------
-- 1a. Confirming a game: 29 minutes after posting, with two players seated.
-- ---------------------------------------------------------------------------
-- Mirrors CONFIRM_LOCK_MS (30 minutes) and MIN_PLAYERS_OTHER (2) in src/app/group-detail.tsx.
-- The server allows it a minute sooner than the app does, so a phone whose clock runs a little
-- ahead of the server's is not refused by a rule the app has just said is met.
-- Edge cases: only the change from not confirmed to confirmed is checked, so editing a group
-- that is already confirmed, or un-confirming one, is never refused here; the age is measured
-- on the server's clock from created_at, which a client cannot set; the players are counted at
-- the moment of the update, so someone leaving afterwards does not un-confirm the game (a
-- round still needs two players - see group_results_guard_round). Raises with a message meant
-- for the player. Applies to every writer, the service role included.
create or replace function public.groups_guard_confirm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  min_age constant interval := interval '29 minutes';
  min_players constant int := 2;
begin
  if new.confirmed is not true or old.confirmed is true then
    return new;
  end if;

  if old.created_at is null or old.created_at > now() - min_age then
    raise exception 'A game can be confirmed 30 minutes after it is posted, so players have time to join.';
  end if;

  if (select count(*) from public.group_players where group_id = new.id) < min_players then
    raise exception 'A game needs at least % players before it can be confirmed.', min_players;
  end if;

  return new;
end;
$$;

revoke all on function public.groups_guard_confirm() from public, anon, authenticated;

drop trigger if exists groups_guard_confirm_trg on public.groups;
create trigger groups_guard_confirm_trg
  before update of confirmed on public.groups
  for each row execute function public.groups_guard_confirm();

-- ---------------------------------------------------------------------------
-- 1b. A round is recorded only for a confirmed game.
-- ---------------------------------------------------------------------------
-- A trigger on group_results, like group_results_guard_round, so it holds for whichever
-- version of submit_group_result is installed. It runs before that trigger (triggers fire in
-- name order), so a refused round logs nobody against their daily limit.
-- Edge cases: a group that no longer exists is refused too (the insert would fail on its
-- foreign key anyway); nothing is written or paid when this raises, because the whole of
-- submit_group_result is one transaction. Applies to every writer, the service role included.
create or replace function public.group_results_require_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.groups g where g.id = new.group_id and g.confirmed is true
  ) then
    raise exception 'Confirm the game before reporting a round.';
  end if;
  return new;
end;
$$;

revoke all on function public.group_results_require_confirmed() from public, anon, authenticated;

drop trigger if exists group_results_confirmed_trg on public.group_results;
create trigger group_results_confirmed_trg
  before insert on public.group_results
  for each row execute function public.group_results_require_confirmed();

-- ---------------------------------------------------------------------------
-- 2. Take back the privileges nobody uses.
-- ---------------------------------------------------------------------------
-- TRUNCATE is not held back by row-level security, and TRIGGER lets a role attach its own code
-- to a table. No client needs either on any table. Signed-out callers get nothing at all.
do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and c.relname in (
         'profiles', 'groups', 'group_players', 'group_results', 'local_events', 'event_areas',
         'shop_items', 'shop_purchases', 'starter_rewards', 'round_report_log',
         'edge_rate_limits', 'game_stores'
       )
  loop
    execute format('revoke truncate, trigger on public.%I from anon, authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- There is no way to delete a profile from the app, and no policy that would allow it.
revoke delete on public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Things the live database has that no migration here creates.
-- ---------------------------------------------------------------------------
do $$
begin
  -- game_stores belongs to the shelved store-events feature. Signed-in players may read it
  -- (its own policy says so); nobody but the service role writes it.
  if to_regclass('public.game_stores') is not null then
    revoke all on public.game_stores from anon, authenticated;
    grant select on public.game_stores to authenticated;
  end if;

  -- An event trigger's function. Nothing calls it by name.
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;

  -- The trigger function that stamps profiles.updated_at. It names nothing but now(), so an
  -- empty search_path changes nothing it does.
  if to_regprocedure('public.set_updated_at()') is not null then
    revoke all on function public.set_updated_at() from public, anon, authenticated;
    alter function public.set_updated_at() set search_path = '';
  end if;
end;
$$;
