-- Rival matching and per-game leaderboards need: a draw counter (wins/losses already exist),
-- a place to store each user's daily-refreshed rival matches, and bookkeeping timestamps so the
-- scheduled refresh/reset jobs (see the refresh-rivals Edge Function + pg_cron schedule) can
-- tell whether they've already run for the current day/month without re-deriving it from scratch.
alter table public.profiles
  add column draws integer not null default 0,
  add column rival_ids uuid[] not null default '{}',
  add column last_rival_refresh timestamptz,
  add column monthly_reset_at timestamptz;

-- Rival matching and leaderboards must read every profile, not just the caller's own row.
-- profiles carries no sensitive data beyond gameplay stats/username/location (free-text,
-- user-entered, not precise geolocation), so a broad authenticated-read policy is an acceptable
-- trade for making matchmaking work. Insert/update/delete stay locked to auth.uid() = id via the
-- policies below, which are unaffected by this change.
drop policy if exists "profiles_select_own" on public.profiles;

create policy "profiles_select_authenticated"
  on public.profiles for select
  using (auth.role() = 'authenticated');
