import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import {
  BRACKET_INFO,
  FORMAT_OPTIONS,
  GAME_COLOR,
  GAME_EMOJI,
  GAME_LABELS,
  GameType,
  NO_GO_OPTIONS,
  NoGoRule,
} from '../../data/types';

/**
 * Profile tab showing the player's stats, game preferences, no-go rules, and rivals.
 * Supports inline editing of location, formats, bracket, and no-go list.
 * Parameters: none; reads and writes currentUser from global context.
 * Returns: a scrollable profile screen with a toggle between view and edit modes.
 * Edge cases: edit mode shows only fields relevant to the player's selected games.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { currentUser, rivals, chosenRivalId, setCurrentUser, clearCurrentUser } = useApp();
  const [editing, setEditing] = useState(false);

  if (!currentUser) return null;

  const [editLocation, setEditLocation] = useState(currentUser.location);
  const [editBrackets, setEditBrackets] = useState<number[]>(currentUser.brackets);
  const [editFormats, setEditFormats] = useState(currentUser.preferredFormats);
  const [editNoGo, setEditNoGo] = useState<NoGoRule[]>(currentUser.noGo);

  const totalGames = currentUser.wins + currentUser.losses;
  const winPct = totalGames === 0 ? 0 : Math.round((currentUser.wins / totalGames) * 100);

  const saveEdit = () => {
    setCurrentUser({
      ...currentUser,
      location: editLocation.trim() || currentUser.location,
      brackets: editBrackets.length > 0 ? editBrackets : currentUser.brackets,
      preferredFormats: editFormats,
      noGo: editNoGo,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(false);
  };

  const toggleFormat = (game: GameType, fmt: string) => {
    setEditFormats((prev) => {
      const current = prev[game] ?? [];
      const updated = current.includes(fmt)
        ? current.filter((f) => f !== fmt)
        : [...current, fmt];
      return { ...prev, [game]: updated };
    });
  };

  const toggleNoGo = (rule: NoGoRule) => {
    Haptics.selectionAsync();
    setEditNoGo((prev) =>
      prev.includes(rule) ? prev.filter((r) => r !== rule) : [...prev, rule]
    );
  };

  const initials = currentUser.username
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar + name */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.username}>{currentUser.username}</Text>
        {editing ? (
          <TextInput
            style={styles.locationInput}
            value={editLocation}
            onChangeText={setEditLocation}
            placeholder="Your area"
            placeholderTextColor="#555"
          />
        ) : (
          <Text style={styles.location}>{currentUser.location}</Text>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{currentUser.wins}</Text>
            <Text style={styles.statLabel}>Wins</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{currentUser.losses}</Text>
            <Text style={styles.statLabel}>Losses</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{winPct}%</Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, styles.xpColor]}>{currentUser.xp}</Text>
            <Text style={styles.statLabel}>XP</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${winPct}%` }]} />
        </View>
      </View>

      {/* Games */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Games</Text>
        <View style={styles.chipRow}>
          {currentUser.games.map((g) => (
            <View key={g} style={[styles.gamePill, { borderColor: GAME_COLOR[g] }]}>
              <Text style={styles.gamePillText}>{GAME_EMOJI[g]} {GAME_LABELS[g]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Formats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferred Formats</Text>
        {currentUser.games.map((game) => (
          <View key={game} style={styles.gameFormatBlock}>
            <Text style={[styles.gameFormatTitle, { color: GAME_COLOR[game] }]}>
              {GAME_EMOJI[game]} {GAME_LABELS[game]}
            </Text>
            <View style={styles.chipRow}>
              {FORMAT_OPTIONS[game].map((fmt) => {
                const active = (editing ? editFormats[game] : currentUser.preferredFormats[game] ?? []).includes(fmt);
                return (
                  <Pressable
                    key={fmt}
                    disabled={!editing}
                    style={[
                      styles.chip,
                      active && { backgroundColor: GAME_COLOR[game], borderColor: GAME_COLOR[game] },
                    ]}
                    onPress={() => toggleFormat(game, fmt)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{fmt}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      {/* Bracket (MTG only) */}
      {currentUser.games.includes('mtg') && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Commander Bracket</Text>
          <Text style={styles.sectionHintText}>Wizards 1–5 · select all you play</Text>
          <View style={styles.bracketRow}>
            {[1, 2, 3, 4, 5].map((b) => {
              const active = (editing ? editBrackets : currentUser.brackets).includes(b);
              return (
                <Pressable
                  key={b}
                  disabled={!editing}
                  style={[styles.bracketBtn, active && styles.bracketBtnActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEditBrackets((prev) =>
                      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
                    );
                  }}
                >
                  <Text style={[styles.bracketNum, active && styles.bracketNumActive]}>{b}</Text>
                  <Text style={styles.bracketLabel}>{BRACKET_INFO[b].label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* No-go */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Won't Play Against</Text>
        <View style={styles.chipRow}>
          {(editing ? NO_GO_OPTIONS : currentUser.noGo.length > 0 ? currentUser.noGo : NO_GO_OPTIONS).map((rule) => {
            const active = (editing ? editNoGo : currentUser.noGo).includes(rule);
            return (
              <Pressable
                key={rule}
                disabled={!editing}
                style={[styles.chip, active && styles.chipNoGo]}
                onPress={() => toggleNoGo(rule)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{rule}</Text>
              </Pressable>
            );
          })}
          {!editing && currentUser.noGo.length === 0 && (
            <Text style={styles.emptyText}>None set — plays against anything</Text>
          )}
        </View>
      </View>

      {/* Rivals */}
      {rivals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rivals & Contenders</Text>
          {rivals.map((rival) => {
            const isChosen = rival.id === chosenRivalId;
            return (
              <View
                key={rival.id}
                style={[styles.rivalCard, isChosen && styles.rivalCardChosen]}
              >
                <View style={[styles.rivalAvatar, isChosen && styles.rivalAvatarChosen]}>
                  <Text style={styles.rivalInitial}>{rival.username[0]}</Text>
                </View>
                <View style={styles.rivalInfo}>
                  <Text style={styles.rivalName}>{rival.username}</Text>
                  <Text style={styles.rivalMeta}>
                    {rival.wins}W – {rival.losses}L · {rival.games.map((g) => GAME_EMOJI[g]).join(' ')}
                  </Text>
                  <Text style={styles.rivalLocation}>{rival.location}</Text>
                </View>
                {isChosen ? (
                  <View style={styles.rivalBadge}>
                    <Text style={styles.rivalBadgeText}>RIVAL</Text>
                  </View>
                ) : (
                  <View style={[styles.rivalBadge, styles.contenderBadge]}>
                    <Text style={[styles.rivalBadgeText, styles.contenderBadgeText]}>CONTENDER</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Edit actions */}
      <View style={styles.editActions}>
        {editing ? (
          <>
            <Pressable style={styles.saveBtn} onPress={saveEdit}>
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => { setEditing(false); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.editBtn} onPress={() => { Haptics.selectionAsync(); setEditing(true); }}>
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.restartBtn}
          onPress={() => {
            Alert.alert(
              'RESTART',
              'Clear your profile and start over from the beginning?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Restart',
                  style: 'destructive',
                  onPress: () => {
                    clearCurrentUser();
                    router.replace('/profile-creation');
                  },
                },
              ]
            );
          }}
        >
          <Text style={styles.restartBtnText}>RESTART</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFF',
  },
  username: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 4,
  },
  location: {
    fontSize: 14,
    color: '#666',
  },
  locationInput: {
    backgroundColor: '#1C1C24',
    borderWidth: 1,
    borderColor: '#2C2C38',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#FFF',
    marginTop: 4,
    minWidth: 200,
    textAlign: 'center',
  },
  statsCard: {
    backgroundColor: '#1C1C24',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  stat: {
    alignItems: 'center',
  },
  statNum: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
  },
  xpColor: {
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 11,
    color: '#555',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2C2C38',
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#2C2C38',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#34C759',
    borderRadius: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gamePill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#1C1C24',
  },
  gamePillText: {
    fontSize: 13,
    color: '#CCC',
    fontWeight: '600',
  },
  gameFormatBlock: {
    marginBottom: 14,
  },
  gameFormatTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#2C2C38',
    backgroundColor: '#1C1C24',
  },
  chipText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFF',
  },
  chipNoGo: {
    backgroundColor: '#3D1215',
    borderColor: '#C0392B',
  },
  emptyText: {
    fontSize: 13,
    color: '#555',
    fontStyle: 'italic',
  },
  bracketRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bracketBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2C2C38',
    backgroundColor: '#1C1C24',
  },
  bracketBtnActive: {
    borderColor: '#007AFF',
    backgroundColor: '#001A3D',
  },
  bracketNum: {
    fontSize: 20,
    fontWeight: '800',
    color: '#555',
  },
  bracketNumActive: {
    color: '#007AFF',
  },
  bracketLabel: {
    fontSize: 9,
    color: '#555',
    marginTop: 2,
  },
  sectionHintText: {
    fontSize: 11,
    color: '#555',
    marginBottom: 10,
    marginTop: -8,
  },
  rivalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C24',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#2C2C38',
  },
  rivalCardChosen: {
    borderColor: '#FF3B30',
    backgroundColor: '#1F1012',
  },
  rivalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rivalAvatarChosen: {
    backgroundColor: '#FF3B30',
  },
  rivalInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
  },
  rivalInfo: {
    flex: 1,
  },
  rivalName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 2,
  },
  rivalMeta: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  rivalLocation: {
    fontSize: 11,
    color: '#555',
  },
  rivalBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  rivalBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.8,
  },
  contenderBadge: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#8B6914',
  },
  contenderBadgeText: {
    color: '#C9952A',
  },
  editActions: {
    gap: 10,
    marginTop: 8,
  },
  editBtn: {
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  editBtnText: {
    color: '#007AFF',
    fontWeight: '700',
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  cancelBtn: {
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  cancelBtnText: {
    color: '#888',
    fontWeight: '700',
    fontSize: 15,
  },
  restartBtn: {
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3D1215',
    marginTop: 8,
  },
  restartBtnText: {
    color: '#C0392B',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1.5,
  },
});
