# PlayLink

A React Native / Expo Router app for finding and organizing tabletop card game play groups. Users create a profile, select the games they play, get matched with rivals, and browse or create local play groups.

Built with **Expo SDK 57**, **React Native**, and **TypeScript**.

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

This project uses a layered branch model built around one rule: **`main` only changes when
a developer explicitly cuts a release.** Everything else exists to protect it.

```bash
git checkout main          # release only — never commit here directly
git checkout development   # integration branch — everything ready lands here
git checkout life-counter  # example top-level feature branch
git checkout -b feature/your-change life-counter
```

| Branch | Purpose |
|---|---|
| `main` | Release only. Ships to MVP testers. Tagged at every release (e.g. `v0.1.0-mvp`). Never commit here, never merge here without an explicit release request. |
| `development` | Integration branch. Everything tested and finished lands here first. Not itself shippable. |
| `<feature>` (no prefix) | Top-level feature branch forked from `development`, named after the feature (e.g. `life-counter`, `rival-system`, `shop`). |
| `feature/<function>` | Sub-branch of a top-level feature branch, scoped to one specific piece of work, merges back into it. |
| `unitTests` | Kept in sync with `development`; feeds the `test/<feature>` cycle. |
| `test/<feature>` | Created fresh per test cycle as `unitTests` + `<feature>`; tests are written and run here before promotion. |

Full details, diagrams, and the pass/fail testing cycle are documented in
[`docs/version-control-workflow.md`](docs/version-control-workflow.md). `CLAUDE.md` has the
condensed, mandatory version of the same rules that Claude Code follows every session.

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
  documentation-prompt.txt     Function documentation standard
  version-control-workflow.md  Full branching/testing/release workflow reference
```

`life-counter.tsx` and `pickup-setup.tsx` exist as screens too, but only on the
`life-counter` branch — they're excluded from `main`/`development` until that feature is
finished (see the branch workflow above).

---

## For AI assistants (Claude Code)

This project ships with `CLAUDE.md` which Claude Code reads automatically. It contains the
architecture overview, git workflow rules, and documentation requirements.

Machine-specific instructions (git binary path, etc.) live in `CLAUDE.local.md`, which is
gitignored. Claude Code will reference that file for environment-specific commands.

---

## Expo documentation

- [Expo Router docs](https://docs.expo.dev/versions/v57.0.0/) (v57)
- [React Native docs](https://reactnative.dev/docs/getting-started)
- [Expo Go](https://expo.dev/go)
