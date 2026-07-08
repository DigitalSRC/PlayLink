# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

PlayLink is an Expo Router app (v57) built with React Native and TypeScript. Users create a profile and then browse, join, create, and manage play groups.

## Commands

- `npm install` — install dependencies
- `npm start` / `npx expo start` — start the dev server (add `--android`, `--ios`, or `--web` to target a platform)
- `npm test` — run all Jest tests (only meaningful on `unitTests` or a `test/<feature>` branch — test files are never present on `development`/`main`, see Git workflow below)
- `npx jest --testPathPattern=group-utils` — run a single test file by path fragment
- `npx jest -t "normalizes invalid"` — run tests matching a name pattern
- `npm run lint` — run ESLint via expo lint

### Never put a test file inside `src/app/`

`src/app/` is Expo Router's configured root (see `app.json`) — every `.tsx`/`.ts` file directly
inside it gets scanned into the route table regardless of naming, `*.test.tsx` included. A test
file for a screen (e.g. `sign-in.tsx`) placed at `src/app/sign-in.test.tsx` gets bundled into the
real app, pulling in test-only packages (`@testing-library/react-native`, `jest`, etc.) that
aren't safe for the native/web runtime — e.g. `@testing-library/react-native` imports Node's
`console` module, which fails to bundle with "the native React runtime does not include the Node
standard library." This is easy to miss because every *other* test file in this repo (`src/utils/`,
`src/lib/`) is safely colocated next to its source, since those directories aren't scanned by the
router. Screen tests belong in `src/__tests__/app/<screen>.test.tsx` instead (mirrors the `app/`
path, but outside the scanned root) — Jest's default `testMatch` already covers `__tests__/`
directories anywhere, no config change needed.

### Git binary location

If `git` is not in your system PATH, your machine-specific path to the git executable is
stored in `CLAUDE.local.md` (gitignored — never committed). If you have not created that
file yet, copy `CLAUDE.local.md.example` and fill in the path for your environment.

Before changing Expo or routing behavior, read the versioned docs at https://docs.expo.dev/versions/v57.0.0/.

## Architecture

### Navigation flow

Expo Router file-based routing. [src/app/_layout.tsx](src/app/_layout.tsx) wraps the entire app in `AppProvider` and a `<Stack />` with headers hidden globally.

```
index (landing / welcome)
  └─ profile-creation  (collects username, games, location, brackets)
       └─ (tabs)/         ← authenticated zone; redirects to profile-creation if no user
            ├─ home       (joined groups, upcoming sessions)
            ├─ browse     (discover and join groups)
            ├─ stats      (wins/losses/points, rivals)
            ├─ shop       (placeholder)
            └─ profile    (user settings, theme, sign-out)
```

Modal-like screens pushed on the root stack (not tabs): `group-detail`, `player-profile`.

