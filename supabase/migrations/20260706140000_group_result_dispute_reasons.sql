-- disputeGroupResult previously only recorded the disputing player's id in disputed_by, with no
-- reason or comment captured anywhere - the host had no visibility into *why* a round was
-- flagged. dispute_reasons is a jsonb object keyed by disputing player id (mirrors disputed_by's
-- one-id-per-disputer shape) rather than a separate table, since nothing here needs a relational
-- join, just "give me this round's dispute reasons as a unit" - same reasoning as placements.
alter table public.group_results
  add column dispute_reasons jsonb not null default '{}'::jsonb;
