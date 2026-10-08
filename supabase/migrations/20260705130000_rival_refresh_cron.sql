-- Schedules the refresh-rivals Edge Function (supabase/functions/refresh-rivals) to run once a
-- day at 19:00 UTC, which is 11am Pacific Standard Time. pg_cron schedules run in UTC and don't
-- track US daylight saving, so during Pacific Daylight Time this actually fires at noon; the
-- function itself determines the monthly-reset boundary using real IANA timezone data, so only
-- the exact time-of-day the refresh happens drifts by an hour part of the year, not correctness.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- The shared secret the function checks (see its x-cron-secret header check) is intentionally
-- NOT set here — committing a secret value into a migration file would leak it into git history.
-- Store it once, out of band, via the SQL editor or psql:
--   select vault.create_secret('<same value passed to `supabase secrets set CRON_SECRET=...`>', 'cron_secret');
-- and rotate it there directly if it ever needs to change; this migration only references it by name.
select
  cron.schedule(
    'refresh-rivals-daily',
    '0 19 * * *',
    $$
    select net.http_post(
      url := 'https://vuleighklamwupryxyjj.supabase.co/functions/v1/refresh-rivals',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb
    );
    $$
  );
