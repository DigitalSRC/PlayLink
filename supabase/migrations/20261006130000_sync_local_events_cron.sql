-- Schedules the sync-local-events Edge Function (supabase/functions/sync-local-events) to run
-- every 6 hours. Stores post their Commander nights to the Wizards locator days or weeks ahead,
-- so four runs a day keeps the Calendar tab current (and picks up a same-day cancellation within
-- hours) without hammering a service we don't own.
--
-- pg_cron/pg_net are already enabled by 20260705130000_rival_refresh_cron.sql. This job reuses
-- that migration's vault secret ('cron_secret'), which the function checks against the same
-- CRON_SECRET function secret refresh-rivals uses - so there is nothing new to set up, and no
-- secret value appears in this file.
select
  cron.schedule(
    'sync-local-events-every-6h',
    '15 */6 * * *',
    $$
    select net.http_post(
      url := 'https://vuleighklamwupryxyjj.supabase.co/functions/v1/sync-local-events',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb
    );
    $$
  );
