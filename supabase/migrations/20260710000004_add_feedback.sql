-- Run this once to add the optional "what would make you use this" free-text field.

alter table public.alpha_signups
  add column if not exists feedback text;
