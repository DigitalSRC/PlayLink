# PlayLink Version Control Workflow

**Status:** Active
**Applies to:** every contributor and every AI assistant session working in this repository.

This document is the authoritative reference for how branches, testing, and releases work
in PlayLink. `CLAUDE.md` summarizes the mandatory rules for AI-assisted sessions; this
document is the full, detailed reference those rules point back to.

---

## 1. Guiding principle

**`main` is the product.** It is what ships to MVP testers and, later, real users. Every
other branch exists to protect `main` from unfinished, untested, or unreviewed work.

> `main` only ever changes when a human developer explicitly says "cut a release." Never
> as a side effect of finishing a feature, never as a side effect of tests passing, and
> never automatically by an AI assistant. If in doubt, don't touch `main` — ask first.

---

## 2. Branch tiers

```
main                    Release only. Tagged at every release (e.g. v0.1.0-mvp).
  ↑  explicit release approval only
development             Integration branch. Everything destined for production
  │                      lands here once its tests pass AND a developer has
  │                      explicitly confirmed it's ready. Never shippable on its
  │                      own — it's the front of the queue, not the release.
  ↑  merge only after tests pass on test/<feature> AND explicit developer confirmation
<feature>                Top-level feature branch, forked from development.
  │                       Named after the feature itself — no "feature/" prefix
  │                       at this tier (e.g. life-counter, rival-system, shop).
  ↑  merge
feature/<function>      Sub-branch of a top-level feature branch, forked from
                          it, named after the specific piece of work (e.g.
                          feature/rotate-button off life-counter). Merges back
                          into the top-level feature branch it came from.

Parallel testing lane:
unitTests                Kept up to date with development at all times.
  +  <feature>           Latest state of the feature branch being tested.
  =  test/<feature>       A merge of the two above, created fresh whenever a
                            feature is ready for testing (e.g. test/life-counter).
                            Tests are written and run here.
```

**Where each tier lives** (§2.9): branches a team shares live on `origin` — `main`,
`development`, `unitTests`, the `LandingPage` deployment branch, and every in-progress
top-level `<feature>` branch. Branches one person owns stay local and are never pushed —
`feature/<function>` and `test/<feature>`.

### 2.1 `main` — release only

- Never commit directly.
- Never merge into it without the developer explicitly asking for a release cut.
- Tag every release point (`v0.1.0-mvp`, `v0.2.0-mvp`, `v1.0.0-beta`, ...) so any past release
  can be found by name, not by digging through `development`'s history.
- Contains no in-progress feature work, no testing scaffolding, nothing unreviewed.

### 2.2 `development` — integration branch

- Everything that has passed its `test/<feature>` cycle **and** has been explicitly
  confirmed ready by the developer (or another developer) lands here. A green
  `test/<feature>` run is necessary but not sufficient by itself — do not merge into
  `development` just because tests passed. Wait for the explicit go-ahead, then merge.
- This is what the old two-tier model called `main`. If you see references to "merge to
  main" in older commit messages or muscle memory, they mean `development` now.
- Still not committed to directly — even integration-ready work arrives via a merge from
  a completed `test/<feature>` cycle (after confirmation), not a direct commit.
- Branches still fork *from* `development` as normal (see §2.3) — the confirmation
  requirement above governs what's allowed to merge back *into* `development`, not where
  new top-level feature branches originate.
- Contains no test files — see §2.6.

### 2.3 Top-level feature branches — `<feature-name>`, no prefix

- Forked from the current tip of `development`.
- Named exactly after the feature: `life-counter`, `shop`. Not
  `feature/life-counter` — the bare name is the branch at this tier.
- Long-lived for as long as the feature is under active development. Not deleted when
  work pauses; picked back up later from wherever it was left.
- **Owned by a team and shared on `origin`.** Pushed as soon as it's created
  (`git push -u origin <feature>`) so everyone on the team can pull it and merge their pieces in.
  Deleted from `origin` once it merges into `development` (§2.9).
- All work on that feature happens either directly here for small changes, or via
  sub-branches (below) for anything substantial enough to want its own history.

