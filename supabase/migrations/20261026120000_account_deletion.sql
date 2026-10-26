-- Lets a player delete their own account from inside the app. Both the App Store (guideline
-- 5.1.1(v)) and Google Play require this of any app where people can create an account.
--
-- Deleting the auth user removes everything that hangs off it through the existing foreign keys:
-- the profile, purchases, starter rewards, Rival picks, contest ballots, and sessions. Two things
-- need more care than a cascade gives them, and this migration handles both:
--
--   1. Seats. Simply dropping a player's group_players rows would skip the rules in leave_group:
--      a group left without a host would never get a new one. So every seat is left through
--      leave_group first, which passes the host role on or removes the posting, exactly as if
--      the player had tapped Leave in each group.
--   2. Postings. groups.created_by was ON DELETE CASCADE, so deleting a player would also have
--      deleted every group they ever posted - including ones they had since handed to another
--      host, under players who are still using them. It becomes ON DELETE SET NULL. A group with
--      no creator keeps working; only the host-seat rule reads created_by, and it already refuses
--      a null creator (a creator-less group always has its host already).
--
-- Past rounds stay as they are. Their placements are JSON naming player ids, so other players'
-- history and points are untouched; the app shows the missing player as "Deleted player".

-- ---------------------------------------------------------------------------
-- 1. A posting outlives the player who posted it.
-- ---------------------------------------------------------------------------
alter table public.groups alter column created_by drop not null;
alter table public.groups drop constraint if exists groups_created_by_fkey;
alter table public.groups
  add constraint groups_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- A reported round outlives the host who reported it. submitted_by had no delete rule at all, so
-- any host who had ever reported a round could not be deleted. A null reporter is safe where it
-- is read: vote_group_result compares the caller with it (never equal to null), and the app
-- shows "Deleted player".
alter table public.group_results alter column submitted_by drop not null;
alter table public.group_results drop constraint if exists group_results_submitted_by_fkey;
alter table public.group_results
  add constraint group_results_submitted_by_fkey
  foreign key (submitted_by) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. delete_my_account
-- ---------------------------------------------------------------------------
-- Deletes the calling player's account and everything that belongs only to them, in one
-- transaction: it all happens, or nothing does.
-- A signed-in session alone is not enough. A borrowed unlocked phone, or a copied session, must
-- not be able to destroy an account for good, so the caller must have entered their password in
-- the last 10 minutes. Supabase records when in the token's `amr` claim, and a refreshed token
-- keeps the original time, so refreshing a stolen session does not pass. The app signs the player
-- in again with the password they type just before calling this.
-- Edge cases: raises if unauthenticated; raises if the last password sign-in is older than 10
-- minutes or the token has no `amr` claim (fails closed); raises, deleting nothing, if leaving
-- one of the player's groups is refused - today that is a group whose round is still inside its
-- contest window and would be deleted by this player leaving it ("try again in a few minutes").
-- Empty postings the player left behind (no seats at all) are removed rather than left without a
-- creator. A second call after success has nothing left to delete and changes nothing (in
-- practice the gateway refuses it first, since the user is gone).
create or replace function public.delete_my_account()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  max_age_seconds constant int := 600;
  last_sign_in bigint;
  seat record;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select max((m->>'timestamp')::bigint)
    into last_sign_in
    from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) m
   where m->>'method' = 'password';
  if last_sign_in is null or last_sign_in < extract(epoch from now())::bigint - max_age_seconds then
    raise exception 'For your safety, enter your password again to delete your account.';
  end if;

  for seat in
    select group_id from public.group_players where player_id = caller order by group_id
  loop
    perform public.leave_group(seat.group_id);
  end loop;

  delete from public.groups g
   where g.created_by = caller
     and not exists (select 1 from public.group_players p where p.group_id = g.id);

  delete from auth.users where id = caller;
  return 'deleted';
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
