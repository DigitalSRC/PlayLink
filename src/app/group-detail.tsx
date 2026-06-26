import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { BRACKET_INFO, DAYS_OF_WEEK, GAME_COLOR, GAME_EMOJI, GAME_LABELS } from '../data/types';
import { formatBrackets } from '../utils/group-utils';

const CONFIRM_LOCK_MS = 30 * 60 * 1000; // group must be 30 min old before host can confirm
const MIN_PLAYERS_COMMANDER = 3;        // minimum attendees for a Commander session
const MIN_PLAYERS_OTHER = 2;            // minimum attendees for all other formats

/**
 * Group detail screen showing the full roster, settings, and host controls for a single group.
 * Handles join, leave, host transfer, and group edits with haptic and visual feedback on each action.
 * Multi-round session flow: host confirms a round, selects the winner (winner earns +30 Points), then chooses Another Round or End Session (+10 consolation Points to current user).
 * Anti-cheat guards block confirmation until the group is at least 30 minutes old and has reached the minimum player count (3 for Commander, 2 for others).
 * Parameters: none; reads id from route search params and locates the matching group in global context.
 * Returns: a scrollable detail screen or null when the group ID does not match any active group.
 * Edge cases: renders null and back-navigates silently when the group is not found or has been disbanded.
 */
