-- A reported round can be contested for 15 minutes, and the group's votes decide it.
--
-- Since 20261007160000 the host's report was final and paid at once: a wrong order could not be
-- corrected and a host could misreport who won. Asked for after play-testing (2026-10-12), on
-- the model of golf scoring apps: bring back a short window in which the other players can
-- contest, and let the players' own reports outvote a wrong one.
--
-- The rule:
--   * The host reports a round. It is recorded as 'pending', nobody is paid yet, and a
--     15-minute window opens. The round counts as played at once, so the next round can be
--     reported while this one is still open.
--   * The host's report is the host's vote. Each other player in the round has one vote: they
--     either agree with the report, or contest it by entering the finish order they say is
--     right. A player can change their vote until the round is settled.
--   * The round is settled when the window ends, or as soon as every player in it has voted.
--     The order with the most votes wins. If no single order has the most votes (a tie), the
--     host's report stands.
--   * Settling scores the winning order here, on the server, adds the store-event bonus, pays
--     every player, and marks the round 'finalized'. That happens exactly once.
--
-- Nothing is ever paid for a pending round, so there is nothing to claw back, and no client can
-- settle a round early or pay itself: clients can only report (host), vote (players in the
-- round), and ask for an overdue round to be settled.
--
-- Who settles: a pg_cron job every minute (20261012130100), any vote that completes the set,
-- and - as a failsafe if the job is not running - any group member's app asking for an overdue
-- round (settle_group_result_if_due).

-- ---------------------------------------------------------------------------
-- 1. Rounds can be pending again; ballots get their own table.
-- ---------------------------------------------------------------------------
alter table public.group_results drop constraint if exists group_results_always_final;
alter table public.group_results drop constraint if exists group_results_status_check;
alter table public.group_results
  add constraint group_results_status_check check (status in ('pending', 'finalized'));
alter table public.group_results alter column status set default 'pending';

-- True when the group's votes replaced the host's reported order.
alter table public.group_results
  add column if not exists overturned boolean not null default false;

