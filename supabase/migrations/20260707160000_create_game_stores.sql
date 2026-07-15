-- Game stores whose published event calendars (iCal/.ics or RSS feeds) get synced into `groups`
-- rows by the sync-store-events Edge Function, turning their in-store events (Magic: The
-- Gathering first, but not hardcoded to it - see game_types/game_type_keywords below) into
-- joinable listings alongside player-created groups. MVP onboarding for a store is
-- developer-curated (a row inserted directly via Studio/service-role) - there is deliberately no
-- insert/update/delete policy below for any authenticated role, since there is no in-app
-- store-submission flow yet.
create table public.game_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website_url text not null default '',
  feed_url text not null,
  feed_type text not null check (feed_type in ('ical', 'rss')),
  city text not null default '',
  state text not null default '',
  -- GameType values (see src/data/types.ts) this store's feed can produce events for. A store
  -- that only ever runs Magic events just lists 'mtg'; this is what lets a 5th GameType slot in
  -- later without any change to the sync function itself.
  game_types text[] not null default '{}',
  -- Fallback format string (e.g. 'Commander') used when no keyword match is found for an event.
  default_format text not null default '',
  -- { [GameType]: string[] } - per-store keyword hints the sync function uses to classify an
  -- event's game_type/format when a store's feed text doesn't say so explicitly. Entirely
  -- data-driven so adding game support to a store is a data change, not a code change.
  game_type_keywords jsonb not null default '{}',
  default_target_players integer not null default 8,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_stores enable row level security;

create policy "game_stores_select_authenticated"
  on public.game_stores for select
  using (auth.role() = 'authenticated');
