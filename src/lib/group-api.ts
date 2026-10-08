import { supabase } from './supabase';
import { Group, PlayerProfile } from '../data/groups';
import { GameType, NoGoRule } from '../data/types';
import { GameOutcome, PlacementInput } from '../utils/scoring-utils';

interface GroupPlayerRow {
  player_id: string;
  role: string;
  bracket: number;
  profiles: {
    username: string;
    display_name: string | null;
    location: string;
    title?: string | null;
    name_color?: string | null;
  } | null;
}

interface GroupRow {
  id: string;
  name: string;
  join_code: string;
  created_by: string;
  created_at: string;
  scheduled_at: string | null;
  rounds_played: number;
  target_players: number;
  brackets: number[];
  location: string;
  time: string;
  game_type: string;
  format: string;
  no_go: string[];
  confirmed: boolean;
  local_event_id?: string | null;
  group_players: GroupPlayerRow[];
}

const GROUP_SELECT =
  '*, group_players(player_id, role, bracket, profiles(username, display_name, location, title, name_color))';

const mapPlayerRow = (row: GroupPlayerRow): PlayerProfile => ({
  id: row.player_id,
  username: row.profiles?.username ?? 'Unknown',
  displayName: row.profiles?.display_name ?? undefined,
  bracket: row.bracket,
  location: row.profiles?.location ?? '',
  role: row.role,
  title: row.profiles?.title ?? undefined,
  nameColor: row.profiles?.name_color ?? undefined,
});

const mapGroupRow = (row: GroupRow): Group => ({
  id: row.id,
  name: row.name,
  joinCode: row.join_code,
  createdBy: row.created_by,
  createdAt: new Date(row.created_at).getTime(),
  scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).getTime() : undefined,
  roundsPlayed: row.rounds_played,
  players: row.group_players.map(mapPlayerRow),
  targetPlayers: row.target_players,
  brackets: row.brackets,
  location: row.location,
  time: row.time,
  gameType: row.game_type as GameType,
  format: row.format,
  noGo: row.no_go as NoGoRule[],
  confirmed: row.confirmed,
  localEventId: row.local_event_id ?? undefined,
});

/**
 * Fetches every group and its current roster, newest first.
 * Parameters: none.
 * Returns: an array of Group, each with its players already embedded (no N+1 follow-up fetch
 * needed per group).
 * Edge cases: returns an empty array if no groups exist yet.
 */
export const fetchGroups = async (): Promise<Group[]> => {
  const { data, error } = await supabase
    .from('groups')
    .select(GROUP_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as GroupRow[]).map(mapGroupRow);
};

/**
 * Fetches a single group and its roster by id.
 * Parameters: groupId.
 * Returns: the matching Group, or null if it doesn't exist (e.g. a stale route param).
 * Edge cases: throws on any Postgres/network error other than "no row found".
 */
export const fetchGroupById = async (groupId: string): Promise<Group | null> => {
  const { data, error } = await supabase
    .from('groups')
    .select(GROUP_SELECT)
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapGroupRow(data as unknown as GroupRow) : null;
};

export interface CreateGroupDraft {
  name: string;
  joinCode: string;
  scheduledAt?: number;
  targetPlayers: number;
  brackets: number[];
  location: string;
  time: string;
  gameType: GameType;
  format: string;
  noGo: NoGoRule[];
  hostBracket: number;
  /** The store event the group is playing at, chosen from the calendar; omit for none. */
  localEventId?: string;
}

/**
 * Creates a new group row and seats its host as the first player.
 * Parameters: hostId (the creating user's id), draft (the group's fields plus the host's own
 * chosen bracket for this session).
 * Returns: the newly created Group, with the host already in its player list.
 * Edge cases: throws (and leaves no group_players row) if the group insert fails; throws if the
 * host's own group_players insert fails even though the group row was created — callers should
 * treat any error here as "creation failed," not attempt to reuse a partially-created group.
 */
