import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { showDialog } from '../components/AppDialog';
import { showToast } from '../components/AppToast';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import PlayerName from '../components/PlayerName';
import { useApp } from '../context/AppContext';
import { BRACKET_INFO, DAYS_OF_WEEK, GAME_COLOR, GAME_EMOJI, GAME_LABELS } from '../data/types';
import { formatDayHeading } from '../utils/calendar-utils';
import { findGroupOnDay, formatBrackets, groupDayKey, groupErrorMessage } from '../utils/group-utils';
import { PlacementInput } from '../utils/scoring-utils';
import {
  CONTEST_WINDOW_MS,
  contestMinutesLeft,
  leadingOrder,
  normalizePlacements,
  orderKey,
  voteStatus,
} from '../utils/contest-utils';
import { GroupResult, settleGroupResultIfDue } from '../lib/group-api';
import { ThemeColors, useThemeColors } from '../utils/theme-utils';
import { VENUE_EVENT_BONUS } from '../utils/venue-bonus-utils';
import { profileKeys, useRivaledByQuery } from '../hooks/useProfileQueries';
import { useClaimStarterReward } from '../hooks/useRewardQueries';
import {
  groupKeys,
  useConfirmGroupMutation,
  useDeleteGroupMutation,
  useGroupBallotsQuery,
  useGroupQuery,
  useGroupResultsQuery,
  useJoinGroupMutation,
  useLeaveGroupMutation,
  useSetGroupHostMutation,
  useSubmitGroupResultMutation,
  useUpdateGroupMutation,
  useVoteGroupResultMutation,
} from '../hooks/useGroupQueries';

/**
 * Writes a placement as an ordinal: 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th".
 * Used wherever a finish position is read back to a person.
 * Parameters: n (a positive whole number).
 * Returns: the number with its English suffix.
 * Edge cases: 11, 12, and 13 take "th" (11th, not 11st), as do 111-113.
 */
