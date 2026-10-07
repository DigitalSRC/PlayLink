-- Regions the Calendar tab can show events for. Until now the list of areas was hardcoded in both
-- the app and the sync function, so a player anywhere but Reno-Sparks still saw Reno-Sparks. With
-- areas as rows, a new one is created the first time someone sets their location to a city that
-- isn't inside an existing area's radius (see supabase/functions/resolve-area), and the scheduled
-- sync (supabase/functions/sync-local-events) reads its list from here instead of from code.
create table public.event_areas (
  -- Slug written to local_events.area, e.g. 'reno-sparks' or 'sacramento-california-us'.
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text not null check (length(btrim(label)) > 0),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  -- How far from the center the sync searches. A location inside this radius belongs to this
  -- area rather than getting one of its own, which is what keeps Reno and Sparks together.
  radius_meters integer not null default 25000 check (radius_meters between 1000 and 100000),
  -- The venues' IANA zone, used to turn the feed's UTC instants into wall-clock dates and times.
  time_zone text not null check (length(btrim(time_zone)) > 0),
  created_at timestamptz not null default now(),
  -- Last time a signed-in player asked for this area. The scheduled sync only keeps refreshing
  -- areas someone has recently looked at, so a city typed once doesn't get synced forever.
  last_requested_at timestamptz not null default now(),
  -- Last time a sync for this area started. Also the lock that stops two syncs of one area
  -- overlapping: a sync must move this forward in a single guarded UPDATE before it may run.
  last_synced_at timestamptz
);

-- Default-deny, same shape as local_events: signed-in clients may read, nothing else. Areas are
-- only ever created or changed by the Edge Functions (service role), which validate the input.
alter table public.event_areas enable row level security;

revoke all on public.event_areas from anon, authenticated;
grant select on public.event_areas to authenticated;

create policy "event_areas_select_authenticated"
  on public.event_areas for select
  to authenticated
  using (true);

-- The area that already has events. Centered between downtown Reno and Sparks; 25 km covers both
-- without reaching Carson City (~40 km south).
insert into public.event_areas (id, label, latitude, longitude, radius_meters, time_zone)
values ('reno-sparks', 'Reno-Sparks, NV', 39.5296, -119.8138, 25000, 'America/Los_Angeles');

-- Every event must belong to a real area; removing an area removes its events with it.
alter table public.local_events
  add constraint local_events_area_fkey
  foreign key (area) references public.event_areas (id) on delete cascade;
