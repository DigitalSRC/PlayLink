-- profiles: one row per Supabase auth user, keyed 1:1 by auth.users.id.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  is_developer boolean not null default false,
  location text not null default '',
  games text[] not null default '{}',
  preferred_formats jsonb not null default '{}'::jsonb,
  brackets integer[] not null default '{}',
  no_go text[] not null default '{}',
  wins integer not null default 0,
  losses integer not null default 0,
  points integer not null default 0,
  monthly_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive username uniqueness.
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- Keep updated_at current on every row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Row Level Security: a user may only read/write their own row.
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No delete policy: account deletion is out of scope for this branch.
