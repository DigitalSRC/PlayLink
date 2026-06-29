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

const ALL_GAMES: GameType[] = ['mtg', 'pokemon', 'lorcana', 'onepiece'];

/**
 * Profile tab — personal info, stats, game preferences, rivals, settings, and dev tools.
 * Header row shows an avatar circle on the left and display name / username / location on the right.
 * Settings section includes a dark/light mode toggle and a Dev Tools shortcut for developer accounts.
 * Parameters: none; reads and writes currentUser, chosenRivalId, rivals, and theme from global context.
 * Returns: a scrollable profile page; null when no user is logged in.
 * Edge cases: shows bracket section only for MTG Commander; dev tools button hidden for non-developer profiles.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const {
    currentUser, rivals, chosenRivalId, mostPlayedAgainst,
    setCurrentUser, clearCurrentUser, setChosenRivalId,
    theme, setTheme,
  } = useApp();

  if (!currentUser) return null;

  const [editDisplayName, setEditDisplayNameState] = useState(currentUser.displayName ?? '');
  const [editLocation, setEditLocationState] = useState(currentUser.location);
  const [editGames, setEditGames] = useState<GameType[]>(currentUser.games);
  const [editBrackets, setEditBrackets] = useState<number[]>(currentUser.brackets);
  const [editFormats, setEditFormats] = useState(currentUser.preferredFormats);
  const [editNoGo, setEditNoGo] = useState<NoGoRule[]>(currentUser.noGo);
  const [dirty, setDirty] = useState(false);
  const [showGameModal, setShowGameModal] = useState(false);
  const [modalGames, setModalGames] = useState<GameType[]>(currentUser.games);

  const setEditDisplayName = (v: string) => { setEditDisplayNameState(v); setDirty(true); };
  const setEditLocation = (v: string) => { setEditLocationState(v); setDirty(true); };

  const initials = (currentUser.displayName ?? currentUser.username)
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || currentUser.username.charAt(0).toUpperCase();

  const commanderSelected = editGames.includes('mtg') && (editFormats?.mtg ?? []).includes('Commander');

  const saveEdit = () => {
    setCurrentUser({
      ...currentUser,
      displayName: editDisplayName.trim() || undefined,
      location: editLocation.trim() || currentUser.location,
      games: editGames.length > 0 ? editGames : currentUser.games,
      brackets: editBrackets.length > 0 ? editBrackets : currentUser.brackets,
      preferredFormats: editFormats,
      noGo: editNoGo,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
  };

  const discardChanges = () => {
    setEditDisplayNameState(currentUser.displayName ?? '');
    setEditLocationState(currentUser.location);
    setEditGames(currentUser.games);
    setEditBrackets(currentUser.brackets);
    setEditFormats(currentUser.preferredFormats);
    setEditNoGo(currentUser.noGo);
    setDirty(false);
  };

  const toggleFormat = (game: GameType, fmt: string) => {
    setDirty(true);
    setEditFormats((prev) => {
      const cur = prev[game] ?? [];
      const updated = cur.includes(fmt) ? cur.filter((f) => f !== fmt) : [...cur, fmt];
      return { ...prev, [game]: updated };
    });
  };

  const toggleNoGo = (rule: NoGoRule) => {
    Haptics.selectionAsync();
    setDirty(true);
    setEditNoGo((prev) => prev.includes(rule) ? prev.filter((r) => r !== rule) : [...prev, rule]);
  };

  const allRivalsInSection = [
    ...rivals,
    ...(mostPlayedAgainst && !rivals.some((r) => r.id === mostPlayedAgainst.id) ? [mostPlayedAgainst] : []),
  ];

  const isDark = theme === 'dark';
  const bg = isDark ? '#0F0F14' : '#F2F2F7';
  const card = isDark ? '#1C1C24' : '#FFFFFF';
  const border = isDark ? '#2C2C38' : '#E0E0E8';
  const textPrimary = isDark ? '#FFFFFF' : '#000000';
  const textSec = isDark ? '#888' : '#666';

  return (
    <ScrollView style={[styles.container, { backgroundColor: bg }]} contentContainerStyle={styles.content}>
      {dirty && (
        <View style={[styles.unsavedBanner, { backgroundColor: isDark ? '#2A1F00' : '#FFF8E0' }]}>
          <Text style={styles.unsavedBannerText}>⚠️ You have unsaved changes</Text>
        </View>
      )}

      {/* ── Profile header: avatar + username left, labeled fields right ── */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarColumn}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={[styles.usernameTag, { color: textSec }]}>@{currentUser.username}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.fieldLabel, { color: textSec }]}>Display Name</Text>
          <TextInput
            style={[styles.displayNameInput, { color: textPrimary, borderColor: border }]}
            value={editDisplayName}
            onChangeText={setEditDisplayName}
            placeholder="Display name"
            placeholderTextColor={textSec}
            maxLength={32}
          />
          <Text style={[styles.fieldLabel, { color: textSec, marginTop: 10 }]}>My Location</Text>
          <TextInput
            style={[styles.locationInput, { color: textPrimary, borderColor: border }]}
            value={editLocation}
            onChangeText={setEditLocation}
            placeholder="Your area"
            placeholderTextColor={textSec}
          />
          {currentUser.isDeveloper && (
            <View style={[styles.devBadge, { marginTop: 10 }]}>
              <Text style={styles.devBadgeText}>🔧 DEVELOPER</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Add Game modal ── */}
      {showGameModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#1C1C24' : '#FFF', borderColor: border }]}>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>Games I Play</Text>
            <Text style={[styles.modalSub, { color: textSec }]}>Tap to select or deselect</Text>
            {ALL_GAMES.map((g) => {
              const selected = modalGames.includes(g);
              return (
                <Pressable
                  key={g}
                  style={[styles.modalGameRow, { borderColor: selected ? GAME_COLOR[g] : border, backgroundColor: selected ? GAME_COLOR[g] + '22' : 'transparent' }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setModalGames((prev) =>
                      prev.includes(g)
                        ? prev.length > 1 ? prev.filter((x) => x !== g) : prev
                        : [...prev, g]
                    );
                  }}
                >
                  <Text style={[styles.modalGameEmoji]}>{GAME_EMOJI[g]}</Text>
                  <Text style={[styles.modalGameLabel, { color: selected ? GAME_COLOR[g] : textPrimary }]}>
                    {GAME_LABELS[g]}
                  </Text>
                  {selected && <Text style={[styles.modalCheckmark, { color: GAME_COLOR[g] }]}>✓</Text>}
                </Pressable>
              );
            })}
            <View style={styles.modalBtns}>
              <Pressable
                style={[styles.modalCancelBtn, { backgroundColor: isDark ? '#2C2C38' : '#EEE' }]}
                onPress={() => { setModalGames(editGames); setShowGameModal(false); }}
              >
                <Text style={[styles.modalCancelText, { color: textSec }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmBtn}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setEditGames(modalGames);
                  setDirty(true);
                  setShowGameModal(false);
                }}
              >
                <Text style={styles.modalConfirmText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ── Games ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: textSec }]}>Games I Play</Text>
        <View style={styles.chipRow}>
          {editGames.map((g) => (
            <View key={g} style={[styles.gamePill, { borderColor: GAME_COLOR[g], backgroundColor: card }]}>
              <Text style={[styles.gamePillText, { color: textPrimary }]}>{GAME_EMOJI[g]} {GAME_LABELS[g]}</Text>
            </View>
          ))}
          <Pressable
            style={[styles.gamePill, styles.addGameBtn, { borderColor: isDark ? '#3C3C4C' : '#C0C0D0', backgroundColor: card }]}
            onPress={() => { setModalGames(editGames); setShowGameModal(true); }}
          >
            <Text style={[styles.gamePillText, { color: textSec }]}>+ Add Game</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Formats ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: textSec }]}>Preferred Formats</Text>
        {editGames.map((game) => (
          <View key={game} style={styles.gameFormatBlock}>
            <Text style={[styles.gameFormatTitle, { color: GAME_COLOR[game] }]}>
              {GAME_EMOJI[game]} {GAME_LABELS[game]}
            </Text>
            <View style={styles.chipRow}>
              {FORMAT_OPTIONS[game].map((fmt) => {
                const active = (editFormats[game] ?? []).includes(fmt);
                return (
                  <Pressable
                    key={fmt}
                    style={[styles.chip, { borderColor: border, backgroundColor: card },
                      active && { backgroundColor: GAME_COLOR[game], borderColor: GAME_COLOR[game] }]}
                    onPress={() => toggleFormat(game, fmt)}
                  >
                    <Text style={[styles.chipText, { color: textSec }, active && styles.chipTextActive]}>{fmt}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      {/* ── Brackets (Commander only) ── */}
      {commanderSelected && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textSec }]}>Commander Bracket</Text>
          <Text style={[styles.sectionHint, { color: textSec }]}>Wizards 1–5 · select all you play</Text>
          <View style={styles.bracketRow}>
            {[1, 2, 3, 4, 5].map((b) => {
              const active = editBrackets.includes(b);
              return (
                <Pressable
                  key={b}
                  style={[styles.bracketBtn, { borderColor: border, backgroundColor: card },
                    active && styles.bracketBtnActive]}
                  onPress={() => {
                    Haptics.selectionAsync(); setDirty(true);
                    setEditBrackets((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]);
                  }}
                >
                  <Text style={[styles.bracketNum, { color: textSec }, active && styles.bracketNumActive]}>{b}</Text>
                  <Text style={[styles.bracketLabel, { color: textSec }]}>{BRACKET_INFO[b].label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* ── No-Go ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: textSec }]}>Won't Play Against</Text>
        <View style={styles.chipRow}>
          {NO_GO_OPTIONS.map((rule) => {
            const active = editNoGo.includes(rule);
            return (
              <Pressable
                key={rule}
                style={[styles.chip, { borderColor: border, backgroundColor: card }, active && styles.chipNoGo]}
                onPress={() => toggleNoGo(rule)}
              >
                <Text style={[styles.chipText, { color: textSec }, active && styles.chipTextActive]}>{rule}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Rivals ── */}
      {allRivalsInSection.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textSec }]}>Rivals & Contenders</Text>
          <Text style={[styles.sectionHint, { color: textSec }]}>Tap card to view · tap badge to set as rival</Text>
          {allRivalsInSection.map((rival) => {
            const isChosen = rival.id === chosenRivalId;
            const isFoe = mostPlayedAgainst?.id === rival.id && !rivals.some((r) => r.id === rival.id);
            return (
              <Pressable
                key={rival.id}
                style={[styles.rivalCard, { backgroundColor: card, borderColor: border },
                  isChosen && styles.rivalCardChosen, isFoe && styles.rivalCardFoe]}
                onPress={() => router.push({ pathname: '/player-profile', params: { username: rival.username } })}
              >
                <View style={[styles.rivalAvatar, isChosen && styles.rivalAvatarChosen]}>
                  <Text style={styles.rivalInitial}>{rival.username.charAt(0) || '?'}</Text>
                </View>
                <View style={styles.rivalInfo}>
                  <Text style={[styles.rivalName, { color: textPrimary }]}>{rival.displayName ?? rival.username}</Text>
                  <Text style={[styles.rivalMeta, { color: textSec }]}>
                    {rival.wins}W – {rival.losses}L · {rival.games.map((g) => GAME_EMOJI[g]).join(' ')}
                  </Text>
                  <Text style={[styles.rivalLocation, { color: textSec }]}>{rival.location}</Text>
                </View>
                {isChosen ? (
                  <View style={styles.rivalBadge}><Text style={styles.rivalBadgeText}>RIVAL</Text></View>
                ) : isFoe ? (
                  <Pressable style={[styles.rivalBadge, styles.foeBadge]}
                    onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); setChosenRivalId(rival.id); }}>
                    <Text style={[styles.rivalBadgeText, styles.foeBadgeText]}>FAMILIAR FOE</Text>
                  </Pressable>
                ) : (
                  <Pressable style={[styles.rivalBadge, styles.contenderBadge]}
                    onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); setChosenRivalId(rival.id); }}>
                    <Text style={[styles.rivalBadgeText, styles.contenderBadgeText]}>CONTENDER</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ── Settings ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: textSec }]}>Settings</Text>

        <View style={[styles.settingsCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.settingsLabel, { color: textSec }]}>Theme</Text>
          <View style={styles.themeRow}>
            <Pressable
              style={[styles.themeBtn, isDark && styles.themeBtnActive]}
              onPress={() => { Haptics.selectionAsync(); setTheme('dark'); }}
            >
              <Text style={[styles.themeBtnText, isDark && styles.themeBtnTextActive]}>🌙 Dark</Text>
            </Pressable>
            <Pressable
              style={[styles.themeBtn, !isDark && styles.themeBtnActiveLight]}
              onPress={() => { Haptics.selectionAsync(); setTheme('light'); }}
            >
              <Text style={[styles.themeBtnText, !isDark && styles.themeBtnTextActiveLight]}>☀️ Light</Text>
            </Pressable>
          </View>
        </View>

        {currentUser.isDeveloper && (
          <Pressable
            style={[styles.devToolsBtn, { backgroundColor: card, borderColor: border }]}
            onPress={() => router.push('/dev-tools')}
          >
            <Text style={styles.devToolsBtnText}>🔧 Developer Tools</Text>
            <Text style={styles.devToolsArrow}>→</Text>
          </Pressable>
        )}
      </View>

      {/* ── Save / Discard / Restart ── */}
      <View style={styles.editActions}>
        {dirty && (
          <>
            <Pressable style={styles.saveBtn} onPress={saveEdit}>
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </Pressable>
            <Pressable style={[styles.cancelBtn, { backgroundColor: card, borderColor: border }]} onPress={discardChanges}>
              <Text style={[styles.cancelBtnText, { color: textSec }]}>Discard Changes</Text>
            </Pressable>
          </>
        )}
        <Pressable
          style={styles.restartBtn}
          onPress={() => Alert.alert(
            'Log Out',
            'Clear your profile and start over?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log Out', style: 'destructive', onPress: () => { clearCurrentUser(); router.replace('/profile-creation'); } },
            ]
          )}
        >
          <Text style={styles.restartBtnText}>LOG OUT / RESTART</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 50 },
  unsavedBanner: {
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#E6A817', alignItems: 'center',
  },
  unsavedBannerText: { fontSize: 13, fontWeight: '700', color: '#E6A817' },

  /* Profile header */
  profileHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 28, gap: 18 },
  avatarColumn: { alignItems: 'center', gap: 8, flexShrink: 0 },
  avatarCircle: {
    width: 144, height: 144, borderRadius: 72, backgroundColor: '#007AFF',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 52, fontWeight: '800', color: '#FFF' },
  usernameTag: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  profileInfo: { flex: 1, paddingTop: 4 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  displayNameInput: {
    fontSize: 17, fontWeight: '700', borderBottomWidth: 1,
    paddingVertical: 4, paddingHorizontal: 0,
  },
  locationInput: { fontSize: 14, borderBottomWidth: 1, paddingVertical: 4, paddingHorizontal: 0 },
  devBadge: {
    backgroundColor: '#0A2A0A', borderRadius: 6, paddingHorizontal: 8,
    paddingVertical: 3, alignSelf: 'flex-start',
  },
  devBadgeText: { fontSize: 10, fontWeight: '800', color: '#34C759', letterSpacing: 1 },

  /* Sections */
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },
  sectionHint: { fontSize: 11, marginBottom: 10, marginTop: -8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gamePill: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1.5 },
  gamePillText: { fontSize: 13, fontWeight: '600' },
  addGameBtn: { borderStyle: 'dashed' },

  /* Add Game modal */
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 99,
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    width: '88%', borderRadius: 20, padding: 24, borderWidth: 1,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalSub: { fontSize: 12, marginBottom: 18 },
  modalGameRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5,
    padding: 14, marginBottom: 10,
  },
  modalGameEmoji: { fontSize: 22, marginRight: 12 },
  modalGameLabel: { flex: 1, fontSize: 15, fontWeight: '700' },
  modalCheckmark: { fontSize: 18, fontWeight: '900' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '700' },
  modalConfirmBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#007AFF' },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  gameFormatBlock: { marginBottom: 14 },
  gameFormatTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5 },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  chipNoGo: { backgroundColor: '#3D1215', borderColor: '#C0392B' },
  bracketRow: { flexDirection: 'row', gap: 8 },
  bracketBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  bracketBtnActive: { borderColor: '#007AFF', backgroundColor: '#001A3D' },
  bracketNum: { fontSize: 20, fontWeight: '800' },
  bracketNumActive: { color: '#007AFF' },
  bracketLabel: { fontSize: 9, marginTop: 2 },

  /* Rivals */
  rivalCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5 },
  rivalCardChosen: { borderColor: '#FF3B30', backgroundColor: '#1F1012' },
  rivalCardFoe: { borderColor: '#5B3FCF', backgroundColor: '#12101F' },
  rivalAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#444', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rivalAvatarChosen: { backgroundColor: '#FF3B30' },
  rivalInitial: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  rivalInfo: { flex: 1 },
  rivalName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  rivalMeta: { fontSize: 12, marginBottom: 2 },
  rivalLocation: { fontSize: 11 },
  rivalBadge: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#FF3B30' },
  rivalBadgeText: { fontSize: 12, fontWeight: '800', color: '#FFF', letterSpacing: 0.8 },
  contenderBadge: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#8B6914' },
  contenderBadgeText: { color: '#C9952A' },
  foeBadge: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#5B3FCF' },
  foeBadgeText: { color: '#8B7FEF' },

  /* Settings */
  settingsCard: { borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1 },
  settingsLabel: { fontSize: 12, fontWeight: '700', marginBottom: 10 },
  themeRow: { flexDirection: 'row', gap: 10 },
  themeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#2C2C38', backgroundColor: 'transparent',
  },
  themeBtnActive: { backgroundColor: '#0A1030', borderColor: '#007AFF' },
  themeBtnActiveLight: { backgroundColor: '#FFF8E0', borderColor: '#E6A817' },
  themeBtnText: { fontSize: 14, fontWeight: '700', color: '#888' },
  themeBtnTextActive: { color: '#007AFF' },
  themeBtnTextActiveLight: { color: '#8B6000' },
  devToolsBtn: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14,
    padding: 16, borderWidth: 1,
  },
  devToolsBtnText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#34C759' },
  devToolsArrow: { fontSize: 18, color: '#34C759' },

  /* Actions */
  editActions: { gap: 10, marginTop: 8 },
  saveBtn: { backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  cancelBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  cancelBtnText: { fontWeight: '700', fontSize: 15 },
  restartBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#3D1215', backgroundColor: 'transparent', marginTop: 8,
  },
  restartBtnText: { color: '#C0392B', fontWeight: '800', fontSize: 13, letterSpacing: 1.5 },
});
