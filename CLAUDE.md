# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

PlayLink is an Expo Router app (v56) built with React Native and TypeScript. Users create a profile and then browse, join, create, and manage play groups.

## Commands

- `npm install` — install dependencies
- `npm start` / `npx expo start` — start the dev server (add `--android`, `--ios`, or `--web` to target a platform)
- `npm test` — run all Jest tests
- `npx jest --testPathPattern=group-utils` — run a single test file by path fragment
- `npx jest -t "normalizes invalid"` — run tests matching a name pattern
- `npm run lint` — run ESLint via expo lint

### Git binary location

If `git` is not in your system PATH, your machine-specific path to the git executable is
stored in `CLAUDE.local.md` (gitignored — never committed). If you have not created that
file yet, copy `CLAUDE.local.md.example` and fill in the path for your environment.

Before changing Expo or routing behavior, read the versioned docs at https://docs.expo.dev/versions/v56.0.0/.

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

Modal-like screens pushed on the root stack (not tabs): `group-detail`, `player-profile`, `dev-tools`.

`pickup-setup` and `life-counter` also exist as root-stack screens, but only on the [life-counter branch](#the-life-counter-branch-feature-under-active-development-excluded-from-the-mvp) — they've been removed from `main`/`development` until that feature is finished (see Git workflow below). `group-detail`'s "Start Game" button is temporarily disabled (`GAME_SESSIONS_ENABLED = false`) as a result.

### State management

Global state lives in [src/context/AppContext.tsx](src/context/AppContext.tsx). `AppProvider` wraps the root layout and holds: `currentUser` (`UserProfile | null`), `groups` (seeded from `HARDCODED_GROUPS`), `rivals`, `chosenRivalId`, `mostPlayedAgainst`, `theme`, and `devDateOffset` (a millisecond offset used in dev tools to simulate future dates). All screens read and mutate this state via the `useApp()` hook. The tab layout redirects unauthenticated users to `/profile-creation`.

### Data layer

**[src/data/types.ts](src/data/types.ts)** is the canonical type file. It defines:
- `UserProfile` — the logged-in user's full identity (games, brackets, noGo rules, wins/losses/points).
- `GameType` (`'mtg' | 'pokemon' | 'lorcana' | 'onepiece'`) and associated display constants (`GAME_LABELS`, `GAME_EMOJI`, `GAME_COLOR`).
- `NoGoRule`, `FORMAT_OPTIONS`, `BRACKET_INFO`, `TIME_SLOTS`, `DAYS_OF_WEEK`.

**[src/data/groups.ts](src/data/groups.ts)** exports `PlayerProfile`, `Group`, and `HARDCODED_GROUPS` (a static seed list; it does not use `Math.random()`).

**[src/data/seed-profiles.ts](src/data/seed-profiles.ts)** provides the pool of `UserProfile` objects used for rival matching.

[src/data/random-data.ts](src/data/random-data.ts) holds string pools (names, locations, times) used by any future dynamic seeding.

### Domain utilities

**[src/utils/group-utils.ts](src/utils/group-utils.ts)** — pure group business logic: `findGroupByUsername`, `isHostForUser`, `isGroupFull`, `canJoinGroup`, `buildNewPlayer`, `normalizePositiveInt`, `removePlayerFromGroup`, `setPlayerAsHost`, `generateJoinCode`, `formatBrackets`. Tested in [src/utils/group-utils.test.ts](src/utils/group-utils.test.ts).

**[src/utils/rival-utils.ts](src/utils/rival-utils.ts)** — exports `findRivals`, which ranks seed profiles by win-rate proximity to the current user and always injects Dillon Carroll (id 113) as the first rival with his preferences mirrored from the current user. Tested in [src/utils/rival-utils.test.ts](src/utils/rival-utils.test.ts).

When adding new group or rival behavior, put the logic in the appropriate utils file and test it there — do not inline it in screen components.

### Styling

All styles use React Native `StyleSheet.create` defined at the bottom of each screen file. No external styling library is used.

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
- **`development` is the default integration target.** When older instructions or commit messages say "merge to main," that now means `development`, unless the developer is explicitly talking about cutting a release.
- **Top-level feature branches fork from `development`, not from `main` and not from `unitTests`.** Name them after the feature with no prefix: `life-counter`, `rival-system`, `shop`. See §5 of the full workflow doc for the current list.
- **Sub-work within a feature** uses `feature/<specific-function>` branched off that feature's own branch (e.g. `feature/rotate-button` off `life-counter`), merging back into it.
- **Testing is a separate lane**, not a step inside `development`. `unitTests` stays synced with `development`; `test/<feature>` is a throwaway-and-recreate merge of `unitTests` + the feature branch, used to write and run tests. Passing promotes the tests into `unitTests` and the feature into `development`; failing sends work back to the feature branch and `test/<feature>` gets recreated later.
- **Branches are not deleted as routine practice.** (A one-time cleanup happened when this document was written, removing branches whose entire history was already absorbed into `development` — see git log. That was a rare, explicit, developer-approved exception, not a standing policy.)

### The `life-counter` branch (feature under active development, excluded from the MVP)

Life counter is not a finished feature and must not reach `development` or `main` until the
developer gives an explicit go-ahead.

```
feature/<function>  →  life-counter  →  test/life-counter (+ unitTests)  →  development  →  main (explicit release only)
```

- `life-counter` itself only advances to `development` when the developer explicitly says the feature is ready to come back — do not do this proactively, even if `life-counter` has been sitting untouched for a while.
- `main`/`development` currently have life-counter's route and its entry points (group-detail's "Start Game" button, the secondary "Life Counter" button, and home's "Quick Actions" pickup card) removed/disabled behind a `GAME_SESSIONS_ENABLED` flag in [src/app/group-detail.tsx](src/app/group-detail.tsx). Restoring the feature means reverting that removal (or manually re-wiring) in addition to merging `life-counter` in — the merge alone will not restore the entry points, by design (see the removal commit's message for why).

