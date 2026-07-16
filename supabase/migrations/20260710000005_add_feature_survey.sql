-- Adds the hero opt-in's optional "what would you want from this app" survey
-- (a feature-interest checklist + a website-vs-mobile-app preference), and a
-- resubmit path: a person who signs up twice with the same email should be
-- able to actually save the extra details a second visit brings (survey
-- answers, or city/games/feedback from the bottom form) instead of just
-- getting rejected with "already on the list."
--
-- That resubmit path needs the anon key to update an existing row by email
-- match. Rather than opening a standing anon UPDATE policy on the table, this
-- follows the same pattern already used for alpha_signup_count(): one
-- SECURITY DEFINER function is the only way in, so every write is funneled
-- through and auditable in one place. It never touches email, created_at, or
-- utm_* on the update path, so first-touch attribution is preserved.

alter table public.alpha_signups
  add column if not exists feature_interests text[],
  add column if not exists platform_preference text;

create or replace function public.alpha_signup_upsert(
  p_email text,
  p_location text default null,
  p_lat double precision default null,
  p_lon double precision default null,
  p_games text[] default null,
  p_feedback text default null,
  p_feature_interests text[] default null,
  p_platform_preference text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  was_existing boolean;
begin
  select exists(select 1 from public.alpha_signups where email = p_email) into was_existing;

  insert into public.alpha_signups as a
    (email, location, lat, lon, games, feedback, feature_interests, platform_preference,
     utm_source, utm_medium, utm_campaign)
  values
    (p_email, p_location, p_lat, p_lon, p_games, p_feedback, p_feature_interests, p_platform_preference,
     p_utm_source, p_utm_medium, p_utm_campaign)
  on conflict (email) do update set
    location = coalesce(excluded.location, a.location),
    lat = coalesce(excluded.lat, a.lat),
    lon = coalesce(excluded.lon, a.lon),
    games = coalesce(excluded.games, a.games),
    feedback = coalesce(excluded.feedback, a.feedback),
    feature_interests = coalesce(excluded.feature_interests, a.feature_interests),
    platform_preference = coalesce(excluded.platform_preference, a.platform_preference);

  return case when was_existing then 'updated' else 'inserted' end;
end;
$$;

revoke all on function public.alpha_signup_upsert(
  text, text, double precision, double precision, text[], text, text[], text, text, text, text
) from public;
grant execute on function public.alpha_signup_upsert(
  text, text, double precision, double precision, text[], text, text[], text, text, text, text
) to anon;
