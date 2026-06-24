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

Before changing Expo or routing behavior, read the versioned docs at https://docs.expo.dev/versions/v56.0.0/.

## Architecture

### Navigation flow

Expo Router file-based routing. Three screens in [src/app/](src/app/):

```
index (landing / welcome)
  └─ profile-creation  (collects username, location, bracket)
       └─ browse-games?username=<value>  (main group management screen)
```

`_layout.tsx` wraps everything in a bare `<Stack />`. The `username` value collected on the profile-creation screen is passed as a route param to browse-games; it is the only user identity the app carries.

### State management

There is no global state, context, or external store. `browse-games.tsx` holds all runtime group state in local `useState`. The initial value comes from `HARDCODED_GROUPS` (see below). Every join, leave, create, and edit mutates that array via `setGroups`.

### Data layer

[src/data/groups.ts](src/data/groups.ts) exports:
- `PlayerProfile` and `Group` TypeScript interfaces — the canonical data shapes for the entire app.
- `HARDCODED_GROUPS` — a module-level constant populated with randomly generated groups on first import. Because it uses `Math.random()` at module load time, the list differs on each app restart.

[src/data/random-data.ts](src/data/random-data.ts) holds the string pools (names, locations, times) used by the seed logic.

### Domain utilities

[src/utils/group-utils.ts](src/utils/group-utils.ts) contains all pure business logic functions: `findGroupByUsername`, `isHostForUser`, `isGroupFull`, `canJoinGroup`, `buildNewPlayer`, `normalizePositiveInt`, `removePlayerFromGroup`, `setPlayerAsHost`. These are tested in [src/utils/group-utils.test.ts](src/utils/group-utils.test.ts).

Note: the `browse-games` screen duplicates some join/leave logic inline rather than calling these utilities. When adding new group behavior, put the logic in `group-utils.ts` and test it there.

### Styling

All styles use React Native `StyleSheet.create` defined at the bottom of each screen file. No external styling library is used.

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
