-- Local play nights shown on the Calendar tab's month view (e.g. a game store's weekly Commander
-- night). This is a read-only directory of *where and when* organized play happens in an area -
-- deliberately separate from `groups`, which are player-created pods people join and score.
--
-- Rows come from two places, told apart by `source`: 'feed' rows are written automatically by the
-- sync-local-events Edge Function from the Wizards store/event locator, keyed by `external_uid`;
-- 'curated' rows are added by hand (Studio / the service role) for venues the locator doesn't
-- cover. The sync only ever touches 'feed' rows. There is no in-app submission flow.
create table public.local_events (
  id uuid primary key default gen_random_uuid(),
  -- Area slug the event belongs to, e.g. 'reno-sparks'. Since 20261007120000_event_areas.sql this
  -- references a row in public.event_areas.
  area text not null check (area ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  venue_name text not null check (length(btrim(venue_name)) > 0),
  address text not null default '',
  -- GameType value (see src/data/types.ts).
  game_type text not null default 'mtg',
  format text not null default 'Commander',
  -- Exactly one of these two is set (enforced below): day_of_week for a night that repeats every
  -- week (0 = Sunday ... 6 = Saturday, same numbering as JS Date.getDay() and Postgres dow), or
  -- event_date for a one-off.
  day_of_week smallint check (day_of_week between 0 and 6),
  event_date date,
  -- Wall-clock time at the venue, with no time zone on purpose: "6:00 PM at the store" should
  -- read as 6:00 PM no matter what zone the viewer's phone is in.
  start_time time not null,
  end_time time,
  -- The event's own name where it has one (e.g. "Commander Free Play Wednesday"); may be empty
  -- for a curated row, in which case the app shows just the venue.
  title text not null default '',
  notes text not null default '',
  source text not null default 'curated' check (source in ('curated', 'feed')),
  -- The feed's own id for this event; only meaningful when source = 'feed'.
  external_uid text,
  -- Soft off-switch so a night that's paused or cancelled can be hidden without losing the row.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint local_events_one_schedule_kind check (
    (day_of_week is not null and event_date is null)
    or (day_of_week is null and event_date is not null)
  ),
  constraint local_events_source_consistency check (
    (source = 'curated' and external_uid is null)
    or (source = 'feed' and external_uid is not null)
  )
);

create index local_events_area_idx on public.local_events (area) where active;

-- Dedup key for the feed sync (supabase/functions/sync-local-events): re-running it must update
-- an existing row, not insert a copy. Deliberately NOT a partial index - an upsert's ON CONFLICT
-- can only target a plain unique index - and it doesn't need to be one: Postgres treats NULLs as
-- distinct, so any number of curated rows (external_uid null) coexist in the same area.
create unique index local_events_feed_uid_idx
  on public.local_events (area, external_uid);

-- Default-deny. RLS is on with a single SELECT policy, and the table-level grants are narrowed to
-- match, so a signed-in client can read active rows and nothing else. No INSERT/UPDATE/DELETE
-- policy or grant exists for anon or authenticated: a forged write through the REST API fails at
-- the grant before RLS is even consulted. Only the service role (Studio, a future sync function)
-- writes here.
alter table public.local_events enable row level security;

revoke all on public.local_events from anon, authenticated;
grant select on public.local_events to authenticated;

create policy "local_events_select_authenticated"
  on public.local_events for select
  to authenticated
  using (active);
