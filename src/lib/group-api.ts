import { supabase } from './supabase';
import { Group, PlayerProfile } from '../data/groups';
import { GameType, NoGoRule, UserProfile } from '../data/types';
import { GameOutcome, PlacementInput } from '../utils/scoring-utils';

/**
 * How long other group members have to dispute a submitted round before it auto-finalizes.
 * Used only for the client-side countdown display — the authoritative 15-minute window is set
 * server-side by the submit_group_result SQL function (see the harden_rls migration). Keep the
 * two in sync if this ever changes.
 */
export const DISPUTE_WINDOW_MS = 15 * 60 * 1000;

interface GroupPlayerRow {
  player_id: string;
  role: string;
  bracket: number;
  profiles: { username: string; display_name: string | null; location: string } | null;
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
  group_players: GroupPlayerRow[];
}

const GROUP_SELECT = '*, group_players(player_id, role, bracket, profiles(username, display_name, location))';

const mapPlayerRow = (row: GroupPlayerRow): PlayerProfile => ({
  id: row.player_id,
  username: row.profiles?.username ?? 'Unknown',
  displayName: row.profiles?.display_name ?? undefined,
  bracket: row.bracket,
  location: row.profiles?.location ?? '',
  role: row.role,
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
  pointsAwarded: number;
}

export interface GroupResult {
  id: string;
  groupId: string;
  roundNumber: number;
  submittedBy: string;
  submittedAt: number;
  status: 'pending' | 'disputed' | 'finalized';
  disputeWindowEndsAt: number;
  finalizedAt?: number;
  disputedBy: string[];
  /** One entry per disputing player id, holding the reason they gave when flagging the round. */
  disputeReasons: Record<string, string>;
  appliedBy: string[];
  placements: GroupResultPlacement[];
}

interface GroupResultRow {
  id: string;
  group_id: string;
  round_number: number;
  submitted_by: string;
  submitted_at: string;
  status: 'pending' | 'disputed' | 'finalized';
  dispute_window_ends_at: string;
  finalized_at: string | null;
  disputed_by: string[];
  dispute_reasons: Record<string, string>;
  applied_by: string[];
  placements: GroupResultPlacement[];
}

const mapResultRow = (row: GroupResultRow): GroupResult => ({
  id: row.id,
  groupId: row.group_id,
  roundNumber: row.round_number,
  submittedBy: row.submitted_by,
  submittedAt: new Date(row.submitted_at).getTime(),
  status: row.status,
  disputeWindowEndsAt: new Date(row.dispute_window_ends_at).getTime(),
  finalizedAt: row.finalized_at ? new Date(row.finalized_at).getTime() : undefined,
  disputedBy: row.disputed_by,
  disputeReasons: row.dispute_reasons ?? {},
  appliedBy: row.applied_by,
  placements: row.placements,
});

/**
 * Fetches every reported round for a group, oldest first.
 * Parameters: groupId.
 * Returns: an array of GroupResult.
 * Edge cases: returns an empty array if no round has been reported yet.
 */
export const fetchGroupResults = async (groupId: string): Promise<GroupResult[]> => {
  const { data, error } = await supabase
    .from('group_results')
    .select('*')
    .eq('group_id', groupId)
    .order('round_number', { ascending: true });
  if (error) throw error;
  return (data as GroupResultRow[]).map(mapResultRow);
};

/**
 * Submits a round's results through the submit_group_result SQL function, which verifies the
 * caller is the group's host and that every placed player is a member, scores the raw placement
 * order server-side (so points can't be inflated from the client), and inserts a pending result
 * with a fresh dispute window. The caller sends only the finish order, never computed points.
 * Parameters: groupId, roundNumber (1-indexed — the caller passes group.roundsPlayed + 1),
 * submittedBy (unused server-side, kept for call-site compatibility; the host is derived from the
 * authenticated session), placements (each participant's rank).
 * Returns: a promise that resolves once the round is recorded; the caller refetches the results
 * query to pick up the new row rather than relying on a return value.
 * Edge cases: throws if the caller isn't the host, if a placement names a non-member, or on any
 * Postgres/network error.
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

/**
 * Flags a pending result as disputed by a group member, permanently blocking it from
 * auto-finalizing — the host must cancel it (cancelGroupResult) and resubmit rather than the
 * dispute ever being "resolved" in place, keeping the anti-cheat model simple. The reason is
 * required so the host has some idea of what to fix before resubmitting, rather than just
 * knowing *that* someone objected.
 * Routes through the dispute_group_result SQL function, which appends only the caller's own id
 * and reason (it can't touch placements or anyone else's entry) and flips the round to disputed.
 * Parameters: result (the result being disputed), playerId (unused server-side — the disputer is
 * the authenticated caller; kept for the local already-disputed short-circuit and call-site
 * compatibility), reason (their required explanation of what's wrong with the round).
 * Returns: a promise that resolves once the update completes.
 * Edge cases: no-op if this player already disputed it (their original reason is kept); throws if
 * the reason is blank, the round is already finalized, or the caller isn't a group member.
 */
export const disputeGroupResult = async (
  result: GroupResult,
  playerId: string,
  reason: string
): Promise<void> => {
  if (result.disputedBy.includes(playerId)) return;
  const { error } = await supabase.rpc('dispute_group_result', {
    p_result_id: result.id,
    p_reason: reason,
  });
  if (error) throw error;
};

/**
 * Deletes a disputed (or otherwise unwanted) result so the host can resubmit a corrected round,
 * via the cancel_group_result SQL function (host-only, and refuses to delete a finalized round).
 * This replaces a direct .delete(), which silently affected zero rows anyway since group_results
 * never had a client DELETE policy.
 * Parameters: resultId.
 * Returns: a promise that resolves once the row is deleted.
 * Edge cases: throws if the caller isn't the group's host or the round is already finalized;
 * no-op if the result no longer exists.
 */
export const cancelGroupResult = async (resultId: string): Promise<void> => {
  const { error } = await supabase.rpc('cancel_group_result', { p_result_id: resultId });
  if (error) throw error;
};

/**
 * Lazily finalizes a pending result once its dispute window has elapsed with no disputes, via the
 * finalize_group_result SQL function — mirrors this app's existing getNow()/devDateOffset pattern
 * of checking elapsed time on read rather than running a scheduled job. The function re-checks the
 * status and window server-side and bumps the group's rounds_played atomically, so a concurrent
 * dispute from another device can't be clobbered. The client-side guard below just avoids a
 * needless call when the round plainly isn't due yet.
 * Parameters: result (the result to check).
 * Returns: a promise that resolves once the check completes; the caller refetches the results and
 * group queries to pick up any change rather than relying on a return value.
 * Edge cases: no-op if the round isn't pending or its window is still open; throws if the caller
 * isn't a group member or on any Postgres/network error.
 */
export const finalizeGroupResultIfReady = async (result: GroupResult): Promise<void> => {
  if (result.status !== 'pending' || Date.now() < result.disputeWindowEndsAt) return;
  const { error } = await supabase.rpc('finalize_group_result', { p_result_id: result.id });
  if (error) throw error;
};

/**
 * Applies the caller's own share of a finalized result to their profile via the apply_group_result
 * SQL function, which reads the points/outcome from the server-computed placements (the client
 * can't influence them), writes the otherwise-locked score columns on the caller's own profile
 * row only, and marks them applied so a later reload never double-awards it. Every participant's
 * own client must still call this for the group's points to fully settle; there is no single step
 * that applies everyone's at once.
 * Parameters: result (a finalized GroupResult), currentProfile (the calling user's own profile —
 * used only for the local short-circuits below so an already-applied or non-participating result
 * never makes a pointless round trip; the actual delta is computed server-side).
 * Returns: a promise that resolves once the server applies the delta, or immediately with no call
 * if the result isn't finalized, doesn't include this player, or was already applied by them.
 * Edge cases: throws on a Postgres/network error; the server rejects any attempt to apply an
 * unfinalized round or to double-apply.
 */
export const applyGroupResultPoints = async (
  result: GroupResult,
  currentProfile: UserProfile
): Promise<void> => {
  if (result.status !== 'finalized' || result.appliedBy.includes(currentProfile.id)) return;
  if (!result.placements.some((p) => p.playerId === currentProfile.id)) return;

  const { error } = await supabase.rpc('apply_group_result', { p_result_id: result.id });
  if (error) throw error;
};
