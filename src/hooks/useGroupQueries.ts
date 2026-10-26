import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmGroup,
  createGroup,
  CreateGroupDraft,
  deleteGroup,
  fetchGroupBallots,
  fetchGroupById,
  fetchGroupResults,
  fetchGroups,
  joinGroup,
  leaveGroup,
  setGroupHost,
  submitGroupResult,
  updateGroup,
  UpdateGroupDraft,
  voteGroupResult,
} from '../lib/group-api';
import { PlayerProfile } from '../data/groups';
import { PlacementInput } from '../utils/scoring-utils';

/**
 * Query key factory for group data, so every call site shares the same cache keys.
 * Parameters: none beyond the key builders' own arguments.
 * Returns: an object with `list()` and `detail(groupId)`/`results(groupId)`/`ballots(groupId)`
 * key builders.
 * Edge cases: none.
 */
export const groupKeys = {
  list: () => ['groups'] as const,
  detail: (groupId: string | undefined) => ['group', groupId] as const,
  results: (groupId: string | undefined) => ['group-results', groupId] as const,
  ballots: (groupId: string | undefined) => ['group-ballots', groupId] as const,
};

/**
 * Fetches and caches every group (Browse tab's data source).
 * Parameters: none.
 * Returns: the standard React Query result object; `data` is a Group[].
 * Edge cases: none — always enabled, since Browse needs the full list regardless of auth state
 * beyond "signed in," which the routing gate above it already guarantees.
 */
export const useGroupsQuery = () =>
  useQuery({ queryKey: groupKeys.list(), queryFn: fetchGroups });

/**
 * Fetches and caches a single group by id (group-detail.tsx's data source).
 * Parameters: groupId (the route param, or undefined while not yet resolved).
 * Returns: the standard React Query result object; `data` is a Group or null.
 * Edge cases: disabled while groupId is undefined.
 */
export const useGroupQuery = (groupId: string | undefined) =>
  useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: () => fetchGroupById(groupId as string),
    enabled: !!groupId,
  });

/**
 * Fetches and caches a group's reported rounds.
 * Parameters: groupId.
 * Returns: the standard React Query result object; `data` is a GroupResult[].
 * Edge cases: disabled while groupId is undefined.
 */
export const useGroupResultsQuery = (groupId: string | undefined) =>
  useQuery({
    queryKey: groupKeys.results(groupId),
    queryFn: () => fetchGroupResults(groupId as string),
    enabled: !!groupId,
  });

/**
 * Fetches and caches the votes cast on a group's rounds.
 * Parameters: groupId.
 * Returns: the standard React Query result object; `data` is a ResultBallot[].
 * Edge cases: disabled while groupId is undefined; a failed request is not retried and leaves
 * `data` undefined, so callers default it to an empty list - which is also what happens
 * against a server that has no contest window yet.
 */
export const useGroupBallotsQuery = (groupId: string | undefined) =>
  useQuery({
    queryKey: groupKeys.ballots(groupId),
    queryFn: () => fetchGroupBallots(groupId as string),
    enabled: !!groupId,
    retry: false,
  });

/**
 * Creates a new group (with its host already seated) and seeds both the list and detail caches
 * with the result, then invalidates the list so other fields (e.g. a join code collision check)
 * stay correct.
 * Parameters: none — call sites pass `{ hostId, draft }` to the returned mutation's mutate/
 * mutateAsync.
 * Returns: a React Query mutation object.
 * Edge cases: on failure, no cache write happens and the error propagates via mutateAsync.
 */
export const useCreateGroupMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ hostId, draft }: { hostId: string; draft: CreateGroupDraft }) =>
      createGroup(hostId, draft),
    onSuccess: (group) => {
      queryClient.setQueryData(groupKeys.detail(group.id), group);
      queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
};

/**
 * Joins an existing group, then invalidates that group's detail query and the list (so the new
 * player count shows up everywhere).
 * Parameters: none — call sites pass `{ groupId, playerId, bracket, role }`.
 * Returns: a React Query mutation object.
 * Edge cases: role is optional and defaults to 'Member' inside joinGroup itself.
 */
