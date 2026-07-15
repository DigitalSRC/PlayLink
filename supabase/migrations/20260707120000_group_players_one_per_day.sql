-- Loosens the "one group, ever" rule (group_players_one_group_per_player, added because a
-- client-side-only check could race during cold start before the persisted React Query cache
-- rehydrated) to "one group per calendar day" - a player can now hold a different group on each
-- day of the week, which is the whole point of a weekly calendar, while still being blocked from
-- double-booking the same day by the same kind of race.
drop index public.group_players_one_group_per_player;

-- Postgres generated columns can't reference a joined table, so session_date is instead kept in
-- sync by triggers below: it mirrors groups.scheduled_at::date (UTC) for this row's group.
alter table public.group_players add column session_date date;

update public.group_players gp
set session_date = (g.scheduled_at at time zone 'utc')::date
from public.groups g
where g.id = gp.group_id;

create or replace function public.group_players_set_session_date()
returns trigger
language plpgsql
as $$
begin
  select (scheduled_at at time zone 'utc')::date into new.session_date
  from public.groups where id = new.group_id;
  return new;
end;
$$;

create trigger group_players_session_date_trg
  before insert or update of group_id on public.group_players
  for each row execute function public.group_players_set_session_date();

-- Keeps session_date correct if a group is rescheduled after players have already joined it.
create or replace function public.groups_propagate_session_date()
returns trigger
language plpgsql
as $$
begin
  if new.scheduled_at is distinct from old.scheduled_at then
    update public.group_players
      set session_date = (new.scheduled_at at time zone 'utc')::date
      where group_id = new.id;
  end if;
  return new;
end;
$$;

create trigger groups_session_date_propagate_trg
  after update of scheduled_at on public.groups
  for each row execute function public.groups_propagate_session_date();

-- Unique indexes treat NULL as distinct from every other NULL, so group_players rows for a
-- (currently unreachable in the app) scheduled_at-less group never collide with each other.
create unique index group_players_one_per_day on public.group_players (player_id, session_date);

-- Known limitation: session_date buckets by UTC calendar date, not the viewer's local calendar
-- day, so a late-night group can bucket as "tomorrow" server-side while still reading as "today"
-- locally. This matches this app's existing precedent of not modeling per-user timezones
-- anywhere; a per-profile timezone column is a reasonable follow-up, not part of this change.
