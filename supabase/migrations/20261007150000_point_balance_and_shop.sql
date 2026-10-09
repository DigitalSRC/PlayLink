-- Points to spend, and a shop to spend them in.
--
-- Until now a profile had two numbers: `points` (everything ever earned) and `monthly_points`
-- (this month's total, which the leaderboard ranks by and which resets each month). Neither can
-- be spent without breaking what it is for - spending lifetime points would undo milestones, and
-- spending monthly points would drop a player down the leaderboard for buying something.
--
-- So this adds a third number, `point_balance`: it goes up by exactly what a player earns and
-- goes down only when they buy something. In the app it is what "Points" means; `monthly_points`
-- is shown as "Score"; `points` stays as the all-time total behind milestones.
--
-- Everything here follows 20260930120000's rule: a client can read, but every write goes through
-- a SECURITY DEFINER function that checks who is calling. A player cannot give themselves
-- points, an item, or a look they have not bought.

-- ---------------------------------------------------------------------------
-- 1. profiles: the spendable balance and the three things a player can wear.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists point_balance integer not null default 0 check (point_balance >= 0),
  -- What is currently worn, stored as the value to display so any screen can render another
  -- player's look straight from their profile row: the title's text, a "#RRGGBB" colour, and a
  -- border style key (see BORDER_STYLES in src/data/shop.ts). NULL means nothing equipped.
  add column if not exists title text check (title is null or length(title) between 1 and 40),
  add column if not exists name_color text check (name_color is null or name_color ~ '^#[0-9A-F]{6}$'),
  add column if not exists card_border text check (card_border is null or card_border ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Everyone starts with what they have already earned, so nobody's past games are worth nothing
-- in the shop. Guarded so re-running this migration can never hand the points out twice.
update public.profiles set point_balance = points where point_balance = 0 and points > 0;

-- These four columns are deliberately NOT added to the column-level INSERT/UPDATE grants from
-- 20260930120000, so a signed-in client cannot write them. If that migration has not been
-- applied (it must be, first), the table-level grant would still allow it - so fail loudly.
do $$
begin
  if has_column_privilege('authenticated', 'public.profiles', 'points', 'UPDATE') then
    raise exception 'Apply 20260930120000_harden_rls_server_authoritative_scoring.sql first: profile score columns are still client-writable';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'point_balance', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'title', 'UPDATE') then
    raise exception 'point_balance/title must not be client-writable';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Earning: collecting a round's points also credits the balance.
-- ---------------------------------------------------------------------------
-- Same function as 20260930120000 with one more column in the UPDATE. Still the only path that
-- can add to a player's score, still only the caller's own share, still exactly once.
-- Edge cases: raises if unauthenticated, the result doesn't exist, or the round isn't finalized.
-- No-op if the caller already applied it or didn't take part. The applied_by marker is written
-- with a guard and checked, so two simultaneous calls from the same player cannot both credit.
create or replace function public.apply_group_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  r public.group_results;
  mine jsonb;
  pts int;
  oc text;
  marked int;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into r from public.group_results where id = p_result_id;
  if not found then
    raise exception 'No such result';
  end if;
  if r.status <> 'finalized' then
    raise exception 'Round is not finalized';
  end if;
  if caller = any(r.applied_by) then
    return;  -- already applied for this caller; idempotent
  end if;

  select e into mine
    from jsonb_array_elements(r.placements) e
    where (e->>'playerId')::uuid = caller
    limit 1;
  if mine is null then
    return;  -- caller didn't participate in this round
  end if;

  -- Claim first, pay second: only the call that actually adds the marker goes on to credit.
  update public.group_results
     set applied_by = array_append(applied_by, caller)
   where id = p_result_id and not (caller = any(applied_by));
  get diagnostics marked = row_count;
  if marked = 0 then
    return;
  end if;

  pts := (mine->>'pointsAwarded')::int;
  oc  := mine->>'outcome';

  update public.profiles
     set points = points + pts,
         monthly_points = monthly_points + pts,
         point_balance = point_balance + pts,
         wins = wins + (case when oc = 'win' then 1 else 0 end),
         losses = losses + (case when oc = 'loss' then 1 else 0 end),
         draws = draws + (case when oc = 'draw' then 1 else 0 end)
   where id = caller;
end;
$$;

revoke execute on function public.apply_group_result(uuid) from public, anon;
grant execute on function public.apply_group_result(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The catalog and what each player owns.
-- ---------------------------------------------------------------------------
create table if not exists public.shop_items (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null check (kind in ('title', 'name_color', 'card_border')),
  -- What the shop calls it.
  name text not null check (length(btrim(name)) > 0),
  -- What wearing it puts on the profile: the title text, a "#RRGGBB" colour, or a border key.
  value text not null check (length(btrim(value)) > 0),
  description text not null default '',
  price integer not null check (price >= 0),
  sort_order integer not null default 0,
  -- Turning an item off hides it from the shop and stops new purchases; anyone who already
  -- owns it keeps it and can still wear it.
  is_active boolean not null default true,
  -- Early-supporter items: when set, only a profile created before this moment can get it.
  joined_before timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, value)
);

create table if not exists public.shop_purchases (
  player_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null references public.shop_items (id) on delete restrict,
  price_paid integer not null check (price_paid >= 0),
  purchased_at timestamptz not null default now(),
  primary key (player_id, item_id)
);

alter table public.shop_items enable row level security;
alter table public.shop_purchases enable row level security;

-- Read-only for clients. Items are added and priced in Studio / by migration (service role).
revoke all on public.shop_items from anon, authenticated;
revoke all on public.shop_purchases from anon, authenticated;
grant select on public.shop_items to authenticated;
grant select on public.shop_purchases to authenticated;

drop policy if exists "shop_items_select_authenticated" on public.shop_items;
create policy "shop_items_select_authenticated"
  on public.shop_items for select
  to authenticated
  using (true);

-- A player sees only their own purchases. What someone is wearing is public (it is on their
-- profile); what they have bought and not worn is their own business.
drop policy if exists "shop_purchases_select_own" on public.shop_purchases;
create policy "shop_purchases_select_own"
  on public.shop_purchases for select
  to authenticated
  using (auth.uid() = player_id);

-- ---------------------------------------------------------------------------
-- 4. Buying and wearing.
-- ---------------------------------------------------------------------------

-- Buys one item for the caller with their own points. Returns their balance afterwards.
-- Edge cases: raises if unauthenticated, the caller has no profile, the item doesn't exist or
-- has been turned off, it is an early-supporter item and the caller joined too late, or they
-- can't afford it. Buying something already owned charges nothing and returns the balance
-- unchanged, so a double tap or a retry after a dropped response can never charge twice. The
-- caller's profile row is locked first, so two purchases at the same instant are handled one
-- after the other and cannot both spend the same points. The price charged is the catalog's
-- price at that moment, never anything sent by the client.
create or replace function public.purchase_shop_item(p_item_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  me public.profiles;
  item public.shop_items;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into me from public.profiles where id = caller for update;
  if not found then
    raise exception 'No profile';
  end if;

  select * into item from public.shop_items where id = p_item_id;
  if not found then
    raise exception 'No such item';
  end if;

  if exists (select 1 from public.shop_purchases where player_id = caller and item_id = item.id) then
    return me.point_balance;  -- already owned: nothing to charge
  end if;

  if not item.is_active then
    raise exception 'This item is no longer available';
  end if;
  if item.joined_before is not null and me.created_at >= item.joined_before then
    raise exception 'This item was only for early supporters';
  end if;
  if me.point_balance < item.price then
    raise exception 'Not enough points';
  end if;

  update public.profiles set point_balance = point_balance - item.price where id = caller;
  insert into public.shop_purchases (player_id, item_id, price_paid) values (caller, item.id, item.price);

  return me.point_balance - item.price;
end;
$$;

-- Puts on (or takes off) one of the caller's own items. p_item_id NULL takes off whatever is
-- worn in that slot.
-- Edge cases: raises if unauthenticated, the kind isn't one of the three slots, the item doesn't
-- exist, it belongs to a different slot, or the caller doesn't own it. An item that has since
-- been turned off can still be worn by someone who owns it. Wearing what is already worn, or
-- taking off an empty slot, changes nothing.
create or replace function public.equip_shop_item(p_kind text, p_item_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  item public.shop_items;
  new_value text := null;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;
  if p_kind is null or p_kind not in ('title', 'name_color', 'card_border') then
    raise exception 'Unknown item slot';
  end if;

  if p_item_id is not null then
    select * into item from public.shop_items where id = p_item_id;
    if not found then
      raise exception 'No such item';
    end if;
    if item.kind <> p_kind then
      raise exception 'That item does not go in this slot';
    end if;
    if not exists (select 1 from public.shop_purchases where player_id = caller and item_id = item.id) then
      raise exception 'You do not own this item';
    end if;
    new_value := item.value;
  end if;

  if p_kind = 'title' then
    update public.profiles set title = new_value where id = caller;
  elsif p_kind = 'name_color' then
    update public.profiles set name_color = new_value where id = caller;
  else
    update public.profiles set card_border = new_value where id = caller;
  end if;
end;
$$;

revoke execute on function public.purchase_shop_item(text) from public, anon;
revoke execute on function public.equip_shop_item(text, text) from public, anon;
grant execute on function public.purchase_shop_item(text) to authenticated;
grant execute on function public.equip_shop_item(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The opening catalog. Text, colour, and border styles only - no artwork needed.
-- ---------------------------------------------------------------------------
-- A casual night earns roughly 50-100 points, so the cheapest things cost one night.
-- Re-running this leaves existing rows (and any price changed in Studio) alone.
-- The early-supporter cutoff below is a placeholder date: move it in Studio when beta ends.
insert into public.shop_items (id, kind, name, value, description, price, sort_order, joined_before) values
  -- Early supporters: free, but only for profiles created before the cutoff.
  ('title-beta-tester',      'title', 'Beta Tester',      'Beta Tester',      'For everyone who played PlayLink before it was finished.', 0, 10, timestamptz '2027-01-01 00:00:00+00'),
  ('title-founding-player',  'title', 'Founding Player',  'Founding Player',  'You were here at the very start.',                          0, 11, timestamptz '2027-01-01 00:00:00+00'),
  ('title-i-was-here-first', 'title', 'I Was Here First', 'I Was Here First', 'Bragging rights, permanently.',                           100, 12, timestamptz '2027-01-01 00:00:00+00'),
  ('border-founder',         'card_border', 'Founder''s Border', 'founder',   'A gold-and-white border for early supporters.',             0, 10, timestamptz '2027-01-01 00:00:00+00')
on conflict (id) do nothing;

insert into public.shop_items (id, kind, name, value, description, price, sort_order) values
  -- Titles: one night of play.
  ('title-pod-regular',        'title', 'Pod Regular',           'Pod Regular',           'Shows up. Shuffles up.',                         50, 100),
  ('title-casual-enjoyer',     'title', 'Casual Enjoyer',        'Casual Enjoyer',        'Here for a good time.',                          50, 101),
  ('title-land-go',            'title', 'Land, Go',              'Land, Go',              'A complete turn, honestly.',                     50, 102),
  ('title-mana-screwed',       'title', 'Mana Screwed',          'Mana Screwed',          'Two lands. Still two lands.',                    50, 103),
  ('title-mana-flooded',       'title', 'Mana Flooded',          'Mana Flooded',          'Fourteen lands and a dream.',                    50, 104),
  ('title-one-more-turn',      'title', 'Just One More Turn',    'Just One More Turn',    'You had it next turn. Everyone knows.',          50, 105),
  ('title-forgot-my-trigger',  'title', 'Forgot My Trigger',     'Forgot My Trigger',     'Wait, go back.',                                 50, 106),
  ('title-whose-turn',         'title', 'Whose Turn Is It?',     'Whose Turn Is It?',     'It was yours. It has been for a while.',         50, 107),
  ('title-shuffles-too-long',  'title', 'Shuffles Too Long',     'Shuffles Too Long',     'Thorough. Very thorough.',                       50, 108),
  ('title-snack-bringer',      'title', 'Snack Bringer',         'Snack Bringer',         'The real MVP of every pod.',                     50, 109),
  ('title-borrowed-this-deck', 'title', 'Borrowed This Deck',    'Borrowed This Deck',    'What does this card do?',                        50, 110),
  ('title-never-has-lands',    'title', 'Never Has Lands',       'Never Has Lands',       'Keeps the one-lander anyway.',                   50, 111),
  -- Titles: table reputation.
  ('title-table-politician',   'title', 'Table Politician',      'Table Politician',      'Every deal is a good deal for you.',            100, 200),
  ('title-kingmaker',          'title', 'Kingmaker',             'Kingmaker',             'Can''t win. Decides who does.',                 100, 201),
  ('title-not-the-threat',     'title', 'Not the Threat',        'Not the Threat',        'Look at their board, not mine.',                100, 202),
  ('title-the-threat',         'title', 'Definitely the Threat', 'Definitely the Threat', 'At least you''re honest about it.',             100, 203),
  ('title-its-just-a-seven',   'title', 'It''s Just a Seven',    'It''s Just a Seven',    'Every deck is a seven.',                        100, 204),
  ('title-pay-the-one',        'title', 'Do You Pay the One?',   'Do You Pay the One?',   'Asked every single time.',                      100, 205),
  ('title-mulligan-merchant',  'title', 'Mulligan Merchant',     'Mulligan Merchant',     'Going to five and feeling fine.',               100, 206),
  ('title-rules-lawyer',       'title', 'Rules Lawyer',          'Rules Lawyer',          'Well, actually.',                               100, 207),
  ('title-precon-hero',        'title', 'Precon Hero',           'Precon Hero',           'Straight out of the box.',                      100, 208),
  ('title-budget-brewer',      'title', 'Budget Brewer',         'Budget Brewer',         'Winning with bulk rares.',                      100, 209),
  -- Titles: playstyle.
  ('title-archenemy',          'title', 'Archenemy',             'Archenemy',             'Three against one. Good odds.',                 150, 300),
  ('title-board-wiper',        'title', 'Board Wiper',           'Board Wiper',           'If you can''t have nice things, nobody can.',   150, 301),
  ('title-combo-player-sorry', 'title', 'Combo Player (Sorry)',  'Combo Player (Sorry)',  'It''s a two-card combo. Deterministic.',        150, 302),
  ('title-removal-magnet',     'title', 'Removal Magnet',        'Removal Magnet',        'Nothing you play survives a turn.',             150, 303),
  ('title-group-hug',          'title', 'Group Hug',             'Group Hug',             'Everybody draws. Everybody is happy.',          150, 304),
  ('title-chaos-agent',        'title', 'Chaos Agent',           'Chaos Agent',           'Nobody knows what is happening, least of all you.', 150, 305),
  ('title-top-deck-wizard',    'title', 'Top-Deck Wizard',       'Top-Deck Wizard',       'Exactly the card you needed. Again.',           150, 306),
  -- Titles: prestige.
  ('title-pod-captain',        'title', 'Pod Captain',           'Pod Captain',           'Somebody has to organise this.',                250, 400),
  ('title-store-champion',     'title', 'Store Champion',        'Store Champion',        'Known at the counter.',                         250, 401),
  ('title-table-tyrant',       'title', 'Table Tyrant',          'Table Tyrant',          'The pod plays around you.',                     250, 402),
  ('title-the-final-boss',     'title', 'The Final Boss',        'The Final Boss',        'Everyone else is just a side quest.',           400, 403),
  ('title-local-legend',       'title', 'Local Legend',          'Local Legend',          'They tell stories about your plays.',           600, 404),
  ('title-living-legend',      'title', 'Living Legend',         'Living Legend',         'For players who never stop showing up.',       1200, 405),
  -- Name colours. All chosen to read on both the dark and the light theme.
  ('color-ember',    'name_color', 'Ember',    '#FF6B4A', 'A warm red-orange.',    150, 100),
  ('color-sky',      'name_color', 'Sky',      '#3D9BFF', 'A clear blue.',         150, 101),
  ('color-emerald',  'name_color', 'Emerald',  '#2FBF71', 'A rich green.',         150, 102),
  ('color-violet',   'name_color', 'Violet',   '#A070FF', 'A soft purple.',        150, 103),
  ('color-rose',     'name_color', 'Rose',     '#F0609A', 'A bright pink.',        150, 104),
  ('color-teal',     'name_color', 'Teal',     '#1FB5A8', 'Somewhere between blue and green.', 150, 105),
  ('color-amber',    'name_color', 'Amber',    '#F29A1F', 'A deep orange-yellow.', 250, 106),
  ('color-crimson',  'name_color', 'Crimson',  '#E5484D', 'A serious red.',        250, 107),
  ('color-gold',     'name_color', 'Gold',     '#D9A520', 'For those who have earned it.', 600, 108),
  -- Card borders. The value is a style key the app draws (BORDER_STYLES in src/data/shop.ts).
  ('border-obsidian', 'card_border', 'Obsidian', 'obsidian', 'A heavy dark-steel border.',          150, 100),
  ('border-bronze',   'card_border', 'Bronze',   'bronze',   'A solid bronze border.',              200, 101),
  ('border-silver',   'card_border', 'Silver',   'silver',   'A polished silver border.',           350, 102),
  ('border-ember',    'card_border', 'Ember',    'ember',    'Red inside gold.',                    500, 103),
  ('border-arcane',   'card_border', 'Arcane',   'arcane',   'Purple inside blue.',                 500, 104),
  ('border-verdant',  'card_border', 'Verdant',  'verdant',  'Green inside teal.',                  500, 105),
  ('border-gold',     'card_border', 'Gold',     'gold',     'The one everybody notices.',          900, 106)
on conflict (id) do nothing;