### 2.4 Sub-feature branches — `feature/<specific-function>`

- Forked from the top-level feature branch (e.g. `feature/rotate-button` off
  `life-counter`), not from `development` and never from `main`.
- Scoped to one specific piece of work within the feature.
- Merges back into its parent top-level feature branch when done; the merged team branch is
  then pushed.
- **Owned by one person and local-only.** Never pushed. Each team member works on their own
  piece in their own `feature/<function>` branch.

### 2.5 Testing lane — `unitTests` and `test/<feature>`

- `unitTests` is a standing branch, kept up to date with `development` (merge
  `development` into it regularly, especially before starting a new `test/<feature>`
  cycle).
- When a top-level feature branch is ready to be tested, create `test/<feature>` as a
  merge of `unitTests` (latest) and `<feature>` (latest) — e.g. `test/life-counter` =
  `unitTests` + `life-counter`.
- `unitTests` lives on `origin`: `git pull` it before syncing, and `git push origin unitTests`
  after every sync or test merge-back. `test/<feature>` is local-only and never pushed.
- Write and run tests on `test/<feature>`.
  - **Tests pass:** merge the new/updated tests back into `unitTests`. This does **not**
    by itself put the feature into `development` — passing tests only clears the way to
    ask. Merging `<feature>` into `development` additionally requires the developer (or
    another developer) to explicitly confirm the feature is ready. Only after that
    confirmation, merge `<feature>` into `development` (stripping any test files first —
    see §2.6).
  - **Tests fail:** development continues on `<feature>` (and its `feature/*`
    sub-branches) to fix the issues. `test/<feature>` is recreated (or updated) from the
    fixed `<feature>` branch and the cycle repeats. `development` is not touched until
    tests pass.
- Testing and feature development happen in tandem, not sequentially — you don't have to
  fully "finish" a feature before starting to test parts of it; `test/<feature>` just has
  to be recreated from the latest `<feature>` tip each time you want a fresh test pass.

### 2.6 No test files on `development` or `main`

- `development` and `main` never contain test files (`*.test.ts` or any other test-suite
  file). `unitTests` and `test/<feature>` are the only branches where test files are
  allowed to exist.
- This applies retroactively as well as going forward: if a test file is ever found on
  `development` or `main`, remove it in a dedicated commit rather than leaving it in
  place "because it's already there."
- When merging a feature into `development` (step 2.2/2.5), check the merge doesn't
  reintroduce test files that only belong on `unitTests`/`test/<feature>` — strip them
  from the feature branch's merge if needed.
- `npm test` / `npx jest ...` are therefore only meaningful when run on `unitTests` or a
  `test/<feature>` branch — running them on `development` or `main` will find nothing to
  run.
