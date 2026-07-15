-- Schedules the sync-store-events Edge Function (supabase/functions/sync-store-events) to run
-- every 3 hours. Store calendars change far less often than the app's own read traffic, but
-- often enough that a newly-posted store event shows up the same day rather than the next one.
-- pg_cron/pg_net are already enabled by 20260705130000_rival_refresh_cron.sql, so this migration
-- doesn't need to re-create those extensions.

-- A separate vault secret from refresh-rivals's 'cron_secret' - rotating one doesn't force
-- redeploying both functions. Not set here for the same reason as the rivals cron migration:
-- committing a secret value into a migration file would leak it into git history.
--   select vault.create_secret('<same value passed to `supabase secrets set STORE_SYNC_CRON_SECRET=...`>', 'cron_secret_store_sync');
select
  cron.schedule(
    'sync-store-events-every-3h',
    '0 */3 * * *',
    $$
    select net.http_post(
      url := 'https://vuleighklamwupryxyjj.supabase.co/functions/v1/sync-store-events',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_store_sync')
      ),
      body := '{}'::jsonb
    );
    $$
  );
