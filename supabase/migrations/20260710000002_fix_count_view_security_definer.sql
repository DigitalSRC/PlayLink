-- Run this once to fix the "Security Definer View" warning from the initial setup.
-- Replaces the flagged view with a locked-down function that does the same job.

drop view if exists public.alpha_signup_count;

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
