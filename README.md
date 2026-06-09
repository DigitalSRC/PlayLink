# PodFinder

Find local Magic: The Gathering pods. Players build a profile once — pods find them.

iOS + Android app built with Expo. Web companion page planned for a later phase.

---

## What this is

A matchmaking app for MTG players. You set your bracket, formats, and availability. Pods that have open seats appear in your feed. You request to join; the pod messages you back.

---

## Monorepo structure

```
podfinder/
├── apps/
│   ├── mobile/          # Expo (React Native) — iOS + Android
│   └── web/             # Future: marketing / info page only
│
├── packages/
│   ├── types/           # Shared TypeScript types — single source of truth
│   ├── core/            # Shared business logic, API client, hooks
│   ├── ui/              # Shared component library
│   └── config/          # Shared constants, env handling, feature flags
│
└── docs/                # Architecture decisions, onboarding notes
```

### Why this structure

Every platform (`apps/*`) is a thin consumer of shared logic (`packages/*`). When a web companion page comes, it installs the shared packages and only writes what's web-specific. No copy-pasting types, no diverging business logic.

---

## File extensions

| Extension | What goes there |
|-----------|----------------|
| `.ts`     | Pure logic, types, utilities — no JSX |
| `.tsx`    | Any file with JSX (components, screens) |
| `.json`   | Config, package manifests |
| `.md`     | Documentation |

No `.js` or `.jsx` — TypeScript strict mode throughout.

---

## Getting started

### Prerequisites

- Node.js >= 20
- Yarn >= 1.22
- Expo CLI: `npm install -g expo-cli`
- For iOS: Xcode 15+ (macOS only)
- For Android: Android Studio + emulator

### Install

```bash
git clone https://github.com/your-org/podfinder.git
cd podfinder
yarn install
```

### Run the mobile app

```bash
yarn mobile            # Start Expo dev server
yarn mobile:ios        # Open in iOS simulator
yarn mobile:android    # Open in Android emulator
```

### Type checking + linting

```bash
yarn typecheck
yarn lint
yarn format
```

---

## Key decisions

**React Native + Expo** — one codebase, both stores. Expo handles OTA updates, push notifications, and native module wrappers without ejecting.

**TypeScript strict mode** — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` all on. Verbose upfront, saves hours of runtime debugging.

**Yarn workspaces monorepo** — packages stay co-located without publishing to npm. Each package can be owned independently as the team grows.

**`@podfinder/types` is the foundation** — every model (`UserProfile`, `Pod`, `Message`, `Session`) lives here. Never re-define a type in a feature file.

**Bracket as the primary signal** — WotC's official 1–5 bracket system is the core compatibility filter. First tag on every pod card, first field on every profile.

---

## Bracket system reference

| Bracket | Name | Description |
|---------|------|-------------|
| 1 | Precon | Unmodified or very lightly changed precons |
| 2 | Casual | Modified precons and budget brews |
| 3 | Optimized | Tuned, synergy-focused lists |
| 4 | High power | Near-cEDH, strong engines and interaction |
| 5 | cEDH | Competitive, maximally optimized |

---

## Roadmap

```
v1.0  iOS + Android (Expo) — core pod browsing, profiles, messaging
v1.1  Push notifications, pod management for hosts
v1.2  Session scheduling
v2.0  Web companion / info page
```

---

## Environment variables

```bash
cp .env.example .env
```

Never commit `.env`.

---

## Contributing

Branch naming: `feat/`, `fix/`, `chore/` prefixes. PRs require passing typecheck + lint.