### Commit rules

- Every feature produces at least one commit on its feature branch.
- Commit as soon as a discrete piece of work is complete — do not batch unrelated changes into one commit.
- Commit messages must be descriptive: what changed and why, not just "fix" or "update".

### Workflow steps — do this for every feature

1. `git checkout <feature> && git pull` — start from the latest state of the relevant top-level feature branch (or `development` if starting a brand-new top-level feature).
2. `git checkout -b feature/<function>` — create the sub-branch for this specific piece of work.
3. Implement the work. Commit on the sub-branch when done.
4. `git checkout <feature> && git merge feature/<function>` — bring it into the feature branch.
5. When the feature is ready to test: `git checkout unitTests && git merge development` (stay current), then `git checkout -b test/<feature> && git merge <feature>`.
6. Write/update unit tests on `test/<feature>`. `npm test` — all tests must pass.
7. On pass: merge the test additions back into `unitTests`, then `git checkout development && git merge <feature>`.
8. On fail: go back to step 2–4 on the feature branch; recreate `test/<feature>` later and retry step 6.
9. Do **not** merge to `main` at any point in this flow — that's a separate, explicitly-requested release step only.

### What to do at the start of every session

1. Run `git branch -a` to orient yourself — know what branches exist.
2. Ask the user which feature to work on if it is not obvious from context.
3. Check out (or create) the appropriate branch before touching any files — a `feature/<function>` sub-branch off the relevant top-level feature branch for feature work, never off `main`.
4. Never assume it is acceptable to work on `main` directly, even for a "small" fix. Never assume it is acceptable to merge into `main` — that requires the developer to explicitly ask for a release.

## Working conventions

- Prefer small, focused changes that fit the existing React Native patterns instead of introducing new libraries or architecture.
- Preserve the existing navigation flow; route params and screen names must remain consistent.
- When modifying group-related logic, keep the `PlayerProfile` and `Group` types in [src/data/groups.ts](src/data/groups.ts) intact and update tests in [src/utils/group-utils.test.ts](src/utils/group-utils.test.ts) when behavior changes.
- Avoid editing content in [example/](example/) unless the task specifically requires it.

## Documentation requirement

Every function and exported helper must be documented following the format in [docs/documentation-prompt.txt](docs/documentation-prompt.txt):
1. At least 3 plain-English lines describing what the function does.
2. `Parameters:` line listing each input.
3. `Returns:` line describing the output.
4. `Edge cases:` line describing failure modes or unusual results.
