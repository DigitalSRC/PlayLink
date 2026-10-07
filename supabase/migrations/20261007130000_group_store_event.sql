-- Lets a player-created group say "we're playing at this store's event" by pointing at a row in
-- local_events (the Calendar tab's data). A group linked this way earns each player a one-time
-- store-event bonus when a round is reported during that event - see src/utils/venue-bonus-utils.ts.
--
-- Nullable: most groups aren't tied to a store event. ON DELETE SET NULL: if the store cancels the
-- event (the sync removes its row) or it ages out, the group simply stops being linked and no
-- further bonus can be earned; the group itself is untouched.
alter table public.groups
  add column local_event_id uuid references public.local_events (id) on delete set null;

create index groups_local_event_id_idx
  on public.groups (local_event_id)
  where local_event_id is not null;
