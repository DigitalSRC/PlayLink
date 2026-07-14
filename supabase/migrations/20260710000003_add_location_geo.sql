-- Run this once to add precise coordinates for signups, now that the
-- location field is validated against real places via Nominatim autocomplete.
-- The `location` text column already exists and keeps the human-readable name.

alter table public.alpha_signups
  add column if not exists lat double precision,
  add column if not exists lon double precision;
