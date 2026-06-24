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
import { GAME_COLOR, GAME_EMOJI, GAME_LABELS } from '../data/types';

/**
 * Group detail screen showing the full roster, group settings, and host controls.
 * Handles join, leave, host transfer, and group edits — with haptic and visual feedback on each action.
 * Hosts can confirm a meetup happened which awards XP to all members and triggers a celebration overlay.
 * Parameters: none; reads id from route search params, finds the group in global context.
 * Returns: a scrollable detail screen or null when the group ID does not match any group.
 * Edge cases: back-navigates silently when the group is not found or has been deleted.
 */
export default function GroupDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { currentUser, groups, setGroups, awardXP } = useApp();

  const groupId = Number(id);
  const group = groups.find((g) => g.id === groupId);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(group?.name ?? '');
  const [editLocation, setEditLocation] = useState(group?.location ?? '');
  const [editTime, setEditTime] = useState(group?.time ?? '');
  const [editTarget, setEditTarget] = useState(String(group?.targetPlayers ?? 4));
  const [editBracket, setEditBracket] = useState(String(group?.bracket ?? 2));
  const [showConfirmOverlay, setShowConfirmOverlay] = useState(false);

  const celebScale = useRef(new Animated.Value(0)).current;
  const celebOpacity = useRef(new Animated.Value(0)).current;
  const xpAnim = useRef(new Animated.Value(0)).current;

  if (!group || !currentUser) {
    return null;
  }

  const displayUser = currentUser.username;
  const isInGroup = group.players.some((p) => p.username === displayUser);
  const isHost = group.players.some((p) => p.username === displayUser && p.role === 'Host');
  const isFull = group.players.length >= group.targetPlayers;

  const currentUserGroup = groups.find((g) =>
    g.players.some((p) => p.username === displayUser)
  );

  const triggerCelebration = () => {
    setShowConfirmOverlay(true);
    celebScale.setValue(0.5);
    celebOpacity.setValue(0);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300);
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 600);

    Animated.parallel([
      Animated.spring(celebScale, { toValue: 1, useNativeDriver: true, bounciness: 15 }),
      Animated.timing(celebOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    Animated.timing(xpAnim, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  };

  const handleConfirmMeetup = () => {
    if (!isHost) return;
    Alert.alert(
      'Confirm Meetup',
      'Did this group meet up? This will award XP to everyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            setGroups((prev) =>
              prev.map((g) => (g.id === groupId ? { ...g, confirmed: true } : g))
            );
            awardXP(50);
            triggerCelebration();
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
                  bracket: currentUser.bracket,
                  location: currentUser.location,
                  role: 'Member',
                },
              ],
            }
          : g
      )
    );
    awardXP(10);
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
              time: editTime.trim() || g.time,
              targetPlayers: Math.max(g.players.length, Number(editTarget) || g.targetPlayers),
              bracket: Number(editBracket) || g.bracket,
            }
          : g
      )
    );
    setEditing(false);
  };

  const xpDisplay = xpAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 50] });

  return (
    <View style={styles.container}>
      {/* Meetup confirmed overlay */}
      {showConfirmOverlay && (
        <Animated.View style={[styles.overlay, { opacity: celebOpacity }]}>
          <Animated.View style={[styles.celebCard, { transform: [{ scale: celebScale }] }]}>
            <Text style={styles.celebEmoji}>🎉</Text>
            <Text style={styles.celebTitle}>Meetup Confirmed!</Text>
            <Animated.Text style={styles.celebXP}>
              +50 XP
            </Animated.Text>
            <Text style={styles.celebSub}>You showed up. That's what it's about.</Text>
            <Pressable
              style={styles.celebBtn}
              onPress={() => { setShowConfirmOverlay(false); router.back(); }}
            >
              <Text style={styles.celebBtnText}>Back to Browse</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
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
            <Text style={styles.confirmedText}>✓ Meetup Confirmed</Text>
          </View>
        )}

        {/* Meta */}
        <View style={styles.metaCard}>
          {editing ? (
            <>
              <TextInput style={styles.editInput} value={editLocation} onChangeText={setEditLocation} placeholder="Location" placeholderTextColor="#555" />
              <TextInput style={styles.editInput} value={editTime} onChangeText={setEditTime} placeholder="Time" placeholderTextColor="#555" />
              <View style={styles.editRow}>
                <View style={styles.editHalf}>
                  <Text style={styles.editLabel}>Players Needed</Text>
                  <TextInput style={styles.editInput} value={editTarget} onChangeText={setEditTarget} keyboardType="numeric" />
                </View>
                <View style={styles.editHalf}>
                  <Text style={styles.editLabel}>Bracket</Text>
                  <TextInput style={styles.editInput} value={editBracket} onChangeText={setEditBracket} keyboardType="numeric" />
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.metaRow}>📍 {group.location}</Text>
              <Text style={styles.metaRow}>🕐 {group.time}</Text>
              <Text style={styles.metaRow}>👥 {group.players.length} / {group.targetPlayers} players</Text>
              <Text style={styles.metaRow}>⚔️ Bracket {group.bracket}</Text>
              {group.noGo.length > 0 && (
                <Text style={[styles.metaRow, styles.noGoRow]}>🚫 No {group.noGo.join(', ')}</Text>
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
              <View style={styles.editBtnRow}>
                <Pressable style={styles.editBtn} onPress={() => setEditing(true)}>
                  <Text style={styles.editBtnText}>Edit Group</Text>
                </Pressable>
                {!group.confirmed && (
                  <Pressable style={styles.confirmBtn} onPress={handleConfirmMeetup}>
                    <Text style={styles.confirmBtnText}>Confirm Meetup</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {/* Roster */}
        <Text style={styles.rosterTitle}>Players</Text>
        {group.players.map((player) => (
          <View key={player.id} style={styles.playerRow}>
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
          </View>
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
    ...StyleSheet.absoluteFillObject,
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
  celebBtn: {
    backgroundColor: '#34C759',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  celebBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
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
    marginBottom: 14,
  },
  confirmedText: {
    color: '#34C759',
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
  confirmBtnText: {
    color: '#34C759',
    fontWeight: '700',
    fontSize: 14,
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
});
