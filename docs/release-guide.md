# Release guide: from here to the Play Store (then the App Store)

The code for 1.0 is done. Everything left is a step only the developer can take: accounts,
payments, dashboards, and pasting SQL into the live database. Work through the sections in order;
within a section, steps can run in parallel. Claude can do any step marked **(Claude)** once you
give the go-ahead or the credential it names.

Decisions behind this plan (2026-10-26): Android first; individual (personal) store accounts;
app ID `com.silvenari.playlink`; domain `silvenari.com` on Cloudflare; Resend for email; 18+
only; free for 1.0; a separate production Supabase project on the free tier until public launch.

---

## A. Accounts and domain — start today (some take days to verify)

1. **Domain.** Buy `silvenari.com` on Cloudflare (dash.cloudflare.com → Domain Registration).
2. **Support inbox.** Cloudflare → silvenari.com → Email → Email Routing: forward
   `support@silvenari.com` to your Gmail. The app, the privacy policy, and both stores use this
   address.
3. **Website on the domain.** In Cloudflare DNS add four `A` records for `silvenari.com` pointing
   to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`, plus a
   `CNAME` record `www` → `digitalsrc.github.io`. Set all of them to **DNS only** (grey cloud).
   Then go to GitHub → DigitalSRC/PlayLink → Settings → Pages → Custom domain, enter
   `silvenari.com`, and tick Enforce HTTPS once it appears. The old github.io address then
   redirects by itself, so the app's links keep working.
4. **Email sending.** Create a Resend account (resend.com), add the domain `silvenari.com`, and
   add the DNS records Resend shows to Cloudflare. Wait for "Verified", then create an API key.
   That key is the SMTP password in step C2.
5. **Google Play Console.** Go to play.google.com/console, choose a **personal** account, pay the
   $25 fee, and complete identity verification (this can take a few days).
6. **Expo.** Create a free account at expo.dev. Builds run on Expo's servers.
7. **Icon.** Draw the 1024×1024 PNG with its own background and no transparency. Put it at
   `assets/source/icon.png` and run
   `powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1`. If its background isn't
   PlayLink blue, add `-Background '#RRGGBB'` and change the two `#007AFF` values in `app.json`
   to match. **(Claude)** can do this step once the file is there.
8. **Testers.** Start collecting at least 12 people with Android phones and their Google account
   emails: friends and family, the `alpha_signups` list, and the LGS Commander night. Google's
   14-day clock starts only once 12 have opted in. **(Claude)** can write the invite text and a QR
   code.

## B. Bring the live database up to date (current project)

Paste each file into Supabase → SQL Editor, in this order. Every file is in
`C:\Users\kcara\.claude\projects\e--Software-Engineering-Projects-PlayLink\sql-sandbox\apply-live\`.
After the last one, ask **(Claude)** to read the database back and confirm.

| Order | File | What it does |
|---|---|---|
| 1 | `4-20261012120000_chosen_rival.sql` | Saves your picked Rival on the profile |
| 2 | `5-20261012130000_contest_window.sql` | The 15-minute agree/contest window for a round |
| 3 | `6-20261012130100_contest_window_cron.sql` | Settles rounds whose window has ended, every minute |
| 4 | `9-landing-20260710000006_harden_signup_upsert.sql` | The landing page's signup function |
| 5 | `11-20261014120000_audit_round_two.sql` | The server enforces the 30-minute confirm wait |
| 6 | `12-20261014120100_retire_store_sync_cron.sql` | Stops the shelved store-sync job |
| 7 | `13-20261026120000_account_deletion.sql` | In-app account deletion |

Then, in a terminal: `npx supabase functions delete sync-store-events` (its job stops in step 6).

The app on `development` works before and after these files are applied. Until file 7 is in,
Delete Account says "Could not delete your account".

## C. Supabase dashboard settings (current project, then again for production)

1. **Authentication → Providers → Email:** minimum password length **10**; turn on
   **Secure password change** and **leaked password protection**.
2. **Authentication → SMTP Settings:** enable custom SMTP. Host `smtp.resend.com`, port `465`,
   username `resend`, password = the Resend API key, sender `no-reply@silvenari.com`, name
   `PlayLink`. Without this, password-reset emails reach only members of the Supabase project.
3. **Authentication → URL Configuration → Redirect URLs:** add `playlink://reset-password`.
4. **Authentication → Email Templates → Reset Password:** optional. Reword it in PlayLink's voice;
   keep `{{ .ConfirmationURL }}`.
5. **Test it:** on sign-in, type your email, tap "Forgot password?", and open the email on the
   same device.

## D. The production database (before the first store build)

