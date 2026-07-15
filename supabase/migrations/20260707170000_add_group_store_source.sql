-- Marks a `groups` row as either player-created (the only kind that existed before) or
-- store-sourced (materialized by the sync-store-events Edge Function from a game_stores feed).
-- created_by becomes nullable because a store-sourced group has no host player at all - it's a
-- discovery/attendance listing, not something anyone "owns" the way a player-created group is.
alter table public.groups
  add column source text not null default 'player' check (source in ('player', 'store')),
  add column store_id uuid references public.game_stores (id) on delete cascade,
  add column external_uid text,
  alter column created_by drop not null;

-- Enforces the two valid shapes: a player group always has a host and never a store link; a
-- store group always has a store link plus the feed's own per-occurrence event id and never a
-- host.
alter table public.groups
  add constraint groups_source_consistency check (
    (source = 'player' and created_by is not null and store_id is null and external_uid is null)
    or
    (source = 'store' and store_id is not null and external_uid is not null)
  );

-- Dedup key for re-syncing the same feed: re-running the sync for a store must update its
-- already-materialized occurrences (one groups row per weekly occurrence within the sync
-- window), not insert duplicates.
create unique index groups_store_external_uid_idx on public.groups (store_id, external_uid);

-- Store-sourced groups are never player-editable - only the service-role sync function may write
-- them. This narrows the existing "any member can update" rule to player groups only; the app's
-- own UI additionally hides host controls entirely for source = 'store' as defense in depth (see
-- group-detail.tsx), but the database is the actual enforcement point.
drop policy "groups_update_members" on public.groups;
create policy "groups_update_members"
  on public.groups for update
  using (source = 'player' and public.is_group_member(id, auth.uid()));
