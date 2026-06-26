import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { useApp } from '../../context/AppContext';
import { Group } from '../../data/groups';
import {
  BRACKET_INFO,
  DAYS_OF_WEEK,
  FORMAT_OPTIONS,
  GAME_COLOR,
  GAME_EMOJI,
  GAME_LABELS,
  GameType,
  NO_GO_OPTIONS,
  NoGoRule,
} from '../../data/types';
import { formatBrackets, generateJoinCode } from '../../utils/group-utils';

type FilterType = GameType | 'all' | 'myGames';
const ALL_GAME_FILTERS: FilterType[] = ['myGames', 'all', 'mtg', 'pokemon', 'lorcana', 'onepiece'];

/**
 * Browse tab showing open groups filterable by game type, defaulting to the user's preferred games.
 * Supports joining groups via a 6-character join code entered through the # Code toggle in the top bar.
 * The create-group form auto-fills game, format, bracket, no-go rules, and location from the current user's preferences.
 * Parameters: none; reads groups, currentUser, and rivals from global context; accepts openCreate route param to open the form on load.
 * Returns: a scrollable list of group cards with filter chips, an inline create form, and a code-entry bar.
 * Edge cases: join by code alerts when the code is wrong length, not found, group is full, or user is already in a group; create is blocked if required fields are empty.
 */
