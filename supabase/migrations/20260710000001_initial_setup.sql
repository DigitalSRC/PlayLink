-- PlayLink alpha landing page: signup capture
-- Run this once in the Supabase SQL Editor for your existing PlayLink project.

create table public.alpha_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique,
  location text,
  games text[],
  utm_source text,
  utm_medium text,
  utm_campaign text
);

-- Lock the table down: anon key can only INSERT, never read other people's rows.
alter table public.alpha_signups enable row level security;

create policy "Allow public insert"
  on public.alpha_signups
  for insert
  to anon
  with check (true);

-- Expose a count-only RPC so the landing page can show a real "N players on the list"
-- number without ever exposing individual signup rows to the anon key.
-- (A plain view here would trip Supabase's "Security Definer View" lint warning,
-- since it has to bypass RLS on the base table to compute the count. A SECURITY DEFINER
-- function with a locked-down search_path is the supported way to do the same thing safely.)
create or replace function public.alpha_signup_count()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.alpha_signups;
$$;

revoke all on function public.alpha_signup_count() from public;
grant execute on function public.alpha_signup_count() to anon;
