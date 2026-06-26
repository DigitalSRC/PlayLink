# PlayLink

A React Native / Expo Router app for finding and organizing tabletop card game play groups. Users create a profile, select the games they play, get matched with rivals, and browse or create local play groups.

Built with **Expo SDK 56**, **React Native**, and **TypeScript**.

---

## Getting started

### Prerequisites

- Node.js 18+
- npm 9+
- [Expo Go](https://expo.dev/go) on your phone, or an Android/iOS simulator

### Install and run

```bash
npm install
npx expo start
```

Then press `a` for Android, `i` for iOS, or `w` for web. Scan the QR code with Expo Go to run on a physical device.

---

## Machine-specific setup (required for all developers)

Some tooling paths differ between machines and must not be committed to the repository.
These are stored in a gitignored file that each developer creates locally.

**Steps:**

1. Copy the template:
   ```bash
   cp CLAUDE.local.md.example CLAUDE.local.md
   ```

2. Open `CLAUDE.local.md` and fill in any values that apply to your machine. The most
   common one is the git binary path if `git` is not in your system PATH — see the
   template for instructions and common locations per OS/tooling.

3. `CLAUDE.local.md` is listed in `.gitignore`. Never commit it.

---

## Branch and workflow setup

This project uses a three-tier branch model. When you clone the repo, make sure all three
branches are available locally:

```bash
git checkout main
git checkout unitTests
git checkout -b feature/your-first-feature unitTests
```

| Branch | Purpose |
|---|---|
| `main` | Production only. Never commit here directly. |
| `unitTests` | Staging. All feature branches merge here; tests run here before anything hits main. |
| `feature/*` | One branch per feature, branched off `unitTests`. Never deleted. |

See `CLAUDE.md` for the full step-by-step workflow Claude Code follows on every session.

---

## Project commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npx expo start` | Start the dev server |
| `npx expo start --android` | Target Android specifically |
| `npx expo start --ios` | Target iOS specifically |
| `npm test` | Run all Jest unit tests |
| `npx jest --testPathPattern=group-utils` | Run a single test file by path fragment |
| `npm run lint` | Run ESLint |

---

## Project structure

```
src/
  app/                  Expo Router screens
    (tabs)/             Tab navigator screens (home, browse, profile)
    index.tsx           Entry point — redirects based on auth state
    profile-creation.tsx  Multi-step onboarding flow
    group-detail.tsx    Group detail / management screen
  context/
    AppContext.tsx       Global state (current user, groups, rivals)
  data/
    types.ts            Core TypeScript interfaces and constants
    groups.ts           Group type + hardcoded seed groups
    seed-profiles.ts    Seed player profiles used for rival matching
    random-data.ts      String pools for random group generation
  utils/
    group-utils.ts      Pure business logic for group operations
    rival-utils.ts      Rival matching algorithm
    group-utils.test.ts Unit tests
docs/
  documentation-prompt.txt  Function documentation standard
```

---

## For AI assistants (Claude Code)

This project ships with `CLAUDE.md` which Claude Code reads automatically. It contains the
architecture overview, git workflow rules, and documentation requirements.

Machine-specific instructions (git binary path, etc.) live in `CLAUDE.local.md`, which is
gitignored. Claude Code will reference that file for environment-specific commands.

---

## Expo documentation

- [Expo Router docs](https://docs.expo.dev/versions/v56.0.0/) (v56)
- [React Native docs](https://reactnative.dev/docs/getting-started)
- [Expo Go](https://expo.dev/go)
