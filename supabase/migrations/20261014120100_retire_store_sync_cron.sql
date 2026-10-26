-- Second security audit, 2026-10-14: stop the store-sync job.
--
-- The shelved store-events feature left a scheduled job on the live database
-- (`sync-store-events-every-3h`) that calls an Edge Function every 3 hours with the service
-- role's key. Neither the job nor the function is part of this branch, so neither was covered
-- by the audit hardening (the function compares its secret with a plain `!==` and fetches
-- whatever address a `game_stores` row holds). `game_stores` is empty, so the job does nothing
-- useful today. If store-events comes back, it brings its own schedule with it.
--
-- Safe to run more than once, and on a database that never had the job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-store-events-every-3h') then
    perform cron.unschedule('sync-store-events-every-3h');
  end if;
end;
$$;
