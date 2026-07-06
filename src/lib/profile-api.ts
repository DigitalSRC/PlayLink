import { supabase } from './supabase';
import { GameType, NoGoRule, UserProfile } from '../data/types';

interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  is_developer: boolean;
  location: string;
  games: string[];
  preferred_formats: Partial<Record<GameType, string[]>>;
  brackets: number[];
  no_go: string[];
  wins: number;
  losses: number;
  points: number;
  monthly_points: number;
}

/**
 * Thrown by insertProfile when the chosen username collides with an existing profile
 * (case-insensitive), so callers can show a friendly "username taken" message instead of a
 * raw Postgres error.
 * Parameters: none beyond the standard Error message.
 * Returns: not applicable — this is an Error subclass, not a function.
 * Edge cases: none — always represents exactly one condition, a unique_violation on username.
 */
export class UsernameTakenError extends Error {
  constructor() {
    super('That username is already taken.');
    this.name = 'UsernameTakenError';
  }
}

/**
 * Converts a raw `profiles` table row (snake_case, as stored in Postgres) into the app's
 * camelCase UserProfile shape. Keeps snake_case column names contained to this file so no
 * other part of the app needs to know the database's naming convention.
 * Parameters: row (a ProfileRow returned by a Supabase query).
 * Returns: a UserProfile matching the row's data.
 * Edge cases: a null display_name maps to undefined (UserProfile.displayName is optional);
 * is_developer of false maps to false, not undefined, since it's a meaningful default.
 */
export const mapRowToProfile = (row: ProfileRow): UserProfile => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name ?? undefined,
  isDeveloper: row.is_developer,
  location: row.location,
  games: row.games as GameType[],
  preferredFormats: row.preferred_formats,
  brackets: row.brackets,
  noGo: row.no_go as NoGoRule[],
  wins: row.wins,
  losses: row.losses,
  points: row.points,
  monthlyPoints: row.monthly_points,
});

/**
 * Converts a (possibly partial) UserProfile into the snake_case shape the `profiles` table
 * expects, omitting `id` (callers supply that separately since it's the auth user's id, not
 * part of the editable profile data).
 * Parameters: profile (a full or partial UserProfile, excluding id).
 * Returns: a partial ProfileRow containing only the fields present on the input, so it's safe
 * to use for both a full insert and a sparse update patch.
 * Edge cases: an explicit `undefined` value for displayName is written through as `null`
 * rather than being dropped, so clearing a display name in the UI actually clears it in the DB.
 */
export const mapProfileToRow = (
  profile: Partial<Omit<UserProfile, 'id'>>
): Partial<Omit<ProfileRow, 'id'>> => {
  const row: Partial<Omit<ProfileRow, 'id'>> = {};
  if ('username' in profile) row.username = profile.username;
  if ('displayName' in profile) row.display_name = profile.displayName ?? null;
  if ('isDeveloper' in profile) row.is_developer = profile.isDeveloper;
  if ('location' in profile) row.location = profile.location;
  if ('games' in profile) row.games = profile.games;
  if ('preferredFormats' in profile) row.preferred_formats = profile.preferredFormats;
  if ('brackets' in profile) row.brackets = profile.brackets;
  if ('noGo' in profile) row.no_go = profile.noGo;
  if ('wins' in profile) row.wins = profile.wins;
  if ('losses' in profile) row.losses = profile.losses;
  if ('points' in profile) row.points = profile.points;
  if ('monthlyPoints' in profile) row.monthly_points = profile.monthlyPoints;
  return row;
};

/**
 * Mirrors username/displayName into the Supabase auth user's own metadata (user_metadata), so
 * the Authentication > Users view in Supabase Studio shows a meaningful identity instead of
 * just an email, and can be inspected or hand-edited there directly if ever needed.
 * Parameters: fields (whichever of username/displayName changed — checked by key presence, not
 * truthiness, so an explicit `displayName: undefined` still clears it in metadata, matching
 * mapProfileToRow's convention for the same field).
 * Returns: a promise that resolves once the sync attempt finishes either way.
 * Edge cases: best-effort — the `profiles` table is this app's actual source of truth, so a
 * failure here is logged and swallowed rather than thrown, and never blocks a profile
 * create/update from succeeding; a no-op if neither field is present on the input.
 */
const syncAuthUserMetadata = async (
  fields: Partial<Pick<UserProfile, 'username' | 'displayName'>>
): Promise<void> => {
  const data: Record<string, string | null> = {};
  if ('username' in fields) data.username = fields.username ?? null;
  if ('displayName' in fields) data.display_name = fields.displayName ?? null;
  if (Object.keys(data).length === 0) return;

  const { error } = await supabase.auth.updateUser({ data });
  if (error) console.warn('Failed to sync auth user metadata:', error.message);
};

/**
 * Fetches the signed-in user's profile row by their Supabase auth user id.
 * Parameters: userId (the auth.users.id / UserProfile.id to look up).
 * Returns: the matching UserProfile, or null if no profile row exists yet for this user
 * (meaning they've authenticated but haven't completed profile-creation).
 * Edge cases: throws on any Postgres/network error other than "no row found" — a missing row
 * is a normal, expected state (new user), not an error.
 */
export const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRowToProfile(data as ProfileRow) : null;
};

/**
 * Creates a new profile row for a freshly authenticated user, at the end of the
 * profile-creation onboarding flow.
 * Parameters: userId (the auth.users.id this profile belongs to), draft (the profile fields
 * collected by onboarding, everything except id).
 * Returns: the newly created UserProfile, as stored (including any DB-applied defaults).
 * Edge cases: throws UsernameTakenError if the username collides case-insensitively with an
 * existing profile (Postgres unique_violation, code 23505); rethrows any other error unchanged;
 * also syncs username/displayName to the auth user's metadata (see syncAuthUserMetadata) so
 * Supabase Studio's user list reflects the new profile — failures there don't affect the result.
 */
export const insertProfile = async (
  userId: string,
  draft: Omit<UserProfile, 'id'>
): Promise<UserProfile> => {
  const row = { id: userId, ...mapProfileToRow(draft) };
  const { data, error } = await supabase.from('profiles').insert(row).select().single();

  if (error) {
    if (error.code === '23505') throw new UsernameTakenError();
    throw error;
  }
  await syncAuthUserMetadata({ username: draft.username, displayName: draft.displayName });
  return mapRowToProfile(data as ProfileRow);
};

/**
 * Applies a partial update to a user's existing profile row — used for edits (display name,
 * location, preferences) and for the point/win/loss mutators in AppContext.
 * Parameters: userId (whose row to update), patch (the fields to change; unlisted fields are
 * left untouched).
 * Returns: the full updated UserProfile after the patch is applied.
 * Edge cases: throws if no row exists for userId (update matches zero rows) or on any other
 * Postgres/network error; RLS silently prevents updating any row other than the caller's own;
 * also syncs username/displayName to the auth user's metadata whenever the patch touches either
 * (see syncAuthUserMetadata), so Supabase Studio's user list stays current after an edit.
 */
export const updateProfile = async (
  userId: string,
  patch: Partial<Omit<UserProfile, 'id'>>
): Promise<UserProfile> => {
  const row = mapProfileToRow(patch);
  const { data, error } = await supabase
    .from('profiles')
    .update(row)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  if ('username' in patch || 'displayName' in patch) {
    await syncAuthUserMetadata({ username: patch.username, displayName: patch.displayName });
  }
  return mapRowToProfile(data as ProfileRow);
};