export default function GroupDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { currentUser, groups, setGroups, awardPoints } = useApp();

  const groupId = Number(id);
  const group = groups.find((g) => g.id === groupId);

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
  const [showConfirmOverlay, setShowConfirmOverlay] = useState(false);
  const [pickerPhase, setPickerPhase] = useState<'winner' | 'celebrate'>('winner');
  const [roundWinner, setRoundWinner] = useState<string | null>(null);

  const celebScale = useRef(new Animated.Value(0)).current;
  const celebOpacity = useRef(new Animated.Value(0)).current;

  if (!group || !currentUser) {
    return null;
  }

  const displayUser = currentUser.username;
  const isInGroup = group.players.some((p) => p.username === displayUser);
  const isHost = group.players.some((p) => p.username === displayUser && p.role === 'Host');
  const isFull = group.players.length >= group.targetPlayers;

  const minPlayers = group.format === 'Commander' ? MIN_PLAYERS_COMMANDER : MIN_PLAYERS_OTHER;
  const msRemaining = Math.max(0, CONFIRM_LOCK_MS - (Date.now() - group.createdAt));
  const minutesRemaining = Math.ceil(msRemaining / 60000);
  const timeLocked = msRemaining > 0;
  const headcountLocked = group.players.length < minPlayers;
  const confirmBlocked = timeLocked || headcountLocked;

  const currentUserGroup = groups.find((g) =>
    g.players.some((p) => p.username === displayUser)
  );

  const animateCelebration = () => {
    celebScale.setValue(0.5);
    celebOpacity.setValue(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300);
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 600);
    Animated.parallel([
      Animated.spring(celebScale, { toValue: 1, useNativeDriver: true, bounciness: 15 }),
      Animated.timing(celebOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const handleSelectWinner = (winnerUsername: string) => {
    setRoundWinner(winnerUsername);
    if (winnerUsername === displayUser) {
      awardPoints(30);
    }
    setPickerPhase('celebrate');
    animateCelebration();
  };

  const handlePlayAnotherRound = () => {
    setRoundWinner(null);
    setPickerPhase('winner');
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, confirmed: false } : g))
    );
    setShowConfirmOverlay(false);
  };

  const handleEndSession = () => {
    if (group.roundsPlayed > 0) {
      awardPoints(10);
    }
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setShowConfirmOverlay(false);
    router.replace('/(tabs)/browse');
  };

  const handleConfirmMeetup = () => {
    if (!isHost) return;
    if (timeLocked) {
      Alert.alert(
        'Too Soon',
        `Groups must exist for at least 30 minutes before they can be confirmed. ${minutesRemaining} min remaining.`
      );
      return;
    }
    if (headcountLocked) {
      Alert.alert(
        'Not Enough Players',
        `A ${group.format === 'Commander' ? 'Commander' : ''} session needs at least ${minPlayers} players to confirm. You currently have ${group.players.length}.`
      );
      return;
    }
    Alert.alert(
      'Confirm Round',
      'Did your pod finish a game?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () => {
            setGroups((prev) =>
              prev.map((g) =>
                g.id === groupId
                  ? { ...g, confirmed: true, roundsPlayed: g.roundsPlayed + 1 }
                  : g
              )
            );
            setPickerPhase('winner');
            setShowConfirmOverlay(true);
            Haptics.selectionAsync();
          },
        },
      ]
    );
  };

  const handleJoin = () => {
    if (currentUserGroup) {
      Alert.alert('Already in a group', 'Leave your current group before joining another.');
      return;
    }
    if (isFull) {
      Alert.alert('Group full', 'No open spots in this group.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              players: [
                ...g.players,
                {
                  id: Date.now(),
                  username: displayUser,
                  bracket: currentUser.brackets[0] ?? 2,
                  location: currentUser.location,
                  role: 'Member',
                },
              ],
            }
          : g
      )
    );
  };

  const handleLeave = () => {
    const leavingPlayer = group.players.find((p) => p.username === displayUser);
    if (!leavingPlayer) return;

    const remaining = group.players.filter((p) => p.id !== leavingPlayer.id);
    const wasHost = leavingPlayer.role === 'Host';

    if (remaining.length === 0) {
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.back();
      return;
    }

    const updatedPlayers = wasHost
      ? remaining.map((p, i) => (i === 0 ? { ...p, role: 'Host' } : p))
      : remaining;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, players: updatedPlayers } : g
      )
    );

    router.back();
  };

  const handleMakeHost = (playerId: number) => {
    if (!isHost) return;
    Haptics.selectionAsync();
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              players: g.players.map((p) => ({
                ...p,
                role:
                  p.id === playerId
                    ? 'Host'
                    : p.role === 'Host'
                    ? 'Member'
                    : p.role,
              })),
            }
          : g
      )
    );
  };

  const handleSaveEdit = () => {
    if (!editName.trim() || !editLocation.trim()) {
      Alert.alert('Missing info', 'Name and location are required.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              name: editName.trim(),
              location: editLocation.trim(),
              time: editDay ? `${editDay} · ${editHour}:${String(editMinute).padStart(2, '0')} ${editPeriod}` : g.time,
              targetPlayers: Math.max(g.players.length, Number(editTarget) || g.targetPlayers),
              brackets: editBrackets.length > 0 ? editBrackets : g.brackets,
            }
          : g
      )
    );
    setEditing(false);
  };

  return (
    <View style={styles.container}>
      {/* Confirm overlay — winner picker then celebration */}
      {showConfirmOverlay && (
        <View style={styles.overlay}>
          {pickerPhase === 'winner' ? (
            <View style={styles.celebCard}>
              <Text style={styles.celebEmoji}>🏆</Text>
              <Text style={styles.celebTitle}>Who Won Round {group.roundsPlayed}?</Text>
              <Text style={styles.celebSub}>Select the winner of this game</Text>
              {group.players.map((player) => (
                <Pressable
                  key={player.id}
                  style={styles.winnerOption}
                  onPress={() => handleSelectWinner(player.username)}
                >
                  <View style={styles.winnerAvatar}>
                    <Text style={styles.winnerInitial}>{player.username[0]}</Text>
                  </View>
                  <Text style={styles.winnerName}>{player.username}</Text>
                  {player.username === displayUser && (
                    <View style={styles.winnerYouTag}>
                      <Text style={styles.winnerYouText}>You</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          ) : (
            <Animated.View style={[styles.celebCard, { transform: [{ scale: celebScale }], opacity: celebOpacity }]}>
              <Text style={styles.celebEmoji}>🎉</Text>
              <Text style={styles.celebTitle}>Round {group.roundsPlayed} Complete!</Text>
              <View style={styles.winnerAnnounce}>
                <Text style={styles.winnerAnnounceLabel}>WINNER</Text>
                <Text style={styles.winnerAnnounceName}>{roundWinner}</Text>
              </View>
              {roundWinner === displayUser && (
                <Text style={styles.celebXP}>+30 Points</Text>
              )}
              <Text style={styles.celebSub}>
                {roundWinner === displayUser ? 'You took it down!' : 'Good game. End the session or run it back.'}
              </Text>
              <View style={styles.celebBtnRow}>
                <Pressable style={styles.celebBtnSecondary} onPress={handleEndSession}>
                  <Text style={styles.celebBtnSecondaryText}>End Session</Text>
                </Pressable>
                <Pressable style={styles.celebBtn} onPress={handlePlayAnotherRound}>
                  <Text style={styles.celebBtnText}>▶ Another Round</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </View>
      )}

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

        {group.confirmed && (
          <View style={styles.confirmedBadge}>
            <Text style={styles.confirmedText}>✓ Round {group.roundsPlayed} Confirmed</Text>
          </View>
        )}
        {!group.confirmed && group.roundsPlayed > 0 && (
          <View style={styles.roundInProgressBadge}>
            <Text style={styles.roundInProgressText}>🎮 Round {group.roundsPlayed + 1} of this session</Text>
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
                  {!group.confirmed && (
                    <Pressable
                      style={[styles.confirmBtn, confirmBlocked && styles.confirmBtnLocked]}
                      onPress={handleConfirmMeetup}
                    >
                      <Text style={[styles.confirmBtnText, confirmBlocked && styles.confirmBtnTextLocked]}>
                        {group.roundsPlayed > 0 ? `Confirm Round ${group.roundsPlayed + 1}` : 'Confirm Meetup'}
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

        {/* Join / Leave */}
        <View style={styles.actionSection}>
          {isInGroup ? (
            <Pressable style={styles.leaveBtn} onPress={handleLeave}>
              <Text style={styles.leaveBtnText}>
                {isHost ? 'Leave & Transfer Host' : 'Leave Group'}
              </Text>
            </Pressable>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  celebCard: {
    backgroundColor: '#1C1C24',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginHorizontal: 32,
    borderWidth: 1,
    borderColor: '#34C759',
  },
  celebEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  celebTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 8,
  },
  celebXP: {
    fontSize: 40,
    fontWeight: '800',
    color: '#34C759',
    marginBottom: 8,
  },
  celebSub: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  celebBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 0,
  },
  celebBtn: {
    flex: 1,
    backgroundColor: '#34C759',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  celebBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  celebBtnSecondary: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  celebBtnSecondaryText: {
    color: '#888',
    fontWeight: '700',
    fontSize: 14,
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
  editRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editHalf: {
    flex: 1,
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
  winnerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F14',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2C2C38',
    width: '100%',
  },
  winnerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C38',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  winnerInitial: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  winnerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  winnerYouTag: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  winnerYouText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFF',
  },
  winnerAnnounce: {
    alignItems: 'center',
    backgroundColor: '#0F0F14',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6A817',
  },
  winnerAnnounceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E6A817',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  winnerAnnounceName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
  },
});
