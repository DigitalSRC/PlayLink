# PlayLink Version Control Workflow

**Status:** Active
**Applies to:** every contributor and every AI assistant session working in this repository.

This document is the authoritative reference for how branches, testing, and releases work
in PlayLink. `CLAUDE.md` summarizes the mandatory rules for AI-assisted sessions; this
document is the full, detailed reference those rules point back to.

---

## 1. Guiding principle

**`main` is the product.** It is what ships to MVP testers and, later, real users. Every
other branch exists to protect `main` from unfinished, untested, or unreviewed work.

> `main` only ever changes when a human developer explicitly says "cut a release." Never
> as a side effect of finishing a feature, never as a side effect of tests passing, and
> never automatically by an AI assistant. If in doubt, don't touch `main` — ask first.

---

## 2. Branch tiers

```
main                    Release only. Tagged at every release (e.g. v0.1.0-mvp).
  ↑  explicit release approval only
development             Integration branch. Everything destined for production
  │                      lands here once its tests pass. Never shippable on its
  │                      own — it's the front of the queue, not the release.
  ↑  merge after tests pass on test/<feature>
<feature>                Top-level feature branch, forked from development.
  │                       Named after the feature itself — no "feature/" prefix
  │                       at this tier (e.g. life-counter, rival-system, shop).
  ↑  merge
feature/<function>      Sub-branch of a top-level feature branch, forked from
                          it, named after the specific piece of work (e.g.
                          feature/rotate-button off life-counter). Merges back
                          into the top-level feature branch it came from.

Parallel testing lane:
unitTests                Kept up to date with development at all times.
  +  <feature>           Latest state of the feature branch being tested.
  =  test/<feature>       A merge of the two above, created fresh whenever a
                            feature is ready for testing (e.g. test/life-counter).
                            Tests are written and run here.
```

### 2.1 `main` — release only

- Never commit directly.
- Never merge into it without the developer explicitly asking for a release cut.
- Tag every release point (`v0.1.0-mvp`, `v0.2.0-mvp`, `v1.0.0-beta`, ...) so any past release
  can be found by name, not by digging through `development`'s history.
- Contains no in-progress feature work, no testing scaffolding, nothing unreviewed.

### 2.2 `development` — integration branch

- Everything that has passed its `test/<feature>` cycle lands here.
- This is what the old two-tier model called `main`. If you see references to "merge to
  main" in older commit messages or muscle memory, they mean `development` now.
- Still not committed to directly — even integration-ready work arrives via a merge from
  a completed `test/<feature>` cycle, not a direct commit.

### 2.3 Top-level feature branches — `<feature-name>`, no prefix

- Forked from the current tip of `development`.
- Named exactly after the feature: `life-counter`, `rival-system`, `shop`. Not
  `feature/life-counter` — the bare name is the branch at this tier.
- Long-lived for as long as the feature is under active development. Not deleted when
  work pauses; picked back up later from wherever it was left.
- All work on that feature happens either directly here for small changes, or via
  sub-branches (below) for anything substantial enough to want its own history.

### 2.4 Sub-feature branches — `feature/<specific-function>`

- Forked from the top-level feature branch (e.g. `feature/rotate-button` off
  `life-counter`), not from `development` and never from `main`.
- Scoped to one specific piece of work within the feature.
- Merges back into its parent top-level feature branch when done.

### 2.5 Testing lane — `unitTests` and `test/<feature>`

- `unitTests` is a standing branch, kept up to date with `development` (merge
  `development` into it regularly, especially before starting a new `test/<feature>`
  cycle).
- When a top-level feature branch is ready to be tested, create `test/<feature>` as a
  merge of `unitTests` (latest) and `<feature>` (latest) — e.g. `test/life-counter` =
  `unitTests` + `life-counter`.
- Write and run tests on `test/<feature>`.
  - **Tests pass:** merge the new/updated tests back into `unitTests`, then merge
    `<feature>` into `development`. The feature is now part of the integration branch.
  - **Tests fail:** development continues on `<feature>` (and its `feature/*`
    sub-branches) to fix the issues. `test/<feature>` is recreated (or updated) from the
    fixed `<feature>` branch and the cycle repeats. `development` is not touched until
    tests pass.
- Testing and feature development happen in tandem, not sequentially — you don't have to
  fully "finish" a feature before starting to test parts of it; `test/<feature>` just has
  to be recreated from the latest `<feature>` tip each time you want a fresh test pass.

---

## 3. Commit rules

- Every discrete piece of work gets its own commit — don't batch unrelated changes.
- Commit messages are descriptive: what changed and why, not just "fix" or "update."
- Branches are never deleted as a matter of routine. (The one exception: a one-time
  cleanup pass when a branch's entire history is already fully absorbed into
  `development` and it serves no further purpose as a named reference — done rarely,
  and only with the developer's explicit go-ahead.)

## 4. Starting new work — quick reference

| I want to... | Branch from | Branch name |
|---|---|---|
| Start a brand-new top-level feature | `development` | `<feature-name>` (no prefix) |
| Work on one piece of an existing feature | that feature's branch | `feature/<specific-function>` |
| Test a feature that's ready | merge of `unitTests` + `<feature>` | `test/<feature>` |
| Fix something found during testing | the feature branch (or its `feature/*` sub-branch) | continue there, don't branch from `test/<feature>` |
| Cut a release | — | not a branch action; ask the developer, then merge `development` → `main` and tag it |

## 5. Current top-level feature branches

As of this document's creation, the active top-level feature branches are:

- **`life-counter`** — in-progress life/commander-damage tracking screen. Excluded from
  `development`/`main` until finished; see [CLAUDE.md](../CLAUDE.md) for the specific
  flag (`GAME_SESSIONS_ENABLED`) gating its entry points on `development`/`main`.
- **`rival-system`** — ongoing work on rival matching/display beyond what's already
  shipped in `src/utils/rival-utils.ts`.
- **`shop`** — build-out of the shop tab, currently a placeholder screen on
  `development`/`main`.

This list will grow as new top-level features start and shrink only when a feature ships
(merges into `development`) or is explicitly abandoned by the developer.
