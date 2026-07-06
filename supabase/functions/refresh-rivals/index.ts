// Daily scheduled job: recomputes every profile's rival matches and, once a month, resets
// everyone's monthlyPoints back to 0 so both the leaderboard and rival matching start a fresh
// season together. Triggered by a pg_cron schedule (see the
// 20260705130000_rival_refresh_cron.sql migration) rather than a user request, so this function
// is deployed with --no-verify-jwt and checks its own shared secret instead of a Supabase JWT.
//
// Deploy: npx supabase functions deploy refresh-rivals --no-verify-jwt
// Secret: npx supabase secrets set CRON_SECRET=<same value stored in the vault, see the migration>

import { createClient } from 'npm:@supabase/supabase-js@2';

const LA_TIME_ZONE = 'America/Los_Angeles';

interface ProfileRow {
  id: string;
  games: string[];
  brackets: number[];
  preferred_formats: Record<string, string[]>;
  monthly_points: number;
  monthly_reset_at: string | null;
}

/**
 * Formats a Date as a `YYYY-MM` string in the given IANA time zone, used to detect whether a
 * calendar month boundary (in Pacific time, not UTC) has been crossed since the last reset.
 * Parameters: date (the instant to format), timeZone (an IANA zone name).
 * Returns: a "YYYY-MM" string, e.g. "2026-08".
 * Edge cases: relies on Intl's tz database rather than a fixed UTC offset, so it stays correct
 * across the PST/PDT daylight-saving transition without any special-casing here.
 */
const monthKey = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}`;
};

/**
 * Ranks candidate profiles for a single user by closeness of monthly points, mirroring
 * src/utils/rival-utils.ts's findRivals — duplicated here rather than imported because Edge
 * Functions run on Deno and can't import React Native app source directly. Keep the two in sync
 * by hand if the ranking rule changes.
 * Parameters: user (the profile to find rivals for), candidates (other profiles sharing at
 * least one game with user), maxRivals (cap, default 3).
 * Returns: up to maxRivals candidate ids, closest monthly points first.
 * Edge cases: returns an empty array if candidates is empty (e.g. a brand-new game with only
 * one player so far).
 */
const rankRivals = (
  user: ProfileRow,
  candidates: ProfileRow[],
  maxRivals: number = 3
): string[] =>
  candidates
    .map((p) => ({ id: p.id, diff: Math.abs(p.monthly_points - user.monthly_points) }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, maxRivals)
    .map((r) => r.id);

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: profiles, error: fetchError } = await supabase
    .from('profiles')
    .select('id, games, brackets, preferred_formats, monthly_points, monthly_reset_at');
  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  const now = new Date();
  const currentMonthKey = monthKey(now, LA_TIME_ZONE);

  // A profile "needs" a monthly reset if it's never been reset, or its last reset happened in
  // a different Pacific-time month than today — covers both a brand-new profile and one that
  // missed a prior run (e.g. this function was down when the month actually rolled over).
  const needsMonthlyReset = (p: ProfileRow) =>
    !p.monthly_reset_at || monthKey(new Date(p.monthly_reset_at), LA_TIME_ZONE) !== currentMonthKey;

  const workingProfiles = profiles.map((p: ProfileRow) =>
    needsMonthlyReset(p) ? { ...p, monthly_points: 0 } : p
  );

  const results = await Promise.allSettled(
    workingProfiles.map(async (profile: ProfileRow) => {
      const candidates = workingProfiles.filter(
        (other: ProfileRow) =>
          other.id !== profile.id && other.games.some((g) => profile.games.includes(g))
      );
      const rivalIds = rankRivals(profile, candidates);

      const patch: Record<string, unknown> = {
        rival_ids: rivalIds,
        last_rival_refresh: now.toISOString(),
      };
      if (needsMonthlyReset(profile)) {
        patch.monthly_points = 0;
        patch.monthly_reset_at = now.toISOString();
      }

      const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id);
      if (error) throw new Error(`${profile.id}: ${error.message}`);
    })
  );

  const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  return new Response(
    JSON.stringify({
      refreshed: results.length - failures.length,
      failed: failures.map((f) => String(f.reason)),
    }),
    { status: failures.length > 0 ? 207 : 200, headers: { 'Content-Type': 'application/json' } }
  );
});
