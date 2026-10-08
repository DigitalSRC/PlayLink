-- A reported round is final.
--
-- Until now the host's report opened a 15-minute window: any member could dispute it, a disputed
-- round sat until the host cancelled and re-reported it, an undisputed one was finalized by
-- whoever next opened the group after the window, and then every player's own app had to
-- collect their points separately. It was slow, it left points unpaid until each player came
-- back, and it was awkward to use.
--
-- Now the host's report is the whole thing: submit_group_result scores the round, records it,
-- pays every player, and counts the round as played, in one transaction. There is no pending or
-- disputed state, and no way to change a round afterwards. The app asks the host to confirm the
-- order before sending it; that read-back is the only check against a mistake.
--
-- What this gives up: other players can no longer contest a host's report, and a wrong report
-- cannot be corrected in the app. Scores are still computed here from the finish order, so a
-- host can misreport who placed where but cannot invent point values.

-- ---------------------------------------------------------------------------
-- 1. Clear out anything still waiting on the old flow, then forbid that state.
-- ---------------------------------------------------------------------------
-- A round left pending or disputed could never complete once the functions below are gone, and
-- it never paid anyone, so removing it loses no points.
delete from public.group_results where status <> 'finalized';

alter table public.group_results alter column status set default 'finalized';
alter table public.group_results drop constraint if exists group_results_always_final;
alter table public.group_results
  add constraint group_results_always_final check (status = 'finalized');

-- ---------------------------------------------------------------------------
-- 2. Remove the dispute / cancel / finalize / collect steps.
-- ---------------------------------------------------------------------------
drop function if exists public.dispute_group_result(uuid, text);
drop function if exists public.cancel_group_result(uuid);
drop function if exists public.finalize_group_result(uuid);
drop function if exists public.apply_group_result(uuid);

-- ---------------------------------------------------------------------------
-- 3. Reporting a round records it, pays it, and counts it - once.
-- ---------------------------------------------------------------------------
-- Same authority and input checks as 20261007140000, the same server-side scoring and
-- store-event bonus, plus the payout that apply_group_result used to do one player at a time.
-- Edge cases: raises if the caller is unauthenticated or not the group's host; if there are no
-- placements, a placement is not a positive whole number, a player is listed twice, or a listed
-- player is not in the group; or if p_round_number is not exactly the group's next round - a
-- repeat of a round already reported (a double tap, or a retry after a dropped response) is
-- refused rather than paid twice, and so is skipping ahead. The group row is locked for the
-- whole call, so two reports for the same group are handled one after the other and the second
-- is refused. Any failure rolls the whole thing back: no round recorded, nobody paid. A player
-- whose profile has gone is simply not paid; everyone else is. applied_by is filled with every
-- placed player, recording that this round has been paid out in full.
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
  venue_event_bonus constant int := 10;  -- VENUE_EVENT_BONUS in venue-bonus-utils.ts
  caller uuid := auth.uid();
  rounds_so_far int;
  scored jsonb;
  eligible boolean;
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
     <> (select count(distinct e->>'playerId') from jsonb_array_elements(p_placements) e) then
    raise exception 'A player is listed more than once';
  end if;

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

  scored := public.compute_placement_scores(p_placements);
  eligible := public.venue_bonus_eligible(p_group_id, now());

  select jsonb_agg(
           case
             when eligible and not exists (
               select 1
                 from public.group_results r,
                      jsonb_array_elements(r.placements) prior
                where r.group_id = p_group_id
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

  insert into public.group_results (
    group_id, round_number, submitted_by, status, dispute_window_ends_at, finalized_at,
    applied_by, placements
  ) values (
    p_group_id, p_round_number, caller, 'finalized', now(), now(),
    array(select (e->>'playerId')::uuid from jsonb_array_elements(scored) e),
    scored
  );

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

  update public.groups set rounds_played = rounds_played + 1 where id = p_group_id;
end;
$$;

revoke execute on function public.submit_group_result(uuid, int, jsonb) from public, anon;
grant execute on function public.submit_group_result(uuid, int, jsonb) to authenticated;
