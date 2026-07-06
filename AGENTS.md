# PlayLink agent instructions

This project's authoritative agent guidance lives in [CLAUDE.md](CLAUDE.md) — architecture,
commands, the mandatory git branching workflow, and the documentation requirement are all
there. Read it first; the notes below only cover what isn't already in that file.

## Project context
- This repository is an Expo Router (v57) app built with React Native and TypeScript.
- The main screens live in [src/app](src/app); route files there are the source of truth for navigation and screen behavior.
- Shared domain logic should live in [src/utils](src/utils), while app data models and seeded data live in [src/data](src/data).
- Before changing Expo or routing behavior, read the versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/.

## Helpful references
- Setup and project overview: [README.md](README.md)
- Data and utility helpers: [src/data/groups.ts](src/data/groups.ts) and [src/utils/group-utils.ts](src/utils/group-utils.ts)