`pickup-setup` and `life-counter` also exist as root-stack screens, but only on the [life-counter branch](#the-life-counter-branch-feature-under-active-development-excluded-from-the-mvp) — they've been removed from `main`/`development` until that feature is finished (see Git workflow below), and neither has any entry point on `development`/`main` today (no disabled button or flag stands in for them — see that section for why). `group-detail`'s round-reporting/scoring flow (a separate, unrelated feature — see [Groups & game scoring](#groups--game-scoring-supabase) below) is fully live on `development`/`main`.

`dev-tools` also exists as a root-stack screen, but only on the dedicated `dev-tools` branch (and `unitTests`/`test/<feature>`) — see [Rival matching, Dev Tools, and mock group data](#rival-matching-dev-tools-and-mock-group-data-features-gated-off-developmentmain) below.

### State management

Global state lives in [src/context/AppContext.tsx](src/context/AppContext.tsx). `AppProvider` wraps the root layout and holds: `session`/`authLoading`/`profileLoading` (Supabase auth status — see Auth & data below), `currentUser` (`UserProfile | null`, fetched and cached via React Query rather than plain local state), `groups`/`groupsLoading` (fetched live from Supabase via `useGroupsQuery()` — see [Groups & game scoring](#groups--game-scoring-supabase) below, not seeded locally on any branch), `rivals`, `chosenRivalId`, `mostPlayedAgainst`, `theme`, and `devDateOffset` (a millisecond offset used in dev tools to simulate future dates). All screens read and mutate this state via the `useApp()` hook. [src/utils/auth-status.ts](src/utils/auth-status.ts)'s `useAuthStatus()` combines session/profile status into `'loading' | 'unauthenticated' | 'no-profile' | 'ready'`; `index.tsx` and the tab layout both branch on it to redirect to `/sign-in`, `/profile-creation`, or render normally.

### Auth & data (Supabase)

PlayLink authenticates and persists user profiles via [Supabase](https://supabase.com). Requires `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in a local `.env` (see `.env.example`) — the app throws at startup if either is missing.

- **[src/lib/supabase.ts](src/lib/supabase.ts)** — the Supabase client singleton (PKCE flow, AsyncStorage-backed session persistence). Only passes AsyncStorage as auth storage outside the Node SSR prerender pass that `app.json`'s `web.output: "static"` performs — see the file's comments before touching this.
- **[src/lib/auth-api.ts](src/lib/auth-api.ts)** — `signInWithGoogle` (hosted OAuth redirect via `expo-web-browser`) and `signInWithApple` (native Sign in with Apple, iOS-only). Both need external console setup (Supabase Auth provider config, a Google Cloud OAuth client, an Apple Developer Services ID) before they work end-to-end.
- **[src/lib/profile-api.ts](src/lib/profile-api.ts)** — `fetchProfile`/`insertProfile`/`updateProfile` wrapping the `profiles` table (schema in `supabase/migrations/`), plus the snake_case↔camelCase converters that keep the DB's column naming out of the rest of the app. `insertProfile`/`updateProfile` also best-effort sync `username`/`displayName` into the auth user's own metadata (`syncAuthUserMetadata`, via `supabase.auth.updateUser({ data })`) so Supabase Studio's Authentication → Users view shows a real identity instead of a blank one; failures there are logged, not thrown — `profiles` stays the source of truth.
- **[src/hooks/useAuthSession.ts](src/hooks/useAuthSession.ts)** and **[src/hooks/useProfileQueries.ts](src/hooks/useProfileQueries.ts)** — React Query hooks (`useProfileQuery`, `useCreateProfileMutation`, `useUpdateProfileMutation`) that `AppContext` adapts into `currentUser` and its mutators (`awardPoints`/`addWin`/`addLoss`/`addDraw`/`resetMonthlyPoints`), using optimistic updates so they still feel instant. Cached via [src/lib/query-client.ts](src/lib/query-client.ts) (`PersistQueryClientProvider` in `_layout.tsx`), persisted to AsyncStorage, so a cached profile renders instantly on cold start before the network refetch completes.
- `UserProfile.id` is a Supabase auth UUID (`string`), matching `auth.users.id` 1:1 so RLS policies on `profiles` are a one-line `auth.uid() = id` check.
- **[src/lib/crypto-polyfill.ts](src/lib/crypto-polyfill.ts)** — a `SubtleCrypto.digest` shim backed by `expo-crypto`, since React Native has no native `crypto.subtle`. Supabase's PKCE auth flow needs it to hash the code verifier; `subtleDigest` is async so an unmapped algorithm rejects the returned promise rather than throwing synchronously, matching the real `SubtleCrypto.digest` contract.

### Groups & game scoring (Supabase)

Groups have real backend persistence (schema in `supabase/migrations/`, starting at `20260705140000_create_groups.sql`) — `AppContext`'s `groups` is fetched live via `useGroupsQuery()`, not client-only state (see [Data layer](#data-layer) below for what `HARDCODED_GROUPS` still is).

- **[src/lib/group-api.ts](src/lib/group-api.ts)** — Supabase CRUD for groups/rosters (`fetchGroups`, `fetchGroupById`, `createGroup`, `joinGroup`, `leaveGroup`, `deleteGroup`, `setGroupHost`, `updateGroup`, `confirmGroup`), plus the round-scoring/dispute workflow: `submitGroupResult` scores placements via `scoring-utils.ts` and inserts a `group_results` row in `'pending'` status with a `DISPUTE_WINDOW_MS` (15 min) countdown; `disputeGroupResult` requires a reason and flips it to `'disputed'`, permanently blocking auto-finalization until the host calls `cancelGroupResult` and resubmits (there is no in-place "resolve" path, by design); `finalizeGroupResultIfReady` lazily flips an undisputed `'pending'` result to `'finalized'` once its window elapses (checked on read via the same `getNow()`/`devDateOffset` pattern `AppContext` uses elsewhere, not a scheduled job); `applyGroupResultPoints` applies the *caller's own* point/win-loss-draw delta to their profile — RLS only allows writing your own profile row, so a group's points don't fully settle until every participant has separately opened the app.
- **[src/hooks/useGroupQueries.ts](src/hooks/useGroupQueries.ts)** — React Query wrappers around `group-api.ts` (`groupKeys` cache-key factory; `useGroupsQuery`/`useGroupQuery`/`useGroupResultsQuery` reads; create/join/leave/delete/setHost/update/confirm/submitResult/disputeResult/cancelResult mutations, each invalidating the relevant list/detail/results query key on success).
- **[src/utils/scoring-utils.ts](src/utils/scoring-utils.ts)** — `computePlacementScores`, pure and unit-testable: the winner's base point pool is `10 * (participants - 1)`, each subsequent distinct rank earns half of the rank before it, the last distinct rank always scores zero placement points (overriding the halving formula), and every player additionally gets a flat `PARTICIPATION_POINTS` (10) regardless of standing. Tied placements score identically and are reported as `'draw'`, even when the tied rank is last.
- [group-detail.tsx](src/app/group-detail.tsx) is the only consumer of this flow: host confirms the group (30-minute `CONFIRM_LOCK_MS` age lock plus a minimum-attendee check), reports each round via drag-and-drop placement order, and members can dispute a pending result with a required reason before it auto-finalizes.

### Data layer

**[src/data/types.ts](src/data/types.ts)** is the canonical type file. It defines:
- `UserProfile` — the logged-in user's full identity (games, brackets, noGo rules, wins/losses/points).
- `GameType` (`'mtg' | 'pokemon' | 'lorcana' | 'onepiece'`) and associated display constants (`GAME_LABELS`, `GAME_EMOJI`, `GAME_COLOR`).
- `NoGoRule`, `FORMAT_OPTIONS`, `BRACKET_INFO`, `TIME_SLOTS`, `DAYS_OF_WEEK`.

**[src/data/groups.ts](src/data/groups.ts)** exports `PlayerProfile` and `Group` everywhere. `PlayerProfile.id` is a Supabase auth UUID (`profiles.id` / `group_players.player_id`), not a locally-generated number, now that groups persist for real (see [Groups & game scoring](#groups--game-scoring-supabase) above). `HARDCODED_GROUPS` (a static seed list; it does not use `Math.random()`) exists only on `unitTests`/`test/<feature>` — removed from `development`/`main` (see [Rival matching, Dev Tools, and mock group data](#rival-matching-dev-tools-and-mock-group-data-features-gated-off-developmentmain) below) and predates the real backend anyway (its ids aren't UUIDs).

**[src/data/seed-profiles.ts](src/data/seed-profiles.ts)** provides the pool of `UserProfile` objects used for rival matching. Exists only on `rival-system`, `unitTests`, and `test/<feature>` — removed from `development`/`main`/`shop`/`life-counter` along with the rest of rival matching (see below).

[src/data/random-data.ts](src/data/random-data.ts) holds string pools (names, locations, times) used by any future dynamic seeding.

### Domain utilities

**[src/utils/group-utils.ts](src/utils/group-utils.ts)** — pure group business logic: `findGroupByUsername`, `isHostForUser`, `isGroupFull`, `canJoinGroup`, `buildNewPlayer`, `normalizePositiveInt`, `removePlayerFromGroup`, `setPlayerAsHost`, `generateJoinCode`, `formatBrackets`. Unit tested in `src/utils/group-utils.test.ts` on the `unitTests` branch (test files don't live on `development`/`main` — see Git workflow below).

**[src/utils/rival-utils.ts](src/utils/rival-utils.ts)** — exports `findRivals`, which ranks seed profiles by win-rate proximity to the current user and always injects Dillon Carroll (id 113) as the first rival with his preferences mirrored from the current user. Unit tested in `src/utils/rival-utils.test.ts` on the `unitTests` branch (same rule — not on `development`/`main`).

**[src/utils/scoring-utils.ts](src/utils/scoring-utils.ts)** — exports `computePlacementScores`; see [Groups & game scoring](#groups--game-scoring-supabase) above. Always shipped (no gating) — round scoring is a finished, live feature.

When adding new group or rival behavior, put the logic in the appropriate utils file — do not inline it in screen components. Write or update its tests on the `unitTests`/`test/<feature>` lane (§2.5 of the workflow doc), not directly on `development` or `main`.

### Styling

All styles use React Native `StyleSheet.create` defined at the bottom of each screen file. No external styling library is used. Screens pull neutral, theme-dependent colors (backgrounds, borders, text tiers) from `ThemeColors` in [src/utils/theme-utils.ts](src/utils/theme-utils.ts) rather than hardcoding light/dark hex values — sourced from `theme` in `AppContext`. Semantic/accent colors (`GAME_COLOR`, success green, accent blue, rival red/gold/purple) are intentionally not part of this palette since they're saturated enough to read on both themes.

## Git workflow — MANDATORY, follow in every session

These rules apply unconditionally. Do not skip them, do not ask whether to follow them — just follow them.

**Full reference:** [docs/version-control-workflow.md](docs/version-control-workflow.md) is
the authoritative, detailed document. This section is the condensed summary an AI session
needs to not violate it.

### Branch structure

```
main                 ← RELEASE ONLY. What ships to MVP testers. Advances only when the
                       developer explicitly says to cut a release — never automatically,
                       never as a side effect of finishing a feature or passing tests.
                       Tagged at each release point (e.g. `v0.1.0-mvp`).
development          ← integration branch. Everything finished and tested lands here. This
                       is the "front of the queue" for the next release, but is NOT itself
                       shippable until the developer says so. (This was called `main` before
                       the MVP split, then briefly `Dev` — all pre-MVP history lives here.)
<feature>            ← top-level feature branch, forked from `development`, named after the
                       feature itself with NO `feature/` prefix at this tier (e.g.
                       `life-counter`, `rival-system`, `shop`).
feature/<function>   ← sub-branch of a top-level feature branch (forked from it, never from
                       `development` or `main`), named after the specific piece of work.
                       Merges back into the top-level feature branch it came from.
unitTests            ← standing branch, kept up to date with `development`.
test/<feature>       ← created fresh per test cycle as a merge of `unitTests` + `<feature>`.
                       Tests are written/run here.
```

- **`main` is release-only and off-limits for all routine work.** Never commit to it directly, and never merge into it without the developer explicitly asking to cut a release. Finishing a feature, passing tests, or merging into `development` does **not** imply permission to touch `main` — treat every `development → main` merge as requiring fresh, explicit authorization, same bar as a force-push.
- **`development` is the default integration target, but merging into it is never automatic.** A green `test/<feature>` run is necessary but **not sufficient** — do not run `git checkout development && git merge <feature>` just because tests passed. Merging into `development` additionally requires the developer (or another developer) to explicitly confirm the feature is ready to land there. If that confirmation hasn't been given, stop after the tests pass and say so instead of merging. When older instructions or commit messages say "merge to main," that now means `development`, unless the developer is explicitly talking about cutting a release.
- **Top-level feature branches still fork from `development`** — that part of the model is unchanged. Name them after the feature with no prefix: `life-counter`, `rival-system`, `shop`. See §5 of the full workflow doc for the current list. (The confirmation gate above is about what's allowed to merge back *into* `development`, not about where new branches originate from it.)
- **Sub-work within a feature** uses `feature/<specific-function>` branched off that feature's own branch (e.g. `feature/rotate-button` off `life-counter`), merging back into it.
- **Testing is a separate lane**, not a step inside `development`. `unitTests` stays synced with `development`; `test/<feature>` is a throwaway-and-recreate merge of `unitTests` + the feature branch, used to write and run tests. Passing tests promotes the tests into `unitTests` — it does **not** by itself promote the feature into `development`; that still needs explicit developer confirmation. Failing tests sends work back to the feature branch and `test/<feature>` gets recreated later.
- **Never sync `unitTests` with a plain `git merge development`.** `development`'s history contains commits that delete unitTests-exclusive content (`dev-tools.tsx`, `seed-profiles.ts`, `HARDCODED_GROUPS`, test files) — if `unitTests` hasn't diverged since, that merge is a silent fast-forward that reapplies every one of those deletions with zero warning (this happened once, 2026-07-03). Always use `git merge development --no-ff` instead, and see §2.7 of the full workflow doc for the conflict-resolution checklist (which lines to keep from `unitTests` vs. take from `development` in the handful of partially-gated files).
- **`development` and `main` never contain test files.** No `*.test.ts` (or other test-suite files) may exist on either branch. `unitTests` and `test/<feature>` are the only branches where test files live. If a merge into `development` or a commit to `main` would introduce a test file, strip it out first — see §2.6 of the full workflow doc.
- **Branches are not deleted as routine practice.** (A one-time cleanup happened when this document was written, removing branches whose entire history was already absorbed into `development` — see git log. That was a rare, explicit, developer-approved exception, not a standing policy.)
- **Always update a branch from its parent before starting new work on it.** Before making any new commit on any branch, first merge in the latest state of its parent — a top-level feature branch's parent is `development`; a `feature/<function>` sub-branch's parent is the top-level feature branch it was forked from; `unitTests`'s parent is `development` via the `--no-ff` rule above. This is separate from `git pull` (which only catches up a branch with its own remote history) — a fix or update can land on the parent while a sibling branch sits untouched, and only merging the parent in surfaces it. (This was added after a bug fixed on one top-level feature branch resurfaced on a sibling top-level branch that had forked from `development` before the fix existed and was never re-synced — syncing from the parent routinely is the general habit that prevents this class of drift, even though in that specific case the fix hadn't reached `development` yet either; see the full workflow doc.)

### The `life-counter` branch (feature under active development, excluded from the MVP)

Life counter is not a finished feature and must not reach `development` or `main` until the
developer gives an explicit go-ahead.

```
feature/<function>  →  life-counter  →  test/life-counter (+ unitTests)  →  development  →  main (explicit release only)
```

- `life-counter` itself only advances to `development` when the developer explicitly says the feature is ready to come back — do not do this proactively, even if `life-counter` has been sitting untouched for a while.
- `main`/`development` currently have life-counter's route (`pickup-setup.tsx`, `life-counter.tsx`) and every one of its entry points removed outright — there is no disabled button or feature flag standing in for them today (an earlier `GAME_SESSIONS_ENABLED` flag on `group-detail.tsx` briefly played that role but no longer exists in the code; the round-reporting/scoring flow that now lives on `group-detail.tsx` is the unrelated `game-scoring` feature, not life-counter). Restoring life-counter means merging it into `development` **and** adding new entry points (a "Start Game"/"Life Counter" button, home's pickup card, etc.) from scratch — there is nothing left to flag back on.

### Rival matching, Dev Tools, and mock group data (features gated off `development`/`main`)

Three more things have been removed from `development`/`main` for the same reason as life-counter — they're unfinished, or they're seed/mock data standing in for a real backend rather than shippable content. Restoring any of them requires the developer's explicit go-ahead, same bar as life-counter — merging the source branch back in alone will not restore the entry points.

- **Rival matching** (`src/data/seed-profiles.ts` and the parts of `profile-creation.tsx`, `stats.tsx`, and `player-profile.tsx` that consumed it). `seed-profiles.ts` exists only on `rival-system`, `unitTests`, and `test/<feature>`. On `development`/`main`/`shop`/`life-counter`, those three files each define a local, empty `RIVAL_POOL: UserProfile[]` placeholder in its place, so rival computation, the leaderboard, and profile lookups keep compiling and degrade safely instead of breaking. `rival-utils.ts` is unaffected — `findRivals` is generic and has no `SEED_PROFILES` dependency, so it stays a permanent, always-shipped domain utility.
- **Dev Tools** (`src/app/dev-tools.tsx`). Removed from every branch except the dedicated `dev-tools` branch and `unitTests`/`test/<feature>`. On `development`/`main`, `(tabs)/profile.tsx`'s Dev Tools badge is gated behind `DEV_TOOLS_ENABLED = false`; the button's `router.push('/dev-tools')` call was deleted outright rather than flag-gated, because Expo Router's typed routes (`app.json` → `experiments.typedRoutes`) type-check route strings against files that exist — a runtime flag can't keep a deleted route compiling.
- **Mock group data** (`HARDCODED_GROUPS` in `src/data/groups.ts`). Removed from every branch except `unitTests`/`test/<feature>` — it's stale seed data (numeric ids, predates the real groups backend) not shippable content. On `development`/`main`, `groups` is fetched live from Supabase instead (see [Groups & game scoring](#groups--game-scoring-supabase) above) — it is **not** seeded as `[]`; that only describes what `AppContext` looked like before the `game-scoring`/`database` features landed. The `Group`/`PlayerProfile` types stay everywhere.

### Commit rules

- Every feature produces at least one commit on its feature branch.
- Commit as soon as a discrete piece of work is complete — do not batch unrelated changes into one commit.
- Commit messages must be descriptive: what changed and why, not just "fix" or "update".

### Workflow steps — do this for every feature

1. `git checkout <feature> && git pull`, then `git merge development` — start from the latest state of the relevant top-level feature branch (or `development` if starting a brand-new top-level feature) **and** bring in whatever has landed on `development` since this branch last synced. Don't skip the merge just because `git pull` reported nothing new — that only covers the branch's own remote history, not its parent.
2. `git checkout -b feature/<function>` — create the sub-branch for this specific piece of work. If `feature/<function>` already exists and work is resuming on it, first `git merge <feature>` (its parent, now synced per step 1) before continuing.
3. Implement the work. Commit on the sub-branch when done.
4. `git checkout <feature> && git merge feature/<function>` — bring it into the feature branch.
5. When the feature is ready to test: `git checkout unitTests && git merge development --no-ff` (stay current — always `--no-ff`, see §2.7 of the workflow doc for why a plain merge can silently delete unitTests-exclusive content), then `git checkout -b test/<feature> && git merge <feature>`.
6. Write/update unit tests on `test/<feature>`. `npm test` — all tests must pass.
7. On pass: merge the test additions back into `unitTests`. Do **not** merge into `development` yet — passing tests only clears the way to ask.
8. Ask the developer (or confirm another developer has already signed off) that the feature is ready for `development`. Only after that explicit confirmation: `git checkout development && git merge <feature>`. Before merging, double-check the feature branch carries no test files into `development` (see §2.6 of the workflow doc) — strip any out first.
9. On fail: go back to step 2–4 on the feature branch; recreate `test/<feature>` later and retry step 6.
10. Do **not** merge to `main` at any point in this flow — that's a separate, explicitly-requested release step only.

### What to do at the start of every session

1. Run `git branch -a` to orient yourself — know what branches exist.
2. Treat `development` as the source of truth for the current state of the project, and check it even if the session starts on a different branch. Other branches (especially `main`) can silently lag behind — `main`'s copy of this file and its workflow model once drifted out of date until a session caught it by diffing against `development` and reconciled it. When a branch's docs or code disagree with `development`, `development` wins unless the developer says otherwise; flag the drift and ask before assuming which side is correct.
3. Ask the user which feature to work on if it is not obvious from context.
4. Check out (or create) the appropriate branch before touching any files — a `feature/<function>` sub-branch off the relevant top-level feature branch for feature work, never off `main`.
5. Before touching any files, sync the checked-out branch from its parent (see "Always update a branch from its parent before starting new work on it" above) — merge latest `development` into a top-level feature branch, or the top-level feature branch into a `feature/<function>` sub-branch. Do this every session, even if the branch was synced recently.
6. Never assume it is acceptable to work on `main` directly, even for a "small" fix. Never assume it is acceptable to merge into `main` — that requires the developer to explicitly ask for a release.

## Working conventions

- Prefer small, focused changes that fit the existing React Native patterns instead of introducing new libraries or architecture.
- Preserve the existing navigation flow; route params and screen names must remain consistent.
- When modifying group-related logic, keep the `PlayerProfile` and `Group` types in [src/data/groups.ts](src/data/groups.ts) intact and update the tests in `src/utils/group-utils.test.ts` on the `unitTests`/`test/<feature>` lane when behavior changes — not on `development`/`main`.
- Avoid editing content in [example/](example/) unless the task specifically requires it.

## Documentation requirement

Every function and exported helper must be documented following the format in [docs/documentation-prompt.txt](docs/documentation-prompt.txt):
1. At least 3 plain-English lines describing what the function does.
2. `Parameters:` line listing each input.
3. `Returns:` line describing the output.
4. `Edge cases:` line describing failure modes or unusual results.
