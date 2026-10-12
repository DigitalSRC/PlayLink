# Security backlog — ready to post as GitHub issues

> **Why this file exists:** these were meant to go straight to GitHub Issues, but this machine
> has no `gh` CLI and the stored GitHub token (in `CLAUDE.local.md`) is expired, so they could
> not be posted automatically. Everything below is ready to paste. Delete this file once the
> issues exist — GitHub is the source of truth, this is just a staging pad.

## How to post these once you have a token

1. Generate a fine-grained token (scope: `Issues: write` on `DigitalSRC/PlayLink`) at
   https://github.com/settings/tokens and swap it into `CLAUDE.local.md`.
2. Either install `gh` (`winget install GitHub.cli`) then `gh auth login`, **or** set
   `$env:GH_TOKEN = "<token>"` for the session.
3. Create each issue below. With `gh`:
   ```powershell
   gh issue create --repo DigitalSRC/PlayLink --title "<title>" --label security --body "<body>"
   ```
   Or via REST without `gh`:
   ```powershell
   $h = @{ Authorization = "Bearer $env:GH_TOKEN"; "User-Agent" = "playlink" }
   Invoke-RestMethod -Method Post -Headers $h `
     -Uri "https://api.github.com/repos/DigitalSRC/PlayLink/issues" `
     -Body (@{ title = "<title>"; body = "<body>"; labels = @("security") } | ConvertTo-Json)
   ```

---

## UPDATE the existing security tracking issue (do NOT close it — keep it persistent)

Find the existing security issue (search `is:issue label:security` or by title) and add this as a
comment. If none exists, create one titled **"Security: standing tracker"** with this as the body
and keep it open permanently.

```
### Progress update — server-authoritative scoring + RLS hardening

Branch `security-hardening` (sub-branch `feature/rls-server-authoritative-scoring`) now contains a
migration + client rewiring that closes the biggest write-side holes. **Not yet applied to the
Supabase project** — see issue "Apply & validate the RLS hardening migration".

Done (written, type-checked, committed — not yet live):
- profiles: revoked the client's INSERT/UPDATE grant on score/privilege columns
  (points, wins, losses, draws, monthly_points, is_developer); only SECURITY DEFINER functions or
  the service role can write them now. Re-granted only the identity columns a user may set.
- group_results: removed all client write policies/grants; every state change goes through
  SECURITY DEFINER functions (submit/dispute/finalize/apply/cancel) that each mutate only the
  caller's own entry and enforce their own preconditions.
- Points are computed server-side from the raw finish order (compute_placement_scores, a PL/pgSQL
  port of scoring-utils.ts), so the host can't submit inflated points either.
- groups: UPDATE restricted to the host; group_players INSERT restricted to self.
- Client (group-api.ts/profile-api.ts) rewired to call the RPCs; insertProfile no longer sends
  score columns.

Confirmed NOT a risk:
- SQL injection — all DB access goes through the supabase-js client / PostgREST, which
  parameterizes values. No string-built SQL anywhere.
- No secrets ever committed to git history (verified).

Still open (tracked as the separate issues below). This tracker stays open as the running
security checklist.
```

---

## Status update — 2026-10-12 (security audit)

A full audit against a standard checklist found no data exposure or sign-in bypass. What it did
find is fixed on branch `security-audit` (not yet merged, migrations not yet applied):

- **Unlimited points.** A host could report a round with only themselves in it, repeatedly.
  Now: two players per round, 10 rounds per group, 12 reported rounds per player per 24 hours.
- **Forgeable group fields.** `groups` and `group_players` now grant columns by name.
- **No server-side limits on text**, and a full group was refused only by the app. Both are
  now enforced by triggers.
- **`resolve-area` had no rate limit.** 30 calls an hour and 3 new areas a day per player;
  unused areas are removed after 90 days.
- **`is_group_member`** has a pinned search_path and is no longer callable signed out; the four
  oldest tables no longer carry grants to `anon`.
- **App:** database errors are not shown to players; the cache is cleared at sign-out; new
  passwords need 10 characters; a username from a link is matched literally.
