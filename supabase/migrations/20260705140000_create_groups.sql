-- Groups previously lived only in client-side AppContext state (HARDCODED_GROUPS on
-- unitTests/test/<feature>, an empty array on development/main) with no backend at all - a join
-- code couldn't actually be shared between accounts, and a host's game results had nowhere
-- shared to live for other players to see or dispute. This gives groups, their rosters, and
-- reported game results real persistence.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  scheduled_at timestamptz,
  rounds_played integer not null default 0,
  target_players integer not null,
  brackets integer[] not null default '{}',
  location text not null default '',
  time text not null default '',
  game_type text not null,
  format text not null default '',
  no_go text[] not null default '{}',
  confirmed boolean not null default false
);

create unique index groups_join_code_idx on public.groups (join_code);

create table public.group_players (
  group_id uuid not null references public.groups (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'Player',
  joined_at timestamptz not null default now(),
  primary key (group_id, player_id)
);

-- One row per reported round of a group's session. `placements` is a JSON array, one entry per
-- participating player - { playerId, placement, outcome, pointsAwarded } - kept denormalized
-- rather than a separate table since nothing here needs a relational join across placements,
-- just "give me this round's results as a unit."
--
-- Anti-cheat model: the host submits a round as 'pending' with a dispute window; any other
-- member can add themselves to disputed_by before it elapses, which permanently blocks
-- auto-finalization (the host must cancel/resubmit - enforced in application code, not here).
-- Once the window elapses with no disputes, any member's client can flip status to 'finalized'
-- (a lazy, client-triggered check, matching this app's existing getNow()/devDateOffset pattern
-- rather than adding a scheduled job for it). Each participant's own client then applies their
-- own point delta from `placements` to their own profiles row (the only row RLS lets them write)
-- and adds themselves to applied_by so a later reload never double-awards it.
create table public.group_results (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  round_number integer not null,
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'disputed', 'finalized')),
  dispute_window_ends_at timestamptz not null,
  finalized_at timestamptz,
  disputed_by uuid[] not null default '{}',
  applied_by uuid[] not null default '{}',
  placements jsonb not null
);

alter table public.groups enable row level security;
alter table public.group_players enable row level security;
alter table public.group_results enable row level security;

-- Membership check shared by the result/roster policies below: is `uid` a player in `gid`?
create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.group_players
    where group_id = gid and player_id = uid
  );
$$;

-- Groups (and who's in them) are readable by any authenticated user, same tradeoff as profiles -
-- Browse and "join by code" both need to find a group before its own membership check would
-- otherwise allow it. Nothing sensitive lives on these two tables.
create policy "groups_select_authenticated"
  on public.groups for select
  using (auth.role() = 'authenticated');

create policy "groups_insert_self_host"
  on public.groups for insert
  with check (auth.uid() = created_by);

create policy "groups_update_members"
  on public.groups for update
  using (public.is_group_member(id, auth.uid()));

create policy "group_players_select_authenticated"
  on public.group_players for select
  using (auth.role() = 'authenticated');

create policy "group_players_insert_self_or_host"
  on public.group_players for insert
  with check (auth.uid() = player_id or public.is_group_member(group_id, auth.uid()));

create policy "group_players_delete_members"
  on public.group_players for delete
  using (public.is_group_member(group_id, auth.uid()));

-- Results are private to the group's own players, unlike groups/group_players above - there's
-- no discovery use case for someone else's game history.
create policy "group_results_select_members"
  on public.group_results for select
  using (public.is_group_member(group_id, auth.uid()));

create policy "group_results_insert_members"
  on public.group_results for insert
  with check (public.is_group_member(group_id, auth.uid()));

-- Coarse backstop only: any member can update a group's result row (to dispute, finalize, or
-- record their own applied_by entry). The narrower rule - you may only add your OWN id to
-- disputed_by/applied_by, never edit placements or someone else's entry - is enforced in
-- application code, since column/value-level RLS can't express "only append your own uuid."
create policy "group_results_update_members"
  on public.group_results for update
  using (public.is_group_member(group_id, auth.uid()));
