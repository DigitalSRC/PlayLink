-- Store-event bonus, decided by the server.
--
-- 20260930120000 made the server score every round, but the store-event bonus (a group made
-- from a Calendar event earns each player +10 once, for a round reported at that event) was
-- added afterwards on the client: the host's app worked out whether the bonus applied and wrote
-- the points itself. Once clients can no longer write group_results at all, that path is gone -
-- and it was forgeable anyway (the host's app chose "now"). This moves the whole rule here:
--   * whether the round falls inside the event's window is decided from the server's clock, in
--     the venue's own time zone;
--   * each player gets the bonus at most once per group, however many rounds are reported.
-- The window and once-only rules MUST stay identical to src/utils/venue-bonus-utils.ts
-- (isWithinVenueEventWindow, playersAlreadyAwarded, applyVenueBonus), which the unit tests pin.
--
-- Also tightens submit_group_result against bad input and repeated submissions.

-- A round number can only be reported once per group. Without this, a double tap or a retry
-- after a dropped response left two rows for the same round and the group screen showed
-- whichever came first.
create unique index if not exists group_results_one_per_round
  on public.group_results (group_id, round_number);

-- True when a round reported at p_at counts as played at the group's store event: from the
-- event's start time on its own day until 4:00 AM the next morning, in the venue's time zone.
-- Edge cases: false (never an error) if the group doesn't exist, isn't linked to a store event,
-- the event has been deleted, or the area's time zone isn't one Postgres knows. A weekly event
-- qualifies on every matching weekday. Exactly at the start time counts; exactly 4:00 AM the
-- next day does not. Times are compared to the minute, matching the TypeScript rule.
create or replace function public.venue_bonus_eligible(p_group_id uuid, p_at timestamptz)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  grace_until constant time := time '04:00';  -- LATE_NIGHT_GRACE_HOUR in venue-bonus-utils.ts
  v_event_date date;
  v_day_of_week smallint;
  v_start time;
  v_zone text;
  local_ts timestamp;
  local_date date;
  local_minute time;
begin
  select e.event_date, e.day_of_week, date_trunc('minute', e.start_time)::time, a.time_zone
    into v_event_date, v_day_of_week, v_start, v_zone
    from public.groups g
    join public.local_events e on e.id = g.local_event_id
    join public.event_areas a on a.id = e.area
   where g.id = p_group_id;
  if not found or p_at is null then
    return false;
  end if;

  begin
    local_ts := p_at at time zone v_zone;
  exception when others then
    return false;  -- unrecognised time zone: fail closed, no bonus
  end;
  local_date := local_ts::date;
  local_minute := date_trunc('minute', local_ts)::time;

  -- The event's own day, from its start time on.
  if local_minute >= v_start and (
       (v_event_date is not null and v_event_date = local_date)
    or (v_event_date is null and v_day_of_week is not null
        and v_day_of_week = extract(dow from local_date)::int)
  ) then
    return true;
  end if;

  -- The small hours after an event that started the evening before.
  if local_minute < grace_until and (
       (v_event_date is not null and v_event_date = local_date - 1)
    or (v_event_date is null and v_day_of_week is not null
        and v_day_of_week = extract(dow from (local_date - 1))::int)
  ) then
    return true;
  end if;

  return false;
end;
$$;

-- Host submits a round. Replaces the version from 20260930120000 with the same authority checks
-- plus: input validation, a lock so two submissions for one group can't interleave, and the
-- store-event bonus. Scores still come only from the raw placement order.
-- Edge cases: raises if the caller is unauthenticated or not the group's host; if there are no
-- placements, a placement is not a positive whole number, a player is listed twice, or a listed
-- player is not in the group; or if that round number has already been reported. When the round
-- is not inside the store event's window (or the group has no store event) every placement gets
-- venueBonus 0. A player who already received the bonus in an earlier round of this group gets 0
-- again; a round the host cancelled no longer counts, since cancelling deletes it.
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
  scored jsonb;
  eligible boolean;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialises submissions for this group, so the once-per-player bonus check below can't race
  -- a second submission. Also raises nothing for a missing group: the host check then fails.
  perform 1 from public.groups where id = p_group_id for update;

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

  if p_round_number is null or p_round_number < 1 then
    raise exception 'Round number must be 1 or more';
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

  if exists (
    select 1 from public.group_results
    where group_id = p_group_id and round_number = p_round_number
  ) then
    raise exception 'Round % has already been reported', p_round_number;
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
    group_id, round_number, submitted_by, status, dispute_window_ends_at, placements
  ) values (
    p_group_id, p_round_number, caller, 'pending',
    now() + interval '15 minutes',           -- keep in sync with DISPUTE_WINDOW_MS in group-api.ts
    scored
  );
end;
$$;

-- venue_bonus_eligible is internal: only submit_group_result (which runs as owner) calls it.
revoke execute on function public.venue_bonus_eligible(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.submit_group_result(uuid, int, jsonb) from public, anon;
grant execute on function public.submit_group_result(uuid, int, jsonb) to authenticated;
