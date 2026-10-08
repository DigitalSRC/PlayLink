# Roadmap ideas / backlog

Ideas and follow-ups surfaced outside normal feature work, captured here so they aren't lost.
Not prioritized or scheduled — just a holding pen until someone decides to act on them.

## Event aggregation (adjacent to core player-matching)

**Source:** competitive research done in `playlink-landing` (2026-07) while working on the alpha
landing page. See that repo's `CLAUDE.md` → "Competitive landscape" section for full context.

**What:** playirl.gg (a free, solo-built MTG event/schedule aggregator — pulls organized-event
listings from Wizards' own locator, TopDeck.gg, and local Discords into one searchable
list/calendar/map, filterable by format/distance/date) got real organic traction on its r/magicTCG
launch thread — active engaged users, real iteration in public. That validates event aggregation
("where/when is organized Magic happening near me") as a genuinely useful feature.

**Why it's separate from what PlayLink already does:** PlayLink's core loop is player-to-player pod
matching (who you'd want to play *with*, filtered by bracket/format/house-rules) — event discovery
(where organized store events are happening) is a different mechanism that could complement it,
not replace it. Worth exploring as an eventual addition, not a v1 requirement.

**Open questions, not yet decided:** would this be PlayLink-native event listings only, or aggregate
from external sources like playirl.gg does; does it make sense before or after Commander alpha
ships; is there a partnership/data-sharing angle instead of building a scraper from scratch.

## Known stub: "Familiar Foe" rival tier is UI-only, never computed

**Source:** found while auditing the app for accurate landing-page copy about the Rival system
(2026-07) — see `src/app/(tabs)/home.tsx`, `src/app/player-profile.tsx`, and `AppContext.tsx`
(`mostPlayedAgainst` / `setMostPlayedAgainst`).

The "Familiar Foe" / "MOST PLAYED" rival tier has full UI treatment (purple accent, badge, avatar
styling) on both Home and Profile screens, but the underlying stat is never actually computed
anywhere in the codebase except being reset to `null` on logout. Either finish the computation
(most-played-against opponent) or remove the UI until it's real — currently it's a dead tier that
will just never show up for any user.
