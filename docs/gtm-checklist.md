# Go-to-market checklist (alpha landing page)

A living, checkable action list — check items off as they actually happen, add new ones as they
come up. The *strategy and reasoning* behind these lives in the `LandingPage` branch's `CLAUDE.md`
(cold-start/density philosophy, channel priority, testing plan, metrics); this file is just the
dated, concrete to-do list version of it, tracked over time.

## Before outreach — finalize the landing page

- [x] Correct game-scope claims: only MTG Commander is actually in development (2026-07-10)
- [x] Restrict location autocomplete to North America (2026-07-13)
- [x] Add competitive-landscape awareness to `CLAUDE.md` (2026-07-13)
- [x] SEO pass on `<title>`/meta description/keywords/og tags (2026-07-13)
- [ ] Anything else that still feels unfinished before pushing outreach hard

## Week 1 — high-touch, in-person (primary channel)

- [ ] Visit the specific LGS/Commander night already identified. Don't just leave a flyer —
      talk to 5–10+ real players directly. Ask what they currently do to find games, what's
      actually painful about it, what they've already tried. Don't lead them.
- [ ] Ask the store owner about a counter flyer/QR code linking to this page
- [ ] Note down anything that comes up repeatedly — that's the real signal, not the signup count

## Week 1 — Discord communities (secondary, after the above)

- [ ] Share the landing page in 1–2 relevant Discord servers, framed around local discovery
      (not generic app-spam) per the `LandingPage` branch's channel guidance
- [ ] Consider r/EDH / r/magicTCG / r/CompetitiveEDH per that same channel list — same framing

## Week 2 — follow up on whoever signed up

- [ ] Once signups exist, check for geographic clustering (Supabase `alpha_signups` table)
- [ ] If ~10-20 cluster in one place, reach out directly and organize a real pod/session —
      that's the actual alpha test, not the landing page itself
- [ ] Ask that first cohort directly: what almost stopped you from signing up? What almost
      stopped you from showing up?

## Ongoing discipline

- [ ] Don't expand to a second city/channel until the first cluster has a real, recurring pod —
      easiest mistake to make when eager for more signups; resist it
- [ ] Track: total signups (least important), geographic clustering (most important), signups by
      game/bracket, conversion by channel

## Deferred / not now

- Donate or support-payment button — the page's job right now is testing whether people will
  hand over an email at all; a payment ask undercuts the "No credit card" trust signal and adds
  legal/processor complexity for a pre-launch alpha. Revisit once there's a real beta to charge for.
