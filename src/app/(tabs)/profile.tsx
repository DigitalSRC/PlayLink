import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { showDialog } from '../../components/AppDialog';
import { showToast } from '../../components/AppToast';
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
import { formatBrackets } from '../../utils/group-utils';
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
 * The player's title is a headline under their photo with a small Change button, which opens a
 * picker listing every title they own plus "No title". Rivals come next. Settings that belong
 * to one game live behind a row under "Game Settings" (today: Commander's brackets and "won't
 * play against"), each opening its own sheet that saves by itself, so the page stays short as
 * more games and options are added. Tapping a contender's badge makes them the player's Rival.
 * Edits save via useUpdateProfileMutation directly (an optimistic Supabase update keyed to the
 * session id), not through AppContext's currentUser setter; logging out ends the Supabase
 * session and redirects to /sign-in rather than /profile-creation.
 * Parameters: currentUser (the signed-in player's profile, passed in by ProfileScreen so every
 * hook here can rely on it); reads session, chosenRivalId, rivals, and theme from global context.
 * Returns: a scrollable profile page.
 * Edge cases: shows bracket section only for MTG Commander; dev tools button hidden for
 * non-developer profiles; the password form validates a 6-character minimum and that both
 * fields match before ever calling Supabase, and shows an inline error or success message; a
 * player who owns no titles sees only "No title" and a link to the Shop in the picker; a title
 * they own that has since been taken off sale is not listed, though they keep wearing it if it
 * is on; the Commander sheet won't save with no bracket picked.
 */
function ProfileContent({ currentUser }: { currentUser: UserProfile }) {
  const router = useRouter();
  const {
    session, rivals, chosenRivalId, mostPlayedAgainst,
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

  const ownedItemIds = new Set(ownedItemsQuery.data ?? []);
  const ownedTitles = (shopItemsQuery.data ?? []).filter(
    (item) => item.kind === 'title' && ownedItemIds.has(item.id)
  );

  /**
   * Puts on one of the player's own titles, or takes the title off.
   * Parameters: item (an owned title, or null for no title).
   * Returns: a promise that resolves once the change is saved or refused.
   * Edge cases: does nothing when signed out or while another change is in flight; choosing
   * what is already worn just closes the picker; the picker is closed before any message is
   * shown, so the message is never hidden behind it; a refusal from the server is shown and
   * nothing changes.
   */
  const changeTitle = async (item: ShopItem | null) => {
    if (!userId || equipMutation.isPending) return;
    if ((item?.value ?? undefined) === (currentUser.title ?? undefined)) {
      setShowTitlePicker(false);
      return;
    }
    try {
      await equipMutation.mutateAsync({ userId, kind: 'title', itemId: item?.id ?? null });
      Haptics.selectionAsync();
      setShowTitlePicker(false);
      showToast(
        item ? 'Title changed' : 'Title removed',
        item ? `You’re now “${item.value}”.` : 'Your name now shows without a title.'
      );
    } catch (err) {
      setShowTitlePicker(false);
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
    showToast('Rival set', `${rival.displayName ?? rival.username} is now your Rival.`);
    claimReward('choose_rival');
  };

  const [editDisplayName, setEditDisplayNameState] = useState(currentUser.displayName ?? '');
  const [editLocation, setEditLocationState] = useState(currentUser.location);
  const [editGames, setEditGames] = useState<GameType[]>(currentUser.games);
  const [editFormats, setEditFormats] = useState(currentUser.preferredFormats);
  const [showTitlePicker, setShowTitlePicker] = useState(false);
  // Commander settings are edited in their own sheet, on a copy, and saved from there.
  const [showCommanderSheet, setShowCommanderSheet] = useState(false);
  const [draftBrackets, setDraftBrackets] = useState<number[]>(currentUser.brackets);
  const [draftNoGo, setDraftNoGo] = useState<NoGoRule[]>(currentUser.noGo);
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
        preferredFormats: editFormats,
      },
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
    showToast('Profile saved');
  };

  const discardChanges = () => {
    setEditDisplayNameState(currentUser.displayName ?? '');
    setEditLocationState(currentUser.location);
    setEditGames(currentUser.games);
    setEditFormats(currentUser.preferredFormats);
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

  /**
   * Opens the Commander settings sheet on a fresh copy of what is saved, so anything left
   * half-changed the last time the sheet was cancelled is forgotten.
   * Parameters: none.
   * Returns: void.
   * Edge cases: none.
   */
  const openCommanderSheet = () => {
    Haptics.selectionAsync();
    setDraftBrackets(currentUser.brackets);
    setDraftNoGo(currentUser.noGo);
    setShowCommanderSheet(true);
  };

  /**
   * Saves the Commander sheet's brackets and "won't play against" choices to the profile.
   * These save by themselves, separately from the page's own Save Changes button, so opening a
   * game's settings never leaves the rest of the page looking unsaved.
   * Parameters: none; reads the sheet's draft values.
   * Returns: void.
   * Edge cases: does nothing when signed out or with no bracket picked (the Save button is
   * disabled then, and the sheet says why); the sheet closes before the confirmation shows.
   */
  const saveCommanderSettings = () => {
    if (!session || draftBrackets.length === 0) return;
    updateProfileMutation.mutate({
      userId: session.user.id,
      patch: { brackets: [...draftBrackets].sort((a, b) => a - b), noGo: draftNoGo },
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowCommanderSheet(false);
    showToast('Commander settings saved');
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

      {/* ── Title: a headline under the photo, with a small button that opens the picker ── */}
      <View style={styles.titleHeader}>
        <Text
          style={[styles.titleHeaderText, { color: currentUser.title ? textPrimary : textSec }]}
          numberOfLines={2}
          accessibilityRole="header"
        >
          {currentUser.title ?? 'No title yet'}
        </Text>
        <Pressable
          style={[styles.titleChangeBtn, { borderColor: border, backgroundColor: card }]}
          onPress={() => { Haptics.selectionAsync(); setShowTitlePicker(true); }}
          accessibilityRole="button"
          accessibilityLabel={currentUser.title ? 'Change your title' : 'Choose a title'}
          hitSlop={6}
        >
          <Text style={[styles.titleChangeText, { color: colors.accentText }]}>{currentUser.title ? 'Change' : 'Choose'}</Text>
        </Pressable>
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

      {/* ── Game settings: one row per game, each opening its own sheet. A new game (or a new
          format with settings of its own) gets a row here and a sheet below, so this page never
          grows a section per option. ── */}
      {commanderSelected && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textSec }]}>Game Settings</Text>
          <Pressable
            style={[styles.shopRow, styles.settingsRow, { backgroundColor: card, borderColor: border }]}
            onPress={openCommanderSheet}
            accessibilityRole="button"
            accessibilityLabel="Open Commander settings"
          >
            <View style={styles.shopRowInfo}>
              <Text style={[styles.shopRowTitle, { color: textPrimary }]}>⚔️ Commander</Text>
              <Text style={[styles.shopRowSub, { color: textSec }]}>
                {formatBrackets(currentUser.brackets) || 'No bracket set'} · {currentUser.noGo.length === 0 ? 'Plays against anything' : `Won’t play: ${currentUser.noGo.join(', ')}`}
              </Text>
            </View>
            <Text style={[styles.settingsRowArrow, { color: textSec }]}>→</Text>
          </Pressable>
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

      {/* ── Title picker ── */}
      <Modal visible={showTitlePicker} transparent animationType="fade" onRequestClose={() => setShowTitlePicker(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowTitlePicker(false)} accessibilityLabel="Close">
          <Pressable style={[styles.sheetCard, { backgroundColor: card, borderColor: border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>Your Title</Text>
            <Text style={[styles.modalSub, { color: textSec }]}>
              {ownedTitles.length === 0 ? 'You don’t own a title yet.' : 'Pick the one that shows under your name.'}
            </Text>
            <ScrollView style={styles.sheetScroll}>
              {[null, ...ownedTitles].map((item) => {
                const active = (item?.value ?? undefined) === (currentUser.title ?? undefined);
                return (
                  <Pressable
                    key={item?.id ?? 'none'}
                    style={[styles.titleOption, { borderColor: active ? '#007AFF' : border, backgroundColor: active ? colors.accentBg : 'transparent' }]}
                    onPress={() => changeTitle(item)}
                    disabled={equipMutation.isPending}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item ? `Wear the title ${item.value}` : 'Wear no title'}
                  >
                    <Text style={[styles.titleOptionText, { color: active ? colors.accentOnBg : item ? textPrimary : textSec }]}>
                      {item ? item.value : 'No title'}
                    </Text>
                    {active && <Text style={[styles.titleOptionCheck, { color: colors.accentOnBg }]}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              style={styles.sheetLink}
              onPress={() => { setShowTitlePicker(false); router.push('/(tabs)/shop'); }}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetLinkText, { color: colors.accentText }]}>Get more titles in the Shop →</Text>
            </Pressable>
            <Pressable
              style={[styles.modalCancelBtn, styles.sheetClose, { backgroundColor: border }]}
              onPress={() => setShowTitlePicker(false)}
              accessibilityRole="button"
            >
              <Text style={[styles.modalCancelText, { color: textSec }]}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Commander settings ── */}
      <Modal visible={showCommanderSheet} transparent animationType="fade" onRequestClose={() => setShowCommanderSheet(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowCommanderSheet(false)} accessibilityLabel="Close">
          <Pressable style={[styles.sheetCard, { backgroundColor: card, borderColor: border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>Commander Settings</Text>
            <ScrollView style={styles.sheetScroll}>
              <Text style={[styles.sectionTitle, styles.sheetSectionTitle, { color: textSec }]}>Bracket</Text>
              <Text style={[styles.sectionHint, { color: textSec }]}>Wizards 1–5 · select all you play</Text>
              <View style={styles.bracketRow}>
                {[1, 2, 3, 4, 5].map((b) => {
                  const active = draftBrackets.includes(b);
                  return (
                    <Pressable
                      key={b}
                      style={[styles.bracketBtn, { borderColor: border, backgroundColor: bg }, active && styles.bracketBtnActive]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setDraftBrackets((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Bracket ${b}, ${BRACKET_INFO[b].label}`}
                    >
                      <Text style={[styles.bracketNum, { color: textSec }, active && styles.bracketNumActive]}>{b}</Text>
                      <Text style={[styles.bracketLabel, { color: textSec }]}>{BRACKET_INFO[b].label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.sectionTitle, styles.sheetSectionTitle, { color: textSec }]}>Won’t Play Against</Text>
              <View style={styles.chipRow}>
                {NO_GO_OPTIONS.map((rule) => {
                  const active = draftNoGo.includes(rule);
                  return (
                    <Pressable
                      key={rule}
                      style={[styles.chip, { borderColor: border, backgroundColor: bg }, active && styles.chipNoGo]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setDraftNoGo((prev) => prev.includes(rule) ? prev.filter((r) => r !== rule) : [...prev, rule]);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.chipText, { color: textSec }, active && { color: colors.dangerOnBg }]}>{rule}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            {draftBrackets.length === 0 && (
              <Text style={styles.passwordErrorText}>Pick at least one bracket you play.</Text>
            )}
            <View style={styles.modalBtns}>
              <Pressable
                style={[styles.modalCancelBtn, { backgroundColor: border }]}
                onPress={() => setShowCommanderSheet(false)}
                accessibilityRole="button"
              >
                <Text style={[styles.modalCancelText, { color: textSec }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirmBtn, draftBrackets.length === 0 && styles.passwordSubmitBtnDisabled]}
                onPress={saveCommanderSettings}
                disabled={draftBrackets.length === 0}
                accessibilityRole="button"
              >
                <Text style={styles.modalConfirmText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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

/**
 * The Profile tab's route. It only waits for the signed-in player's profile and then hands it to
 * ProfileContent, which holds the whole page.
 * Keeping the wait out here means ProfileContent's form state can start from the profile's
 * values without any hook having to run after an early return.
 * Parameters: none; reads currentUser from global context.
 * Returns: the profile page, or null when no user is logged in.
 * Edge cases: the tab layout redirects before this renders without a profile, so null is only
 * ever seen for a moment during sign-out.
 */
export default function ProfileScreen() {
  const { currentUser } = useApp();
  if (!currentUser) return null;
  return <ProfileContent currentUser={currentUser} />;
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

  /* Title headline, under the photo */
  titleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -12, marginBottom: 22 },
  titleHeaderText: { flex: 1, fontSize: 26, fontWeight: '900', fontStyle: 'italic', lineHeight: 30 },
  titleChangeBtn: { borderRadius: 16, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 12 },
  titleChangeText: { fontSize: 12, fontWeight: '700' },

  /* Game settings rows, and the sheets they and the title button open */
  settingsRow: { marginBottom: 0 },
  settingsRowArrow: { fontSize: 18, fontWeight: '700' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheetCard: { width: '100%', maxWidth: 460, maxHeight: '85%', borderRadius: 20, borderWidth: 1, padding: 22 },
  sheetScroll: { flexGrow: 0 },
  sheetSectionTitle: { marginTop: 14 },
  sheetLink: { paddingVertical: 12, alignItems: 'center' },
  sheetLinkText: { fontSize: 14, fontWeight: '700' },
  sheetClose: { flex: 0 },
  titleOption: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5,
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
  },
  titleOptionText: { flex: 1, fontSize: 15, fontWeight: '700' },
  titleOptionCheck: { fontSize: 16, fontWeight: '900' },

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
