-- Scheduled jobs for the contest window (20261012130000).
--
-- 1. Every minute, settle the rounds whose 15-minute window has ended: count the votes, score
--    the winning order, pay the players. A plain SQL call, like the stale-group cleanup - no
--    Edge Function is involved. If this job is ever late or stopped, nothing is lost: a round
--    stays pending until the next run, and any group member's app also asks for an overdue
--    round to be settled (settle_group_result_if_due).
select
  cron.schedule(
    'settle-group-results',
    '* * * * *',
    $$ select public.settle_due_group_results(); $$
  );

-- 2. The hourly stale-group cleanup (20260706130000) must not try to delete a group that has a
--    round still open for contest: the groups_guard_open_rounds trigger refuses that delete, and
--    because the cleanup is one statement, one refusal would cancel the whole hour's cleanup.
--    Such a group is simply left for the next run, by which time its round has been settled.
--    cron.schedule with an existing job name replaces that job.
select
  cron.schedule(
    'cleanup-stale-groups',
    '0 * * * *',
    $$
    delete from public.groups g
    where g.scheduled_at is not null
      and g.scheduled_at < now() - interval '12 hours'
      and not exists (
        select 1 from public.group_results r
        where r.group_id = g.id and r.status = 'pending' and r.dispute_window_ends_at > now()
      );
    $$
  );
