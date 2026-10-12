-- Security audit, 2026-10-12: alpha_signup_upsert let anyone overwrite anyone's signup.
--
-- The function is callable signed out (it has to be - it is the landing page's form), and on a
-- repeat email it replaced whatever the row already held with whatever was sent. So anyone who
-- knew or guessed an email on the list could rewrite that person's city, coordinates, games,
-- and feedback. It also accepted text of any length, and the table still had a policy letting a
-- signed-out caller insert rows directly, around the function and any limit in it.
--
-- Now:
--   * A repeat email only FILLS IN what is still empty. Nothing already saved is replaced. The
--     page's own flow still works: the hero form saves the email, the form below it adds the
--     city and games to the same row.
--   * Every field has a limit, and the email must look like one.
--   * The direct insert policy is gone, so the function is the only way in.
--
-- What this does not change: the function still answers 'inserted' or 'updated', because the
-- page uses that to say "already on the list - add your city below". That means a caller can
-- learn whether an email is on the waitlist. Accepted for now; closing it means the page can no
-- longer tell a returning visitor apart, or giving each signup a private token to present.
-- Likewise, the still-empty fields of someone else's row can be filled in by a stranger.
--
-- Safe to run more than once.

drop policy if exists "Allow public insert" on public.alpha_signups;
revoke all on public.alpha_signups from anon, authenticated;

-- Edge cases: raises (the page shows "Something went wrong") for a missing or malformed email
-- or any field over its limit, and saves nothing. Blank strings are stored as null, so a later
-- visit can still fill them in. On a repeat email, first-touch utm_* values, the email, and
-- created_at are never touched, as before.
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
  v_email text := btrim(coalesce(p_email, ''));
begin
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if char_length(coalesce(p_location, '')) > 120
     or char_length(coalesce(p_feedback, '')) > 1000
     or char_length(coalesce(p_platform_preference, '')) > 40
     or char_length(coalesce(p_utm_source, '')) > 100
     or char_length(coalesce(p_utm_medium, '')) > 100
     or char_length(coalesce(p_utm_campaign, '')) > 100
     or coalesce(cardinality(p_games), 0) > 12
     or coalesce(cardinality(p_feature_interests), 0) > 24
     or exists (select 1 from unnest(p_games) g where char_length(g) > 40)
     or exists (select 1 from unnest(p_feature_interests) f where char_length(f) > 80)
     or (p_lat is not null and p_lat not between -90 and 90)
     or (p_lon is not null and p_lon not between -180 and 180) then
    raise exception 'That is more than this form accepts.';
  end if;

  select exists(select 1 from public.alpha_signups where email = v_email) into was_existing;

  insert into public.alpha_signups as a
    (email, location, lat, lon, games, feedback, feature_interests, platform_preference,
     utm_source, utm_medium, utm_campaign)
  values
    (v_email, nullif(btrim(p_location), ''), p_lat, p_lon, p_games, nullif(btrim(p_feedback), ''),
     p_feature_interests, nullif(btrim(p_platform_preference), ''),
     p_utm_source, p_utm_medium, p_utm_campaign)
  on conflict (email) do update set
    location = coalesce(a.location, excluded.location),
    lat = coalesce(a.lat, excluded.lat),
    lon = coalesce(a.lon, excluded.lon),
    games = coalesce(a.games, excluded.games),
    feedback = coalesce(a.feedback, excluded.feedback),
    feature_interests = coalesce(a.feature_interests, excluded.feature_interests),
    platform_preference = coalesce(a.platform_preference, excluded.platform_preference);

  return case when was_existing then 'updated' else 'inserted' end;
end;
$$;

revoke all on function public.alpha_signup_upsert(
  text, text, double precision, double precision, text[], text, text[], text, text, text, text
) from public;
grant execute on function public.alpha_signup_upsert(
  text, text, double precision, double precision, text[], text, text[], text, text, text, text
) to anon;
