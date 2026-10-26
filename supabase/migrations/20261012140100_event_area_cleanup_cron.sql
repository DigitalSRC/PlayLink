-- Removes event areas nobody uses any more, once a day.
--
-- The resolve-area Edge Function stops creating areas at a fixed ceiling (MAX_AREAS), and until
-- now nothing ever removed one - so once the table filled, whether from years of use or from
-- someone typing city after city on purpose, every player in a new city was refused for good.
-- An area nobody has asked for in 90 days is dropped, and its events go with it (the foreign
-- key on local_events cascades).
--
-- Edge cases: an area that a posting still points at is kept, whether directly (groups.area)
-- or through a store event the posting is linked to - removing it would unlink the group from
-- its event and cost its players the store bonus. An area a player asks for again is simply
-- created again by resolve-area. With nothing old enough, the job does nothing.
select
  cron.schedule(
    'cleanup-unused-event-areas',
    '40 9 * * *',
    $$
    delete from public.event_areas a
    where a.last_requested_at < now() - interval '90 days'
      and not exists (select 1 from public.groups g where g.area = a.id)
      and not exists (
        select 1
          from public.local_events e
          join public.groups g on g.local_event_id = e.id
         where e.area = a.id
      );
    $$
  );
