-- Starter rewards: a new player earns 25 points, once each, for the four things that show them
-- around - posting a game, joining someone else's, looking through the calendar, and picking a
-- rival.
--
-- Same rule as every other point in the app (20260930120000): a client cannot write points. It
-- asks, and a SECURITY DEFINER function decides. The amount is fixed here, never sent by the
-- client, and each reward can be paid to a player at most once because the claim itself is a
-- row with a primary key.
--
-- What the server can and cannot verify, stated plainly:
--   create_group, join_group - verified. The caller must hold a seat in a group they created,
--                              or in one somebody else created.
--   choose_rival             - partly. The caller must actually have rivals to choose from. Which
--                              one they picked is remembered on their phone, not on the server.
--   view_calendar            - not at all. Opening a screen leaves nothing to check.
-- So a player who calls this function directly can collect the last two without doing them. The
-- most that gets anyone is 50 points, once per account, which is why these are small.

create table if not exists public.starter_rewards (
  player_id uuid not null references public.profiles (id) on delete cascade,
  reward_key text not null
    check (reward_key in ('create_group', 'join_group', 'view_calendar', 'choose_rival')),
  points integer not null check (points >= 0),
  awarded_at timestamptz not null default now(),
  primary key (player_id, reward_key)
);

alter table public.starter_rewards enable row level security;

-- Read-only for clients, and only their own rows. Rows are written by the function below.
revoke all on public.starter_rewards from anon, authenticated;
grant select on public.starter_rewards to authenticated;

drop policy if exists "starter_rewards_select_own" on public.starter_rewards;
create policy "starter_rewards_select_own"
  on public.starter_rewards for select
  to authenticated
  using (auth.uid() = player_id);

-- Claims one starter reward for the caller. Returns the points paid by this call: 25 the first
-- time, 0 if they already had it.
-- Edge cases: raises if unauthenticated, the key isn't one of the four, the caller has no
-- profile, or the thing the reward is for hasn't happened (no group posted, no group joined, no
-- rivals to choose from). Claiming a reward already held pays nothing and returns 0, so a double
-- tap, a retry after a dropped response, or the app asking again on every launch is harmless.
-- The caller's profile row is locked first, so two claims at the same instant are handled one
-- after the other; the claim row is inserted before the points are added and both are in one
-- transaction, so a reward is never recorded without being paid or paid without being recorded.
-- Points, Score, and All-Time move together, as they do for a round.
create or replace function public.claim_starter_reward(p_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reward constant int := 25;  -- STARTER_REWARD_POINTS in src/data/rewards.ts (display only)
  caller uuid := auth.uid();
  me public.profiles;
  claimed int;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;
  if p_key is null or p_key not in ('create_group', 'join_group', 'view_calendar', 'choose_rival') then
    raise exception 'No such reward';
  end if;

  select * into me from public.profiles where id = caller for update;
  if not found then
    raise exception 'No profile';
  end if;

  if p_key = 'create_group' and not exists (
    select 1
      from public.group_players gp
      join public.groups g on g.id = gp.group_id
     where gp.player_id = caller and g.created_by = caller
  ) then
    raise exception 'Post a group first';
  end if;

  if p_key = 'join_group' and not exists (
    select 1
      from public.group_players gp
      join public.groups g on g.id = gp.group_id
     where gp.player_id = caller and g.created_by <> caller
  ) then
    raise exception 'Join a group first';
  end if;

  if p_key = 'choose_rival' and cardinality(me.rival_ids) = 0 then
    raise exception 'No rivals to choose from yet';
  end if;

  insert into public.starter_rewards (player_id, reward_key, points)
  values (caller, p_key, reward)
  on conflict (player_id, reward_key) do nothing;
  get diagnostics claimed = row_count;
  if claimed = 0 then
    return 0;  -- already claimed; nothing more to pay
  end if;

  update public.profiles
     set points = points + reward,
         monthly_points = monthly_points + reward,
         point_balance = point_balance + reward
   where id = caller;

  return reward;
end;
$$;

revoke execute on function public.claim_starter_reward(text) from public, anon;
grant execute on function public.claim_starter_reward(text) to authenticated;