const ordinal = (n: number): string => {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`;
};

const CONFIRM_LOCK_MS = 30 * 60 * 1000; // group must be 30 min old before host can start a game
const MIN_PLAYERS_OTHER = 2;            // minimum attendees required to start any game format
const ROW_HEIGHT = 64;                  // draggable placement row height, including its gap
const PENDING_REFRESH_MS = 15 * 1000;   // how often an open round's countdown and votes are refreshed

/**
 * Group detail screen showing the full roster, settings, and host controls for a single group,
 * plus the game-session flow: the host confirms the game, then reports each round's placements
 * once it's over. Points are placement-based (see scoring-utils.ts): the winner's base pool
 * scales with pod size, each subsequent rank earns half of the one before it, last place always
 * scores zero placement points, and everyone gets a flat participation bonus regardless.
 * A reported round is not paid at once: for 15 minutes every other player in it can agree with
 * the report or contest it by entering the order they say is right. When the time is up, or as
 * soon as everyone has voted, the server pays the order with the most votes (the host's report
 * when no single order leads). The host cannot change a report, so they are asked to confirm the
 * order first. Rounds still open, and the most recent final round's standings, are shown to
 * everyone in the group.
 * Parameters: none; reads id from route search params and fetches the matching group from Supabase.
 * Returns: a scrollable detail screen; while the group is loading, a spinner with a Back
 * button; when it can't be shown, a short explanation with a Back button.
 * Edge cases: a group that is not found (e.g. it was just deleted by its last player leaving,
 * or removed after its night passed) or that failed to load never leaves a blank page - the
 * player can always get back; Back goes to Home when there is no earlier page to return to
 * (the page was opened by a link or reloaded in a browser); joining is refused with an
 * explanation when the player already has a group on the same day, since a player can be in
 * one group per day.
 */
export default function GroupDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUser, groups } = useApp();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const claimReward = useClaimStarterReward(currentUser?.id);

  const { data: group, isLoading: groupLoading, isError: groupFailed, refetch: refetchGroup } = useGroupQuery(id);
  const { data: results = [] } = useGroupResultsQuery(id);
  // Players who picked this player as their Rival; they are tagged in the roster.
  const { data: rivaledBy = [] } = useRivaledByQuery(currentUser?.id);

  const joinMutation = useJoinGroupMutation();
  const leaveMutation = useLeaveGroupMutation();
  const deleteMutation = useDeleteGroupMutation();
  const setHostMutation = useSetGroupHostMutation();
  const confirmMutation = useConfirmGroupMutation();
  const submitResultMutation = useSubmitGroupResultMutation();
  const updateGroupMutation = useUpdateGroupMutation();
  const voteMutation = useVoteGroupResultMutation();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group?.name ?? '');
  const [editLocation, setEditLocation] = useState(group?.location ?? '');
  const [editTarget, setEditTarget] = useState(String(group?.targetPlayers ?? 4));
  const [editBrackets, setEditBrackets] = useState<number[]>(group?.brackets ?? [2]);
  const timeParts = (group?.time ?? '').split(' · ');
  const parseTime = (s: string) => {
    const m = s.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
    return m ? { h: parseInt(m[1], 10), min: parseInt(m[2], 10), p: m[3].toUpperCase() as 'AM' | 'PM' } : { h: 7, min: 0, p: 'PM' as 'AM' | 'PM' };
  };
  const parsedTime = parseTime(timeParts[1] ?? '');
  const [editDay, setEditDay] = useState(timeParts[0] ?? '');
  const [editHour, setEditHour] = useState(parsedTime.h);
  const [editMinute, setEditMinute] = useState(parsedTime.min);
  const [editPeriod, setEditPeriod] = useState<'AM' | 'PM'>(parsedTime.p);

  const [showReportModal, setShowReportModal] = useState(false);
  // The pending round the sheet is being used to contest; null when the host is reporting a new one.
  const [contesting, setContesting] = useState<GroupResult | null>(null);
  // The current time, refreshed every few seconds, for the contest countdown.
  const [now, setNow] = useState(() => Date.now());
  // Finish order, best first — the source of truth for the report modal's drag-and-drop list.
  const [placementOrder, setPlacementOrder] = useState<string[]>([]);
  // Player ids tied with whoever is directly above them in placementOrder (index 0 can never be
  // tied, since there's nothing above it). Kept separate from ordering itself so dragging and
  // marking a tie are independent actions.
  const [tiedWithAbove, setTiedWithAbove] = useState<Set<string>>(new Set());
  const rowPositions = useSharedValue<Record<string, number>>({});

  // Rounds still open to be agreed with or contested, and the votes cast on them so far.
  const { data: ballots = [] } = useGroupBallotsQuery(id);
  const pendingResults = results.filter((r) => r.status === 'pending');
  const hasPending = pendingResults.length > 0;
  // The most recent round that has been settled and paid; shown to the whole group as the
  // latest standings.
  const finalResults = results.filter((r) => r.status === 'finalized');
  const latestResult = finalResults.length > 0 ? finalResults[finalResults.length - 1] : undefined;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), PENDING_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  // While a round is open, other players are voting and the server may settle it at any moment:
  // re-read the rounds and votes on every tick so this screen follows along.
  useEffect(() => {
    if (!hasPending) return;
    queryClient.invalidateQueries({ queryKey: groupKeys.results(id) });
    queryClient.invalidateQueries({ queryKey: groupKeys.ballots(id) });
  }, [now, hasPending, id, queryClient]);

  // The server settles a round within a minute of its window ending. If this screen is looking
  // at one that is overdue, ask for it once, so a late job never leaves players waiting.
  const settleAskedRef = useRef<Set<string>>(new Set());
  const overdueIds = pendingResults.filter((r) => r.windowEndsAt <= now).map((r) => r.id).join(',');
  useEffect(() => {
    if (!overdueIds) return;
    for (const resultId of overdueIds.split(',')) {
      if (settleAskedRef.current.has(resultId)) continue;
      settleAskedRef.current.add(resultId);
      settleGroupResultIfDue(resultId)
        .catch(() => false)
        .then(() => queryClient.invalidateQueries({ queryKey: groupKeys.results(id) }));
    }
  }, [overdueIds, id, queryClient]);

  // Keeps the shared position map (read by every draggable row's animated style) in sync with
  // placementOrder — the plain-state array stays the single source of truth; this is just its
  // reanimated-readable mirror.
  useEffect(() => {
    const next: Record<string, number> = {};
    placementOrder.forEach((id, index) => { next[id] = index; });
    rowPositions.value = next;
  }, [placementOrder]);

  // A round pays every player when it is settled, which happens on the server. When this screen
  // sees a settled round it hasn't seen before that the current player took part in, it
  // refreshes their profile so their new points show without a restart.
  const myId = currentUser?.id;
  const roundsIncludingMe = finalResults.filter((r) => r.placements.some((p) => p.playerId === myId)).length;
  useEffect(() => {
    if (!myId || roundsIncludingMe === 0) return;
    queryClient.invalidateQueries({ queryKey: profileKeys.detail(myId) });
  }, [myId, roundsIncludingMe]);

  /**
   * Leaves this page. Normally that is one step back, but a page opened straight from a link, or
   * reloaded in a browser, has no earlier page, and going back from there does nothing but log
   * an error - which left the player stuck on the group.
   * Parameters: none.
   * Returns: void.
   * Edge cases: with no earlier page it opens Home in this page's place.
   */
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  if (!group || !currentUser) {
    const waiting = !currentUser || groupLoading;
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Pressable style={styles.backBtn} onPress={goBack}>
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>
          {waiting ? (
            <ActivityIndicator color={colors.textSecondary} />
          ) : (
            <>
              <Text style={styles.groupName}>{groupFailed ? 'Couldn’t load this group' : 'This group is gone'}</Text>
              <Text style={styles.metaRow}>
                {groupFailed
                  ? 'Check your connection and try again.'
                  : 'It was deleted, or its night has passed. Your points from any reported rounds are safe.'}
              </Text>
              {groupFailed && (
                <Pressable style={styles.missingRetryBtn} onPress={() => refetchGroup()}>
                  <Text style={styles.backBtnText}>Try Again</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </View>
    );
  }

  const displayUser = currentUser.username;
  const isInGroup = group.players.some((p) => p.id === currentUser.id);
  const isHost = group.players.some((p) => p.id === currentUser.id && p.role === 'Host');
  const isFull = group.players.length >= group.targetPlayers;

  const minPlayers = MIN_PLAYERS_OTHER;
  const msRemaining = Math.max(0, CONFIRM_LOCK_MS - (Date.now() - group.createdAt));
  const minutesRemaining = Math.ceil(msRemaining / 60000);
  const timeLocked = msRemaining > 0;
  const headcountLocked = group.players.length < minPlayers;
  const confirmBlocked = timeLocked || headcountLocked;

  const handleJoin = async () => {
    if (isFull) {
      showDialog('Group full', 'No open spots in this group.');
      return;
    }
    const dayKey = groupDayKey(group);
    const sameDay = findGroupOnDay(groups, currentUser.id, dayKey);
    if (sameDay && sameDay.id !== group.id) {
      showDialog(
        'One group per day',
        `You’re already in “${sameDay.name}” on ${dayKey ? formatDayHeading(dayKey) : 'that day'}. You can be in one group per day - leave that one first, or join a group on another day.`
      );
      return;
    }
    try {
      await joinMutation.mutateAsync({
        groupId: group.id,
        playerId: currentUser.id,
        bracket: currentUser.brackets[0] ?? 2,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('You’re in!', `You joined “${group.name}”. It’s on your Home tab, and the host will report each round.`);
      claimReward('first_group');
    } catch (err) {
      showDialog('Couldn’t join', groupErrorMessage(err, 'Please try again.'));
    }
  };

  const leaveGroupNow = async () => {
    try {
      // One server call: it removes this user, deletes the group if they were the last member,
      // and appoints a new host if they were the host. Doing those as separate requests from
      // here could leave the group half-changed if the app dropped off in between.
      const outcome = await leaveMutation.mutateAsync({ groupId: group.id });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      goBack();
      showToast(
        'You left the group',
        outcome === 'deleted' && group.players.length > 1
          ? `Nobody else could host “${group.name}”, so the posting was removed.`
          : `You’re no longer in “${group.name}”.`
      );
    } catch (err) {
      showDialog('Couldn’t leave group', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  /**
   * Asks before leaving, since leaving gives up the seat (and, for a host, the host role).
   * Parameters: none.
   * Returns: void; leaves only if the player confirms.
   * Edge cases: does nothing if the player isn't in the group; a host leaving with others still
   * in the group is told the host role will pass on.
   */
  const handleLeave = () => {
    if (!group.players.some((p) => p.id === currentUser.id)) return;
    showDialog(
      'Leave this group?',
      isHost && group.players.length > 1
        ? 'You’ll give up your seat, and the host role passes to the next player who has room for another posting. If nobody does, the posting is removed.'
        : 'You’ll give up your seat. You can join again if there is still room.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: leaveGroupNow },
      ]
    );
  };

  const handleDeletePosting = () => {
    const otherPlayers = group.players.filter((p) => p.id !== currentUser.id).length;
    showDialog(
      'Delete this posting?',
      otherPlayers > 0
        ? `This removes the group for everyone, including the other ${otherPlayers} player${otherPlayers > 1 ? 's' : ''} in it. This can't be undone.`
        : "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Posting',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ groupId: group.id });
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              goBack();
              showToast('Posting deleted', `“${group.name}” has been removed.`);
            } catch (err) {
              showDialog('Couldn’t delete posting', err instanceof Error ? err.message : 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleMakeHost = (playerId: string) => {
    if (!isHost) return;
    Haptics.selectionAsync();
    const target = group.players.find((p) => p.id === playerId);
    const targetName = target?.displayName ?? target?.username ?? 'this player';
    showDialog(
      `Make ${targetName} the host?`,
      'They’ll confirm the game and report rounds from now on, and it becomes one of their postings instead of yours. You stay in the group as a player.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Make Host',
          onPress: async () => {
            try {
              await setHostMutation.mutateAsync({ groupId: group.id, newHostId: playerId });
              showToast('Host changed', `${targetName} is now the host.`);
            } catch (err) {
              showDialog('Couldn’t change host', err instanceof Error ? err.message : 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleConfirmGame = async () => {
    if (!isHost || confirmBlocked) return;
    try {
      await confirmMutation.mutateAsync({ groupId: group.id, confirmed: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Game confirmed', 'When a round ends, tap Report Results to record how it finished.');
    } catch (err) {
      showDialog('Couldn’t confirm game', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const openReportModal = () => {
    setContesting(null);
    setPlacementOrder(group.players.map((p) => p.id));
    setTiedWithAbove(new Set());
    setShowReportModal(true);
  };

  const closeReportModal = () => {
    setShowReportModal(false);
    setContesting(null);
  };

  /**
   * The name to show for a player in a round, who may have left the group since it was played.
   * Parameters: playerId.
   * Returns: their display name, else their username, else "A player who left".
   * Edge cases: none.
   */
  const nameOf = (playerId: string): string => {
    const player = group.players.find((x) => x.id === playerId);
    return player?.displayName ?? player?.username ?? 'A player who left';
  };

  /**
   * Reads a finish order back as lines of text ("1st - Ana"), best first, for a confirmation.
   * Parameters: placements (the order to describe).
   * Returns: one line per player.
   * Edge cases: tied players share an ordinal; an empty order gives an empty string.
   */
  const describeOrder = (placements: PlacementInput[]): string =>
    [...placements]
      .sort((a, b) => a.placement - b.placement)
      .map((p) => `${ordinal(p.placement)} - ${nameOf(p.playerId)}`)
      .join('\n');

  // Called (via runOnJS) once a drag gesture releases — positionsSnapshot is the row-position
  // shared value's plain-object contents at that moment, movedId is whichever row was dragged.
  // Reordering breaks any tie the moved player had with its old neighbor, so it's cleared here
  // rather than left pointing at a row it's no longer next to.
  const commitPlacementOrder = (positionsSnapshot: Record<string, number>, movedId: string) => {
    const nextOrder = Object.entries(positionsSnapshot)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);
    setPlacementOrder(nextOrder);
    setTiedWithAbove((prev) => {
      if (!prev.has(movedId)) return prev;
      const next = new Set(prev);
      next.delete(movedId);
      return next;
    });
  };

  const toggleTieWithAbove = (playerId: string) => {
    setTiedWithAbove((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId); else next.add(playerId);
      return next;
    });
  };

  /**
   * Turns the report sheet's drag order and tie marks into placements: each player takes the
   * position of their row, unless they are marked tied with the row above, in which case they
   * share that row's placement.
   * Parameters: none; reads placementOrder and tiedWithAbove.
   * Returns: one placement per player in the sheet, best first.
   * Edge cases: the top row can never be tied (there is nothing above it); a run of tied rows
   * all share the first row's placement, and the next untied row takes its own row number, so
   * 1st, 2nd, 2nd, 4th is produced rather than 1st, 2nd, 2nd, 3rd.
   */
  const buildPlacements = (): PlacementInput[] => {
    let placement = 1;
    return placementOrder.map((playerId, index) => {
      if (index === 0 || !tiedWithAbove.has(playerId)) {
        placement = index + 1;
      }
      return { playerId, placement };
    });
  };

  /**
   * Sends the round to the server, which scores it, pays everyone, and counts it as played.
   * Parameters: placements (from buildPlacements).
   * Returns: a promise that resolves once the round is recorded or refused.
   * Edge cases: a refusal (not the host, the round was already reported, a player left the
   * group mid-report) is shown as an alert and the sheet stays open so nothing is lost; a second
   * tap while the first is in flight is ignored.
   */
  const submitResult = async (placements: PlacementInput[]) => {
    if (submitResultMutation.isPending) return;
    try {
      await submitResultMutation.mutateAsync({
        groupId: group.id,
        roundNumber: group.roundsPlayed + 1,
        submittedBy: currentUser.id,
        placements,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeReportModal();
      showToast(
        `Round ${group.roundsPlayed + 1} reported`,
        `The other players have ${CONTEST_WINDOW_MS / 60000} minutes to agree or contest. Points are paid after that.`
      );
    } catch (err) {
      showDialog('Couldn’t submit results', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  /**
   * Asks the host to confirm the finish order before it is submitted. The host can't edit or
   * cancel a report - only the other players' votes can replace it - so this read-back is the
   * host's own check against a mis-dragged row.
   * Parameters: none.
   * Returns: void; submits only if the host confirms.
   * Edge cases: does nothing while a submission is already in flight.
   */
  const handleSubmitResult = () => {
    if (submitResultMutation.isPending) return;
    const placements = buildPlacements();
    showDialog(
      `Submit round ${group.roundsPlayed + 1}?`,
      `${describeOrder(placements)}\n\nYou can’t change this afterwards. The other players get ${CONTEST_WINDOW_MS / 60000} minutes to agree or contest, then points are paid.`,
      [
        { text: 'Go Back', style: 'cancel' },
        { text: 'Submit', onPress: () => submitResult(placements) },
      ]
    );
  };

  /**
   * Records the player's vote on an open round: agreeing with the report, or contesting it with
   * their own order.
   * Parameters: result (the open round), placements (the player's order, or null to agree).
   * Returns: a promise that resolves once the vote is recorded or refused.
   * Edge cases: a refusal (the time ran out, the round was settled meanwhile) is shown as a
   * pop-up and the sheet stays open; a second tap while the first is in flight is ignored; if
   * this was the last vote needed the round is paid at once and the player is told so.
   */
  const castVote = async (result: GroupResult, placements: PlacementInput[] | null) => {
    if (voteMutation.isPending) return;
    try {
      const outcome = await voteMutation.mutateAsync({ groupId: group.id, resultId: result.id, placements });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeReportModal();
      if (outcome === 'settled') {
        showToast(`Round ${result.roundNumber} is final`, 'Everyone has voted, so points have been paid.');
      } else if (placements) {
        showToast('Contest recorded', 'If more players enter your order than the reported one, yours replaces it.');
      } else {
        showToast('Vote recorded', 'Points are paid once everyone has voted or the time runs out.');
      }
    } catch (err) {
      showDialog('Couldn’t record your vote', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  /**
   * Opens the finish-order sheet for contesting an open round, starting from the order the
   * player last entered, or from the reported order if they have not contested yet.
   * Parameters: result (the open round).
   * Returns: void.
   * Edge cases: tied players in the starting order stay marked as tied.
   */
  const openContestSheet = (result: GroupResult) => {
    const mine = ballots.find((b) => b.resultId === result.id && b.playerId === currentUser.id);
    const start = normalizePlacements(mine?.placements ?? result.placements);
    setPlacementOrder(start.map((p) => p.playerId));
    setTiedWithAbove(
      new Set(start.filter((p, i) => i > 0 && p.placement === start[i - 1].placement).map((p) => p.playerId))
    );
    setContesting(result);
    setShowReportModal(true);
  };

  /**
   * Asks the player to confirm the order they are contesting with, then records it as their vote.
   * Parameters: none; reads the sheet's order and the round being contested.
   * Returns: void; votes only if the player confirms.
   * Edge cases: an order identical to the report is not a contest - the player is told to use
   * Looks Right instead; does nothing while a vote is already in flight.
   */
  const handleSubmitContest = () => {
    const result = contesting;
    if (!result || voteMutation.isPending) return;
    const placements = buildPlacements();
    if (orderKey(placements) === orderKey(result.placements)) {
      showDialog(
        'That’s the reported order',
        'This is the same order the host reported. Move the players into the order they really finished, or close this and tap Looks Right.'
      );
      return;
    }
    showDialog(
      `Contest round ${result.roundNumber}?`,
      `${describeOrder(placements)}\n\nYou’re saying this is how the round really finished. It replaces the report only if more players enter this order than the reported one.`,
      [
        { text: 'Go Back', style: 'cancel' },
        { text: 'Contest', onPress: () => castVote(result, placements) },
      ]
    );
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editLocation.trim()) {
      showDialog('Missing info', 'Name and location are required.');
      return;
    }
    try {
      await updateGroupMutation.mutateAsync({
        groupId: group.id,
        draft: {
          name: editName.trim(),
          location: editLocation.trim(),
          time: `${editDay} · ${editHour}:${String(editMinute).padStart(2, '0')} ${editPeriod}`,
          targetPlayers: Math.max(2, Number(editTarget) || group.targetPlayers),
          brackets: editBrackets,
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
      showToast('Changes saved', 'Everyone in the group sees the update.');
    } catch (err) {
      showDialog('Couldn’t save changes', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Back */}
        <Pressable style={styles.backBtn} onPress={goBack}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>

        {/* Game badge + name */}
        <View style={[styles.gameBadge, { borderColor: GAME_COLOR[group.gameType] }]}>
          <Text style={[styles.gameBadgeText, { color: GAME_COLOR[group.gameType] }]}>
            {GAME_EMOJI[group.gameType]} {GAME_LABELS[group.gameType]} · {group.format}
          </Text>
        </View>

        {editing ? (
          <TextInput
            style={styles.editTitleInput}
            value={editName}
            onChangeText={setEditName}
          />
        ) : (
          <Text style={styles.groupName}>{group.name}</Text>
        )}

        {group.confirmed && group.roundsPlayed > 0 && !hasPending && (
          <View style={styles.confirmedBadge}>
            <Text style={styles.confirmedText}>✓ Round {group.roundsPlayed} Final</Text>
          </View>
        )}

        {/* Rounds reported but still open: every player in them can agree or contest */}
        {pendingResults.map((result) => {
          const roundBallots = ballots.filter((b) => b.resultId === result.id);
          const inRound = result.placements.some((p) => p.playerId === currentUser.id);
          const isReporter = result.submittedBy === currentUser.id;
          const myVote = voteStatus(result.placements, roundBallots, currentUser.id);
          const minutesLeft = contestMinutesLeft(result.windowEndsAt, now);
          const contested = roundBallots.filter((b) => orderKey(b.placements) !== orderKey(result.placements)).length;
          const leading = leadingOrder(result.placements, roundBallots);
          return (
            <View key={result.id} style={styles.pendingCard}>
              <Text style={styles.pendingTitle}>⏳ Round {result.roundNumber} - waiting to be confirmed</Text>
              <Text style={styles.pendingSub}>
                {minutesLeft > 0
                  ? `Reported by ${nameOf(result.submittedBy)}. Points are paid in about ${minutesLeft} min, or as soon as every player has voted.`
                  : 'Time is up - the votes are being counted. Points will show in a moment.'}
              </Text>
              {[...result.placements]
                .sort((a, b) => a.placement - b.placement)
                .map((p) => (
                  <Text key={p.playerId} style={styles.resultRow}>
                    {ordinal(p.placement)} · {nameOf(p.playerId)} · +{p.pointsAwarded} pts if confirmed
                  </Text>
                ))}
              <Text style={styles.pendingSub}>
                {roundBallots.length} of {result.placements.length} players have voted
                {contested > 0 ? ` · ${contested} contested` : ''}.
              </Text>
              {contested > 0 && (
                <Text style={styles.pendingNote}>
                  {leading.isReport
                    ? 'As it stands the report holds. A different order needs more votes than the report has.'
                    : `As it stands the group’s order wins:\n${describeOrder(leading.placements)}`}
                </Text>
              )}
              {inRound && isReporter && <Text style={styles.pendingSub}>Your report is your vote.</Text>}
              {inRound && !isReporter && minutesLeft > 0 && (
                myVote === 'none' ? (
                  <View style={[styles.editBtnRow, styles.pendingActions]}>
                    <Pressable style={styles.saveBtn} onPress={() => castVote(result, null)}>
                      <Text style={styles.saveBtnText}>Looks Right</Text>
                    </Pressable>
                    <Pressable style={styles.cancelBtn} onPress={() => openContestSheet(result)}>
                      <Text style={styles.cancelBtnText}>Contest</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Text style={styles.pendingSub}>
                      {myVote === 'agreed' ? 'You agreed with this report.' : 'You contested this report with your own order.'}
                    </Text>
                    <View style={[styles.editBtnRow, styles.pendingActions]}>
                      {myVote === 'contested' && (
                        <Pressable style={styles.cancelBtn} onPress={() => castVote(result, null)}>
                          <Text style={styles.cancelBtnText}>Agree Instead</Text>
                        </Pressable>
                      )}
                      <Pressable style={styles.cancelBtn} onPress={() => openContestSheet(result)}>
                        <Text style={styles.cancelBtnText}>{myVote === 'contested' ? 'Change My Order' : 'Contest Instead'}</Text>
                      </Pressable>
                    </View>
                  </>
                )
              )}
            </View>
          );
        })}
        {!group.confirmed && group.roundsPlayed > 0 && (
          <View style={styles.roundInProgressBadge}>
            <Text style={styles.roundInProgressText}>🎮 Round {group.roundsPlayed + 1} of this session</Text>
          </View>
        )}

        {/* Latest settled round's standings - final, and visible to every member */}
        {latestResult && (
          <View style={styles.resultStatusCard}>
            <Text style={styles.resultStatusTitle}>Round {latestResult.roundNumber} results</Text>
            {[...latestResult.placements]
              .sort((a, b) => a.placement - b.placement)
              .map((p) => {
                const player = group.players.find((x) => x.id === p.playerId);
                return (
                  <Text key={p.playerId} style={styles.resultRow}>
                    {ordinal(p.placement)} · {player?.displayName ?? player?.username ?? 'A player who left'} · +{p.pointsAwarded} pts
                    {(p.venueBonus ?? 0) > 0 ? ` (incl. +${p.venueBonus} store bonus)` : ''}
                  </Text>
                );
              })}
            <Text style={styles.resultStatusSub}>
              {latestResult.overturned ? 'The players voted for a different order than was reported. ' : ''}
              Results are final. Points have been added.
            </Text>
          </View>
        )}

        {/* Meta */}
        <View style={styles.metaCard}>
          {editing ? (
            <>
              {/* A store-event group stays at its store: the link (and its bonus) is to that venue. */}
              {group.localEventId ? (
                <Text style={styles.metaRow}>📍 {group.location}</Text>
              ) : (
                <TextInput style={styles.editInput} value={editLocation} onChangeText={setEditLocation} placeholder="Location" placeholderTextColor={colors.placeholder} />
              )}

              <Text style={styles.editLabel}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {DAYS_OF_WEEK.map((day) => (
                  <Pressable
                    key={day}
                    style={[styles.editChip, editDay === day && styles.editChipActive]}
                    onPress={() => setEditDay(day)}
                  >
                    <Text style={[styles.editChipText, editDay === day && styles.editChipTextActive]}>{day}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.editLabel}>Time</Text>
              <View style={styles.timePicker}>
                <View style={styles.timeUnit}>
                  <Pressable style={styles.timeArrow} onPress={() => { Haptics.selectionAsync(); setEditHour((h) => h === 12 ? 1 : h + 1); }}>
                    <Text style={styles.timeArrowText}>▲</Text>
                  </Pressable>
                  <Text style={styles.timeValue}>{String(editHour).padStart(2, '0')}</Text>
                  <Pressable style={styles.timeArrow} onPress={() => { Haptics.selectionAsync(); setEditHour((h) => h === 1 ? 12 : h - 1); }}>
                    <Text style={styles.timeArrowText}>▼</Text>
                  </Pressable>
                </View>
                <Text style={styles.timeSeparator}>:</Text>
                <View style={styles.timeUnit}>
                  <Pressable style={styles.timeArrow} onPress={() => { Haptics.selectionAsync(); setEditMinute((m) => (m + 15) % 60); }}>
                    <Text style={styles.timeArrowText}>▲</Text>
                  </Pressable>
                  <Text style={styles.timeValue}>{String(editMinute).padStart(2, '0')}</Text>
                  <Pressable style={styles.timeArrow} onPress={() => { Haptics.selectionAsync(); setEditMinute((m) => m === 0 ? 45 : m - 15); }}>
                    <Text style={styles.timeArrowText}>▼</Text>
                  </Pressable>
                </View>
                <View style={styles.timePeriod}>
                  <Pressable style={[styles.periodBtn, editPeriod === 'AM' && styles.periodBtnActive]} onPress={() => { Haptics.selectionAsync(); setEditPeriod('AM'); }}>
                    <Text style={[styles.periodText, editPeriod === 'AM' && styles.periodTextActive]}>AM</Text>
                  </Pressable>
                  <Pressable style={[styles.periodBtn, editPeriod === 'PM' && styles.periodBtnActive]} onPress={() => { Haptics.selectionAsync(); setEditPeriod('PM'); }}>
                    <Text style={[styles.periodText, editPeriod === 'PM' && styles.periodTextActive]}>PM</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.editLabel}>Players Needed</Text>
              <TextInput style={styles.editInput} value={editTarget} onChangeText={setEditTarget} keyboardType="numeric" />

              {group.format === 'Commander' && (
                <>
                  <Text style={styles.editLabel}>Bracket (select all that apply)</Text>
                  <View style={styles.chipRowWrap}>
                    {([1, 2, 3, 4, 5] as number[]).map((b) => {
                      const active = editBrackets.includes(b);
                      return (
                        <Pressable
                          key={b}
                          style={[styles.editChip, active && styles.editChipActive]}
                          onPress={() =>
                            setEditBrackets((prev) =>
                              prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
                            )
                          }
                        >
                          <Text style={[styles.editChipText, active && styles.editChipTextActive]}>
                            {BRACKET_INFO[b].label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              <Text style={styles.metaRow}>📍 {group.location}</Text>
              {group.localEventId && (
                <Text style={styles.storeEventRow}>
                  🏪 For {group.location}&apos;s store event · +{VENUE_EVENT_BONUS} bonus points each for a round played there that night
                </Text>
              )}
              <Text style={styles.metaRow}>🕐 {group.time}</Text>
              <Text style={styles.metaRow}>👥 {group.players.length} / {group.targetPlayers} players</Text>
              {group.format === 'Commander' && (
                <Text style={styles.metaRow}>⚔️ {formatBrackets(group.brackets)}</Text>
              )}
              {group.noGo.length > 0 && (
                <Text style={[styles.metaRow, styles.noGoRow]}>🚫 No {group.noGo.join(', ')}</Text>
              )}
              {group.roundsPlayed > 0 && (
                <Text style={styles.metaRow}>
                  🔄 {group.roundsPlayed} round{group.roundsPlayed > 1 ? 's' : ''} completed this session
                </Text>
              )}
              <View style={styles.joinCodeRow}>
                <Text style={styles.joinCodeLabel}>JOIN CODE</Text>
                <Text style={styles.joinCodeValue}>{group.joinCode}</Text>
              </View>
              {isHost && (
                <Text style={styles.hostHelpNote}>
                  Share this code with friends — they enter it under Find → Join a Group.
                </Text>
              )}
            </>
          )}
        </View>

        {/* Host controls */}
        {isHost && (
          <View style={styles.hostControls}>
            {editing ? (
              <View style={styles.editBtnRow}>
                <Pressable style={styles.saveBtn} onPress={handleSaveEdit}>
                  <Text style={styles.saveBtnText}>Save</Text>
                </Pressable>
                <Pressable style={styles.cancelBtn} onPress={() => setEditing(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.editBtnRow}>
                  <Pressable style={styles.editBtn} onPress={() => setEditing(true)}>
                    <Text style={styles.editBtnText}>Edit Group</Text>
                  </Pressable>
                  {!group.confirmed ? (
                    <Pressable
                      style={[styles.confirmBtn, confirmBlocked && styles.confirmBtnLocked]}
                      onPress={handleConfirmGame}
                      disabled={confirmBlocked}
                    >
                      <Text style={[styles.confirmBtnText, confirmBlocked && styles.confirmBtnTextLocked]}>
                        Confirm Game
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.confirmBtn}
                      onPress={openReportModal}
                    >
                      <Text style={styles.confirmBtnText}>
                        {group.roundsPlayed > 0 ? `Report Round ${group.roundsPlayed + 1}` : 'Report Results'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {!group.confirmed && confirmBlocked && (
                  <Text style={styles.confirmLockNote}>
                    {[
                      timeLocked ? `⏳ ${minutesRemaining} min wait` : null,
                      headcountLocked ? `👥 Need ${minPlayers - group.players.length} more player${minPlayers - group.players.length > 1 ? 's' : ''}` : null,
                    ].filter(Boolean).join('  ·  ')}
                  </Text>
                )}
                {!group.confirmed && (
                  <Text style={styles.hostHelpNote}>
                    Confirm Game starts the session so you can report results. Players can still join after it, until the group is full. It opens {CONFIRM_LOCK_MS / 60000} minutes after you post — time for players to join — once at least {minPlayers} are in.
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {/* Roster */}
        <Text style={styles.rosterTitle}>Players</Text>
        {group.players.map((player) => (
          <Pressable
            key={player.id}
            style={styles.playerRow}
            onPress={() => router.push({ pathname: '/player-profile', params: { username: player.username } })}
          >
            <View style={styles.playerAvatar}>
              <Text style={styles.playerInitial}>{(player.displayName ?? player.username)[0]}</Text>
            </View>
            <View style={styles.playerInfo}>
              <PlayerName
                name={player.displayName ?? player.username}
                cosmetics={{ title: player.title, nameColor: player.nameColor }}
                style={styles.playerName}
              />
              <Text style={styles.playerMeta}>
                {player.role} · Bracket {player.bracket} · {player.location}
              </Text>
            </View>
            {isHost && player.username !== displayUser && (
              <Pressable
                style={styles.makeHostBtn}
                onPress={() => handleMakeHost(player.id)}
              >
                <Text style={styles.makeHostText}>Make Host</Text>
              </Pressable>
            )}
            {player.id !== currentUser.id && rivaledBy.some((r) => r.id === player.id) && (
              <View style={styles.rivalsYouBadge}>
                <Text style={styles.rivalsYouBadgeText}>RIVALS YOU</Text>
              </View>
            )}
            {player.role === 'Host' && (
              <View style={styles.hostBadge}>
                <Text style={styles.hostBadgeText}>HOST</Text>
              </View>
            )}
          </Pressable>
        ))}

        {/* Join / Leave / Delete */}
        <View style={styles.actionSection}>
          {isInGroup ? (
            isHost ? (
              group.players.length > 1 ? (
                <View style={styles.hostActionRow}>
                  <Pressable style={[styles.leaveBtn, styles.hostActionHalf]} onPress={handleLeave}>
                    <Text style={styles.leaveBtnText}>Leave (Transfers Host)</Text>
                  </Pressable>
                  <Pressable style={[styles.deletePostingBtn, styles.hostActionHalf]} onPress={handleDeletePosting}>
                    <Text style={styles.deletePostingBtnText}>Delete Posting</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.deletePostingBtn} onPress={handleDeletePosting}>
                  <Text style={styles.deletePostingBtnText}>Delete Posting</Text>
                </Pressable>
              )
            ) : (
              <Pressable style={styles.leaveBtn} onPress={handleLeave}>
                <Text style={styles.leaveBtnText}>Leave Group</Text>
              </Pressable>
            )
          ) : (
            <Pressable
              style={[styles.joinBtn, isFull && styles.joinBtnDisabled]}
              onPress={handleJoin}
              disabled={isFull}
            >
              <Text style={styles.joinBtnText}>{isFull ? 'Group Full' : 'Join Group'}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* Report Results modal */}
      {/* An overlay rather than a native Modal, so the confirm pop-up can open on top of it. */}
      {showReportModal && (
        <View style={styles.modalBackdrop}>
          <View style={styles.reportSheet}>
            <Text style={styles.reportTitle}>
              {contesting ? `Contest Round ${contesting.roundNumber}` : `Report Round ${group.roundsPlayed + 1}`}
            </Text>
            <Text style={styles.reportSubtitle}>
              {contesting ? 'Put the players in the order they really finished. ' : ''}
              Drag ☰ to set each player&apos;s finish order (1st at top). Use &quot;Tie with above&quot; for a shared placement.
            </Text>
            <View style={[styles.reportList, { height: placementOrder.length * ROW_HEIGHT }]}>
              {placementOrder.map((playerId, index) => {
                return (
                  <DraggablePlacementRow
                    key={playerId}
                    playerId={playerId}
                    label={nameOf(playerId)}
                    index={index}
                    totalCount={placementOrder.length}
                    positions={rowPositions}
                    onDragEnd={commitPlacementOrder}
                    isTied={tiedWithAbove.has(playerId)}
                    onToggleTie={() => toggleTieWithAbove(playerId)}
                  />
                );
              })}
            </View>
            <View style={styles.editBtnRow}>
              <Pressable style={styles.cancelBtn} onPress={closeReportModal}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={contesting ? handleSubmitContest : handleSubmitResult}>
                <Text style={styles.saveBtnText}>{contesting ? 'Submit My Order' : 'Submit Results'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

    </View>
  );
}

interface DraggablePlacementRowProps {
  playerId: string;
  label: string;
  index: number;
  totalCount: number;
  positions: SharedValue<Record<string, number>>;
  onDragEnd: (positionsSnapshot: Record<string, number>, movedId: string) => void;
  isTied: boolean;
  onToggleTie: () => void;
}

/**
 * One row of the report-results modal's finish-order list. Dragging its ☰ handle reorders the
 * whole list live (every other row's position is driven off the shared `positions` map, so they
 * slide out of the way as this row passes over them); releasing settles the drag and reports the
 * new order back to the parent via onDragEnd. A separate "Tie with above" chip lets the row share
 * its neighbor's placement without affecting drag order — dragging and tying are independent.
 * Parameters: playerId/label (who this row is), index (this player's last-committed position,
 * used as a fallback before the shared position map has an entry), totalCount (list length, to
 * clamp drags within bounds), positions (shared position map all rows read from), onDragEnd
 * (parent callback fired once per drag release), isTied/onToggleTie (this row's tie state and
 * toggle handler).
 * Returns: an absolutely-positioned, animated row that reorders instead of scrolling.
 * Edge cases: none beyond standard gesture cancellation, which onEnd handles the same as a normal
 * release since gesture-handler always calls it.
 */
function DraggablePlacementRow({
  playerId,
  label,
  index,
  totalCount,
  positions,
  onDragEnd,
  isTied,
  onToggleTie,
}: DraggablePlacementRowProps) {
  'use no memo'; // React Compiler can't see that mutating a SharedValue's .value is the sanctioned
  // Reanimated update pattern, not an actual prop mutation — opt this component out rather than
  // have the compiler bail on (or the linter flag) every drag gesture callback below.
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dragY = useSharedValue(0);
  const startY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
      startY.value = (positions.value[playerId] ?? index) * ROW_HEIGHT;
      dragY.value = startY.value;
    })
    .onUpdate((e) => {
      dragY.value = startY.value + e.translationY;
      const newIndex = Math.min(
        totalCount - 1,
        Math.max(0, Math.round(dragY.value / ROW_HEIGHT))
      );
      const currentIndex = positions.value[playerId] ?? index;
      if (newIndex !== currentIndex) {
        const next = { ...positions.value };
        for (const key in next) {
          if (key === playerId) continue;
          if (newIndex > currentIndex && next[key] > currentIndex && next[key] <= newIndex) {
            next[key] -= 1;
          } else if (newIndex < currentIndex && next[key] >= newIndex && next[key] < currentIndex) {
            next[key] += 1;
          }
        }
        next[playerId] = newIndex;
        // reanimated's SharedValue.value assignment is its sanctioned update mechanism, not a real prop mutation.
        // eslint-disable-next-line react-hooks/immutability
        positions.value = next;
      }
    })
    .onEnd(() => {
      isDragging.value = false;
      runOnJS(onDragEnd)(positions.value, playerId);
    });

  const animatedStyle = useAnimatedStyle(() => {
    const pos = positions.value[playerId] ?? index;
    return {
      transform: [{ translateY: isDragging.value ? dragY.value : withSpring(pos * ROW_HEIGHT) }],
      zIndex: isDragging.value ? 10 : 0,
    };
  });

  return (
    <Animated.View style={[styles.placementRow, animatedStyle]}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.dragHandle} hitSlop={8}>
          <Text style={styles.dragHandleText}>☰</Text>
        </View>
      </GestureDetector>
      <Text style={styles.placementName}>{label}</Text>
      {index > 0 && (
        <Pressable style={[styles.tieChip, isTied && styles.tieChipActive]} onPress={onToggleTie}>
          <Text style={[styles.tieChipText, isTied && styles.tieChipTextActive]}>
            {isTied ? 'Tied ✓' : 'Tie with above'}
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// Built per theme: every neutral and tinted color comes from ThemeColors, so the screen follows
// the light/dark setting. Only saturated accents that read on both stay as fixed values.
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hostHelpNote: {
    fontSize: 12,
    lineHeight: 17,
    color: c.textSecondary,
    marginTop: 8,
  },
  storeEventRow: {
    fontSize: 13,
    fontWeight: '700',
    color: c.successText,
    marginBottom: 6,
  },
  container: {
    flex: 1,
    backgroundColor: c.bg,
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  backBtn: {
    marginBottom: 20,
  },
  backBtnText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  missingRetryBtn: {
    marginTop: 16,
  },
  gameBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: c.card,
    marginBottom: 12,
  },
  gameBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  groupName: {
    fontSize: 28,
    fontWeight: '800',
    color: c.textPrimary,
    marginBottom: 10,
  },
  editTitleInput: {
    fontSize: 26,
    fontWeight: '800',
    color: c.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: '#007AFF',
    marginBottom: 10,
    paddingBottom: 4,
  },
  confirmedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: c.successBg,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#34C759',
    marginBottom: 8,
  },
  confirmedText: {
    color: c.successText,
    fontSize: 12,
    fontWeight: '700',
  },
  roundInProgressBadge: {
    alignSelf: 'flex-start',
    backgroundColor: c.accentBg,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
    marginBottom: 8,
  },
  roundInProgressText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '700',
  },
  resultStatusCard: {
    backgroundColor: c.accentBg,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  resultStatusTitle: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  resultStatusSub: {
    color: c.textBody,
    fontSize: 12,
    marginTop: 8,
  },
  resultRow: {
    color: c.textPrimary,
    fontSize: 13,
    lineHeight: 20,
  },
  pendingCard: {
    backgroundColor: c.warnBg,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6A817',
  },
  pendingTitle: {
    color: c.warnText,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  pendingSub: {
    color: c.textBody,
    fontSize: 12,
    marginVertical: 6,
  },
  pendingNote: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 4,
  },
  pendingActions: {
    marginTop: 6,
  },
  metaCard: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.border,
    gap: 8,
  },
  metaRow: {
    fontSize: 14,
    color: c.textBody,
  },
  noGoRow: {
    color: '#C0392B',
  },
  joinCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  joinCodeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: c.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  joinCodeValue: {
    fontSize: 15,
    fontWeight: '800',
    color: c.warnText,
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  editInput: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: c.textPrimary,
    marginBottom: 8,
  },
  editLabel: {
    fontSize: 11,
    color: c.textMuted,
    marginBottom: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  hostControls: {
    marginBottom: 20,
  },
  editBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editBtn: {
    flex: 1,
    backgroundColor: c.card,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },
  editBtnText: {
    color: '#007AFF',
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: c.successBg,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  confirmBtnLocked: {
    backgroundColor: c.card,
    borderColor: c.border,
  },
  confirmBtnText: {
    color: c.successText,
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtnTextLocked: {
    color: c.textMuted,
  },
  confirmLockNote: {
    fontSize: 12,
    color: c.textMuted,
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: c.card,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },
  cancelBtnText: {
    color: c.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
  rosterTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: c.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: c.border,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  playerInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: c.textPrimary,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '700',
    color: c.textPrimary,
    marginBottom: 2,
  },
  playerMeta: {
    fontSize: 12,
    color: c.textMuted,
  },
  makeHostBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: c.warnBg,
    borderWidth: 1,
    borderColor: '#E6A817',
    marginLeft: 8,
  },
  makeHostText: {
    fontSize: 11,
    fontWeight: '700',
    color: c.warnText,
  },
  hostBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: '#E6A817',
    marginLeft: 8,
  },
  rivalsYouBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: c.dangerBg,
    marginLeft: 8,
  },
  rivalsYouBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: c.dangerOnBg,
    letterSpacing: 0.5,
  },
  hostBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  actionSection: {
    marginTop: 24,
  },
  joinBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  joinBtnDisabled: {
    backgroundColor: c.disabledBg,
  },
  joinBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
  leaveBtn: {
    backgroundColor: c.dangerBg,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C0392B',
  },
  leaveBtnText: {
    color: '#C0392B',
    fontWeight: '700',
    fontSize: 16,
  },
  hostActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  hostActionHalf: {
    flex: 1,
  },
  deletePostingBtn: {
    backgroundColor: c.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },
  deletePostingBtnText: {
    color: c.textBody,
    fontWeight: '700',
    fontSize: 16,
  },
  chipRow: {
    gap: 6,
    paddingBottom: 4,
  },
  chipRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  editChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.bg,
  },
  editChipActive: {
    backgroundColor: c.accentBg,
    borderColor: '#007AFF',
  },
  editChipText: {
    fontSize: 12,
    color: c.textSecondary,
    fontWeight: '600',
  },
  editChipTextActive: {
    color: c.accentOnBg,
  },
  timePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  timeUnit: {
    alignItems: 'center',
    gap: 4,
  },
  timeArrow: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  timeArrowText: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '700',
  },
  timeValue: {
    fontSize: 24,
    fontWeight: '800',
    color: c.textPrimary,
    minWidth: 38,
    textAlign: 'center',
  },
  timeSeparator: {
    fontSize: 24,
    fontWeight: '800',
    color: c.textMuted,
    marginBottom: 2,
  },
  timePeriod: {
    gap: 6,
    marginLeft: 4,
  },
  periodBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  periodBtnActive: {
    backgroundColor: c.accentBg,
    borderColor: '#007AFF',
  },
  periodText: {
    fontSize: 11,
    fontWeight: '700',
    color: c.textMuted,
  },
  periodTextActive: {
    color: '#007AFF',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  reportSheet: {
    backgroundColor: c.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: c.border,
  },
  reportTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: c.textPrimary,
    marginBottom: 6,
  },
  reportSubtitle: {
    fontSize: 13,
    color: c.textBody,
    lineHeight: 18,
    marginBottom: 16,
  },
  reportList: {
    position: 'relative',
    marginBottom: 16,
  },
  placementRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW_HEIGHT - 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  dragHandle: {
    paddingHorizontal: 6,
    paddingVertical: 10,
    marginRight: 10,
  },
  dragHandleText: {
    color: c.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  placementName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: c.textPrimary,
  },
  tieChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  tieChipActive: {
    backgroundColor: c.accentBg,
    borderColor: '#007AFF',
  },
  tieChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: c.textMuted,
  },
  tieChipTextActive: {
    color: '#007AFF',
  },
});
