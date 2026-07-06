import { supabase } from './supabase';
import { updateProfile } from './profile-api';
import { Group, PlayerProfile } from '../data/groups';
import { GameType, NoGoRule, UserProfile } from '../data/types';
import { computePlacementScores, GameOutcome, PlacementInput } from '../utils/scoring-utils';

/** How long other group members have to dispute a submitted round before it auto-finalizes. */
export const DISPUTE_WINDOW_MS = 15 * 60 * 1000;

interface GroupPlayerRow {
  player_id: string;
  role: string;
  bracket: number;
  profiles: { username: string; location: string } | null;
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

const GROUP_SELECT = '*, group_players(player_id, role, bracket, profiles(username, location))';

const mapPlayerRow = (row: GroupPlayerRow): PlayerProfile => ({
  id: row.player_id,
  username: row.profiles?.username ?? 'Unknown',
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

/**
 * Removes a player from a group's roster.
 * Parameters: groupId, playerId.
 * Returns: a promise that resolves once the membership row is deleted.
 * Edge cases: no-op (no error) if the player wasn't a member; does not reassign the host role —
 * callers must call setGroupHost first if the leaving player is the host and others remain.
 */
export const leaveGroup = async (groupId: string, playerId: string): Promise<void> => {
  const { error } = await supabase
    .from('group_players')
    .delete()
    .eq('group_id', groupId)
    .eq('player_id', playerId);
  if (error) throw error;
};

/**
 * Reassigns a group's host role from one player to another.
 * Parameters: groupId, newHostId, previousHostId.
 * Returns: a promise that resolves once both role updates complete.
 * Edge cases: if the promotion succeeds but the demotion fails, the group is left with two
 * "Host" rows rather than none — acceptable since isHostForUser only checks for a match, not
 * exclusivity, and a caller can retry the demotion.
 */
export const setGroupHost = async (
  groupId: string,
  newHostId: string,
  previousHostId: string
): Promise<void> => {
  const { error: promoteError } = await supabase
    .from('group_players')
    .update({ role: 'Host' })
    .eq('group_id', groupId)
    .eq('player_id', newHostId);
  if (promoteError) throw promoteError;

  const { error: demoteError } = await supabase
    .from('group_players')
    .update({ role: 'Member' })
    .eq('group_id', groupId)
    .eq('player_id', previousHostId);
  if (demoteError) throw demoteError;
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
 * Submits a round's results: scores every player's placement via computePlacementScores and
 * inserts a pending result with a fresh dispute window.
 * Parameters: groupId, roundNumber (1-indexed — the caller is responsible for passing
 * group.roundsPlayed + 1), submittedBy (the host's id), placements (each participant's rank).
 * Returns: the newly created GroupResult.
 * Edge cases: throws if RLS rejects the insert (submitter isn't a group member).
 */
export const submitGroupResult = async (
  groupId: string,
  roundNumber: number,
  submittedBy: string,
  placements: PlacementInput[]
): Promise<GroupResult> => {
  const scored = computePlacementScores(placements);
  const { data, error } = await supabase
    .from('group_results')
    .insert({
      group_id: groupId,
      round_number: roundNumber,
      submitted_by: submittedBy,
      dispute_window_ends_at: new Date(Date.now() + DISPUTE_WINDOW_MS).toISOString(),
      placements: scored,
    })
    .select()
    .single();
  if (error) throw error;
  return mapResultRow(data as GroupResultRow);
};

/**
 * Flags a pending result as disputed by a group member, permanently blocking it from
 * auto-finalizing — the host must cancel it (cancelGroupResult) and resubmit rather than the
 * dispute ever being "resolved" in place, keeping the anti-cheat model simple.
 * Parameters: result (the result being disputed), playerId (who's disputing it).
 * Returns: a promise that resolves once the update completes.
 * Edge cases: no-op if this player already disputed it.
 */
export const disputeGroupResult = async (result: GroupResult, playerId: string): Promise<void> => {
  if (result.disputedBy.includes(playerId)) return;
  const { error } = await supabase
    .from('group_results')
    .update({ disputed_by: [...result.disputedBy, playerId], status: 'disputed' })
    .eq('id', result.id);
  if (error) throw error;
};

/**
 * Deletes a disputed (or otherwise unwanted) result so the host can resubmit a corrected round.
 * Parameters: resultId.
 * Returns: a promise that resolves once the row is deleted.
 * Edge cases: none beyond the standard Postgres/network error; deleting a finalized result does
 * not undo points already applied from it (not exposed in the UI — see group-detail.tsx).
 */
export const cancelGroupResult = async (resultId: string): Promise<void> => {
  const { error } = await supabase.from('group_results').delete().eq('id', resultId);
  if (error) throw error;
};

/**
 * Lazily finalizes a pending result once its dispute window has elapsed with no disputes, and
 * bumps the group's rounds_played — mirrors this app's existing getNow()/devDateOffset pattern
 * of checking elapsed time whenever a screen reads the data, rather than running a scheduled job
 * to do it centrally.
 * Parameters: result (the result to check), currentRoundsPlayed (the group's rounds_played
 * before this round, needed since the increment is a read-then-write rather than an atomic SQL
 * expression).
 * Returns: the result unchanged if it isn't ready to finalize yet, or the updated (now
 * 'finalized') result.
 * Edge cases: the `.eq('status', 'pending')` guard means a concurrent dispute from another
 * player's device loses the update (0 rows affected) rather than overwriting their dispute -
 * `.select().maybeSingle()` then returns null for that case, so the caller re-fetches instead.
 */
export const finalizeGroupResultIfReady = async (
  result: GroupResult,
  currentRoundsPlayed: number
): Promise<GroupResult> => {
  if (result.status !== 'pending' || Date.now() < result.disputeWindowEndsAt) return result;

  const { data, error } = await supabase
    .from('group_results')
    .update({ status: 'finalized', finalized_at: new Date().toISOString() })
    .eq('id', result.id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return result;

  await supabase.from('groups').update({ rounds_played: currentRoundsPlayed + 1 }).eq('id', result.groupId);
  return mapResultRow(data as GroupResultRow);
};

/**
 * Applies one player's own share of a finalized result to their profile (points/monthlyPoints,
 * and whichever of wins/losses/draws matches their outcome), then marks them as applied so a
 * later reload never double-awards it. Only ever touches the caller's own profile row — RLS
 * wouldn't allow anything else — so every participant's own client must call this for the
 * group's points to fully settle; there is no single step that applies everyone's at once.
 * Parameters: result (a finalized GroupResult), currentProfile (the calling user's own, current
 * UserProfile, used as the base for the point/record delta).
 * Returns: a promise that resolves once both the profile update and the applied_by marker land,
 * or resolves immediately with no writes if the result isn't finalized, doesn't include this
 * player, or was already applied by them.
 * Edge cases: none beyond the standard Postgres/network error from either write.
 */
export const applyGroupResultPoints = async (
  result: GroupResult,
  currentProfile: UserProfile
): Promise<void> => {
  if (result.status !== 'finalized' || result.appliedBy.includes(currentProfile.id)) return;
  const mine = result.placements.find((p) => p.playerId === currentProfile.id);
  if (!mine) return;

  await updateProfile(currentProfile.id, {
    wins: currentProfile.wins + (mine.outcome === 'win' ? 1 : 0),
    losses: currentProfile.losses + (mine.outcome === 'loss' ? 1 : 0),
    draws: currentProfile.draws + (mine.outcome === 'draw' ? 1 : 0),
    points: currentProfile.points + mine.pointsAwarded,
    monthlyPoints: currentProfile.monthlyPoints + mine.pointsAwarded,
  });

  const { error } = await supabase
    .from('group_results')
    .update({ applied_by: [...result.appliedBy, currentProfile.id] })
    .eq('id', result.id);
  if (error) throw error;
};
