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

## Cosmetics beyond titles: banners and earned badges

**Source:** the developer, after play-testing the Shop on 2026-10-08.

Titles should feel like Overwatch's: a short line under the player's name on their card, picked
from a collection. That part exists (the Shop sells them; the Profile tab's "Your Title" section
switches between the ones a player owns). Wanted next, not built:

- **Banners** - a background for the player's card, alongside the title, name color, and border.
- **Badges you earn** - awarded for doing things rather than bought. The milestone tiles on the
  Stats tab (First Win, 10 Wins, 100 Points, ...) are the obvious starting set; today they are
  computed on the phone and shown only to the player themselves.

Earned badges would need a server-side record of what each player has earned, written by the same
kind of function that pays points, so a badge can be shown on someone else's profile and can't be
forged. A banner needs artwork or a generated pattern, which the text-and-color-only shop has
avoided so far.