export const createGroup = async (hostId: string, draft: CreateGroupDraft): Promise<Group> => {
  const { data, error } = await supabase
    .from('groups')
    .insert({
      name: draft.name,
      join_code: draft.joinCode,
      created_by: hostId,
      scheduled_at: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : null,
      target_players: draft.targetPlayers,
      brackets: draft.brackets,
      location: draft.location,
      time: draft.time,
      game_type: draft.gameType,
      format: draft.format,
      no_go: draft.noGo,
      local_event_id: draft.localEventId ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  const { error: joinError } = await supabase
    .from('group_players')
    .insert({ group_id: data.id, player_id: hostId, role: 'Host', bracket: draft.hostBracket });
  if (joinError) throw joinError;

  const created = await fetchGroupById(data.id);
  if (!created) throw new Error('Failed to load newly created group');
  return created;
};

/**
 * Adds a player to an existing group's roster.
 * Parameters: groupId, playerId, bracket (their chosen bracket for this session), role (defaults
 * to 'Member').
 * Returns: a promise that resolves once the membership row is inserted.
 * Edge cases: throws on a duplicate membership (group_players' primary key rejects joining the
 * same group twice) or if RLS blocks it (e.g. the group no longer exists).
 */
export const joinGroup = async (
  groupId: string,
  playerId: string,
  bracket: number,
  role: PlayerProfile['role'] = 'Member'
): Promise<void> => {
  const { error } = await supabase
    .from('group_players')
    .insert({ group_id: groupId, player_id: playerId, bracket, role });
  if (error) throw error;
};

/** What leave_group did: the caller left, the caller was last so the group is gone, or nothing. */
export type LeaveGroupOutcome = 'left' | 'deleted' | 'not_member';

/**
 * Removes the signed-in user from a group via the leave_group database function. The server does
 * the whole thing in one transaction: if they were the last member the group is deleted, and if
 * they were the host with others remaining, the longest-standing member becomes host. There is
 * deliberately no playerId argument - the server acts on whoever is signed in, so this can never
 * be used to remove someone else.
 * Parameters: groupId.
 * Returns: 'left', 'deleted' (the caller was the last member), or 'not_member' (nothing changed).
 * Edge cases: resolves to 'not_member' rather than throwing if the group no longer exists or the
 * user wasn't in it, so leaving twice or leaving an already-cleaned-up group is harmless; throws
 * if the user isn't signed in or on a Postgres/network error.
 */
export const leaveGroup = async (groupId: string): Promise<LeaveGroupOutcome> => {
  const { data, error } = await supabase.rpc('leave_group', { p_group_id: groupId });
  if (error) throw error;
  return data as LeaveGroupOutcome;
};

/**
 * Deletes a group for everyone via the delete_group database function (cascades to its roster
 * and results). Only the group's host is allowed to; the server checks, not this client.
 * This replaces a direct .delete(), which silently affected zero rows because `groups` never had
 * a DELETE policy - so the old call reported success without deleting anything.
 * Parameters: groupId.
 * Returns: a promise that resolves once the group is gone.
 * Edge cases: resolves without error if the group no longer exists (a repeated tap, or the
 * stale-group cron got there first); throws if the caller isn't the host.
 */
export const deleteGroup = async (groupId: string): Promise<void> => {
  const { error } = await supabase.rpc('delete_group', { p_group_id: groupId });
  if (error) throw error;
};

/**
 * Hands a group's host role to another member via the transfer_group_host database function.
 * The server promotes the new host and demotes the old one in a single transaction, so the group
 * always ends up with exactly one host. Only the current host may call it.
 * This replaces two direct .update() calls, which silently affected zero rows because
 * `group_players` never had an UPDATE policy - host transfer never actually persisted.
 * Parameters: groupId, newHostId.
 * Returns: a promise that resolves once the role has moved.
 * Edge cases: no-op if newHostId is already the host; throws if the caller isn't the host, the
 * target isn't a member of the group, or the group no longer exists.
 */
export const setGroupHost = async (groupId: string, newHostId: string): Promise<void> => {
  const { error } = await supabase.rpc('transfer_group_host', {
    p_group_id: groupId,
    p_new_host_id: newHostId,
  });
  if (error) throw error;
};

export interface UpdateGroupDraft {
  name: string;
  location: string;
  time: string;
  targetPlayers: number;
  brackets: number[];
}

/**
 * Persists edits made through group-detail.tsx's Edit Group form: name, location, day/time,
 * players needed, and Commander brackets. This was previously local-state-only (the form's Save
 * button just showed a "coming soon" alert), so nothing typed here ever reached the `groups` row.
 * Parameters: groupId, draft (the edited field values, already validated/parsed by the caller).
 * Returns: a promise that resolves once the update completes.
 * Edge cases: none beyond the standard Postgres/network error; does not touch gameType, format,
 * or noGo, none of which the edit form exposes.
 */
export const updateGroup = async (groupId: string, draft: UpdateGroupDraft): Promise<void> => {
  const { error } = await supabase
    .from('groups')
    .update({
      name: draft.name,
      location: draft.location,
      time: draft.time,
      target_players: draft.targetPlayers,
      brackets: draft.brackets,
    })
    .eq('id', groupId);
  if (error) throw error;
};

/**
 * Sets whether a group's game session is confirmed (host-only in practice, enforced by the UI
 * rather than RLS since any member can currently update a group row).
 * Parameters: groupId, confirmed.
 * Returns: a promise that resolves once the update completes.
 * Edge cases: none beyond the standard Postgres/network error.
 */
export const confirmGroup = async (groupId: string, confirmed: boolean): Promise<void> => {
  const { error } = await supabase.from('groups').update({ confirmed }).eq('id', groupId);
  if (error) throw error;
};

export interface GroupResultPlacement {
  playerId: string;
  placement: number;
  outcome: GameOutcome;
  /** Total points for the round, including venueBonus. */
  pointsAwarded: number;
  /** How much of pointsAwarded is the store-event bonus (0 or VENUE_EVENT_BONUS). Absent on
   * rounds recorded before the bonus existed. */
  venueBonus?: number;
}

export interface GroupResult {
  id: string;
  groupId: string;
  roundNumber: number;
  submittedBy: string;
  submittedAt: number;
  placements: GroupResultPlacement[];
}

interface GroupResultRow {
  id: string;
  group_id: string;
  round_number: number;
  submitted_by: string;
  submitted_at: string;
  placements: GroupResultPlacement[];
}

const mapResultRow = (row: GroupResultRow): GroupResult => ({
  id: row.id,
  groupId: row.group_id,
  roundNumber: row.round_number,
  submittedBy: row.submitted_by,
  submittedAt: new Date(row.submitted_at).getTime(),
  placements: row.placements ?? [],
});

/**
 * Fetches every reported round for a group, oldest first. Every round here is final: there is
 * no pending or disputed state, so what this returns is exactly what was paid out.
 * Parameters: groupId.
 * Returns: an array of GroupResult.
 * Edge cases: returns an empty array if no round has been reported yet.
 */
export const fetchGroupResults = async (groupId: string): Promise<GroupResult[]> => {
  const { data, error } = await supabase
    .from('group_results')
    .select('id, group_id, round_number, submitted_by, submitted_at, placements')
    .eq('group_id', groupId)
    .order('round_number', { ascending: true });
  if (error) throw error;
  return (data as GroupResultRow[]).map(mapResultRow);
};

/**
 * Reports a round, and that report is final. The submit_group_result SQL function verifies the
 * caller is the group's host and that every placed player is a member, scores the raw finish
 * order itself (so points can't be inflated from the client), adds the one-time store-event
 * bonus where it applies, records the round, pays every player their points, and counts the
 * round as played - all in one transaction. There is no dispute window and no way to edit or
 * cancel a round afterwards, so the caller should confirm the order with the host first.
 * Parameters: groupId, roundNumber (1-indexed - the caller passes group.roundsPlayed + 1, and
 * the server refuses anything else, which is what makes a double tap harmless), submittedBy
 * (unused server-side, kept for call-site compatibility; the host is the authenticated caller),
 * placements (each participant's rank).
 * Returns: a promise that resolves once the round is recorded and paid; the caller refetches
 * the group, its results, and its own profile rather than relying on a return value.
 * Edge cases: throws if the caller isn't the host, a placement names a non-member or the same
 * player twice, the round number isn't the next one (already reported, or out of order), or on
 * any Postgres/network error. On any failure nothing is recorded and nobody is paid.
 */
export const submitGroupResult = async (
  groupId: string,
  roundNumber: number,
  submittedBy: string,
  placements: PlacementInput[]
): Promise<void> => {
  const { error } = await supabase.rpc('submit_group_result', {
    p_group_id: groupId,
    p_round_number: roundNumber,
    p_placements: placements.map((p) => ({ playerId: p.playerId, placement: p.placement })),
  });
  if (error) throw error;
};
