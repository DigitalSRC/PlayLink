import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useApp } from '../context/AppContext';
import { BRACKET_INFO, DAYS_OF_WEEK, GAME_COLOR, GAME_EMOJI, GAME_LABELS } from '../data/types';
import { formatBrackets } from '../utils/group-utils';
import { PlacementInput } from '../utils/scoring-utils';
import { applyGroupResultPoints, finalizeGroupResultIfReady, GroupResult } from '../lib/group-api';
import { profileKeys } from '../hooks/useProfileQueries';
import {
  groupKeys,
  useCancelGroupResultMutation,
  useConfirmGroupMutation,
  useDeleteGroupMutation,
  useDisputeGroupResultMutation,
  useGroupQuery,
  useGroupResultsQuery,
  useJoinGroupMutation,
  useLeaveGroupMutation,
  useSetGroupHostMutation,
  useSubmitGroupResultMutation,
} from '../hooks/useGroupQueries';

const CONFIRM_LOCK_MS = 30 * 60 * 1000; // group must be 30 min old before host can start a game
const MIN_PLAYERS_OTHER = 2;            // minimum attendees required to start any game format
const ROW_HEIGHT = 64;                  // draggable placement row height, including its gap

/**
 * Group detail screen showing the full roster, settings, and host controls for a single group,
 * plus the game-session flow: the host confirms the game, then reports each round's placements
 * once it's over. Points are placement-based (see scoring-utils.ts): the winner's base pool
 * scales with pod size, each subsequent rank earns half of the one before it, last place always
 * scores zero placement points, and everyone gets a flat participation bonus regardless.
 * A submitted round starts as 'pending' with a dispute window before it finalizes and each
 * participant's own device applies their point delta — see group-api.ts for the full model.
 * Parameters: none; reads id from route search params and fetches the matching group from Supabase.
 * Returns: a scrollable detail screen or null when the group ID does not match any group, or
 * currentUser hasn't loaded yet.
 * Edge cases: renders null when the group is not found (e.g. it was just deleted by its last
 * player leaving).
 */
