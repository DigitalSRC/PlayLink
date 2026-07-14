# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this branch is

The standalone alpha landing page for **PlayLink**, a Silvenari product. This is *not* the app
itself — the app's source lives on this same repo's `development`/`main` branches. This branch is
just a static marketing site: one `index.html`, no build step, deployed via GitHub Pages.

**This branch is an intentional orphan** — it shares no commit history with `development` or
`main`, and it isn't part of this repo's feature-branch workflow (`docs/version-control-workflow.md`
describes that system; it doesn't apply here — this branch is never meant to merge into
`development`/`main`, and `development`/`main` are never meant to merge into it). It exists as its
own independent thing sharing a remote with the app for convenience, not as a feature under
development.

Before writing or editing any marketing copy that describes specific app functionality (a feature
name, how something behaves, what's actually implemented vs. planned), check the app source for
ground truth rather than inventing or assuming behavior — this branch has a history of drifting
into overpromising (e.g. listing games as "live in the alpha" when only Magic Commander was
actually in development). If a feature exists in code but is stubbed/incomplete (not actually wired
up end-to-end), don't market it as working. To check: `git worktree add ../PlayLink-dev-check
development` (or `main`) from a clone of this repo, or just `git show development:<path>` for a
single file, rather than switching this worktree's own branch away from `LandingPage`.

## Supabase backend

This landing page's signup form writes to a Supabase project that is **shared with the main
PlayLink app** — same project, two branches of the same repo, two separate migration histories.
This branch only owns the `alpha_signups` table and its supporting function; everything else in
that database (profiles, rival system, etc.) belongs to the app's `development`/`main` branches,
which have their own separate `supabase/migrations` history.

Schema changes for this branch live in `supabase/migrations/`, applied via the Supabase CLI (already
linked to project `vuleighklamwupryxyjj` — `supabase link` was already run, credentials live in the
CLI's own local config, not in this branch). **Do not run `supabase db push`** — this project's
remote migration history includes ~7 migrations that belong to the app's `development`/`main`
branches and aren't present here, and `db push` wants to reconcile the *entire* history, which
risks corrupting that bookkeeping. Instead, for a new schema change:

1. Write the new file as `supabase/migrations/<timestamp>_<name>.sql` (timestamp format
   `YYYYMMDDHHMMSS`, must sort after the existing files).
2. Apply it directly: `supabase db query --linked -f supabase/migrations/<file>.sql`
3. Mark just that one version as tracked: `supabase migration repair --status applied <timestamp>`
   (this only touches the specified version's bookkeeping row — safe to use for this branch's own
   migrations, but never run `migration repair --status reverted` against the app's migration
   versions).

## What it's for

PlayLink's core pitch: the players you'd want to play with — Magic, Pokémon TCG, Lorcana, One
Piece TCG, and eventually board games/TTRPGs — are already near you (or near wherever you happen
to be), but there's nothing that tells you they're there. This site exists to test that pitch
before/while the app is built: collect an alpha waitlist, see what messaging actually gets people
to hand over an email, and recruit a real first cohort of testers.

## Competitive landscape

Researched 2026-07. This space is more crowded than it first looks — don't market PlayLink as
having no competition.

- **playgroup.gg** — EDH stat-tracker first (life totals, ELO leaderboards, per-deck analytics),
  but its marketing explicitly advertises a "Find a Playgroup" local map. Closest real overlap.
- **playirl.gg** — free, solo-built, explicitly **not monetizing** MTG event/schedule aggregator
  (pulls from WotC's own locator, TopDeck.gg, and local Discords into one list/calendar/map,
  filterable by format/distance/date), currently in Beta, with a Discord bot that auto-posts
  nearby events to servers. This is a **different mechanism** from PlayLink, not just a smaller
  version of it: it answers "where/when is organized Magic happening near me," not "which specific
  players near me match my bracket, format, and house rules." Don't flatten this distinction —
  event discovery and player-to-player pod matching are genuinely separate problems.
- **EDHmeetup, Nerd Culture, MTG Finder, the official Wizards Store & Event Locator, Meetup's MTG
  groups** — all still active. More options exist here than "no one does this."
- At least one prior tool in this niche ("SpiceRack," per a Reddit mention) has folded. Worth
  keeping in mind — this space isn't risk-free just because it's under-served.
- **PlayLink's actual differentiation**: local-discovery-first (not bolted onto a stat tracker or
  event calendar), cross-game by design even though Commander ships first, and real
  seat-filling/matchmaking (bracket/format/house-rule filtering) — vs. a static directory, map, or
  events list.
- **Noted for the app's own branches, not this one**: playirl.gg's traction (an actively-engaged
  r/magicTCG launch thread, real iteration in public) validates that event aggregation is a
  genuinely useful *adjacent* feature, separate from PlayLink's core player-matching. There's an
  open idea to add this to PlayLink itself eventually — see `docs/roadmap-ideas.md` on
  `development`. This note just preserves the signal so it isn't lost.

## The core strategic problem: this is a cold-start / liquidity product

PlayLink only delivers value once there's a critical mass of nearby players in the same game and
bracket. A single signup in Ohio and another in Oregon don't make either of their apps useful —
**density in one place matters more than raw signup count spread everywhere.** Every marketing and
testing decision below should be weighed against "does this concentrate players somewhere, or just
scatter them?" Broad, diffuse awareness (a viral tweet, a random subreddit blast) is worth much
less right now than 20 signups clustered in one city or one campus.

Practical implication: **seed one or two small, dense areas first** (the developer's own city, a
local game store, a college tabletop club) before spending effort on broad reach. A landing page
visit from someone with no local density to match into isn't worth much yet.

## Marketing channels worth trying, roughly in priority order

1. **High-touch, in-person, local first.** Talk to local game store (LGS) owners about a flyer/QR
   code at the counter. Show up to an existing Commander night, Pokémon league night, or D&D one-shot
   and hand-recruit a few real players. This is slow but produces real, high-quality signal and a
   genuine first pod to test against — far more valuable early on than volume.
2. **College/university tabletop gaming clubs.** Dense, enthusiastic, physically concentrated,
   usually looking for more organized play — a good match for the density problem above.
3. **Game-specific online communities**, framed around the local-discovery hook rather than generic
   app spam: r/EDH, r/magicTCG, r/CompetitiveEDH, r/pkmntcg, r/Lorcana, r/OnePieceTCG, plus regional/LGS
   Discord servers.
4. **Local-community channels** (city subreddits, local Facebook groups, Meetup.com groups) — these
   fit the "discovering your own city's players" half of the pitch directly.
5. **Organic/shareable content.** The hook ("someone a few miles from you is playing a game you want
   to be playing") is written to work as a short social post or video on its own — worth testing as
   a TikTok/Instagram/X post that drives to this landing page, separate from the LGS/community outreach.
6. **Referral framing.** Because the app is inherently social (nobody plays alone), alpha invites
   should ask people to bring their existing pod/group rather than just themselves — this seeds
   complete, ready-to-play groups instead of isolated individuals waiting for a match.
7. **SEO / organic search (low priority, passive).** The page's `<title>`/meta description/on-page
   copy are tuned for real search phrases ("magic the gathering groups near me," "find EDH pod near
   me," etc.), but a brand-new page with zero backlinks won't meaningfully rank against the
   established players in the competitive landscape above (Wizards' own locator, Meetup) any time
   soon. This is baseline hygiene, not an active channel — don't let it substitute for 1–6 above.

## Signup capture — current state

The email form writes directly to Supabase (`alpha_signups` table — see the Supabase backend
section above), capturing email (required), and optional city/state (geocoded via OpenStreetMap
Nominatim, restricted to North America), game votes, and a free-text suggestion box. UTM params are
captured automatically for channel attribution. There are two entry points on the page: a
minimal email-only form in the hero, and a fuller form near the bottom with the optional fields —
submitting either one syncs the success/error state to both.

## Testing plan for building a real user base

1. Run the high-touch/local channels first and watch for geographic clustering in signups.
2. Once ~10-20 signups exist clustered in one city or campus, reach out directly and organize an
   actual pod/session with them — this is the real alpha test, not the landing page itself.
3. Treat that first cohort as testers, not just users: ask them directly what almost stopped them
   from signing up, and what almost stopped them from showing up to the first session.
4. Only expand to a second geographic cluster once the first one has an actual recurring pod
   running — resist spreading thin across many cities before any single one has liquidity.

## Track these metrics

- Total signups (vanity metric — least important on its own).
- Geographic clustering of signups (most important — tells you where a real test is possible).
- Signups by game/bracket (tells you which community to prioritize recruiting into first).
- Conversion by channel (which of the channels above is actually producing signups, not just traffic).
