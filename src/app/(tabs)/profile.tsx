import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { showDialog } from '../../components/AppDialog';
import PlayerName from '../../components/PlayerName';
import { useApp } from '../../context/AppContext';
import {
  BRACKET_INFO,
  COMMANDER_ONLY,
  SELECTABLE_GAMES,
  selectableFormats,
  visibleGames,
  GAME_COLOR,
  GAME_EMOJI,
  GAME_LABELS,
  GameType,
  NO_GO_OPTIONS,
  NoGoRule,
  UserProfile,
} from '../../data/types';
import { ShopItem } from '../../data/shop';
import { useUpdateProfileMutation } from '../../hooks/useProfileQueries';
import { useClaimStarterReward } from '../../hooks/useRewardQueries';
import { useEquipShopItemMutation, useOwnedShopItemsQuery, useShopItemsQuery } from '../../hooks/useShopQueries';
import { updatePassword } from '../../lib/auth-api';
import { ThemeColors, useThemeColors } from '../../utils/theme-utils';

const ALL_GAMES: GameType[] = SELECTABLE_GAMES;

// Dev Tools (src/app/dev-tools.tsx) is a testing scaffold, not part of the shipped MVP
// surface. Its working copy now lives on the dedicated `dev-tools` branch (and is still
// present, unchanged, on `unitTests`/`test/<feature>`) but has been removed from
// development/main — see CLAUDE.md git workflow. DEV_TOOLS_ENABLED documents that removal and
// gates the "DEVELOPER" badge below; it can't also gate the Dev Tools button itself, because
// that button's router.push('/dev-tools') call had to be deleted outright below (not just
// wrapped in a runtime check) — Expo Router's typedRoutes (app.json ->
// experiments.typedRoutes) type-checks route strings against files that exist in src/app/, so
// a call to a deleted route can't compile even behind `if (false)`. Restoring Dev Tools means
// re-adding dev-tools.tsx first (so the route re-appears in the generated types), then
// flipping this flag and re-adding the button (see this commit's diff).
const DEV_TOOLS_ENABLED = false;