export default function GroupDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUser } = useApp();
  const queryClient = useQueryClient();

  const { data: group } = useGroupQuery(id);
  const { data: results = [] } = useGroupResultsQuery(id);

  const joinMutation = useJoinGroupMutation();
  const leaveMutation = useLeaveGroupMutation();
  const deleteMutation = useDeleteGroupMutation();
  const setHostMutation = useSetGroupHostMutation();
  const confirmMutation = useConfirmGroupMutation();
  const submitResultMutation = useSubmitGroupResultMutation();
  const disputeMutation = useDisputeGroupResultMutation();
  const cancelResultMutation = useCancelGroupResultMutation();

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
  // Finish order, best first — the source of truth for the report modal's drag-and-drop list.
  const [placementOrder, setPlacementOrder] = useState<string[]>([]);
  // Player ids tied with whoever is directly above them in placementOrder (index 0 can never be
  // tied, since there's nothing above it). Kept separate from ordering itself so dragging and
  // marking a tie are independent actions.
  const [tiedWithAbove, setTiedWithAbove] = useState<Set<string>>(new Set());
  const rowPositions = useSharedValue<Record<string, number>>({});

  const [disputeTarget, setDisputeTarget] = useState<GroupResult | null>(null);
  const [disputeReasonInput, setDisputeReasonInput] = useState('');

  // Remembers a disputed round's placements across cancel -> resubmit, so reopening the report
  // modal pre-fills the host's correction instead of resetting to the default 1..N order — the
  // host is correcting a mistake, not re-entering the whole round from scratch. Cleared once the
  // corrected round is actually submitted.
  const [lastCancelledPlacements, setLastCancelledPlacements] = useState<Record<string, number> | null>(null);

  const activeResult = results.find((r) => r.status !== 'finalized');

  // Keeps the shared position map (read by every draggable row's animated style) in sync with
  // placementOrder — the plain-state array stays the single source of truth; this is just its
  // reanimated-readable mirror.
  useEffect(() => {
    const next: Record<string, number> = {};
    placementOrder.forEach((id, index) => { next[id] = index; });
    rowPositions.value = next;
  }, [placementOrder]);

  // Lazily finalizes a pending result once its dispute window has elapsed — matches this app's
  // existing getNow()/devDateOffset pattern of checking elapsed time on read rather than running
  // a scheduled job for it. Runs whenever the group or its results are (re)loaded.
  useEffect(() => {
    if (!group || !activeResult) return;
    if (activeResult.status !== 'pending' || Date.now() < activeResult.disputeWindowEndsAt) return;
    finalizeGroupResultIfReady(activeResult, group.roundsPlayed).then(() => {
      queryClient.invalidateQueries({ queryKey: groupKeys.results(group.id) });
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(group.id) });
    });
  }, [group?.id, group?.roundsPlayed, activeResult?.id, activeResult?.status, activeResult?.disputeWindowEndsAt]);

  // Applies this device's own point delta from any finalized result the current user hasn't
  // synced yet. RLS only allows writing your own profile row, so every participant's device has
  // to do this independently — there's no single step that applies everyone's points at once.
  useEffect(() => {
    if (!currentUser) return;
    const toApply = results.find(
      (r) =>
        r.status === 'finalized' &&
        !r.appliedBy.includes(currentUser.id) &&
        r.placements.some((p) => p.playerId === currentUser.id)
    );
    if (!toApply) return;
    applyGroupResultPoints(toApply, currentUser).then(() => {
      queryClient.invalidateQueries({ queryKey: groupKeys.results(toApply.groupId) });
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(currentUser.id) });
    });
  }, [results, currentUser?.id]);

  if (!group || !currentUser) {
    return null;
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
      Alert.alert('Group full', 'No open spots in this group.');
      return;
    }
    try {
      await joinMutation.mutateAsync({
        groupId: group.id,
        playerId: currentUser.id,
        bracket: currentUser.brackets[0] ?? 2,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert('Couldn’t join', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleLeave = async () => {
    const leavingPlayer = group.players.find((p) => p.id === currentUser.id);
    if (!leavingPlayer) return;

    const remaining = group.players.filter((p) => p.id !== leavingPlayer.id);
    const wasHost = leavingPlayer.role === 'Host';

    try {
      if (remaining.length === 0) {
        await deleteMutation.mutateAsync({ groupId: group.id });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.back();
        return;
      }

      if (wasHost) {
        await setHostMutation.mutateAsync({
          groupId: group.id,
          newHostId: remaining[0].id,
          previousHostId: leavingPlayer.id,
        });
      }
      await leaveMutation.mutateAsync({ groupId: group.id, playerId: leavingPlayer.id });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.back();
    } catch (err) {
      Alert.alert('Couldn’t leave group', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleDeletePosting = () => {
    const otherPlayers = group.players.filter((p) => p.id !== currentUser.id).length;
    Alert.alert(
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
              router.back();
            } catch (err) {
              Alert.alert('Couldn’t delete posting', err instanceof Error ? err.message : 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleMakeHost = async (playerId: string) => {
    if (!isHost) return;
    const previousHost = group.players.find((p) => p.role === 'Host');
    if (!previousHost) return;
    Haptics.selectionAsync();
    try {
      await setHostMutation.mutateAsync({ groupId: group.id, newHostId: playerId, previousHostId: previousHost.id });
    } catch (err) {
      Alert.alert('Couldn’t change host', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleConfirmGame = async () => {
    if (!isHost || confirmBlocked) return;
    try {
      await confirmMutation.mutateAsync({ groupId: group.id, confirmed: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert('Couldn’t confirm game', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const openReportModal = () => {
    let order = group.players.map((p) => p.id);
    const tied = new Set<string>();
    if (lastCancelledPlacements) {
      order = [...order].sort(
        (a, b) => (lastCancelledPlacements[a] ?? 1) - (lastCancelledPlacements[b] ?? 1)
      );
      order.forEach((id, index) => {
        if (index === 0) return;
        const prevId = order[index - 1];
        if ((lastCancelledPlacements[id] ?? 1) === (lastCancelledPlacements[prevId] ?? 1)) {
          tied.add(id);
        }
      });
    }
    setPlacementOrder(order);
    setTiedWithAbove(tied);
    setShowReportModal(true);
  };

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

  const handleSubmitResult = async () => {
    let placement = 1;
    const placements: PlacementInput[] = placementOrder.map((playerId, index) => {
      if (index === 0 || !tiedWithAbove.has(playerId)) {
        placement = index + 1;
      }
      return { playerId, placement };
    });
    try {
      await submitResultMutation.mutateAsync({
        groupId: group.id,
        roundNumber: group.roundsPlayed + 1,
        submittedBy: currentUser.id,
        placements,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowReportModal(false);
      setLastCancelledPlacements(null);
    } catch (err) {
      Alert.alert('Couldn’t submit results', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleDispute = (result: GroupResult) => {
    setDisputeReasonInput('');
    setDisputeTarget(result);
  };

  const handleSubmitDispute = async () => {
    if (!disputeTarget) return;
    const reason = disputeReasonInput.trim();
    if (!reason) {
      Alert.alert('Reason required', "Let the host know what's wrong before flagging this round.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await disputeMutation.mutateAsync({ result: disputeTarget, playerId: currentUser.id, reason });
      setDisputeTarget(null);
    } catch (err) {
      Alert.alert('Couldn’t flag dispute', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleCancelResult = async (result: GroupResult) => {
    try {
      await cancelResultMutation.mutateAsync({ resultId: result.id, groupId: result.groupId });
      const prefill: Record<string, number> = {};
      result.placements.forEach((p) => { prefill[p.playerId] = p.placement; });
      setLastCancelledPlacements(prefill);
    } catch (err) {
      Alert.alert('Couldn’t cancel round', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleSaveEdit = () => {
    if (!editName.trim() || !editLocation.trim()) {
      Alert.alert('Missing info', 'Name and location are required.');
      return;
    }
    // Group editing (name/location/time/targetPlayers/brackets) isn't wired to the backend yet —
    // this screen's real-backend migration focused on the game-session/scoring flow. Left as a
    // known gap rather than silently no-op-ing without saying so.
    Alert.alert('Not available yet', 'Editing group details after creation is coming soon.');
    setEditing(false);
  };

  const dispusteWindowMinutesLeft = activeResult
    ? Math.max(0, Math.ceil((activeResult.disputeWindowEndsAt - Date.now()) / 60000))
    : 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Back */}
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
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

        {group.confirmed && !activeResult && (
          <View style={styles.confirmedBadge}>
            <Text style={styles.confirmedText}>✓ Round {group.roundsPlayed} Confirmed</Text>
          </View>
        )}
        {!group.confirmed && group.roundsPlayed > 0 && (
          <View style={styles.roundInProgressBadge}>
            <Text style={styles.roundInProgressText}>🎮 Round {group.roundsPlayed + 1} of this session</Text>
          </View>
        )}

        {/* Pending/disputed round status — visible to every member */}
        {activeResult && (
          <View style={[styles.resultStatusCard, activeResult.status === 'disputed' && styles.resultStatusCardDisputed]}>
            {activeResult.status === 'pending' ? (
              <>
                <Text style={styles.resultStatusTitle}>Round {activeResult.roundNumber} results submitted</Text>
                <Text style={styles.resultStatusSub}>
                  Finalizes in {dispusteWindowMinutesLeft} min unless someone disputes it.
                </Text>
                <Pressable style={styles.disputeBtn} onPress={() => handleDispute(activeResult)}>
                  <Text style={styles.disputeBtnText}>⚠️ Something's wrong with this</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.resultStatusTitleDisputed}>Round {activeResult.roundNumber} disputed</Text>
                <Text style={styles.resultStatusSub}>
                  {isHost ? 'Cancel it and resubmit corrected results.' : 'Waiting on the host to resubmit.'}
                </Text>
                {activeResult.disputedBy.map((disputerId) => {
                  const disputer = group.players.find((p) => p.id === disputerId);
                  const reason = activeResult.disputeReasons[disputerId];
                  if (!reason) return null;
                  return (
                    <Text key={disputerId} style={styles.disputeReasonText}>
                      {disputer?.username ?? 'A player'}: "{reason}"
                    </Text>
                  );
                })}
                {isHost && (
                  <Pressable style={styles.disputeBtn} onPress={() => handleCancelResult(activeResult)}>
                    <Text style={styles.disputeBtnText}>Cancel Round {activeResult.roundNumber}</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        )}

        {/* Meta */}
        <View style={styles.metaCard}>
          {editing ? (
            <>
              <TextInput style={styles.editInput} value={editLocation} onChangeText={setEditLocation} placeholder="Location" placeholderTextColor="#555" />

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
                      style={[styles.confirmBtn, !!activeResult && styles.confirmBtnLocked]}
                      onPress={openReportModal}
                      disabled={!!activeResult}
                    >
                      <Text style={[styles.confirmBtnText, !!activeResult && styles.confirmBtnTextLocked]}>
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
              <Text style={styles.playerInitial}>{player.username[0]}</Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{player.username}</Text>
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
      <Modal visible={showReportModal} animationType="slide" transparent onRequestClose={() => setShowReportModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.reportSheet}>
            <Text style={styles.reportTitle}>Report Round {group.roundsPlayed + 1}</Text>
            <Text style={styles.reportSubtitle}>
              Drag ☰ to set each player&apos;s finish order (1st at top). Use &quot;Tie with above&quot; for a shared placement.
            </Text>
            <View style={[styles.reportList, { height: placementOrder.length * ROW_HEIGHT }]}>
              {placementOrder.map((playerId, index) => {
                const player = group.players.find((p) => p.id === playerId);
                if (!player) return null;
                return (
                  <DraggablePlacementRow
                    key={playerId}
                    playerId={playerId}
                    label={player.username}
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
              <Pressable style={styles.cancelBtn} onPress={() => setShowReportModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={handleSubmitResult}>
                <Text style={styles.saveBtnText}>Submit Results</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Dispute reason modal */}
      <Modal visible={!!disputeTarget} animationType="slide" transparent onRequestClose={() => setDisputeTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.reportSheet}>
            <Text style={styles.reportTitle}>What&apos;s wrong with this round?</Text>
            <Text style={styles.reportSubtitle}>
              Let the host know what needs fixing before they cancel and resubmit it.
            </Text>
            <TextInput
              style={[styles.editInput, styles.disputeReasonInput]}
              value={disputeReasonInput}
              onChangeText={setDisputeReasonInput}
              placeholder="e.g. I actually came in 2nd, not 3rd"
              placeholderTextColor="#555"
              multiline
            />
            <View style={styles.editBtnRow}>
              <Pressable style={styles.cancelBtn} onPress={() => setDisputeTarget(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={handleSubmitDispute}>
                <Text style={styles.saveBtnText}>Flag Dispute</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
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
  gameBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: '#1C1C24',
    marginBottom: 12,
  },
  gameBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  groupName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 10,
  },
  editTitleInput: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#007AFF',
    marginBottom: 10,
    paddingBottom: 4,
  },
  confirmedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0D2A15',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#34C759',
    marginBottom: 8,
  },
  confirmedText: {
    color: '#34C759',
    fontSize: 12,
    fontWeight: '700',
  },
  roundInProgressBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#001A3D',
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
    backgroundColor: '#001A3D',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  resultStatusCardDisputed: {
    backgroundColor: '#3D1215',
    borderColor: '#C0392B',
  },
  resultStatusTitle: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  resultStatusTitleDisputed: {
    color: '#C0392B',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  resultStatusSub: {
    color: '#AAA',
    fontSize: 12,
    marginBottom: 10,
  },
  disputeBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#1C1C24',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  disputeBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  disputeReasonText: {
    color: '#E6A0A0',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  disputeReasonInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  metaCard: {
    backgroundColor: '#1C1C24',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2C2C38',
    gap: 8,
  },
  metaRow: {
    fontSize: 14,
    color: '#AAA',
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
    color: '#555',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  joinCodeValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#E6A817',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  editInput: {
    backgroundColor: '#0F0F14',
    borderWidth: 1,
    borderColor: '#2C2C38',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#FFF',
    marginBottom: 8,
  },
  editLabel: {
    fontSize: 11,
    color: '#555',
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
    backgroundColor: '#1C1C24',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  editBtnText: {
    color: '#007AFF',
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#0D2A15',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  confirmBtnLocked: {
    backgroundColor: '#1C1C24',
    borderColor: '#333',
  },
  confirmBtnText: {
    color: '#34C759',
    fontWeight: '700',
    fontSize: 14,
  },
  confirmBtnTextLocked: {
    color: '#555',
  },
  confirmLockNote: {
    fontSize: 12,
    color: '#666',
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
    backgroundColor: '#1C1C24',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  cancelBtnText: {
    color: '#888',
    fontWeight: '700',
    fontSize: 14,
  },
  rosterTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2C2C38',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  playerInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 2,
  },
  playerMeta: {
    fontSize: 12,
    color: '#666',
  },
  makeHostBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: '#2C1A00',
    borderWidth: 1,
    borderColor: '#E6A817',
    marginLeft: 8,
  },
  makeHostText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E6A817',
  },
  hostBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: '#E6A817',
    marginLeft: 8,
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
    backgroundColor: '#1C1C24',
  },
  joinBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
  leaveBtn: {
    backgroundColor: '#3D1215',
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
    backgroundColor: '#1C1C24',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#555',
  },
  deletePostingBtnText: {
    color: '#AAA',
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
    borderColor: '#333',
    backgroundColor: '#0F0F14',
  },
  editChipActive: {
    backgroundColor: '#001A33',
    borderColor: '#007AFF',
  },
  editChipText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  editChipTextActive: {
    color: '#FFF',
  },
  timePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C38',
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
    color: '#FFF',
    minWidth: 38,
    textAlign: 'center',
  },
  timeSeparator: {
    fontSize: 24,
    fontWeight: '800',
    color: '#555',
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
    borderColor: '#333',
    backgroundColor: '#1C1C24',
  },
  periodBtnActive: {
    backgroundColor: '#001A33',
    borderColor: '#007AFF',
  },
  periodText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
  },
  periodTextActive: {
    color: '#007AFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  reportSheet: {
    backgroundColor: '#1C1C24',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  reportTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 6,
  },
  reportSubtitle: {
    fontSize: 13,
    color: '#AAA',
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
    backgroundColor: '#0F0F14',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  dragHandle: {
    paddingHorizontal: 6,
    paddingVertical: 10,
    marginRight: 10,
  },
  dragHandleText: {
    color: '#666',
    fontSize: 18,
    fontWeight: '700',
  },
  placementName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  tieChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1C1C24',
  },
  tieChipActive: {
    backgroundColor: '#001A33',
    borderColor: '#007AFF',
  },
  tieChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
  },
  tieChipTextActive: {
    color: '#007AFF',
  },
});
