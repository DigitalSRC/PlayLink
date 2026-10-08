-- Failsafe: a group whose scheduled meeting time has passed by more than 12 hours is almost
-- certainly abandoned (the session either happened and was never cleaned up, or never happened
-- at all) and just clutters Browse for everyone else. Runs hourly; a plain SQL delete is enough
-- here (no Edge Function needed, unlike refresh-rivals) since there's no application logic
-- beyond the time comparison itself. Groups with no scheduled_at are never touched by this rule.
select
  cron.schedule(
    'cleanup-stale-groups',
    '0 * * * *',
    $$
    delete from public.groups
    where scheduled_at is not null
      and scheduled_at < now() - interval '12 hours';
    $$
  );