1. Create a new Supabase project named `playlink-prod` (free tier) in the same region.
2. Give **(Claude)** its project ref and database password (put them in `CLAUDE.local.md`).
   Claude then runs `supabase link` and `db push` (every migration, in order), deploys the three
   Edge Functions with the flags in `supabase/config.toml`, and sets the `CRON_SECRET` function
   secret and the matching vault `cron_secret`.
3. Repeat section C on the new project.
4. From then on the current project is **staging**: tests and paste-ins go there first.
5. On public launch day: upgrade `playlink-prod` to Pro ($25/month) so it never pauses and has
   daily backups.

## E. First Android build

1. `npx eas-cli login`, then `npx eas-cli init` (adds the project id to `app.json`; commit it).
2. Give each build its Supabase keys (they are public keys, safe to store at Expo):
   ```
   npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value <staging URL> --visibility plaintext
   npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <staging key> --visibility plaintext
   npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value <prod URL> --visibility plaintext
   npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <prod key> --visibility plaintext
   ```
3. `npx eas-cli build -p android --profile preview`, then open the link it prints on an Android
   phone and install the APK.
4. **On-device checklist.** None of these has been tried on a real phone yet:
   - [ ] Sign up (the 18+ box), then close the app completely and reopen: still signed in (secure storage)
   - [ ] The keyboard never covers a field: sign-in, Profile name/location, Change Password, Delete Account, the create-group form
   - [ ] Forgot password: the email arrives, and the link opens the app on the reset screen
   - [ ] Post a group, join it from a second phone, wait 30 minutes, confirm, then drag to report a round
   - [ ] Contest window: the other player agrees or contests, and points arrive after 15 minutes
   - [ ] Haptics on buttons; light/dark follows the phone's setting
   - [ ] The Calendar finds your city and shows events
   - [ ] Shop: buy and wear a title
   - [ ] Delete Account on a throwaway account, then confirm it's gone (ask Claude to check)
   - [ ] The Android back gesture never leaves you on a dead screen

## F. Google Play listing and closed test

1. Play Console → Create app: name **PlayLink: Commander Pods**, free, app (not game). Accept
   the declarations.
2. **Store listing:** a short description (80 characters), a full description, the 512×512 icon
   (`assets/images/icon.png` scaled down), a 1024×500 feature graphic, and at least 2 phone
   screenshots. **(Claude)** can draft the text.
3. **App content:**
   - Privacy policy: `https://silvenari.com/privacy.html`
   - App access: some features need an account → add a reviewer account. **(Claude)** can create
     it on prod and record its credentials in `CLAUDE.local.md`.
   - Ads: no. Target audience: **18 and over**. Content rating: fill in the questionnaire
     (players can talk through group names and usernames, so it has user-generated content).
   - Data safety, matching `privacy.html`. Collected, not shared, encrypted in transit, can be
     deleted (in the app, plus `https://silvenari.com/delete-account.html`):
     - Personal info: **email address** (account management), **name** (username/display name — app functionality)
     - Location: **approximate location** (the city you type — app functionality)
     - App activity: **other user-generated content** (group names) and **in-app actions** (results, purchases of points-only items)
   - Account deletion URL: `https://silvenari.com/delete-account.html`
4. **Upload:** `npx eas-cli build -p android --profile production` makes an `.aab`. Google
   requires the very first one to be uploaded by hand: Testing → Internal testing → Create
   release. Later builds can go with `npx eas-cli submit -p android` once a Google service
   account key is set up.
5. **Closed testing:** create a track, add the testers' emails, and send them the opt-in link.
   Keep **12 or more opted in for 14 days in a row**, then apply for production access.

## G. iOS (once the Android 14 days are running)

1. Apple Developer Program, **individual**, $99/year (developer.apple.com/programs/enroll).
2. `npx eas-cli build -p ios --profile production` (EAS handles signing), then
   `npx eas-cli submit -p ios`.
3. App Store Connect: privacy "nutrition labels" (same answers as Data safety), age rating
   (choose 18+ through the questionnaire's user-generated-content and contact answers), the
   reviewer account, support URL `https://silvenari.com`, and privacy URL.
4. TestFlight internal → external testers (short review) → submit for App Store review.

## H. Release

Tell Claude to cut the release: `development` → `main`, tagged `v1.0.0`. The store builds should
come from that tag.

---

## Later (not needed for 1.0)

- Form a single-member LLC and transfer both store listings to it, so the seller shows as Silvenari.
- Before making any money from the app: replace Open-Meteo geocoding (non-commercial use only).
- If the Wizards locator stops working or Wizards objects: switch the Calendar to curated events.
- Crash reporting (Sentry), CAPTCHA at sign-up, hiding location and "won't play against" from
  other players (column-level reads).