export const useJoinGroupMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      playerId,
      bracket,
      role,
    }: {
      groupId: string;
      playerId: string;
      bracket: number;
      role?: PlayerProfile['role'];
    }) => joinGroup(groupId, playerId, bracket, role),
    onSuccess: (_data, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
};

/**
 * Leaves a group as the signed-in user, invalidating the same queries useJoinGroupMutation does.
 * Parameters: none — call sites pass `{ groupId }`.
 * Returns: a React Query mutation object; its result is 'left', 'deleted', or 'not_member'.
 * Edge cases: the server deletes the group if the caller was its last member and appoints a new
 * host if the caller was host, so call sites don't sequence those steps themselves.
 */
export const useLeaveGroupMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId }: { groupId: string }) => leaveGroup(groupId),
    onSuccess: (_data, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
};

/**
 * Deletes a group, invalidating the list so it disappears from Browse immediately.
 * Parameters: none — call sites pass `{ groupId }`.
 * Returns: a React Query mutation object.
 * Edge cases: none beyond the standard mutation error path.
 */
export const useDeleteGroupMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId }: { groupId: string }) => deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
};

/**
 * Reassigns a group's host, invalidating that group's detail query.
 * Parameters: none — call sites pass `{ groupId, newHostId }`.
 * Returns: a React Query mutation object.
 * Edge cases: rejects if the caller isn't the host or the target isn't a member.
 */
export const useSetGroupHostMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, newHostId }: { groupId: string; newHostId: string }) =>
      setGroupHost(groupId, newHostId),
    onSuccess: (_data, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
    },
  });
};

/**
 * Persists edits from group-detail.tsx's Edit Group form, invalidating that group's detail query
 * and the list (so name/location/time changes show up on Browse's cards too).
 * Parameters: none — call sites pass `{ groupId, draft }`.
 * Returns: a React Query mutation object.
 * Edge cases: none beyond the standard mutation error path.
 */
export const useUpdateGroupMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, draft }: { groupId: string; draft: UpdateGroupDraft }) =>
      updateGroup(groupId, draft),
    onSuccess: (_data, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.list() });
    },
  });
};

/**
 * Sets a group's confirmed flag, invalidating that group's detail query.
 * Parameters: none — call sites pass `{ groupId, confirmed }`.
 * Returns: a React Query mutation object.
 * Edge cases: none beyond the standard mutation error path.
 */
export const useConfirmGroupMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, confirmed }: { groupId: string; confirmed: boolean }) =>
      confirmGroup(groupId, confirmed),
    onSuccess: (_data, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
    },
  });
};

/**
 * Reports a round. The server records it as pending and opens the contest window, so on success
 * this refreshes what the report changed: the group's results and votes, the group itself (its
 * rounds-played count), the group list, and the submitter's own profile (a round with nobody
 * else in it is paid at once).
 * Parameters: none - call sites pass `{ groupId, roundNumber, submittedBy, placements }`.
 * Returns: a React Query mutation object.
 * Edge cases: on failure nothing is invalidated, since nothing was recorded.
 */
export const useSubmitGroupResultMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      roundNumber,
      submittedBy,
      placements,
    }: {
      groupId: string;
      roundNumber: number;
      submittedBy: string;
      placements: PlacementInput[];
    }) => submitGroupResult(groupId, roundNumber, submittedBy, placements),
    onSuccess: (_data, { groupId, submittedBy }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.results(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.ballots(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.list() });
      queryClient.invalidateQueries({ queryKey: ['profile', submittedBy] });
    },
  });
};

/**
 * Casts the signed-in player's vote on a pending round - agreeing with the report, or contesting
 * it with their own order - then refreshes the round's votes and results. If the vote was the
 * last one needed the round is paid in the same step, so profiles are refreshed too.
 * Parameters: none - call sites pass `{ groupId, resultId, placements }` (placements null to agree).
 * Returns: a React Query mutation object; its result is 'recorded' or 'settled'.
 * Edge cases: on failure nothing is invalidated, since nothing was recorded.
 */
export const useVoteGroupResultMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      resultId,
      placements,
    }: {
      groupId: string;
      resultId: string;
      placements: PlacementInput[] | null;
    }) => voteGroupResult(resultId, placements),
    onSuccess: (outcome, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.ballots(groupId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.results(groupId) });
      if (outcome === 'settled') queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
};
