# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

PlayLink is an Expo Router app (v57) built with React Native and TypeScript, developed by Silvenari. Users sign in, create a profile, and then browse, join, create, and manage tabletop card game play groups, report round results for points, and get matched with rivals. The backend is Supabase (auth, Postgres with RLS, Edge Functions, `pg_cron` jobs).

Everything in this file describes `development` unless it says otherwise. `main` is the `v0.1.0-mvp` release and predates the Supabase backend entirely (no `src/lib/`, no sign-in screen, rival data stubbed out) — don't infer how the app works from `main`.

## Commands

- `npm install` — install dependencies
- `npm start` / `npx expo start` — start the dev server (add `--android`, `--ios`, or `--web` to target a platform)
- `npx tsc --noEmit` — type-check. There is no npm script for it. Errors under `example/` are noise (an untracked, gitignored Expo template whose `@/` imports don't resolve here); only errors under `src/` count. `supabase/functions/**` is excluded in `tsconfig.json` because it's Deno code.
- `npm run lint` — run ESLint via expo lint. The baseline is **not** clean: it already reports dozens of errors under `src/`, almost all `react-hooks/refs`, `react-hooks/rules-of-hooks`, and `react/no-unescaped-entities`. Compare against the baseline rather than expecting zero, and don't mass-fix them as a side effect of other work.
- `npm test` — run all Jest tests (`jest --runInBand`; only meaningful on `unitTests` or a `test/<feature>` branch — test files are never present on `development`/`main`, see Git workflow below)
- `npx jest --testPathPattern=group-utils` — run a single test file by path fragment
- `npx jest -t "normalizes invalid"` — run tests matching a name pattern
- `npx supabase functions deploy refresh-rivals --no-verify-jwt` — deploy an Edge Function (CLI login/link details are in `CLAUDE.local.md`). `sync-local-events` deploys the same way; `resolve-area` deploys **without** `--no-verify-jwt`.

Jest uses the `jest-expo` preset with `jsdom`. [jest.setup.env.js](jest.setup.env.js) injects placeholder `EXPO_PUBLIC_SUPABASE_*` values because `src/lib/supabase.ts` throws at import time without them, and `jest.config.js` maps AsyncStorage to its official mock — so a test can import anything that transitively touches the Supabase client without a real `.env`.

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

Expo Router file-based routing. [src/app/_layout.tsx](src/app/_layout.tsx) nests, outermost first: `GestureHandlerRootView` (required at the root for `group-detail`'s drag-and-drop) → `PersistQueryClientProvider` → `AppProvider` → a `<Stack />` with headers hidden globally (wrapped in `ThemedStack`, which paints the stack background and status bar in the current theme), with `<DialogHost />` beside it. The order matters: `AppProvider` calls React Query hooks, so the query client must sit above it, and both `ThemedStack` and `DialogHost` read the theme, so they sit inside it.

**Pop-ups go through `showDialog`, never `Alert.alert`.** React Native's `Alert.alert` draws nothing in a web browser, so on web every confirmation, warning, and error was silently skipped (found in play-testing 2026-10-08: Delete Posting, the Shop's buy button, and "already in a group" all looked dead). [src/components/AppDialog.tsx](src/components/AppDialog.tsx) exports `showDialog(title, message?, buttons?)` with the same arguments, drawn by the one `DialogHost` at the root; it queues, follows the theme, and falls back to `Alert.alert` only when no host is mounted (a screen rendered alone in a unit test). Because the host is a native `Modal`, a screen that needs a dialog on top of its own sheet must draw that sheet as an in-screen overlay, not a second `Modal` (see the round-report sheet in `group-detail`). Every action a player takes should end by saying it worked.

```
index             (no UI of its own — a spinner, then a Redirect based on useAuthStatus())
  ├─ sign-in           (no session: email/password sign-up or sign-in)
  ├─ profile-creation  (session but no profiles row: identity → games → preferences → rival reveal)
  └─ (tabs)/           ← authenticated zone; its layout re-runs the same gate and redirects
       ├─ stats          to /sign-in or /profile-creation if the user isn't 'ready'
       ├─ calendar     (this month's local store events for the player's area; Commander by default)
       ├─ home         (joined groups, upcoming sessions) — centered, rendered larger
       ├─ browse       (discover, create, and join groups; tab label is "Find")
       └─ profile      (user settings, theme, change password, sign-out)
```

The tabs are listed above in their on-screen order (Stats, Calendar, Home, Find, Profile), which is deliberate — see the comment in [(tabs)/_layout.tsx](src/app/(tabs)/_layout.tsx). `(tabs)/shop.tsx` is the working Shop, but it is **not in the tab bar** (`SHOP_TAB_ENABLED = false` in that layout - the Calendar has its old slot and six tabs is one too many). It stays registered as a hidden tab route so the tab bar remains visible on it; players reach it from the points badge on Home and the Shop row on the Profile tab.

`sign-in` does not rely on the auth listener alone to leave the screen: `index` and `sign-in` are sibling routes, so `index`'s gate only re-evaluates when remounted. After a successful sign-in the screen explicitly navigates back to `/`.

Modal-like screens pushed on the root stack (not tabs): `group-detail`, `player-profile`.

`pickup-setup` and `life-counter` also exist as root-stack screens, but only on the [life-counter branch](#the-life-counter-branch-feature-under-active-development-excluded-from-the-mvp) — they've been removed from `main`/`development` until that feature is finished (see Git workflow below), and neither has any entry point on `development`/`main` today (no disabled button or flag stands in for them — see that section for why). `group-detail`'s round-reporting/scoring flow (a separate, unrelated feature — see [Groups & game scoring](#groups--game-scoring-supabase) below) is fully live on `development`/`main`.

`dev-tools` also exists as a root-stack screen, but only on the dedicated `dev-tools` branch (and `unitTests`/`test/<feature>`) — see [Dev Tools and leftover seed data](#dev-tools-and-leftover-seed-data-gated-off-developmentmain) below.

### State management

Global state lives in [src/context/AppContext.tsx](src/context/AppContext.tsx). `AppProvider` wraps the root layout and holds: `session`/`authLoading`/`profileLoading` (Supabase auth status — see Auth & data below), `currentUser` (`UserProfile | null`, fetched and cached via React Query rather than plain local state), `groups`/`groupsLoading` (fetched live from Supabase via `useGroupsQuery()` — see [Groups & game scoring](#groups--game-scoring-supabase) below, not seeded locally on any branch), `rivals` (rehydrated from the profile's stored `rivalIds` via `fetchProfilesByIds` whenever the profile loads or changes — see [Rival matching](#rival-matching) below), `chosenRivalId` (the player's picked Rival, remembered per account in AsyncStorage — per device, not synced), `mostPlayedAgainst`, `theme` (defaults to `'dark'`; the choice is saved in AsyncStorage per device, not per account), and `devDateOffset` (a millisecond offset used in dev tools to simulate future dates; read it through `getNow()` rather than calling `Date.now()` in time-dependent logic). All screens read and mutate this state via the `useApp()` hook. [src/utils/auth-status.ts](src/utils/auth-status.ts)'s `useAuthStatus()` combines session/profile status into `'loading' | 'unauthenticated' | 'no-profile' | 'ready'`; `index.tsx` and the tab layout both branch on it to redirect to `/sign-in`, `/profile-creation`, or render normally.

### Auth & data (Supabase)

PlayLink authenticates and persists user profiles via [Supabase](https://supabase.com). Requires `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in a local `.env` (see `.env.example`) — the app throws at startup if either is missing.

- **[src/lib/supabase.ts](src/lib/supabase.ts)** — the Supabase client singleton (PKCE flow, AsyncStorage-backed session persistence). Only passes AsyncStorage as auth storage outside the Node SSR prerender pass that `app.json`'s `web.output: "static"` performs — see the file's comments before touching this.
- **[src/lib/auth-api.ts](src/lib/auth-api.ts)** — `signUpWithEmail`/`signInWithEmail`/`updatePassword` are the live path: email/password is the only sign-in method currently surfaced, and the Supabase project has email confirmation disabled, so sign-up establishes a session immediately. `signInWithGoogle` (hosted OAuth redirect via `expo-web-browser`) and `signInWithApple` (native Sign in with Apple, iOS-only) are fully built but hidden behind `OAUTH_ENABLED = false` in [sign-in.tsx](src/app/sign-in.tsx) until their external console setup is done (Supabase Auth provider config, a Google Cloud OAuth client, an Apple Developer Services ID).
- **[src/lib/profile-api.ts](src/lib/profile-api.ts)** — `fetchProfile`/`insertProfile`/`updateProfile` wrapping the `profiles` table (schema in `supabase/migrations/`), the read helpers behind other screens (`fetchProfilesByIds`, `fetchProfileByUsername` for `player-profile`, `fetchLeaderboard` for `stats`, `fetchRivalCandidates` for onboarding), plus the snake_case↔camelCase converters (`mapRowToProfile`/`mapProfileToRow`) that keep the DB's column naming out of the rest of the app. `insertProfile` throws `UsernameTakenError` on a case-insensitive username collision. `insertProfile`/`updateProfile` also best-effort sync `username`/`displayName` into the auth user's own metadata (`syncAuthUserMetadata`, via `supabase.auth.updateUser({ data })`) so Supabase Studio's Authentication → Users view shows a real identity instead of a blank one; failures there are logged, not thrown — `profiles` stays the source of truth.
- **[src/hooks/useAuthSession.ts](src/hooks/useAuthSession.ts)** and **[src/hooks/useProfileQueries.ts](src/hooks/useProfileQueries.ts)** — React Query hooks (`useProfileQuery`, `useCreateProfileMutation`, `useUpdateProfileMutation`) that `AppContext` adapts into `currentUser` and its mutators (`awardPoints`/`addWin`/`addLoss`/`addDraw`/`resetMonthlyPoints`), using optimistic updates so they still feel instant. Cached via [src/lib/query-client.ts](src/lib/query-client.ts) (`PersistQueryClientProvider` in `_layout.tsx`), persisted to AsyncStorage, so a cached profile renders instantly on cold start before the network refetch completes.
- `UserProfile.id` is a Supabase auth UUID (`string`), matching `auth.users.id` 1:1 so RLS policies on `profiles` are a one-line `auth.uid() = id` check.
- **[src/lib/crypto-polyfill.ts](src/lib/crypto-polyfill.ts)** — a `SubtleCrypto.digest` shim backed by `expo-crypto`, since React Native has no native `crypto.subtle`. Supabase's PKCE auth flow needs it to hash the code verifier; `subtleDigest` is async so an unmapped algorithm rejects the returned promise rather than throwing synchronously, matching the real `SubtleCrypto.digest` contract.

### Groups & game scoring (Supabase)

Groups have real backend persistence (schema in `supabase/migrations/`, starting at `20260705140000_create_groups.sql`: `groups`, `group_players`, `group_results`) — `AppContext`'s `groups` is fetched live via `useGroupsQuery()`, not client-only state.

Two rules are enforced in the database, not just the client, and both affect how the UI must behave:

- **One group per player per day** (decided 2026-10-08; a player may hold a group on every day). `groups.play_date` is the calendar day the host picked, as it read on their phone; a trigger copies it onto each seat as `group_players.session_date`, and the unique index `group_players_one_per_day (player_id, session_date)` refuses a second seat that day even if the client-side check was fooled by a not-yet-loaded groups list (`20261008120000_group_play_date.sql`). The day is the host's local day on purpose: bucketing by the UTC date of `scheduled_at` refused Friday 7 PM plus Saturday 1 PM for a west-coast player and allowed two groups on the same Saturday. The client goes through `groupDayKey`/`findGroupOnDay` in `group-utils.ts` and turns the database's refusal into a sentence with `groupErrorMessage`. `play_date` is client-supplied, so a check constraint keeps it within a day of `scheduled_at`.
  **Until that migration is applied to the live database** (it was not, as of 2026-10-08), live still buckets by UTC date using the older trigger from the shelved `calendar-system` work, and `createGroup` retries without `play_date` when the column is missing. The earlier `20260706120000_one_group_per_player.sql` index is dropped by the new migration.
- **Scores and rosters are written by the server, not the client.** The migrations are live on Supabase (applied 2026-10-07), but the client code that uses them is only on `security-hardening`, `shop`, and `combined-preview` - a build from `development`, `event-calendar`, `commander-only`, or `main` still tries to write scores directly and is now refused when it reports a round, collects points, or deletes a group. After `20260930120000_harden_rls_server_authoritative_scoring.sql`, `20261006140000_group_lifecycle_rpcs.sql`, and `20261007140000_server_venue_bonus.sql`, a signed-in client has no write access to `group_results`, to a profile's `points`/`monthly_points`/`wins`/`losses`/`draws`/`is_developer`, or to delete/update rows in `groups`/`group_players` beyond the host editing their own group. Every such change goes through a `SECURITY DEFINER` function that checks who is calling and re-derives points from the finish order. Before these migrations, "Delete Posting" and "Cancel Round" silently did nothing (no DELETE policy) and a player could rewrite their own points - GitHub issue #10. `createGroup` is still two requests, so a refused host seat can leave an empty group row behind.
- **Stale groups delete themselves.** An hourly `pg_cron` job (`20260706130000_stale_group_cleanup_cron.sql`) deletes any group whose `scheduled_at` is more than 12 hours in the past. Groups with no `scheduled_at` are never touched. A group vanishing between two reads is therefore normal, not a bug.

- **[src/lib/group-api.ts](src/lib/group-api.ts)** — reads (`fetchGroups`, `fetchGroupById`, `fetchGroupResults`) and the two direct inserts that remain (`createGroup`, `joinGroup`, each limited by RLS to the caller's own id), plus thin wrappers over the server functions: `leaveGroup` → `leave_group` (deletes the group if the caller was last, appoints a new host if they were host), `deleteGroup` → `delete_group` (host only), `setGroupHost` → `transfer_group_host`, and `submitGroupResult` → `submit_group_result`. **A reported round is final** (`20261007160000_final_results.sql`): that one call checks the caller is the host, scores the finish order, adds the store-event bonus, records the round, pays every player (Points, Score, All-Time, and win/loss/draw), and bumps `rounds_played`, in one transaction. It refuses any round number that isn't exactly `rounds_played + 1`, which is what makes a double tap or a retry harmless. There is **no dispute window, no pending state, and no way to edit or cancel a round** - the earlier dispute/cancel/finalize/collect functions were dropped, and `group_results.status` is constrained to `'finalized'` (the `dispute_*`, `disputed_by`, and `applied_by` columns are leftovers, still written but unused). `updateGroup`/`confirmGroup` are still direct updates, allowed for the host only.
- **Several groups per player.** Because the rule is per day, code must not assume a player has "their group": Home lists all of them (`findGroupsForPlayer`), and create/join compare days, not membership.
- **[src/hooks/useGroupQueries.ts](src/hooks/useGroupQueries.ts)** — React Query wrappers around `group-api.ts` (`groupKeys` cache-key factory; `useGroupsQuery`/`useGroupQuery`/`useGroupResultsQuery` reads; create/join/leave/delete/setHost/update/confirm/submitResult/disputeResult/cancelResult mutations, each invalidating the relevant list/detail/results query key on success).
- **[src/utils/scoring-utils.ts](src/utils/scoring-utils.ts)** — `computePlacementScores`, pure and unit-testable: the winner's base point pool is `10 * (participants - 1)`, each subsequent distinct rank earns half of the rank before it, the last distinct rank always scores zero placement points (overriding the halving formula), and every player additionally gets a flat `PARTICIPATION_POINTS` (10) regardless of standing. Tied placements score identically and are reported as `'draw'`, even when the tied rank is last.
- [group-detail.tsx](src/app/group-detail.tsx) is the only consumer of this flow: host confirms the group (30-minute `CONFIRM_LOCK_MS` age lock plus a minimum-attendee check), then reports each round via drag-and-drop placement order. Because a report is final, the host is shown the order read back ("1st - ..., 2nd - ...") and must confirm before it is sent; that read-back is the only guard against a mis-dragged row. Everyone in the group sees the latest round's standings and points. Other players' apps learn they were paid by noticing a new round that includes them and refreshing their own profile.

### Local events calendar

The Calendar tab ([(tabs)/calendar.tsx](src/app/(tabs)/calendar.tsx)) shows the current month of local game-store Magic events — where and when organized play happens — and is deliberately separate from `groups`. The grid writes shortened store names on each day; a format switcher defaults to Commander; below the grid is a "coming up" list from today to the end of the month. There is no month navigation yet. The player can change their location from this tab (it updates the profile, so every tab follows) and ask for an immediate refresh. Rows live in the `local_events` table (`supabase/migrations/20261006120000_create_local_events.sql`). Clients have a SELECT grant and policy only, so there is no in-app way to add or edit one. An event is either weekly (`day_of_week`) or a one-off (`event_date`), and its times are venue wall-clock values with no time zone — never run them through `Date`.

Rows are filled automatically. `supabase/functions/sync-local-events` (Deno; every 6 hours via the `pg_cron` job in `20261006130000_sync_local_events_cron.sql`, deployed with `--no-verify-jwt`, reusing refresh-rivals's `CRON_SECRET`/vault `cron_secret`) pulls scheduled Magic events of every format near each area from the service behind Wizards of the Coast's store locator (locator.wizards.com), where stores post their own events, and upserts them as `source = 'feed'` rows keyed by `external_uid`. That service is **undocumented and unsupported** — it can change without notice, so the function throws rather than accept a partial read, never deletes on a failed or empty fetch, and only ever touches `'feed'` rows. `source = 'curated'` rows are hand-added (Studio/service role) for venues the locator doesn't cover. Each run covers the areas in `event_areas` that a player has requested in the last 30 days (capped per run).

Areas are rows, not code. `event_areas` (`20261007120000_event_areas.sql`) holds each area's center, radius, and time zone; `local_events.area` is a foreign key to it. `supabase/functions/resolve-area` (deployed **with** JWT verification, and it additionally requires a real signed-in user since the anon key is itself a valid JWT) takes the player's free-text profile location, geocodes it (Open-Meteo — free for non-commercial use only; swap `geocode()` before a commercial launch), returns the area whose radius contains that point or creates one centered on it, and syncs that area on the spot if it's stale. Sync starts are serialized and rate-limited per area by a guarded UPDATE of `last_synced_at` (`claimAndSyncArea` in `sync-local-events/sync.ts`), shared by the cron job and this function. The calendar's "Change" control just updates `profiles.location`; the area follows because `useEventAreaQuery` is keyed on that text.

- **[src/data/local-events.ts](src/data/local-events.ts)** — the `LocalEvent`, `EventArea`, and `EventAreaResolution` types. No city is hardcoded in the app.
- **[src/lib/local-event-api.ts](src/lib/local-event-api.ts)** / **[src/lib/event-area-api.ts](src/lib/event-area-api.ts)** / **[src/hooks/useLocalEventQueries.ts](src/hooks/useLocalEventQueries.ts)** — `fetchLocalEvents(area, format?)`, `resolveEventArea(location, refresh?)` (calls the `resolve-area` function; throws a coded `EventAreaError`), and their React Query wrappers.
- **[src/utils/calendar-utils.ts](src/utils/calendar-utils.ts)** — pure month-grid/date-key/event-matching helpers, the per-day store labels and upcoming list, and `formatAgo`.
- **[src/components/MonthCalendar.tsx](src/components/MonthCalendar.tsx)** — the grid itself; display only.

**Store-event bonus.** A group is tied to a store event only by starting it from the Calendar tab: every listed event from today onward has a "Create game" button, which pushes `browse` with `openCreate` plus the `storeEvent*` route params built by `storeEventLinkParams`. `browse.tsx` validates them with `parseStoreEventLink` (a bad link alerts and opens nothing) and opens the normal create form with the game, format, venue, and night fixed to the event; posting sets `groups.local_event_id` (`20261007130000_group_store_event.sql`, `ON DELETE SET NULL`). The create form has no event picker of its own, and `group-detail` won't let the host edit a linked group's location. Weekly events can be linked too — the day they were listed under pins the night. When the host reports a round, the server's `submit_group_result` adds `VENUE_EVENT_BONUS` (10) to each player who hasn't already had it for that group, but only if the round is reported from the event's start time on its own day until 4:00 AM the next morning, in the venue's time zone. Each placement records its `venueBonus` so the bonus is paid once per player per event. The rule lives in SQL (`venue_bonus_eligible` in `20261007140000_server_venue_bonus.sql`, using the server's clock) and fails closed: no bonus, never a blocked round. The pure functions in **[src/utils/venue-bonus-utils.ts](src/utils/venue-bonus-utils.ts)** are the reference copy the unit tests pin - a **hand-maintained duplicate**, like `computePlacementScores` and its SQL port, so change both together.

### Points, Score, and the Shop

A profile has three numbers, and they must not be confused:

| Column | App name | What it is |
|---|---|---|
| `point_balance` (`pointBalance`) | **Points** | Spendable. Goes up by exactly what is earned, down only on a purchase. Shown on Home and in the Shop. |
| `monthly_points` (`monthlyPoints`) | **Score** | This month's earnings. Ranks the leaderboard and rival matching; reset to 0 each month by `refresh-rivals`. Never reduced by spending. |
| `points` | **All-Time** | Everything ever earned. Never goes down; milestones are measured against it. |

All three are credited together, once, by `submit_group_result` at the moment the host reports the round. None is writable by a client.

The Shop sells cosmetics only - **titles**, **name colors**, and **card borders** - all drawn from text and color, so nothing needs artwork. Schema and rules are in `supabase/migrations/20261007150000_point_balance_and_shop.sql`:

- `shop_items` is the catalog (read-only to clients; add or reprice items in Studio or by migration - no app release needed). `joined_before` marks early-supporter items such as "Beta Tester", obtainable only by profiles created before that date; the seeded cutoff (2027-01-01) is a placeholder to move when beta ends. `is_active = false` hides an item without taking it from anyone who owns it.
- `shop_purchases` records ownership; a player can read only their own rows.
- `purchase_shop_item(item_id)` looks the price up itself, locks the buyer's profile row, checks the balance, deducts, and records the purchase in one transaction. Re-buying an owned item charges nothing (safe on a double tap or retry).
- `equip_shop_item(kind, item_id | null)` writes the worn item's **display value** onto the profile (`title`, `name_color`, `card_border`), so any screen can draw another player's look straight from their profile row without loading the catalog.

Client side: **[src/data/shop.ts](src/data/shop.ts)** (types, `BORDER_STYLES` - the key-to-colors map for borders; a key the build doesn't know draws no border), **[src/utils/shop-utils.ts](src/utils/shop-utils.ts)** (pure: `groupShopItems`, `shopItemState`, `pointsShort`, `safeNameColor`, `borderStyleFor`), **[src/lib/shop-api.ts](src/lib/shop-api.ts)**, **[src/hooks/useShopQueries.ts](src/hooks/useShopQueries.ts)**, and **[src/components/PlayerName.tsx](src/components/PlayerName.tsx)** (`PlayerName` draws a name in its bought color with the title beneath; `CosmeticBorder` frames a card). **Any screen that shows a player's name should render it with `PlayerName`** so a purchase shows everywhere; today that is Home (own name), the group roster, the leaderboard, `player-profile`, the Shop preview, and the Profile tab's "Your Title" section, where a player switches between the titles they own without going back to the Shop. `PlayerName` returns the name and title as siblings, so wrap it in a plain `View` wherever the parent lays children out in a row. Name colors from other players' rows go through `safeNameColor` before reaching a style.

Adding a new border means a `shop_items` row **and** a `BORDER_STYLES` entry; adding a title or color needs only the row.

### Starter rewards

A new player earns 25 points, once each, for four things: posting a game, joining someone else's, looking through the Calendar, and picking their Rival (`20261008130000_starter_rewards.sql`). `claim_starter_reward(key)` is the only way they are paid: it fixes the amount itself, records the claim as a row in `starter_rewards` (primary key player + reward, so never twice), and credits Points, Score, and All-Time together. It verifies what it can - a seat in a group the caller created, or one somebody else created; rivals to choose from - but opening the Calendar leaves nothing to check and the chosen Rival lives on the phone, so those two can be claimed by calling the function directly. That is 50 points at most, once per account, and is accepted.

Client side: **[src/data/rewards.ts](src/data/rewards.ts)** (the four rewards and their display copy), **[src/lib/reward-api.ts](src/lib/reward-api.ts)**, and **[src/hooks/useRewardQueries.ts](src/hooks/useRewardQueries.ts)**. Screens call `useClaimStarterReward(userId)`'s `claim(key)` right after the task succeeds; it is silent unless points were actually paid, so it is safe to call every time. Home shows the checklist until all four are claimed, and hides it entirely if the server has no starter rewards (the query fails), which is the case until the migration is applied.

**[src/components/HowItWorksSheet.tsx](src/components/HowItWorksSheet.tsx)** is the "How PlayLink works" guide. It opens from a button on Home at any time, and by itself once (remembered per account in AsyncStorage) with a welcome the first time a new player arrives from onboarding.

### Rival matching

Rival matching is live on `development` and runs against real `profiles` rows — there is no seed pool involved. It is computed in two places that must agree:

- **Client, once, at signup.** [profile-creation.tsx](src/app/profile-creation.tsx) calls `fetchRivalCandidates` and ranks them with `findRivals` from [rival-utils.ts](src/utils/rival-utils.ts), then best-effort persists the result to the profile's `rivalIds`. If nobody matches (e.g. the very first profile), the rival-reveal step is skipped rather than shown as a dead end.
- **Server, daily.** `supabase/functions/refresh-rivals` (Deno; scheduled by the `pg_cron`/`pg_net` job in `supabase/migrations/20260705130000_rival_refresh_cron.sql`, deployed with `--no-verify-jwt` and checking its own `x-cron-secret` header) rewrites every profile's `rival_ids` and is the long-term source of truth. Its `rankRivals` is a **hand-maintained duplicate** of `findRivals`, because an Edge Function can't import app source — change the ranking rule in one and you must change it in the other.

The ranking rule in both: candidates must share at least one game with the user, then are ordered by closeness of `monthlyPoints` (not lifetime win rate), capped at 3.

The same Edge Function also resets every profile's `monthlyPoints` to 0 when the calendar month rolls over in Pacific time. `monthlyPoints` is what `(tabs)/stats.tsx`'s leaderboard (`fetchLeaderboard`) sorts by, so that reset is the season boundary for the leaderboard and rival matching together. `AppContext`'s local `resetMonthlyPoints` mutator still exists for client-driven resets, but the automatic rollover happens server-side. All branches share one Supabase project (one set of migrations, no per-branch isolation), so these jobs run regardless of what's checked out locally.

`rival-utils.ts` still contains a leftover from the seed-data era: a hardcoded "Dillon Carroll" profile (`DILLON_ID = '113'`) that is injected as the first rival if the pool contains that id. Real profile ids are UUIDs, so this branch is inert in the shipped app — but the unit tests exercise it, and the file's header comment about `RIVAL_POOL` being empty "on this branch" is out of date.

### Data layer

**[src/data/types.ts](src/data/types.ts)** is the canonical type file. It defines:
- `UserProfile` — the logged-in user's full identity (games, brackets, noGo rules, wins/losses/points).
- `GameType` (`'mtg' | 'pokemon' | 'lorcana' | 'onepiece'`) and associated display constants (`GAME_LABELS`, `GAME_EMOJI`, `GAME_COLOR`).
- `NoGoRule`, `NO_GO_OPTIONS`, `FORMAT_OPTIONS`, `BRACKET_INFO`, `TIME_SLOTS`, `DAYS_OF_WEEK`.

**Commander-only mode.** `COMMANDER_ONLY = true` in `types.ts` narrows the whole app to Magic Commander without deleting anything: onboarding skips its game step and saves `games: ['mtg']` / `preferredFormats: { mtg: ['Commander'] }`, the create-group form has no game or format pickers, the Find tab lists only Commander groups (and join-by-code only finds those), the Calendar pins its format and hides the switcher, and Home, Stats, Profile, and `player-profile` hide their game and format lists. Screens must go through the helpers next to the flag (`SELECTABLE_GAMES`, `selectableFormats`, `visibleGames`, `isGroupInScope`) instead of reading `FORMAT_OPTIONS` or a profile's `games` directly, so flipping the flag back to `false` restores every option. It is a display rule only: older rows with other games or formats stay in the database, and nothing server-side rejects one.

**[src/data/groups.ts](src/data/groups.ts)** exports the `PlayerProfile` and `Group` types and nothing else. `PlayerProfile.id` is a Supabase auth UUID (`profiles.id` / `group_players.player_id`), not a locally-generated number.

[src/data/random-data.ts](src/data/random-data.ts) holds string pools (names, locations, times) for possible future seeding; nothing imports it today.

`src/lib/` is the only layer that talks to Supabase; `src/hooks/` wraps it in React Query; screens and `AppContext` consume the hooks (a few screens call `lib` read helpers directly inside their own `useQuery`). `src/utils/` stays pure and Supabase-free.

### Domain utilities

**[src/utils/group-utils.ts](src/utils/group-utils.ts)** — pure group business logic: `findGroupByUsername`, `isHostForUser`, `isGroupFull`, `canJoinGroup`, `buildNewPlayer`, `normalizePositiveInt`, `removePlayerFromGroup`, `setPlayerAsHost`, `generateJoinCode`, `formatBrackets`. Unit tested in `src/utils/group-utils.test.ts` on the `unitTests` branch (test files don't live on `development`/`main` — see Git workflow below).

**[src/utils/rival-utils.ts](src/utils/rival-utils.ts)** — exports `findRivals`; see [Rival matching](#rival-matching) above. Unit tested in `src/utils/rival-utils.test.ts` on the `unitTests` branch (same rule — not on `development`/`main`).

**[src/utils/scoring-utils.ts](src/utils/scoring-utils.ts)** — exports `computePlacementScores`; see [Groups & game scoring](#groups--game-scoring-supabase) above. Always shipped (no gating) — round scoring is a finished, live feature.

When adding new group or rival behavior, put the logic in the appropriate utils file — do not inline it in screen components. Write or update its tests on the `unitTests`/`test/<feature>` lane (§2.5 of the workflow doc), not directly on `development` or `main`.

### Styling

All styles use React Native `StyleSheet.create` defined at the bottom of each screen file. No external styling library is used. Screens pull theme-dependent colors from `ThemeColors` in [src/utils/theme-utils.ts](src/utils/theme-utils.ts) rather than hardcoding light/dark hex values — sourced from `theme` in `AppContext`. That covers the neutrals (backgrounds, borders, text tiers) **and the tinted surfaces behind an accent** (`accentBg`, `successBg`, `dangerBg`, `warnBg`, the purple rank card) with the text that sits on them: those tints used to be fixed near-black values, which is what made selected chips, the rival card, and the whole group page unreadable in light mode (issue #11). The saturated accents themselves (`GAME_COLOR`, the blue/green/red buttons, rival red and gold) are intentionally not part of the palette since they read on both themes.

Two ways to apply it, both in use: older screens (`home`, `calendar`, `shop`) keep a static StyleSheet and add `{ color: colors.x }` inline; `group-detail`, `player-profile`, `browse`, `profile`, and `stats` build theirs with `makeStyles(c: ThemeColors)` and `useMemo`, so no color in the sheet is pinned to one theme. Use `makeStyles` for any screen with more than a few themed values. Never put a dark hex in a style. `sign-in`, `profile-creation`, and the opening spinner are still dark-only.

## Git workflow — MANDATORY, follow in every session

These rules apply unconditionally. Do not skip them, do not ask whether to follow them — just follow them.

**Full reference:** [docs/version-control-workflow.md](docs/version-control-workflow.md) is
the authoritative, detailed document. This section is the condensed summary an AI session
needs to not violate it.

### Branch structure

Branches are split by **who owns them**. Shared branches live on `origin`: the base branches,
the `LandingPage` deployment branch, and every top-level feature branch that's in progress (a
feature is owned by a team, so the whole team needs it). Individual branches stay local: a
`feature/<function>` is one person's piece of a feature, and `test/<feature>` is a throwaway test
build. See "What lives on `origin`" below.

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
                       `life-counter`, `shop`). Owned by a team; shared on `origin`.
feature/<function>   ← sub-branch of a top-level feature branch (forked from it, never from
                       `development` or `main`), named after the specific piece of work.
                       Owned by one person; local only. Merges back into the top-level
                       feature branch it came from.
unitTests            ← standing branch, kept up to date with `development`.
test/<feature>       ← created fresh per test cycle as a merge of `unitTests` + `<feature>`.
                       Tests are written/run here.
```

On `origin`: `main`, `development`, `unitTests`, `LandingPage`, and every in-progress `<feature>`.
Local only: every `feature/<function>` and `test/<feature>` branch.

### What lives on `origin`

- **Shared (pushed):** `main`, `development`, `unitTests`, `LandingPage`, and each top-level `<feature>` branch while it's in progress. A new top-level feature is pushed as soon as it's created (`git push -u origin <feature>`) so the rest of its team can pull it.
- **Individual (never pushed):** `feature/<function>` and `test/<feature>`. Never push one or set an upstream for it. Your piece of a feature reaches `origin` by being merged into the team's `<feature>` branch, which you then push.
- **A feature branch leaves `origin` once it merges into `development`.** After the merge, `git push origin --delete <feature>`. The local copy can stay as a record. This keeps `origin` limited to work that's actually in progress.
- **Claim work through GitHub Issues.** A team claims a feature by being assigned its issue. Each person claims their piece through a smaller issue for that piece (a sub-issue of the feature's issue), assigned to them, before creating the matching `feature/<function>` branch. An assigned issue means "someone has this — don't start the same thing." Unassign yourself if you drop it.
- **`LandingPage` is a deployment branch, not a feature.** It holds the static marketing site (`index.html`, its own Supabase migrations) and GitHub Pages deploys straight from `origin/LandingPage` (Settings → Pages). Never delete it from `origin`: that takes the site down and breaks the flyer's QR code. It's worked on through a separate worktree (path in `CLAUDE.local.md`), never merged into the app branches, and is pushed directly.
- **Individual branches have no off-machine backup.** A disk failure or OS reinstall loses any `feature/<function>` work that hasn't been merged into its team branch and pushed. Merge your pieces up often.
- **Pushing:** push a `<feature>` branch after merging a piece into it; `git push origin development` after a feature merge; `git push origin unitTests` after a sync or after passing tests are merged back. `main` is pushed only as part of an explicitly-requested release, together with its tag (`git push origin main --tags`).
- **Remote cleanup (2026-10-06):** finished features and all `feature/*` and `test/*` branches were removed from `origin` when this policy was adopted. Each still exists locally on the machine that did the cleanup, and none had commits that weren't also in a local branch.

- **`main` is release-only and off-limits for all routine work.** Never commit to it directly, and never merge into it without the developer explicitly asking to cut a release. Finishing a feature, passing tests, or merging into `development` does **not** imply permission to touch `main` — treat every `development → main` merge as requiring fresh, explicit authorization, same bar as a force-push.
- **`development` is the default integration target, but merging into it is never automatic.** A green `test/<feature>` run is necessary but **not sufficient** — do not run `git checkout development && git merge <feature>` just because tests passed. Merging into `development` additionally requires the developer (or another developer) to explicitly confirm the feature is ready to land there. If that confirmation hasn't been given, stop after the tests pass and say so instead of merging. When older instructions or commit messages say "merge to main," that now means `development`, unless the developer is explicitly talking about cutting a release.
- **Top-level feature branches still fork from `development`** — that part of the model is unchanged. Name them after the feature with no prefix: `life-counter`, `shop`. See §5 of the full workflow doc for the current list. (The confirmation gate above is about what's allowed to merge back *into* `development`, not about where new branches originate from it.)
- **Sub-work within a feature** uses `feature/<specific-function>` branched off that feature's own branch (e.g. `feature/rotate-button` off `life-counter`), merging back into it.
- **Testing is a separate lane**, not a step inside `development`. `unitTests` stays synced with `development`; `test/<feature>` is a throwaway-and-recreate merge of `unitTests` + the feature branch, used to write and run tests. Passing tests promotes the tests into `unitTests` — it does **not** by itself promote the feature into `development`; that still needs explicit developer confirmation. Failing tests sends work back to the feature branch and `test/<feature>` gets recreated later.
- **Never sync `unitTests` with a plain `git merge development`.** `development`'s history contains commits that delete unitTests-exclusive content (`dev-tools.tsx`, `seed-profiles.ts`, test files) — if `unitTests` hasn't diverged since, that merge is a silent fast-forward that reapplies every one of those deletions with zero warning (this happened once, 2026-07-03). Always use `git merge development --no-ff` instead, and see §2.7 of the full workflow doc for the conflict-resolution checklist (which lines to keep from `unitTests` vs. take from `development` in the handful of partially-gated files).
- **`development` and `main` never contain test files.** No `*.test.ts` (or other test-suite files) may exist on either branch. `unitTests` and `test/<feature>` are the only branches where test files live. If a merge into `development` or a commit to `main` would introduce a test file, strip it out first — see §2.6 of the full workflow doc.
- **Local branches are not deleted as routine practice.** A finished feature's local branches can be kept as a reference; deleting them is the developer's call. (A one-time cleanup once removed branches whose entire history was already absorbed into `development` — that was a rare, explicit, developer-approved exception.) Remote branches are a different matter: a feature branch is deleted from `origin` once it merges into `development`, and a `feature/*` or `test/*` branch on `origin` was pushed by mistake — see "What lives on `origin`" above.
- **Always update a branch from its parent before starting new work on it.** Before making any new commit on any branch, first merge in the latest state of its parent — a top-level feature branch's parent is `development`; a `feature/<function>` sub-branch's parent is the top-level feature branch it was forked from; `unitTests`'s parent is `development` via the `--no-ff` rule above. "Latest" means latest from `origin`: `git pull` the parent first (and the branch itself, if it's a shared `<feature>` branch), then merge. A `feature/<function>` has no remote, so for it, pull the team's `<feature>` branch and merge that in. A fix or update can land on the parent while a sibling branch sits untouched, and only merging the parent in surfaces it. (This was added after a bug fixed on one top-level feature branch resurfaced on a sibling top-level branch that had forked from `development` before the fix existed and was never re-synced — syncing from the parent routinely is the general habit that prevents this class of drift, even though in that specific case the fix hadn't reached `development` yet either; see the full workflow doc.)

### The `life-counter` branch (feature under active development, excluded from the MVP)

Life counter is not a finished feature and must not reach `development` or `main` until the
developer gives an explicit go-ahead.

```
feature/<function>  →  life-counter  →  test/life-counter (+ unitTests)  →  development  →  main (explicit release only)
```

- `life-counter` itself only advances to `development` when the developer explicitly says the feature is ready to come back — do not do this proactively, even if `life-counter` has been sitting untouched for a while.
- `main`/`development` currently have life-counter's route (`pickup-setup.tsx`, `life-counter.tsx`) and every one of its entry points removed outright — there is no disabled button or feature flag standing in for them today (an earlier `GAME_SESSIONS_ENABLED` flag on `group-detail.tsx` briefly played that role but no longer exists in the code; the round-reporting/scoring flow that now lives on `group-detail.tsx` is the unrelated `game-scoring` feature, not life-counter). Restoring life-counter means merging it into `development` **and** adding new entry points (a "Start Game"/"Life Counter" button, home's pickup card, etc.) from scratch — there is nothing left to flag back on.

### Dev Tools and leftover seed data (gated off `development`/`main`)

- **Dev Tools** (`src/app/dev-tools.tsx`). Removed from every branch except the dedicated `dev-tools` branch and `unitTests`/`test/<feature>`. On `development`/`main`, `(tabs)/profile.tsx`'s Dev Tools badge is gated behind `DEV_TOOLS_ENABLED = false`; the button's `router.push('/dev-tools')` call was deleted outright rather than flag-gated, because Expo Router's typed routes (`app.json` → `experiments.typedRoutes`) type-check route strings against files that exist — a runtime flag can't keep a deleted route compiling. Restoring it requires the developer's explicit go-ahead, same bar as life-counter, and means re-adding the file first, then the flag and button.
- **Seed profiles** (`src/data/seed-profiles.ts`). Still present on `unitTests`, `dev-tools`, and `test/<feature>`, absent from `development`/`main`. Nothing imports it anymore now that rival matching reads real profiles (see [Rival matching](#rival-matching)), but a `unitTests` sync must still not delete it — see the `--no-ff` rule above.
- **Mock group data** (`HARDCODED_GROUPS`). Gone from every branch, `unitTests` included, since groups got a real backend. If older docs or comments mention it, they're stale.
- **`RIVAL_POOL` placeholders.** Before real rival matching landed, `profile-creation.tsx`, `stats.tsx`, and `player-profile.tsx` each defined a local, empty `RIVAL_POOL: UserProfile[]`. Those are gone on `development`, but still exist on `main` and on long-lived branches that haven't re-synced (`shop`, `life-counter`). Expect conflicts in those three files when such a branch merges `development` in — take `development`'s side.

### Commit rules

- Every feature produces at least one commit on its feature branch.
- Commit as soon as a discrete piece of work is complete — do not batch unrelated changes into one commit.
- Commit messages must be descriptive: what changed and why, not just "fix" or "update".

### Workflow steps — do this for every feature

0. Claim the work: the team takes the feature's GitHub issue, and you assign yourself the issue for the specific piece you'll build (create either if it doesn't exist). Don't start on a piece someone else has assigned to themselves.
1. `git checkout development && git pull`, then `git checkout <feature> && git pull && git merge development` — refresh `development` and the team's feature branch from `origin`, then bring `development` into the feature branch. For a brand-new top-level feature, `git checkout -b <feature>` from the freshly pulled `development` instead and `git push -u origin <feature>` so the team can use it.
2. `git checkout -b feature/<function>` — create your local sub-branch for this specific piece of work (never pushed). If `feature/<function>` already exists and work is resuming on it, first `git merge <feature>` (its parent, now synced per step 1) before continuing.
3. Implement the work. Commit on the sub-branch when done.
4. `git checkout <feature> && git pull && git merge feature/<function>`, then `git push` — bring your piece into the team's feature branch and share it.
5. When the feature is ready to test: `git checkout unitTests && git pull && git merge development --no-ff` (stay current — always `--no-ff`, see §2.7 of the workflow doc for why a plain merge can silently delete unitTests-exclusive content), then `git checkout -b test/<feature> && git merge <feature>`. `test/<feature>` is local-only and never pushed.
6. Write/update unit tests on `test/<feature>`. `npm test` — all tests must pass.
7. On pass: merge the test additions back into `unitTests` and `git push origin unitTests`. Do **not** merge into `development` yet — passing tests only clears the way to ask.
8. Ask the developer (or confirm another developer has already signed off) that the feature is ready for `development`. Only after that explicit confirmation: `git checkout development && git pull && git merge <feature>`, then `git push origin development`. Before merging, double-check the feature branch carries no test files into `development` (see §2.6 of the workflow doc) — strip any out first. Then `git push origin --delete <feature>` (the feature is finished; the local branch can stay), and close or update the feature's GitHub issue.
9. On fail: go back to step 2–4 on the feature branch; recreate `test/<feature>` later and retry step 6.
10. Do **not** merge to `main` at any point in this flow — that's a separate, explicitly-requested release step only.

### What to do at the start of every session

1. Run `git fetch --prune` then `git branch -a` to orient yourself — know what branches exist locally and on `origin`. If `origin` has a `feature/*` or `test/*` branch, or a `<feature>` branch that has already merged into `development`, flag it to the developer rather than deleting it yourself (someone may have pushed it by mistake with work that exists nowhere else).
2. Treat `development` as the source of truth for the current state of the project, and check it even if the session starts on a different branch. Other branches (especially `main`) can silently lag behind — `main`'s copy of this file and its workflow model once drifted out of date until a session caught it by diffing against `development` and reconciled it. When a branch's docs or code disagree with `development`, `development` wins unless the developer says otherwise; flag the drift and ask before assuming which side is correct.
3. Ask the user which feature to work on if it is not obvious from context.
4. Check out (or create) the appropriate branch before touching any files — a `feature/<function>` sub-branch off the relevant top-level feature branch for feature work, never off `main`.
5. Before touching any files, sync the checked-out branch from its parent (see "Always update a branch from its parent before starting new work on it" above) — merge latest `development` into a top-level feature branch, or the top-level feature branch into a `feature/<function>` sub-branch. Do this every session, even if the branch was synced recently.
6. Never assume it is acceptable to work on `main` directly, even for a "small" fix. Never assume it is acceptable to merge into `main` — that requires the developer to explicitly ask for a release.

## Working conventions

- Prefer small, focused changes that fit the existing React Native patterns instead of introducing new libraries or architecture.
- Preserve the existing navigation flow; route params and screen names must remain consistent.
- When modifying group-related logic, keep the `PlayerProfile` and `Group` types in [src/data/groups.ts](src/data/groups.ts) intact and update the tests in `src/utils/group-utils.test.ts` on the `unitTests`/`test/<feature>` lane when behavior changes — not on `development`/`main`.
- Avoid editing content in [example/](example/) unless the task specifically requires it (it's an untracked, gitignored Expo template, not part of the app).
- Use relative imports. `tsconfig.json` defines an `@/*` → `src/*` alias, but nothing under `src/` uses it.
- When a finished-but-not-yet-shippable capability needs hiding, follow the existing pattern: a module-level `const X_ENABLED = false` with a comment saying what flips it back on (`OAUTH_ENABLED`, `DEV_TOOLS_ENABLED`). A flag cannot hide a `router.push` to a route file that doesn't exist — typed routes won't compile it.

## Documentation requirement

Every function and exported helper must be documented following the format in [docs/documentation-prompt.txt](docs/documentation-prompt.txt):
1. At least 3 plain-English lines describing what the function does.
2. `Parameters:` line listing each input.
3. `Returns:` line describing the output.
4. `Edge cases:` line describing failure modes or unusual results.