/**
 * Profile tab — personal info, stats, game preferences, rivals, settings, and dev tools.
 * Header row shows an avatar circle on the left and display name / username / location on the right.
 * Settings section includes a dark/light mode toggle, a change-password form, and a Dev Tools
 * shortcut for developer accounts.
 * "Your Title" shows the player's name as others see it and lists the titles they own; tapping
 * one wears it, and "No title" takes it off. Buying happens in the Shop, which the row above
 * opens. Tapping a contender's badge makes them the player's Rival and confirms it.
 * Edits save via useUpdateProfileMutation directly (an optimistic Supabase update keyed to the
 * session id), not through AppContext's currentUser setter; logging out ends the Supabase
 * session and redirects to /sign-in rather than /profile-creation.
 * Parameters: none; reads currentUser, session, chosenRivalId, rivals, and theme from global context.
 * Returns: a scrollable profile page; null when no user is logged in.
 * Edge cases: shows bracket section only for MTG Commander; dev tools button hidden for
 * non-developer profiles; the password form validates a 6-character minimum and that both
 * fields match before ever calling Supabase, and shows an inline error or success message; a
 * player who owns no titles sees a pointer to the Shop instead of a picker; a title they own
 * that has since been taken off sale is not listed, though they keep wearing it if it is on.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const {
    session, currentUser, rivals, chosenRivalId, mostPlayedAgainst,
    clearCurrentUser, setChosenRivalId,
    theme, setTheme,
  } = useApp();
  const colors = useThemeColors();
  const { bg, card, border, textPrimary, textSecondary: textSec } = colors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const updateProfileMutation = useUpdateProfileMutation();
  const userId = session?.user.id;
  const shopItemsQuery = useShopItemsQuery();
  const ownedItemsQuery = useOwnedShopItemsQuery(userId);
  const equipMutation = useEquipShopItemMutation();
  const claimReward = useClaimStarterReward(userId);

  if (!currentUser) return null;

  const ownedItemIds = new Set(ownedItemsQuery.data ?? []);
  const ownedTitles = (shopItemsQuery.data ?? []).filter(
    (item) => item.kind === 'title' && ownedItemIds.has(item.id)
  );

  /**
   * Puts on one of the player's own titles, or takes the title off.
   * Parameters: item (an owned title, or null for no title).
   * Returns: a promise that resolves once the change is saved or refused.
   * Edge cases: does nothing when signed out, while another change is in flight, or when the
   * choice is what is already worn; a refusal from the server is shown and nothing changes.
   */
  const changeTitle = async (item: ShopItem | null) => {
    if (!userId || equipMutation.isPending) return;
    if ((item?.value ?? undefined) === (currentUser.title ?? undefined)) return;
    try {
      await equipMutation.mutateAsync({ userId, kind: 'title', itemId: item?.id ?? null });
      Haptics.selectionAsync();
      showDialog(
        item ? 'Title changed' : 'Title removed',
        item ? `You’re now “${item.value}”. It shows under your name everywhere.` : 'Your name now shows without a title.'
      );
    } catch (err) {
      showDialog('Couldn’t change your title', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  /**
   * Makes one of the player's rivals their main Rival and says so.
   * Parameters: rival (the contender or familiar foe whose badge was tapped).
   * Returns: void.
   * Edge cases: the pick is remembered on this device only; the first pick also earns the
   * one-time starter reward, which the server pays at most once.
   */
  const chooseRival = (rival: UserProfile) => {
    setChosenRivalId(rival.id);
    showDialog('Rival set', `${rival.displayName ?? rival.username} is now your Rival.`);
    claimReward('choose_rival');
  };

  const [editDisplayName, setEditDisplayNameState] = useState(currentUser.displayName ?? '');
  const [editLocation, setEditLocationState] = useState(currentUser.location);
  const [editGames, setEditGames] = useState<GameType[]>(currentUser.games);
  const [editBrackets, setEditBrackets] = useState<number[]>(currentUser.brackets);
  const [editFormats, setEditFormats] = useState(currentUser.preferredFormats);
  const [editNoGo, setEditNoGo] = useState<NoGoRule[]>(currentUser.noGo);
  const [dirty, setDirty] = useState(false);
  const [showGameModal, setShowGameModal] = useState(false);
  const [modalGames, setModalGames] = useState<GameType[]>(currentUser.games);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const setEditDisplayName = (v: string) => { setEditDisplayNameState(v); setDirty(true); };
  const setEditLocation = (v: string) => { setEditLocationState(v); setDirty(true); };

  const initials = (currentUser.displayName ?? currentUser.username)
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || currentUser.username.charAt(0).toUpperCase();

  const commanderSelected =
    COMMANDER_ONLY || (editGames.includes('mtg') && (editFormats?.mtg ?? []).includes('Commander'));

  const saveEdit = () => {
    if (!session) return;
    updateProfileMutation.mutate({
      userId: session.user.id,
      patch: {
        displayName: editDisplayName.trim() || undefined,
        location: editLocation.trim() || currentUser.location,
        games: editGames.length > 0 ? editGames : currentUser.games,
        brackets: editBrackets.length > 0 ? editBrackets : currentUser.brackets,
        preferredFormats: editFormats,
        noGo: editNoGo,
      },
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
    showDialog('Profile saved', 'Your changes are live.');
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

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess(false);
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setIsChangingPassword(true);
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not change password. Please try again.');
    } finally {
      setIsChangingPassword(false);
    }
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

  return (
    <ScrollView style={[styles.container, { backgroundColor: bg }]} contentContainerStyle={styles.content}>
      {dirty && (
        <View style={[styles.unsavedBanner, { backgroundColor: colors.unsavedBanner }]}>
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
          {DEV_TOOLS_ENABLED && currentUser.isDeveloper && (
            <View style={[styles.devBadge, { marginTop: 10 }]}>
              <Text style={styles.devBadgeText}>🔧 DEVELOPER</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Shop ── */}
      <Pressable
        style={[styles.shopRow, { backgroundColor: card, borderColor: border }]}
        onPress={() => router.push('/(tabs)/shop')}
        accessibilityRole="button"
        accessibilityLabel={`Open the shop. You have ${currentUser.pointBalance} points`}
      >
        <View style={styles.shopRowInfo}>
          <Text style={[styles.shopRowTitle, { color: textPrimary }]}>🛍️ Shop</Text>
          <Text style={[styles.shopRowSub, { color: textSec }]}>
            {currentUser.title ? `Wearing “${currentUser.title}”` : 'Titles, name colors, and card borders'}
          </Text>
        </View>
        <Text style={styles.shopRowPoints}>{currentUser.pointBalance} pts →</Text>
      </Pressable>

      {/* ── Title: see what is worn and switch between owned titles ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: textSec }]}>Your Title</Text>
        <View style={[styles.titlePreview, { backgroundColor: card, borderColor: border }]}>
          <PlayerName
            name={currentUser.displayName ?? currentUser.username}
            cosmetics={{ title: currentUser.title, nameColor: currentUser.nameColor }}
            style={[styles.titlePreviewName, { color: textPrimary }]}
            titleStyle={styles.titlePreviewTitle}
          />
          {!currentUser.title && (
            <Text style={[styles.titlePreviewEmpty, { color: textSec }]}>No title on</Text>
          )}
        </View>
        {ownedTitles.length === 0 ? (
          <Text style={[styles.titleHint, { color: textSec }]}>
            You don’t own a title yet. Pick one up in the Shop and it will appear here to wear.
          </Text>
        ) : (
          <View style={styles.chipRow}>
            {[null, ...ownedTitles].map((item) => {
              const active = (item?.value ?? undefined) === (currentUser.title ?? undefined);
              return (
                <Pressable
                  key={item?.id ?? 'none'}
                  style={[styles.chip, { borderColor: border, backgroundColor: card }, active && styles.titleChipActive]}
                  onPress={() => changeTitle(item)}
                  disabled={equipMutation.isPending}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item ? `Wear the title ${item.value}` : 'Wear no title'}
                >
                  <Text style={[styles.chipText, { color: textSec }, active && { color: colors.accentOnBg }]}>
                    {item ? item.value : 'No title'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Add Game modal ── */}
      {showGameModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: card, borderColor: border }]}>
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
                style={[styles.modalCancelBtn, { backgroundColor: border }]}
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

      {/* ── Games and formats: hidden while the app is Commander-only (see COMMANDER_ONLY) ── */}
      {!COMMANDER_ONLY && (
      <>
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
              {selectableFormats(game).map((fmt) => {
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
      </>
      )}

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
                <Text style={[styles.chipText, { color: textSec }, active && { color: colors.dangerOnBg }]}>{rule}</Text>
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
                    {rival.wins}W – {rival.losses}L · {visibleGames(rival.games).map((g) => GAME_EMOJI[g]).join(' ')}
                  </Text>
                  <Text style={[styles.rivalLocation, { color: textSec }]}>{rival.location}</Text>
                </View>
                {isChosen ? (
                  <View style={styles.rivalBadge}><Text style={styles.rivalBadgeText}>RIVAL</Text></View>
                ) : isFoe ? (
                  <Pressable style={[styles.rivalBadge, styles.foeBadge]}
                    onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); chooseRival(rival); }}>
                    <Text style={[styles.rivalBadgeText, styles.foeBadgeText]}>FAMILIAR FOE</Text>
                  </Pressable>
                ) : (
                  <Pressable style={[styles.rivalBadge, styles.contenderBadge]}
                    onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); chooseRival(rival); }}>
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

        <View style={[styles.settingsCard, { backgroundColor: card, borderColor: border }]}>
          <Pressable
            style={styles.passwordToggleRow}
            onPress={() => {
              Haptics.selectionAsync();
              setPasswordError('');
              setPasswordSuccess(false);
              setShowPasswordForm((v) => !v);
            }}
          >
            <Text style={[styles.settingsLabel, { color: textSec, marginBottom: 0 }]}>Change Password</Text>
            <Text style={[styles.passwordToggleArrow, { color: textSec }]}>{showPasswordForm ? '−' : '+'}</Text>
          </Pressable>

          {showPasswordForm && (
            <View style={styles.passwordForm}>
              <TextInput
                style={[styles.passwordInput, { color: textPrimary, borderColor: border }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password (min. 6 characters)"
                placeholderTextColor={textSec}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isChangingPassword}
              />
              <TextInput
                style={[styles.passwordInput, { color: textPrimary, borderColor: border }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor={textSec}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isChangingPassword}
              />
              {!!passwordError && <Text style={styles.passwordErrorText}>{passwordError}</Text>}
              {passwordSuccess && <Text style={styles.passwordSuccessText}>Password updated.</Text>}
              <Pressable
                style={[styles.passwordSubmitBtn, isChangingPassword && styles.passwordSubmitBtnDisabled]}
                onPress={handleChangePassword}
                disabled={isChangingPassword}
              >
                {isChangingPassword ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.passwordSubmitText}>Update Password</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* Dev Tools entry point removed along with src/app/dev-tools.tsx — see
            DEV_TOOLS_ENABLED above and CLAUDE.md git workflow. */}
      </View>

      {/* ── Save / Discard / Log Out ── */}
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
          style={styles.logoutBtn}
          onPress={() => showDialog(
            'Log Out',
            'Are you sure you want to log out?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log Out', style: 'destructive', onPress: () => { clearCurrentUser(); router.replace('/sign-in'); } },
            ]
          )}
        >
          <Text style={styles.logoutBtnText}>LOG OUT</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// Built per theme: every neutral and tinted color comes from ThemeColors, so the screen follows
// the light/dark setting. Only saturated accents that read on both stay as fixed values.
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 50 },
  unsavedBanner: {
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#E6A817', alignItems: 'center',
  },
  unsavedBannerText: { fontSize: 13, fontWeight: '700', color: c.warnText },

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
    backgroundColor: c.successBg, borderRadius: 6, paddingHorizontal: 8,
    paddingVertical: 3, alignSelf: 'flex-start',
  },
  devBadgeText: { fontSize: 10, fontWeight: '800', color: c.successText, letterSpacing: 1 },

  /* Sections */
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },
  sectionHint: { fontSize: 11, marginBottom: 10, marginTop: -8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gamePill: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1.5 },
  gamePillText: { fontSize: 13, fontWeight: '600' },
  addGameBtn: { borderStyle: 'dashed' },

  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  shopRowInfo: {
    flex: 1,
  },
  shopRowTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  shopRowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  shopRowPoints: {
    fontSize: 14,
    fontWeight: '800',
    color: '#007AFF',
  },

  titlePreview: { borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12 },
  titlePreviewName: { fontSize: 18, fontWeight: '800' },
  titlePreviewTitle: { fontSize: 13, marginTop: 2 },
  titlePreviewEmpty: { fontSize: 12, marginTop: 2 },
  titleHint: { fontSize: 12, lineHeight: 17 },
  titleChipActive: { backgroundColor: c.accentBg, borderColor: '#007AFF' },

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
  chipNoGo: { backgroundColor: c.dangerBg, borderColor: '#C0392B' },
  bracketRow: { flexDirection: 'row', gap: 8 },
  bracketBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  bracketBtnActive: { borderColor: '#007AFF', backgroundColor: c.accentBg },
  bracketNum: { fontSize: 20, fontWeight: '800' },
  bracketNumActive: { color: '#007AFF' },
  bracketLabel: { fontSize: 9, marginTop: 2 },

  /* Rivals */
  rivalCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1.5 },
  rivalCardChosen: { borderColor: '#FF3B30', backgroundColor: c.rivalMainBg },
  rivalCardFoe: { borderColor: '#5B3FCF', backgroundColor: c.rivalFamiliarFoeBg },
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
    borderWidth: 1.5, borderColor: c.border, backgroundColor: 'transparent',
  },
  themeBtnActive: { backgroundColor: c.accentBg, borderColor: '#007AFF' },
  themeBtnActiveLight: { backgroundColor: '#FFF8E0', borderColor: '#E6A817' },
  themeBtnText: { fontSize: 14, fontWeight: '700', color: c.textSecondary },
  passwordToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  passwordToggleArrow: { fontSize: 18, fontWeight: '700' },
  passwordForm: { marginTop: 14, gap: 10 },
  passwordInput: {
    borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14,
  },
  passwordErrorText: { fontSize: 12, color: '#C0392B', fontWeight: '600' },
  passwordSuccessText: { fontSize: 12, color: c.successText, fontWeight: '600' },
  passwordSubmitBtn: {
    backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  passwordSubmitBtnDisabled: { opacity: 0.6 },
  passwordSubmitText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  themeBtnTextActive: { color: '#007AFF' },
  themeBtnTextActiveLight: { color: '#8B6000' },
  devToolsBtn: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14,
    padding: 16, borderWidth: 1,
  },
  devToolsBtnText: { flex: 1, fontSize: 15, fontWeight: '700', color: c.successText },
  devToolsArrow: { fontSize: 18, color: c.successText },

  /* Actions */
  editActions: { gap: 10, marginTop: 8 },
  saveBtn: { backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  cancelBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  cancelBtnText: { fontWeight: '700', fontSize: 15 },
  logoutBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#C0392B', backgroundColor: 'transparent', marginTop: 8,
  },
  logoutBtnText: { color: '#C0392B', fontWeight: '800', fontSize: 13, letterSpacing: 1.5 },
});