export default function BrowseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { currentUser, groups, setGroups, awardPoints, rivals } = useApp();

  const [filter, setFilter] = useState<FilterType>('myGames');
  const [showCreate, setShowCreate] = useState(false);
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [codeValue, setCodeValue] = useState('');

  const [newName, setNewName] = useState('');
  const [newGame, setNewGame] = useState<GameType>('mtg');
  const [newFormat, setNewFormat] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDay, setNewDay] = useState('');
  const [newHour, setNewHour] = useState(7);
  const [newMinute, setNewMinute] = useState(0);
  const [newPeriod, setNewPeriod] = useState<'AM' | 'PM'>('PM');
  const [newTarget, setNewTarget] = useState('4');
  const [newBrackets, setNewBrackets] = useState<number[]>([2]);
  const [newNoGo, setNewNoGo] = useState<NoGoRule[]>([]);

  const [feedbackMsg, setFeedbackMsg] = useState('');
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const feedbackScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (params.openCreate === '1') setShowCreate(true);
  }, [params.openCreate]);

  useEffect(() => {
    if (showCreate && currentUser) {
      const primaryGame = currentUser.games[0] ?? 'mtg';
      const primaryFormat = (currentUser.preferredFormats[primaryGame] ?? [])[0] ?? '';
      setNewGame(primaryGame);
      setNewFormat(primaryFormat);
      setNewBrackets(currentUser.brackets.length > 0 ? [...currentUser.brackets] : [2]);
      setNewNoGo([...currentUser.noGo]);
      setNewLocation(currentUser.location);
    }
  }, [showCreate]);

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    feedbackOpacity.setValue(0);
    feedbackScale.setValue(0.8);
    Animated.parallel([
      Animated.spring(feedbackScale, { toValue: 1, useNativeDriver: true, bounciness: 10 }),
      Animated.timing(feedbackOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(feedbackOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
      }, 2000);
    });
  };

  const displayUser = currentUser?.username ?? 'Player';
  const currentUserGroup = groups.find((g) =>
    g.players.some((p) => p.username === displayUser)
  );

  const filtered =
    filter === 'all'
      ? groups
      : filter === 'myGames'
      ? groups.filter((g) => currentUser?.games.includes(g.gameType))
      : groups.filter((g) => g.gameType === filter);

  const handleJoinByCode = () => {
    if (!currentUser) return;
    const code = codeValue.toUpperCase().trim();
    if (code.length !== 6) {
      Alert.alert('Invalid code', 'Join codes are 6 characters long.');
      return;
    }
    const group = groups.find((g) => g.joinCode === code);
    if (!group) {
      Alert.alert('Code not found', 'No group matches that join code. Double-check with the host.');
      return;
    }
    if (currentUserGroup) {
      Alert.alert('Already in a group', 'Leave your current group before joining another.');
      return;
    }
    if (group.players.length >= group.targetPlayers) {
      Alert.alert('Group full', 'This group has no open spots.');
      return;
    }
    setCodeValue('');
    setShowCodeEntry(false);
    handleJoin(group);
  };

  const handleJoin = (group: Group) => {
    if (!currentUser) return;
    if (currentUserGroup) {
      Alert.alert('Already in a group', 'Leave your current group before joining another.');
      return;
    }
    if (group.players.length >= group.targetPlayers) {
      Alert.alert('Group full', 'This group has no open spots.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setGroups((prev) =>
      prev.map((g) =>
        g.id === group.id
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

    showFeedback(`Joined ${group.name}!`);
  };

  const handleCreate = () => {
    if (!currentUser) return;
    if (currentUserGroup) {
      Alert.alert('Already in a group', 'Leave your current group first.');
      return;
    }
    if (!newName.trim() || !newLocation.trim()) {
      Alert.alert('Missing info', 'Group name and location are required.');
      return;
    }

    const resolvedFormat = newFormat || FORMAT_OPTIONS[newGame][0];
    const group: Group = {
      id: Date.now(),
      name: newName.trim(),
      joinCode: generateJoinCode(groups),
      createdAt: Date.now(),
      roundsPlayed: 0,
      gameType: newGame,
      format: resolvedFormat,
      brackets: resolvedFormat === 'Commander' && newBrackets.length > 0 ? newBrackets : [2],
      location: newLocation.trim(),
      time: newDay ? `${newDay} · ${newHour}:${String(newMinute).padStart(2, '0')} ${newPeriod}` : 'TBD',
      players: [
        {
          id: Date.now() + 1,
          username: displayUser,
          bracket: currentUser.brackets[0] ?? 2,
          location: currentUser.location,
          role: 'Host',
        },
      ],
      targetPlayers: Math.max(2, Number(newTarget) || 4),
      noGo: newNoGo,
      confirmed: false,
    };

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setGroups((prev) => [group, ...prev]);
    setShowCreate(false);
    setNewName('');
    setNewDay('');
    setNewHour(7);
    setNewMinute(0);
    setNewPeriod('PM');
    setNewTarget('4');
    showFeedback('Group created!');
  };

  const toggleBracket = (b: number) => {
    Haptics.selectionAsync();
    if (newFormat === 'Commander') {
      setNewBrackets((prev) =>
        prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
      );
    } else {
      setNewBrackets([b]);
    }
  };

  const toggleNoGo = (rule: NoGoRule) => {
    setNewNoGo((prev) =>
      prev.includes(rule) ? prev.filter((r) => r !== rule) : [...prev, rule]
    );
  };

  return (
    <View style={styles.container}>
      {/* Feedback banner */}
      <Animated.View
        style={[styles.feedbackBanner, { opacity: feedbackOpacity, transform: [{ scale: feedbackScale }] }]}
        pointerEvents="none"
      >
        <Text style={styles.feedbackText}>{feedbackMsg}</Text>
      </Animated.View>

      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Find a Game</Text>
        <View style={styles.topBarActions}>
          <Pressable
            style={[styles.createToggle, showCodeEntry && styles.codeToggleActive]}
            onPress={() => { Haptics.selectionAsync(); setShowCodeEntry((v) => !v); setShowCreate(false); setCodeValue(''); }}
          >
            <Text style={[styles.createToggleText, showCodeEntry && styles.codeToggleText]}>{showCodeEntry ? '✕' : '# Code'}</Text>
          </Pressable>
          <Pressable
            style={[styles.createToggle, showCreate && styles.createToggleActive]}
            onPress={() => { Haptics.selectionAsync(); setShowCreate((v) => !v); setShowCodeEntry(false); setCodeValue(''); }}
          >
            <Text style={styles.createToggleText}>{showCreate ? '✕ Close' : '+ Create'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Join by code */}
      {showCodeEntry && (
        <View style={styles.codeEntryBar}>
          <TextInput
            style={styles.codeInput}
            value={codeValue}
            onChangeText={(t) => setCodeValue(t.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))}
            placeholder="XXXXXX"
            placeholderTextColor="#444"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
          />
          <Pressable style={styles.codeJoinBtn} onPress={handleJoinByCode}>
            <Text style={styles.codeJoinText}>Join →</Text>
          </Pressable>
        </View>
      )}

      {/* Game filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {ALL_GAME_FILTERS.map((f) => {
          const active = filter === f;
          const chipColor = f === 'myGames' ? '#34C759' : f === 'all' ? '#007AFF' : GAME_COLOR[f as GameType];
          return (
            <Pressable
              key={f}
              style={[styles.filterChip, active && { backgroundColor: chipColor, borderColor: 'transparent' }]}
              onPress={() => { Haptics.selectionAsync(); setFilter(f); }}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {f === 'myGames' ? '🎮 My Games' : f === 'all' ? 'All Games' : `${GAME_EMOJI[f as GameType]} ${GAME_LABELS[f as GameType]}`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {/* Create form */}
        {showCreate && (
          <View style={styles.createForm}>
            <Text style={styles.createTitle}>Post a Group</Text>

            <Text style={styles.fieldLabel}>Game</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gamePickerRow}>
              {(['mtg', 'pokemon', 'lorcana', 'onepiece'] as GameType[]).map((g) => (
                <Pressable
                  key={g}
                  style={[styles.gamePicker, newGame === g && { borderColor: GAME_COLOR[g], backgroundColor: GAME_COLOR[g] + '22' }]}
                  onPress={() => { setNewGame(g); setNewFormat(''); setNewBrackets([2]); }}
                >
                  <Text style={styles.gamePickerEmoji}>{GAME_EMOJI[g]}</Text>
                  <Text style={[styles.gamePickerLabel, newGame === g && { color: GAME_COLOR[g] }]}>
                    {GAME_LABELS[g]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Format</Text>
            <View style={styles.chipRow}>
              {FORMAT_OPTIONS[newGame].map((fmt) => (
                <Pressable
                  key={fmt}
                  style={[styles.chip, newFormat === fmt && { backgroundColor: GAME_COLOR[newGame], borderColor: GAME_COLOR[newGame] }]}
                  onPress={() => setNewFormat(fmt)}
                >
                  <Text style={[styles.chipText, newFormat === fmt && styles.chipTextActive]}>{fmt}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Group Name</Text>
            <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="e.g. Saturday Grind" placeholderTextColor="#555" />

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput style={styles.input} value={newLocation} onChangeText={setNewLocation} placeholder="e.g. Downtown Library" placeholderTextColor="#555" />

            <Text style={styles.fieldLabel}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timePickerContent}>
              {DAYS_OF_WEEK.map((day) => (
                <Pressable
                  key={day}
                  style={[styles.chip, newDay === day && styles.chipTimeActive]}
                  onPress={() => { setNewDay(day); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.chipText, newDay === day && styles.chipTextActive]}>{day}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Time</Text>
            <View style={styles.timePicker}>
              <View style={styles.timeUnit}>
                <Pressable style={styles.timeArrow} onPress={() => { Haptics.selectionAsync(); setNewHour((h) => h === 12 ? 1 : h + 1); }}>
                  <Text style={styles.timeArrowText}>▲</Text>
                </Pressable>
                <Text style={styles.timeValue}>{String(newHour).padStart(2, '0')}</Text>
                <Pressable style={styles.timeArrow} onPress={() => { Haptics.selectionAsync(); setNewHour((h) => h === 1 ? 12 : h - 1); }}>
                  <Text style={styles.timeArrowText}>▼</Text>
                </Pressable>
              </View>
              <Text style={styles.timeSeparator}>:</Text>
              <View style={styles.timeUnit}>
                <Pressable style={styles.timeArrow} onPress={() => { Haptics.selectionAsync(); setNewMinute((m) => (m + 15) % 60); }}>
                  <Text style={styles.timeArrowText}>▲</Text>
                </Pressable>
                <Text style={styles.timeValue}>{String(newMinute).padStart(2, '0')}</Text>
                <Pressable style={styles.timeArrow} onPress={() => { Haptics.selectionAsync(); setNewMinute((m) => m === 0 ? 45 : m - 15); }}>
                  <Text style={styles.timeArrowText}>▼</Text>
                </Pressable>
              </View>
              <View style={styles.timePeriod}>
                <Pressable style={[styles.periodBtn, newPeriod === 'AM' && styles.periodBtnActive]} onPress={() => { Haptics.selectionAsync(); setNewPeriod('AM'); }}>
                  <Text style={[styles.periodText, newPeriod === 'AM' && styles.periodTextActive]}>AM</Text>
                </Pressable>
                <Pressable style={[styles.periodBtn, newPeriod === 'PM' && styles.periodBtnActive]} onPress={() => { Haptics.selectionAsync(); setNewPeriod('PM'); }}>
                  <Text style={[styles.periodText, newPeriod === 'PM' && styles.periodTextActive]}>PM</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Players Needed</Text>
              <TextInput style={styles.input} value={newTarget} onChangeText={setNewTarget} keyboardType="numeric" placeholderTextColor="#555" />
            </View>

            {newGame !== 'mtg' && (
              <Text style={styles.comingSoonNote}>
                ⏳ PlayLink is currently focused on MTG Commander. Full {GAME_LABELS[newGame]} support is planned — basic grouping and rivals available now.
              </Text>
            )}
            {newGame === 'mtg' && newFormat !== '' && newFormat !== 'Commander' && (
              <Text style={styles.comingSoonNote}>
                ⏳ Bracket preferences are available for Commander groups. Other MTG formats support basic grouping and rivals.
              </Text>
            )}

            {newGame === 'mtg' && newFormat === 'Commander' && (
              <>
                <Text style={styles.fieldLabel}>Bracket (select all that apply)</Text>
                <View style={styles.chipRow}>
                  {([1, 2, 3, 4, 5] as number[]).map((b) => {
                    const active = newBrackets.includes(b);
                    return (
                      <Pressable
                        key={b}
                        style={[styles.chip, active && styles.chipBracketActive]}
                        onPress={() => toggleBracket(b)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {BRACKET_INFO[b].label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>No-Go Rules</Text>
            <View style={styles.chipRow}>
              {NO_GO_OPTIONS.map((rule) => {
                const active = newNoGo.includes(rule);
                return (
                  <Pressable
                    key={rule}
                    style={[styles.chip, active && styles.chipNoGo]}
                    onPress={() => toggleNoGo(rule)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{rule}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.postBtn} onPress={handleCreate}>
              <Text style={styles.postBtnText}>Post Group</Text>
            </Pressable>
          </View>
        )}

        {/* Group cards */}
        {filtered.length === 0 && (
          <Text style={styles.emptyText}>No groups found for this game type.</Text>
        )}
        {filtered.map((group) => {
          const inThisGroup = group.players.some((p) => p.username === displayUser);
          const isFull = group.players.length >= group.targetPlayers;
          const rivalInGroup = rivals.some((r) =>
            group.players.some((p) => p.username === r.username)
          );
          return (
            <Pressable
              key={group.id}
              style={[styles.groupCard, rivalInGroup && styles.groupCardRival]}
              onPress={() => router.push({ pathname: '/group-detail', params: { id: group.id } })}
            >
              <View style={styles.cardTop}>
                <View style={[styles.gameBadge, { backgroundColor: GAME_COLOR[group.gameType] + '22', borderColor: GAME_COLOR[group.gameType] }]}>
                  <Text style={[styles.gameBadgeText, { color: GAME_COLOR[group.gameType] }]}>
                    {GAME_EMOJI[group.gameType]} {group.format}
                  </Text>
                </View>
                {rivalInGroup && (
                  <View style={styles.rivalGroupBadge}>
                    <Text style={styles.rivalGroupBadgeText}>⚔️ RIVAL HERE</Text>
                  </View>
                )}
                {isFull && !rivalInGroup && (
                  <View style={styles.fullBadge}><Text style={styles.fullBadgeText}>FULL</Text></View>
                )}
              </View>

              <Text style={styles.groupName}>{group.name}</Text>
              <Text style={styles.groupMeta}>
                {group.players.length}/{group.targetPlayers} players{group.format === 'Commander' ? ` · ${formatBrackets(group.brackets)}` : ''}
              </Text>
              <Text style={styles.groupMeta}>{group.location} · {group.time}</Text>

              {group.noGo.length > 0 && (
                <Text style={styles.noGoText}>🚫 No {group.noGo.join(', ')}</Text>
              )}

              <View style={styles.cardBottom}>
                {inThisGroup ? (
                  <View style={styles.inGroupBadge}>
                    <Text style={styles.inGroupText}>✓ You're in this group</Text>
                  </View>
                ) : (
                  <Pressable
                    style={[styles.joinBtn, isFull && styles.joinBtnDisabled]}
                    onPress={(e) => { e.stopPropagation(); handleJoin(group); }}
                    disabled={isFull}
                  >
                    <Text style={styles.joinBtnText}>{isFull ? 'Full' : 'Join →'}</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  feedbackBanner: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    backgroundColor: '#34C759',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    zIndex: 99,
  },
  feedbackText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  codeToggleActive: {
    backgroundColor: '#1A2A1A',
    borderColor: '#34C759',
  },
  codeToggleText: {
    color: '#34C759',
  },
  codeEntryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  codeInput: {
    flex: 1,
    backgroundColor: '#1C1C24',
    borderWidth: 1.5,
    borderColor: '#34C759',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    fontSize: 22,
    fontWeight: '800',
    color: '#34C759',
    letterSpacing: 6,
    textAlign: 'center',
  },
  codeJoinBtn: {
    backgroundColor: '#34C759',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  codeJoinText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFF',
  },
  createToggle: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#007AFF',
  },
  createToggleActive: {
    backgroundColor: '#1C2940',
  },
  createToggleText: {
    color: '#007AFF',
    fontWeight: '700',
    fontSize: 13,
  },
  filterRow: {
    paddingLeft: 20,
    marginBottom: 10,
    flexGrow: 0,
  },
  filterContent: {
    paddingRight: 20,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#2C2C38',
    backgroundColor: '#1C1C24',
    marginRight: 0,
  },
  filterChipText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  createForm: {
    backgroundColor: '#1C1C24',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  createTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 6,
  },
  gamePickerRow: {
    flexGrow: 0,
    marginBottom: 4,
  },
  gamePicker: {
    alignItems: 'center',
    backgroundColor: '#0F0F14',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2C2C38',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
    minWidth: 90,
  },
  gamePickerEmoji: {
    fontSize: 18,
    marginBottom: 4,
  },
  gamePickerLabel: {
    fontSize: 10,
    color: '#888',
    fontWeight: '600',
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#333',
    backgroundColor: '#0F0F14',
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
  chipBracketActive: {
    backgroundColor: '#001A33',
    borderColor: '#007AFF',
  },
  chipTimeActive: {
    backgroundColor: '#001A33',
    borderColor: '#007AFF',
  },
  timePickerContent: {
    gap: 6,
    paddingBottom: 4,
  },
  timePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C38',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 4,
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
    fontSize: 14,
    fontWeight: '700',
  },
  timeValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFF',
    minWidth: 42,
    textAlign: 'center',
  },
  timeSeparator: {
    fontSize: 26,
    fontWeight: '800',
    color: '#555',
    marginBottom: 2,
  },
  timePeriod: {
    gap: 6,
    marginLeft: 4,
  },
  periodBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#333',
    backgroundColor: '#1C1C24',
  },
  periodBtnActive: {
    backgroundColor: '#001A33',
    borderColor: '#007AFF',
  },
  periodText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  periodTextActive: {
    color: '#007AFF',
  },
  input: {
    backgroundColor: '#0F0F14',
    borderWidth: 1,
    borderColor: '#2C2C38',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#FFF',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  halfField: {
    flex: 1,
  },
  comingSoonNote: {
    fontSize: 11,
    color: '#555',
    fontStyle: 'italic',
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 16,
  },
  postBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  postBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  emptyText: {
    color: '#555',
    textAlign: 'center',
    marginTop: 60,
    fontSize: 15,
  },
  groupCard: {
    backgroundColor: '#1C1C24',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  groupCardRival: {
    borderColor: '#FF3B30',
    borderWidth: 2,
    backgroundColor: '#1E1214',
  },
  rivalGroupBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
  },
  rivalGroupBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  gameBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  gameBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  fullBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  fullBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.5,
  },
  groupName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 5,
  },
  groupMeta: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  noGoText: {
    fontSize: 11,
    color: '#C0392B',
    marginTop: 5,
  },
  cardBottom: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  joinBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  joinBtnDisabled: {
    backgroundColor: '#2C2C38',
  },
  joinBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  inGroupBadge: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#0D2A15',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  inGroupText: {
    color: '#34C759',
    fontSize: 12,
    fontWeight: '700',
  },
});
