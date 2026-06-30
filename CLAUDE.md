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

Modal-like screens pushed on the root stack (not tabs): `group-detail`, `player-profile`, `pickup-setup`, `life-counter`, `dev-tools`.

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

### Branch structure

```
main          ← production-only; merged into only from unitTests after tests pass
unitTests     ← integration point; feature branches merge here first
feature/*     ← one branch per feature, created fresh each time
```

- **`main` is read-only for direct work.** Never commit directly to main. It receives merges only from `unitTests` after all tests pass.
- **`unitTests` is the staging branch.** Every completed feature branch merges into `unitTests`. Unit tests for that feature are written and run on this branch before anything reaches main.
- **Each feature gets its own branch**, named `feature/<short-description>` (e.g. `feature/login-existing-profile`). Create it from the current tip of `unitTests`.
- **Branches are never deleted.** Keep all branches so work can be resumed or reverted later.

### Commit rules

- Every feature produces at least one commit on its feature branch.
- Commit as soon as a discrete piece of work is complete — do not batch unrelated changes into one commit.
- Commit messages must be descriptive: what changed and why, not just "fix" or "update".

### Workflow steps — do this for every feature

1. `git checkout unitTests && git pull` — start from the latest staging state.
2. `git checkout -b feature/<name>` — create the feature branch.
3. Implement the feature. Commit on the feature branch when done.
4. `git checkout unitTests && git merge feature/<name>` — bring the feature into staging.
5. Write or update unit tests on `unitTests` for the new behavior.
6. `npm test` — all tests must pass before anything merges to main.
7. `git checkout main && git merge unitTests` — only after tests are green.

### What to do at the start of every session

1. Run `git branch -a` to orient yourself — know what branches exist.
2. Ask the user which feature to work on if it is not obvious from context.
3. Check out (or create) the appropriate feature branch before touching any files.
4. Never assume it is acceptable to work on `main` directly, even for a "small" fix.

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
