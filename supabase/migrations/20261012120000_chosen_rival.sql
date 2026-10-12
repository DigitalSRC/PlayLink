-- A player's picked Rival is saved on their profile.
--
-- Until now the pick lived only on the phone that made it (AsyncStorage), so nobody else could
-- see it: a player had no way to learn that someone had made them their Rival, and the pick did
-- not follow the player to another device. Asked for in play-testing (2026-10-12): "it should
-- let you know that they have made you their rival even if you are not rivaling them".
--
-- The pick is the player's own to set, like rival_ids, so it is a plain column the owner may
-- update (the existing "profiles_update_own" policy limits the row; the column grant below
-- limits the column). It is a display fact, not a permission: nothing is paid or unlocked by it,
-- so a player who sets it by calling the API directly gains nothing but a tag on someone's screen.
--
-- Edge cases: a player cannot pick themselves (check constraint); when the picked player's
-- account is deleted the pick clears itself (ON DELETE SET NULL); the daily refresh-rivals job
-- can drop the picked player from rival_ids without clearing this column, so readers must also
-- require that the picked player is still in rival_ids (the app's fetchRivaledBy does).

alter table public.profiles
  add column if not exists chosen_rival_id uuid references public.profiles (id) on delete set null;

alter table public.profiles drop constraint if exists profiles_chosen_rival_not_self;
alter table public.profiles
  add constraint profiles_chosen_rival_not_self check (chosen_rival_id is null or chosen_rival_id <> id);

-- "Who has picked me?" is asked on every refresh, and the foreign key's own ON DELETE needs it.
create index if not exists profiles_chosen_rival_idx
  on public.profiles (chosen_rival_id) where chosen_rival_id is not null;

-- Table-level UPDATE was revoked in 20260930120000; each writable column is granted by name.
grant update (chosen_rival_id) on public.profiles to authenticated;
