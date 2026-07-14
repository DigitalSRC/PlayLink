# PlayLink — Alpha Landing Page

*A Silvenari product.*

Static, single-file landing page for the PlayLink alpha: the problem, an interface mockup, and an
email signup. No build step — `index.html` is the entire site.

This lives on the `LandingPage` branch of the main PlayLink repo — an intentional orphan branch,
disconnected from `development`/`main`'s history and their feature-branch workflow. See
`CLAUDE.md` for why.

## Local preview

Open `index.html` directly in a browser, or serve it:

```bash
npx serve .
```

## Deploying

Served as-is by GitHub Pages (Settings → Pages → Deploy from branch → `LandingPage` → `/ (root)`).

## Signup backend

The email form writes directly to Supabase (see `CLAUDE.md`'s "Supabase backend" section for the
schema/migration workflow — this branch owns the `alpha_signups` table only).