- **Never place a test file inside `src/app/`, even on `unitTests`/`test/<feature>`.**
  `src/app/` is Expo Router's scanned root — a `*.test.tsx` file there gets bundled into the
  real app (not just picked up by Jest), pulling in test-only packages that break the actual
  bundle (`@testing-library/react-native` imports Node's `console` module, which the RN/web
  runtime doesn't have). Every other test file in this repo is colocated with its source
  (`src/utils/`, `src/lib/`) precisely because those directories aren't scanned by the router;
  screen tests need a different home — `src/__tests__/app/<screen>.test.tsx` (Jest's default
  `testMatch` already covers `__tests__/` directories anywhere, so this needs no config change).

### 2.7 Syncing `unitTests` with `development` — never let it fast-forward

`development`'s history contains commits whose entire purpose is stripping unitTests-exclusive
content out of `development` specifically: `src/app/dev-tools.tsx`, `src/data/seed-profiles.ts`,
`HARDCODED_GROUPS` in `src/data/groups.ts`, and any test files. `unitTests` is supposed to keep
all of that. That creates a trap: **a plain `git merge development` from `unitTests` can silently
delete every one of those things**, with no conflict, no warning — discovered the hard way while
building the `database` feature (2026-07-03).

**Why it happens:** if `unitTests` hasn't diverged from `development`'s shared lineage since
those stripping commits landed (i.e. `unitTests` never got its own commit touching those files),
`unitTests`'s tip is a strict ancestor of `development`'s tip. Git resolves that as a
**fast-forward** — a pure pointer move, not a merge. Fast-forwards run zero conflict detection,
so every deletion `development` accumulated along the way is applied without so much as a diff
being shown.

**The fix, verified empirically on disposable branches (not tested against `.gitattributes`
tricks — those don't help here, see below):**

- **`unitTests` must always carry its own real commit(s) over the gated files.** Once it does,
  `unitTests`'s tip is no longer an ancestor of `development`'s, so `development` can never again
  fast-forward it — every sync becomes a real 3-way merge, and git's normal conflict detection
  applies. This happens naturally every time a `test/<feature>` cycle merges its reconciliation
  work back into `unitTests` (see below) — it's self-maintaining as long as that step isn't
  skipped.
- **As an extra guard against ever hitting a fast-forward by accident** (e.g. a freshly
  recreated `unitTests` that hasn't diverged yet), always sync with:
  ```
  git checkout unitTests
  git merge development --no-ff
  ```
  `--no-ff` forces a real merge commit even in cases where a fast-forward would otherwise be
  possible, so conflict detection always runs.
- **`.gitattributes merge=ours` does *not* fix this**, and was ruled out after testing: when
  `unitTests` hasn't touched a file at all relative to the merge base, git deletes it on `theirs`
  regardless of any merge driver — there's no content to run a driver on. A custom merge driver
  only ever gets a chance to run when `unitTests` has *also* modified the file, at which point git
  raises a normal `CONFLICT (modify/delete)` and leaves `unitTests`'s version in the tree
  automatically anyway — the driver doesn't add anything a real divergence didn't already provide.

**What a sync merge conflict actually looks like, and how to resolve it:** merging `development`
into `unitTests` after `development` has changed one of the partially-gated files below will
raise a normal git content conflict on the overlapping lines (not the fully-deleted-file case —
that one's silent, see above). Resolve by keeping `unitTests`'s side for the gated lines and
taking `development`'s side for everything else in the file:

| File | Keep from `unitTests` | Take from `development` |
|---|---|---|
| `src/app/dev-tools.tsx` | the whole file (fully exclusive) | n/a — `development` doesn't have it |
| `src/data/seed-profiles.ts` | the whole file (fully exclusive) | n/a — `development` doesn't have it |
| `src/utils/*.test.ts` | the whole file (fully exclusive) | n/a — `development` doesn't have it |
| `src/data/groups.ts` | the `HARDCODED_GROUPS` export | everything else (`Group`/`PlayerProfile` types) |
| `src/context/AppContext.tsx` | `useState<Group[]>(HARDCODED_GROUPS)` for `groups` | everything else |
| `src/app/profile-creation.tsx`, `(tabs)/stats.tsx`, `player-profile.tsx` | `import { SEED_PROFILES } from '.../seed-profiles'` and its usages | everything else (these files also carry real feature logic that must flow through) |
| `(tabs)/profile.tsx` | the real "Developer Tools" button/`router.push('/dev-tools')` (no `DEV_TOOLS_ENABLED` flag) | everything else |

A fully-exclusive file that's missing after a merge (not conflicting — just gone) means a
fast-forward slipped through; restore it with
`git show <last-known-good-unitTests-commit>:<path> > <path>` and commit the restoration before
continuing, same as the 2026-07-03 recovery.

**A further option, not done as of this writing:** the partially-gated files above mix
gated and shared content in the same file, which is why they need manual conflict resolution
every time `development` touches something nearby. Extracting the gated bits into their own
small, fully-exclusive files (the way `dev-tools.tsx` and `seed-profiles.ts` already are) would
let the main files merge cleanly forever, at the cost of a refactor across profile-creation.tsx,
stats.tsx, player-profile.tsx, and AppContext.tsx. Worth doing if this conflict resolution
becomes a recurring drag across many future `test/<feature>` cycles; not worth it for a one-off.

### 2.8 Sync from parent before starting work on any branch

**Before making any new commit on any branch, merge in the latest state of its parent first —
not just `git pull` from its own remote.** `git pull` only catches a branch up with its own
remote history; it says nothing about whatever has landed on the branch's *parent* since this
branch last synced. The two are easy to conflate because they're both "getting current," but
only the second one surfaces fixes/updates that happened elsewhere in the tree.

- **Top-level feature branch** (`<feature-name>`): merge latest `development` in before
  starting work each session — `git checkout development && git pull`, then
  `git checkout <feature> && git pull && git merge development`, then `git push`. (Pulling the
  feature branch picks up teammates' merged pieces; pulling `development` first is what makes the
  merge bring in everyone else's finished work.)
- **Sub-branch** (`feature/<function>`): merge the latest state of its parent top-level feature
  branch in before resuming work on it — `git checkout <feature> && git pull`, then
  `git checkout feature/<function> && git merge <feature>`.
- **`unitTests`**: its parent is `development`, but use the `--no-ff` merge from §2.7 specifically
  — a plain `git merge development` here risks a silent fast-forward that deletes
  unitTests-exclusive content. §2.7's guidance supersedes the plain merge described above for
  this one branch.
- **`test/<feature>`**: recreated fresh each cycle as `unitTests` + `<feature>` (see §2.5) —
  there's no separate "sync" step since the branch is rebuilt from both parents' current tips
  every time anyway.

**Why this was added:** a bug in the profile-creation onboarding flow (the rival-reveal step
being a dead end when no rivals exist) was fixed once on the `onboarding-fixes` top-level
branch, then resurfaced on `database`, a sibling top-level branch that had forked from
`development` before the fix existed and was never merged with `onboarding-fixes` or refreshed
from `development` afterward (2026-07-04). Note the specific nuance: syncing `database` from
`development` alone would *not* have caught this particular case, since the fix hadn't been
merged into `development` yet either — it was sitting on a sibling top-level branch awaiting
release. The general habit of routinely syncing from parent still matters going forward (it
closes the more common case: a fix that *has* landed on `development` but a long-lived sibling
branch hasn't pulled it in), but it doesn't replace paying attention to fixes still parked on
other active top-level branches — if a bug fix is generally applicable (not specific to one
feature's unfinished work), consider whether it needs to be applied to other active top-level
branches directly (as a cherry-pick or equivalent) rather than assuming a `development` sync
will eventually deliver it.

### 2.9 What lives on `origin`, and how work is claimed

**Policy (adopted 2026-10-06):** branches are split by who owns them. A **team** owns a feature;
an **individual** owns one piece of it.

| Branch | Owner | On `origin`? |
|---|---|---|
| `main`, `development`, `unitTests` | everyone | yes, always |
| `LandingPage` | deployment | yes, always (see below) |
| `<feature>` | the team building it | yes, while in progress; deleted from `origin` once merged into `development` |
| `feature/<function>` | one person | no, never pushed |
| `test/<feature>` | whoever runs the test cycle | no, never pushed (rebuilt every cycle; passing tests are shared through `unitTests`) |

- **Pushing.** A new `<feature>` is pushed as soon as it's created (`git push -u origin
  <feature>`). After merging your `feature/<function>` piece into it, `git push`. After a feature
  lands, `git push origin development` and then `git push origin --delete <feature>` (keep the
  local copy if you like). `git push origin unitTests` after a sync or test merge-back.
  `git push origin main --tags` only as part of an explicitly requested release.
- **Claiming work through GitHub Issues.** A team claims a feature by being assigned the feature's
  issue. Each person claims their piece through a smaller issue for that piece (a sub-issue of
  the feature's issue), assigned to them, before creating the matching `feature/<function>`
  branch. Individual branches are local, so the issue is the only way teammates can see who's
  doing what. Unassign yourself if you drop a piece; close the feature's issue when it merges into
  `development`.
- **`LandingPage` is a deployment branch.** The static marketing site lives on `LandingPage`, and
  GitHub Pages deploys directly from `origin/LandingPage` (Settings → Pages → Deploy from branch).
  It must stay on `origin` — deleting it takes the site offline and breaks the QR code printed on
  the flyer. It's developed in its own worktree, pushed directly, and never merged into the app
  branches.
- **Backup risk.** A `feature/<function>` branch has no copy anywhere else until it's merged into
  its team branch and pushed. Merge your pieces up often.
- **Stray remote branches.** If `git fetch --prune && git branch -r` shows a `feature/*` or
  `test/*` branch, or a `<feature>` that has already merged into `development`, it was pushed or
  left by mistake. Check whether its commits exist anywhere else before deleting it from
  `origin`; ask the person who pushed it first.
- **One-time cleanup (2026-10-06):** when this policy was adopted, finished features and every
  `feature/*` and `test/*` branch were removed from `origin`. Every one of them had a matching
  local branch on the machine that did the cleanup, and none had commits that weren't also local.

---

## 3. Commit rules

- Every discrete piece of work gets its own commit — don't batch unrelated changes.
- Commit messages are descriptive: what changed and why, not just "fix" or "update."
- Local branches are never deleted as a matter of routine. (The one exception: a one-time
  cleanup pass when a branch's entire history is already fully absorbed into
  `development` and it serves no further purpose as a named reference — done rarely,
  and only with the developer's explicit go-ahead.) Remote branches follow §2.9 instead:
  a feature branch leaves `origin` once it merges into `development`, and individual branches
  are never on `origin` at all.

## 4. Starting new work — quick reference

| I want to... | Branch from | Branch name |
|---|---|---|
| Claim work before starting | — | team: assign the feature's GitHub issue; you: assign yourself the issue for your piece (§2.9) |
| Start a brand-new top-level feature | freshly pulled `development` | `<feature-name>` (no prefix), then `git push -u origin <feature-name>` |
| Work on one piece of an existing feature | that feature's branch (freshly pulled) | `feature/<specific-function>`, local-only |
| Test a feature that's ready | merge of `unitTests` + `<feature>` | `test/<feature>` |
| Fix something found during testing | the feature branch (or its `feature/*` sub-branch) | continue there, don't branch from `test/<feature>` |
| Resume work on any existing branch | that branch | first merge its parent in (§2.8) before committing anything new |
| Merge a tested feature into `development` | — | not automatic on green tests; requires explicit developer (or other-developer) confirmation the feature is ready — then merge, with no test files carried in (§2.6), `git push origin development`, and `git push origin --delete <feature>` |
| Hand my piece to a teammate | — | merge what you have into the team's `<feature>` branch, push it, and reassign your piece's issue (§2.9) |
| Cut a release | — | not a branch action; ask the developer, then merge `development` → `main` and tag it |

## 5. Current top-level feature branches

This list records which features exist and roughly what state they're in; who is working on
each one is tracked by GitHub issue assignment, not here. As of 2026-10-07, the top-level
branches not yet merged into `development` — all of them shared on `origin` (§2.9) — are:

- **`life-counter`** — in-progress life/commander-damage tracking screen. Excluded from
  `development`/`main` until finished; it has no entry points or feature flag there — see
  [CLAUDE.md](../CLAUDE.md).
- **`shop`** — the working Shop: spendable Points (`point_balance`), the monthly total shown as
  Score, and three kinds of cosmetic (titles, name colors, card borders) bought and worn through
  server functions. **Stacked on `security-hardening`** - its migration refuses to apply unless
  the hardening migration is in place. Its migration is live on Supabase (applied 2026-10-07).
- **`dev-tools`** — home for `src/app/dev-tools.tsx`, the developer testing screen.
  Excluded from every other branch except `unitTests`/`test/<feature>`; see
  [CLAUDE.md](../CLAUDE.md) for the `DEV_TOOLS_ENABLED` flag.
- **`security-hardening`** — server-authoritative scoring and RLS hardening, including the
  store-event bonus (moved to the server on 2026-10-07) and working delete/cancel (GitHub issue
  #10). **Stacked on `commander-only`**, so the merge order into `development` is
  `event-calendar` -> `commander-only` -> `security-hardening` -> `shop`. Its three migrations
  are **live on Supabase (applied 2026-10-07)** and were verified there with throwaway accounts.
  Consequence: any build that still writes scores directly - `development`, `event-calendar`,
  `commander-only`, and `main` - can no longer report rounds, collect points, or delete a group
  against the live database. Only this branch, `shop`, and `combined-preview` work fully until
  the stack is merged. See `docs/security-backlog.md`.
- **`final-results`** — removes the 15-minute dispute window: the host's report is final, and the
  server records it, pays every player, and counts the round in one step. **Stacked on `shop`**
  (the payout credits the spendable balance), so it is the last link:
  `event-calendar` -> `commander-only` -> `security-hardening` -> `shop` -> `final-results`. Its
  migration is live on Supabase (applied 2026-10-07).
- **`readme-refresh`** — rewrites `README.md` with diagrams of the app and the branch flow, plus
  the `.env` setup step it was missing. Documentation only: no code, no migration. **Stacked on
  `final-results`** (made 2026-10-08) because the README describes the app as it is once the
  stack has landed, so it merges into `development` after `final-results`.
- **`playtest-fixes`** — fixes from the developer's first play-test of `combined-preview` in a
  browser (2026-10-08): pop-ups that work on web (`showDialog`), one group per day, light mode
  on every signed-in screen, a title picker on the Profile tab, the "How PlayLink works" guide
  as a button and as the last step of onboarding, and 25-point starter rewards. **Stacked on
  `readme-refresh`**, so it lands last. It carries three migrations, all **applied to the live
  database on 2026-10-08** (run by the developer in the SQL editor, then checked by reading the
  database back): `20261008120000_group_play_date.sql`, `20261008130000_starter_rewards.sql`,
  and `20261008140000_group_area_and_posting_limit.sql`. So the live database is again ahead of
  every branch below this one: builds without this branch still work, but do not send a play
  date or an area with a new posting. A second round of fixes from testing in Expo Go
  the same day added self-closing confirmations (`showToast`), the Find tab's bottom Create
  button, area filter, and date sorting, and the reworked Profile tab.
- **`combined-preview`** — not a feature: `development` plus the whole stack merged in order
  (`event-calendar`, `commander-only`, `security-hardening`, `shop`), made on 2026-10-07 so the
  developer can test everything together. Its tree is identical to `shop`. Do not build on it;
  fix things on the branch they belong to and re-merge. Delete it from `origin` once the stack
  has landed in `development`.
- **`event-calendar`** — **PENDING DEV MERGE (marked 2026-10-07, GitHub issue #12).** The
  developer considers it finished and will review it before it lands; do not merge it into
  `development` until they say so. The Calendar tab: a month view of local Commander nights from the
  `local_events` table, starting with Reno-Sparks, filled by the `sync-local-events` Edge Function.
  Its two migrations and the function are live on Supabase (applied/deployed 2026-10-07). Also
  carries the "Create game" button that starts a store-linked group, and a batch of first-time
  player fixes (sign-in, onboarding, Home) that were placed here rather than on their own branch.
- **`commander-only`** — hides every game and Magic format except Commander behind the
  `COMMANDER_ONLY` flag in `src/data/types.ts`, deleting nothing. **Stacked on `event-calendar`**
  (it has to hide the Calendar's format switcher), so it merges into `development` only after
  `event-calendar` does. Tracked in GitHub issue #9.
- **`calendar-system`** — shelved (2026-10-06) in favor of `event-calendar`: a weekly calendar of
  player groups plus a one-group-per-day rule change. Kept as a reference, not planned to merge.
  **Its `group_players_one_per_day` migration is nonetheless live on Supabase** (confirmed
  2026-10-07), so the live database enforces one group per day while `development`'s migrations
  still declare one group per player overall — see GitHub issue #10.
- **`location-autocomplete`**, **`store-events`**, **`ui-polish`**, **`onboarding-fixes`** —
  in-progress features with unmerged work.
- **`LandingPage`** — the marketing site; not an app feature and never merged into the app
  branches. Lives on `origin` because GitHub Pages deploys from it (§2.9).

`rival-system` has fully merged into `development` and is no longer an open feature.

This list will grow as new top-level features start and shrink when a feature ships
(merges into `development`) or is explicitly abandoned by the developer.