- **Landing page:** the signup function no longer overwrites saved details (committed on
  `LandingPage`, not pushed).

Still open after the audit, each needing a decision or a setting outside the code:

- Issue 3 (auth posture): the project's own minimum password length must be raised to 10 in the
  dashboard to match the app; email confirmation, CAPTCHA, and requiring a recent sign-in to
  change a password are still off. Without confirmation or CAPTCHA, accounts are free to
  create, which is what makes two accounts trading wins possible (now bounded, not prevented).
- Issue 5 (secrets): the access tokens in `CLAUDE.local.md` should be rotated and kept
  somewhere other than a plaintext file.
- Issue 2 (profile read exposure) is unchanged.
- The 30-minute wait before confirming a game is still only checked by the app (GitHub #18);
  the full-group half of that issue is now enforced.
- The landing page's signup function still reveals whether an email is on the list.
- The session token is kept in AsyncStorage (`localStorage` on web); moving it to the device's
  secure store on phones is not done.
- `npm audit` reports issues in build and test tooling with no fix available short of
  downgrading Expo.

## Status update — 2026-10-06

Work done since this file was written. None of it is applied to the Supabase project yet.

- **Issue 4 (group lifecycle) is written.** Migration
  `supabase/migrations/20261006140000_group_lifecycle_rpcs.sql` adds `leave_group`,
  `delete_group` and `transfer_group_host` (SECURITY DEFINER, one transaction each), drops the
  "any member can delete any member" policy, and revokes the direct UPDATE/DELETE grants.
  `group-api.ts` / `useGroupQueries.ts` / `group-detail.tsx` call the functions. There is still
  no kick feature, by design. Remaining for issue 4: apply it and try the flows in the app.
- **Issue 1, partly done.** Both migrations were run against a local in-memory Postgres (PGlite)
  with stand-ins for Supabase's `auth` schema and roles, then exercised as host / member /
  outsider / signed-out. 65 checks pass, including: the old exploits fail (set own points, make
  self developer, rewrite a result, kick a member, promote self), the submit -> dispute -> cancel
  -> resubmit -> finalize -> apply flow works and awards points exactly once, and
  `compute_placement_scores` matches `scoring-utils.ts` on all 3,413 placement combinations for
  1-5 players. That covers the "validate parity" and "attempt the old exploits" tasks against a
  stand-in; they still need repeating against the real project after `db push`, since PGlite is
  not Supabase.
- **Found and fixed by that run:** the scoring RPCs were not actually locked away from signed-out
  callers. Supabase grants EXECUTE on new `public` functions to `anon` and `authenticated` by
  name, so `revoke ... from public` alone did nothing for them; only each function's own
  "Not authenticated" check stood in the way, and `compute_placement_scores` was callable by any
  client. The revokes now name `anon` (and `authenticated` for the internal function).

---

## Issue 1 — Apply & validate the RLS hardening migration

**Title:** `Apply & validate the server-authoritative scoring / RLS migration`
**Labels:** `security`

**Body:**
```
The migration `supabase/migrations/20260930120000_harden_rls_server_authoritative_scoring.sql`
(branch `security-hardening`) is written and type-checked but has NOT been applied to the Supabase
project, and the PL/pgSQL scoring port has not been validated against a live DB.

Tasks:
- [ ] Replace the expired Supabase access token (CLAUDE.local.md), `supabase link`.
- [ ] Apply to a STAGING/local project first: `npx supabase db push`.
- [ ] Validate compute_placement_scores parity with src/utils/scoring-utils.ts — run it over the
      same pods the unit tests use (2–6 players, ties, tie-for-last) and diff the output.
- [ ] Exercise the flow end-to-end on staging: submit → dispute (with reason) → cancel/resubmit →
      finalize (after window) → apply, from both a host and a non-host account.
- [ ] Attempt the old exploits directly against the API with a normal user JWT and confirm they
      now fail (set own points; rewrite another group's result; confirm a group as a non-host).
- [ ] Run the test/<feature> lane, then (with explicit go-ahead) merge security-hardening into
      development.
- [ ] Only then apply to production.

Acceptance: a normal authenticated user cannot change any score/privilege column or any
group_results row except through the RPCs, and scoring output matches the TS implementation.
```

---

## Issue 2 — Tighten profile read exposure

**Title:** `Limit what one authenticated user can read of another's profile`
**Labels:** `security`

**Body:**
```
`profiles_select_authenticated` lets any logged-in user read every column of every profile row,
so anyone who signs up can scrape the full directory (usernames, display names, free-text
location, stats). Matchmaking needs *some* of this, but not all of it to everyone.

Tasks:
- [ ] Decide the minimum column set a stranger needs (likely: username, display_name, games,
      brackets, monthly_points for the leaderboard) vs. what should be self-only or
      rival-only (e.g. location).
- [ ] Enforce it — e.g. a restricted view for the broad read + a self-only policy on the base
      table, or column-level SELECT grants.
- [ ] Confirm an anonymous (no-session) caller still reads zero rows.

Note: this is a privacy tightening, not an active breach — anon already gets nothing, and the
data is user-entered and non-credential.
```

---

## Issue 3 — Strengthen auth posture

**Title:** `Strengthen auth: password policy, email confirmation, abuse protection`
**Labels:** `security`

**Body:**
```
Current `supabase/config.toml` auth settings are permissive:
- minimum_password_length = 6, password_requirements = "" (no complexity).
- [auth.email] enable_confirmations = false (accounts are usable with an unverified email).
- No CAPTCHA ([auth.captcha] disabled), no leaked-password protection.

Tasks:
- [ ] Raise minimum_password_length (>= 8) and consider a password_requirements tier.
- [ ] Decide on email confirmation (tradeoff: adds a verify step to onboarding; the app currently
      assumes immediate session on sign-up — see auth-api.ts signUpWithEmail).
- [ ] Enable leaked-password protection and/or CAPTCHA if sign-up abuse becomes a concern.
- [ ] These are project-level Supabase settings as well as config.toml — apply in both.

Impact: mainly raises the bar for targeted account takeover; existing rate limits already cap bulk
brute-forcing.
```

---

## Issue 4 — Fix latent RLS gaps in the group lifecycle

**Title:** `Group lifecycle RLS: delete group, transfer host, and member-kick are mis-scoped`
**Labels:** `security`, `bug`

**Body:**
```
Found during the hardening pass; pre-existing, mostly fail-closed (so not exploitable) but two
are broken features and one is a griefing vector:

- `groups` has no DELETE policy → `deleteGroup` (group-api.ts) silently affects 0 rows. The
  "delete when last player leaves" flow never actually deletes; only the stale-group cron does.
- `group_players` has no UPDATE policy → `setGroupHost` silently affects 0 rows; host transfer
  doesn't persist.
- `group_players_delete_members` lets ANY member delete ANY member's row → a non-host can kick
  other players (griefing).

Tasks:
- [ ] Add a host-only DELETE path for groups (policy or SECURITY DEFINER RPC, consistent with the
      scoring RPCs).
- [ ] Add a host-only UPDATE path for group_players role changes.
- [ ] Restrict group_players delete to self-or-host.
- [ ] Verify leave/transfer/delete flows end-to-end after the change.
```

---

## Issue 5 — Secrets hygiene

**Title:** `Secrets hygiene: rotate tokens, stop storing them in plaintext`
**Labels:** `security`

**Body:**
```
No secrets are in git history (verified), and .env is gitignored — good. But:
- CLAUDE.local.md stores a Supabase personal access token and a GitHub PAT in plaintext (both now
  expired). A leaked service_role key or access token is the single most likely path to bulk data
  theft, since service_role bypasses RLS entirely.

Tasks:
- [ ] Rotate both tokens; store them in a secret manager / OS credential store, not a plaintext
      file. Keep CLAUDE.local.md pointing at *where* they live, not the values.
- [ ] Confirm the service_role key is only ever used server-side (Edge Functions / CI), never in
      the app bundle or committed anywhere.
- [ ] Confirm the CRON_SECRET for refresh-rivals lives only in the Vault + Supabase secrets, and
      rotate it if it has ever been pasted anywhere.
```