-- One row per player per round: the finish order that player says is right. The host's row is
-- written when they report. Placements are stored normalized (see normalize_placements), so two
-- ballots for the same order are equal as jsonb and can simply be counted.
create table if not exists public.group_result_ballots (
  result_id uuid not null references public.group_results (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  placements jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (result_id, player_id)
);

alter table public.group_result_ballots enable row level security;

-- Readable by the group's own players (the same audience as the round itself), so everyone can
-- see who has voted and for what. No client writes at all: votes go through vote_group_result.
revoke all on public.group_result_ballots from anon, authenticated;
grant select on public.group_result_ballots to authenticated;

drop policy if exists "group_result_ballots_select_members" on public.group_result_ballots;
create policy "group_result_ballots_select_members"
  on public.group_result_ballots for select
  using (public.is_group_member(group_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Helpers.
-- ---------------------------------------------------------------------------
-- Checks that a finish order is well formed: a non-empty array, each entry a player id and a
-- position of 1 or more, no player listed twice.
-- Edge cases: raises with a plain-English message on the first problem found; says nothing
-- about whether the players belong to any group - callers check that.
create or replace function public.assert_valid_placements(p_placements jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_placements is null or jsonb_typeof(p_placements) <> 'array'
     or jsonb_array_length(p_placements) = 0 then
    raise exception 'A round needs at least one placement';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_placements) e
    where coalesce(e->>'placement', '') !~ '^[0-9]{1,4}$' or (e->>'placement')::int < 1
       or coalesce(e->>'playerId', '') !~ '^[0-9a-fA-F-]{36}$'
  ) then
    raise exception 'Every placement needs a player and a position of 1 or more';
  end if;

  if (select count(*) from jsonb_array_elements(p_placements))
     <> (select count(distinct lower(e->>'playerId')) from jsonb_array_elements(p_placements) e) then
    raise exception 'A player is listed more than once';
  end if;
end;
$$;

-- Rewrites a finish order into one fixed form: only playerId and placement, ids in lower case,
-- positions as competition ranks (1, 2, 2, 4), sorted by position and then id. Two reports of
-- the same finish - whatever numbers or order the app sent, and whatever extra fields - come out
-- identical, which is what lets votes be counted by comparing them.
-- Edge cases: expects input that passed assert_valid_placements; an empty array gives null.
create or replace function public.normalize_placements(p_placements jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object('playerId', x.pid, 'placement', x.rnk) order by x.rnk, x.pid)
    from (
      select lower(e->>'playerId') as pid,
             rank() over (order by (e->>'placement')::int) as rnk
        from jsonb_array_elements(p_placements) e
    ) x;
$$;

-- ---------------------------------------------------------------------------
-- 3. Settling a round: count the votes, score the winner, pay everyone - once.
-- ---------------------------------------------------------------------------
-- Does nothing unless the round is pending AND is due: its window has ended, or every player in
-- it (who still has a profile) has voted. Returns true only when this call settled it.
-- Edge cases: an unknown or already-final round returns false, so calling it twice, or from two
-- places at once, pays once - the group row and then the round row are locked, in that order
-- (the same order submit and vote use), so concurrent calls run one after the other. The order
-- with the most votes wins; with no single leader the host's report stands, and it also stands
-- if every ballot has gone (deleted accounts). The store-event bonus is judged at the moment
-- the round was REPORTED, not when it settles, and is still once per player per group, counted
-- against rounds already settled. A player whose profile has gone is simply not paid.
create or replace function public.settle_group_result(p_result_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  venue_event_bonus constant int := 10;  -- VENUE_EVENT_BONUS in venue-bonus-utils.ts
  v_group uuid;
  r public.group_results;
  reported jsonb;
  winner jsonb;
  top_votes int;
  leaders int;
  everyone_voted boolean;
  scored jsonb;
  eligible boolean;
begin
  select group_id into v_group from public.group_results where id = p_result_id;
  if not found then
    return false;
  end if;

  perform 1 from public.groups where id = v_group for update;
  select * into r from public.group_results where id = p_result_id for update;
  if not found or r.status <> 'pending' then
    return false;
  end if;

  reported := public.normalize_placements(r.placements);

  everyone_voted := not exists (
    select 1
      from jsonb_array_elements(reported) e
      join public.profiles p on p.id = (e->>'playerId')::uuid
     where not exists (
       select 1 from public.group_result_ballots b
        where b.result_id = r.id and b.player_id = p.id
     )
  );

  if now() < r.dispute_window_ends_at and not everyone_voted then
    return false;
  end if;

  -- How many votes the leading order has, and how many different orders share that lead.
  select max(t.votes) into top_votes
    from (
      select count(*)::int as votes
        from public.group_result_ballots b
       where b.result_id = r.id
       group by b.placements
    ) t;
  select count(*)::int into leaders
    from (
      select count(*)::int as votes
        from public.group_result_ballots b
       where b.result_id = r.id
       group by b.placements
    ) t
   where t.votes = top_votes;

  if top_votes is null or leaders <> 1 then
    winner := reported;
  else
    select t.placements into winner
      from (
        select b.placements, count(*)::int as votes
          from public.group_result_ballots b
         where b.result_id = r.id
         group by b.placements
      ) t
     where t.votes = top_votes;
  end if;

  scored := public.compute_placement_scores(winner);
  eligible := public.venue_bonus_eligible(v_group, r.submitted_at);

  select jsonb_agg(
           case
             when eligible and not exists (
               select 1
                 from public.group_results other,
                      jsonb_array_elements(other.placements) prior
                where other.group_id = v_group
                  and other.id <> r.id
                  and other.status = 'finalized'
                  and prior->>'playerId' = s.elem->>'playerId'
                  and coalesce((prior->>'venueBonus')::int, 0) > 0
             )
             then s.elem || jsonb_build_object(
                    'pointsAwarded', (s.elem->>'pointsAwarded')::int + venue_event_bonus,
                    'venueBonus', venue_event_bonus)
             else s.elem || jsonb_build_object('venueBonus', 0)
           end
           order by s.ord)
    into scored
    from jsonb_array_elements(scored) with ordinality as s(elem, ord);

  update public.group_results
     set placements = scored,
         status = 'finalized',
         finalized_at = now(),
         overturned = (winner <> reported),
         applied_by = array(select (e->>'playerId')::uuid from jsonb_array_elements(scored) e)
   where id = r.id;

  -- Pay everyone in the round: spendable points, this month's score, and the all-time total
  -- move together, along with the win/loss/draw record.
  update public.profiles p
     set points = p.points + x.pts,
         monthly_points = p.monthly_points + x.pts,
         point_balance = p.point_balance + x.pts,
         wins = p.wins + (case when x.oc = 'win' then 1 else 0 end),
         losses = p.losses + (case when x.oc = 'loss' then 1 else 0 end),
         draws = p.draws + (case when x.oc = 'draw' then 1 else 0 end)
    from (
      select (e->>'playerId')::uuid as id,
             (e->>'pointsAwarded')::int as pts,
             e->>'outcome' as oc
        from jsonb_array_elements(scored) e
    ) x
   where p.id = x.id;

  return true;
end;
$$;

-- Settles every round whose window has ended. Run every minute by pg_cron.
-- Edge cases: a round that fails to settle is skipped with a warning and tried again on the
-- next run, so one bad row never holds up the rest; with nothing due it does nothing.
create or replace function public.settle_due_group_results()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  due record;
  settled int := 0;
begin
  for due in
    select id from public.group_results
     where status = 'pending' and dispute_window_ends_at <= now()
     order by submitted_at, round_number
  loop
    begin
      if public.settle_group_result(due.id) then
        settled := settled + 1;
      end if;
    exception when others then
      raise warning 'settle_group_result(%) failed: %', due.id, sqlerrm;
    end;
  end loop;
  return settled;
end;
$$;

-- Lets a group member's app ask for an overdue round to be settled, in case the scheduled job
-- is late or not running. It can only do what the job would do anyway.
-- Edge cases: raises if unauthenticated or the caller is not in the round's group; returns
-- false (no error) for an unknown round, one already final, or one still inside its window.
create or replace function public.settle_group_result_if_due(p_result_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  v_group uuid;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;
  select group_id into v_group from public.group_results where id = p_result_id;
  if not found then
    return false;
  end if;
  if not exists (
    select 1 from public.group_players where group_id = v_group and player_id = caller
  ) then
    raise exception 'Only players in this group can do that';
  end if;
  return public.settle_group_result(p_result_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reporting a round opens the window instead of paying.
-- ---------------------------------------------------------------------------
-- Same authority and input checks as before. The round is recorded as pending with the host's
-- order (scored provisionally, without the store bonus, so the app has something to show), the
-- host's ballot is written, and the round counts as played.
-- Edge cases: raises if the caller is unauthenticated or not the group's host; on a malformed
-- order, a player listed twice, or a listed player who is not in the group; or if
-- p_round_number is not exactly the group's next round - a repeat (double tap, retry) is
-- refused, and so is skipping ahead. The group row is locked for the whole call. Any failure
-- rolls everything back. A round whose only player is the host has every vote in already, so it
-- settles in this same call.
create or replace function public.submit_group_result(
  p_group_id uuid,
  p_round_number int,
  p_placements jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  contest_window constant interval := interval '15 minutes';  -- CONTEST_WINDOW_MS in contest-utils.ts
  caller uuid := auth.uid();
  rounds_so_far int;
  normalized jsonb;
  scored jsonb;
  new_id uuid;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  -- Locks the group for the rest of the transaction. A missing group leaves rounds_so_far NULL
  -- and then fails the host check below.
  select rounds_played into rounds_so_far from public.groups where id = p_group_id for update;

  if not exists (
    select 1 from public.group_players
    where group_id = p_group_id and player_id = caller and role = 'Host'
  ) then
    raise exception 'Only the host may submit a result';
  end if;

  perform public.assert_valid_placements(p_placements);

  if exists (
    select 1 from jsonb_array_elements(p_placements) e
    where (e->>'playerId')::uuid not in (
      select player_id from public.group_players where group_id = p_group_id
    )
  ) then
    raise exception 'A placement refers to a player who is not in this group';
  end if;

  if p_round_number is null or p_round_number < 1 then
    raise exception 'Round number must be 1 or more';
  end if;
  if p_round_number <= rounds_so_far or exists (
    select 1 from public.group_results
    where group_id = p_group_id and round_number = p_round_number
  ) then
    raise exception 'Round % has already been reported', p_round_number;
  end if;
  if p_round_number <> rounds_so_far + 1 then
    raise exception 'Round % is next - rounds are reported in order', rounds_so_far + 1;
  end if;

  normalized := public.normalize_placements(p_placements);

  select jsonb_agg(s.elem || jsonb_build_object('venueBonus', 0) order by s.ord)
    into scored
    from jsonb_array_elements(public.compute_placement_scores(normalized)) with ordinality as s(elem, ord);

  insert into public.group_results (
    group_id, round_number, submitted_by, status, dispute_window_ends_at, placements
  ) values (
    p_group_id, p_round_number, caller, 'pending', now() + contest_window, scored
  )
  returning id into new_id;

  -- The host's report is the host's vote - but only if the host played in the round.
  if exists (select 1 from jsonb_array_elements(normalized) e where e->>'playerId' = caller::text) then
    insert into public.group_result_ballots (result_id, group_id, player_id, placements)
    values (new_id, p_group_id, caller, normalized);
  end if;

  update public.groups set rounds_played = rounds_played + 1 where id = p_group_id;

  -- Settles at once only when nobody else is left to vote.
  perform public.settle_group_result(new_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Voting: agree with the report, or contest it with the right order.
-- ---------------------------------------------------------------------------
-- p_placements null means "the report is right". Otherwise it is the finish order the caller
-- says is right, and it must rank exactly the players the report ranked.
-- Returns 'settled' when this vote was the last one needed and the round was paid, else 'recorded'.
-- Edge cases: raises if unauthenticated; if the round does not exist, is already final, or its
-- window has ended; if the caller reported the round (their report is their vote) or did not
-- play in it; or if a contested order is malformed, lists a player twice, or does not rank the
-- same players as the report. Voting again replaces the caller's earlier vote. Locks the group
-- and then the round, so a vote cannot land halfway through a settle.
create or replace function public.vote_group_result(p_result_id uuid, p_placements jsonb default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  v_group uuid;
  r public.group_results;
  reported jsonb;
  ballot jsonb;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select group_id into v_group from public.group_results where id = p_result_id;
  if not found then
    raise exception 'No such round';
  end if;

  perform 1 from public.groups where id = v_group for update;
  select * into r from public.group_results where id = p_result_id for update;
  if not found then
    raise exception 'No such round';
  end if;
  if r.status <> 'pending' then
    raise exception 'This round is already final';
  end if;
  if now() >= r.dispute_window_ends_at then
    raise exception 'The time to contest this round has passed';
  end if;

  reported := public.normalize_placements(r.placements);

  if not exists (select 1 from jsonb_array_elements(reported) e where e->>'playerId' = caller::text) then
    raise exception 'Only players in this round can vote on it';
  end if;
  if caller = r.submitted_by then
    raise exception 'You reported this round - your report is your vote';
  end if;

  if p_placements is null or jsonb_typeof(p_placements) = 'null' then
    ballot := reported;
  else
    perform public.assert_valid_placements(p_placements);
    ballot := public.normalize_placements(p_placements);
    if jsonb_array_length(ballot) <> jsonb_array_length(reported) or exists (
      select 1 from jsonb_array_elements(ballot) e
      where not exists (
        select 1 from jsonb_array_elements(reported) h where h->>'playerId' = e->>'playerId'
      )
    ) then
      raise exception 'A contested order must rank the same players as the report';
    end if;
  end if;

  insert into public.group_result_ballots (result_id, group_id, player_id, placements)
  values (r.id, v_group, caller, ballot)
  on conflict (result_id, player_id)
  do update set placements = excluded.placements, updated_at = now();

  if public.settle_group_result(r.id) then
    return 'settled';
  end if;
  return 'recorded';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. A group cannot be deleted out from under an open round.
-- ---------------------------------------------------------------------------
-- Deleting a group deletes its rounds. For a pending round that would mean nobody is ever paid -
-- and a host could report a wrong order and delete the posting to dodge the vote. So: a round
-- whose window has ended is settled first and the delete goes ahead; a round still inside its
-- window blocks the delete. This covers every path at once - Delete Posting, the last player
-- leaving, and the hourly stale-group cleanup.
-- Edge cases: raises with a plain-English message while a window is open; never blocks for
-- longer than the 15 minutes a window lasts, since an ended window is settled right here even
-- if the scheduled job is not running.
create or replace function public.groups_guard_open_rounds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_round record;
begin
  for open_round in
    select id, dispute_window_ends_at from public.group_results
     where group_id = old.id and status = 'pending'
     order by round_number
  loop
    if now() < open_round.dispute_window_ends_at then
      raise exception 'A round in this group can still be contested. Try again in a few minutes, once it is final.';
    end if;
    perform public.settle_group_result(open_round.id);
  end loop;
  return old;
end;
$$;

drop trigger if exists groups_guard_open_rounds on public.groups;
create trigger groups_guard_open_rounds
  before delete on public.groups
  for each row execute function public.groups_guard_open_rounds();

-- ---------------------------------------------------------------------------
-- 7. Who may call what.
-- ---------------------------------------------------------------------------
revoke execute on function public.assert_valid_placements(jsonb) from public, anon, authenticated;
revoke execute on function public.normalize_placements(jsonb) from public, anon, authenticated;
revoke execute on function public.settle_group_result(uuid) from public, anon, authenticated;
revoke execute on function public.settle_due_group_results() from public, anon, authenticated;
revoke execute on function public.groups_guard_open_rounds() from public, anon, authenticated;

revoke execute on function public.submit_group_result(uuid, int, jsonb) from public, anon;
revoke execute on function public.vote_group_result(uuid, jsonb) from public, anon;
revoke execute on function public.settle_group_result_if_due(uuid) from public, anon;
grant execute on function public.submit_group_result(uuid, int, jsonb) to authenticated;
grant execute on function public.vote_group_result(uuid, jsonb) to authenticated;
grant execute on function public.settle_group_result_if_due(uuid) to authenticated;
