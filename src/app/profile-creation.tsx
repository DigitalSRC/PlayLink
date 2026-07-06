import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useApp } from "../context/AppContext";
import {
  BRACKET_INFO,
  FORMAT_OPTIONS,
  GAME_COLOR,
  GAME_EMOJI,
  GAME_LABELS,
  GameType,
  NO_GO_OPTIONS,
  NoGoRule,
  UserProfile,
} from "../data/types";
import { useCreateProfileMutation } from "../hooks/useProfileQueries";
import { fetchRivalCandidates, UsernameTakenError, updateProfile } from "../lib/profile-api";
import { findRivals } from "../utils/rival-utils";

// Ordered labels for the four-step onboarding flow displayed in the progress indicator.
// Index corresponds to the currentStep state value; length determines total step count for the progress bar.
// Changing this array requires updating all step-index comparisons throughout ProfileCreation.
const STEPS = ["Identity", "Games", "Preferences", "Your Rivals"];

// A user who signs up, fills in part of this form, then closes the app (or the app crashes,
// or they just get pulled away) comes back to a blank step 0 on remount — there's nowhere else
// this WIP state lives, since the real profiles row isn't written until step 2 completes. This
// key namespaces a local snapshot of that WIP state per signed-in user so it survives a remount.
const draftStorageKey = (userId: string) => `profile-creation-draft:${userId}`;

interface ProfileCreationDraft {
  step: number;
  username: string;
  displayName: string;
  location: string;
  selectedGames: GameType[];
  selectedFormats: Partial<Record<GameType, string[]>>;
  selectedBrackets: number[];
  selectedNoGo: NoGoRule[];
}

/**
 * Multi-step onboarding screen that collects the player's full profile.
 * Steps: identity (username + location), game selection, preferences (formats, bracket, no-go), rival reveal.
 * On the games-to-preferences transition, writes the profile to Supabase (createProfileMutation,
 * keyed to the signed-in user's session id), fetches a pool of other real profiles
 * (fetchRivalCandidates) to run findRivals against, then advances to the reveal step.
 * Parameters: none; reads the Supabase session from useApp() to attribute the new profile row.
 * Returns: a React Native screen with animated step transitions and haptic feedback on progression.
 * Edge cases: blocks progression if required fields are missing; shows a field-level error and
 * returns to step 0 if the chosen username is already taken (Postgres unique violation), or a
 * generic inline error for any other save failure; the submit button shows a spinner and can't
 * be pressed again while a save is in flight. If no rivals are found (e.g. this is the very
 * first profile in the table), the reveal step is skipped entirely and the user goes straight
 * to the tabs — otherwise it would be a dead end, since the reveal step's Continue button can't
 * be enabled without a rival to pick. Entering the tabs (from either this fast path or
 * the reveal step's "Enter the Arena") sets awaitingHomeEntry rather than navigating directly —
 * the create-profile mutation resolving only means the query cache has been written, not that
 * AppContext's currentUser has re-rendered with it yet, and navigating before that propagates
 * would make the tabs' own routing gate see a stale null currentUser and bounce straight back
 * here. If the user left
 * mid-onboarding (steps 0-2) and comes back, a locally-persisted draft (see
 * ProfileCreationDraft) restores their progress and a "Welcome back" banner briefly confirms
 * it; the draft is cleared once the profile actually saves. A "Sign Out" link in the header
 * (see handleSignOut) is this screen's only way back to /sign-in — necessary because a session
 * can land here with no way to ever leave (e.g. the profiles row was deleted directly in the
 * database after the session was established), and the normal logout button lives on the
 * profile tab, which is unreachable without a profile.
 */
export default function ProfileCreation() {
  const router = useRouter();
  const { session, currentUser, setRivals, setChosenRivalId, clearCurrentUser } = useApp();
  const createProfileMutation = useCreateProfileMutation();

  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [location, setLocation] = useState("");
  const [selectedGames, setSelectedGames] = useState<GameType[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<Partial<Record<GameType, string[]>>>({});
  const [selectedBrackets, setSelectedBrackets] = useState<number[]>([2]);
  const [selectedNoGo, setSelectedNoGo] = useState<NoGoRule[]>([]);
  const [computedRivals, setComputedRivals] = useState<UserProfile[]>([]);
  const [pickedRivalId, setPickedRivalId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [welcomeBackEmail, setWelcomeBackEmail] = useState<string | null>(null);
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);
  const [awaitingHomeEntry, setAwaitingHomeEntry] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const rivalCardAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const animateIn = () => {
    slideAnim.setValue(40);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 8,
    }).start();
  };

  // Restore any in-progress draft for this user before the save-effect below gets a chance to
  // run — otherwise it would immediately overwrite the stored draft with the blank initial
  // state. Runs once per signed-in user id.
  useEffect(() => {
    if (!session) return;
    let isMounted = true;

    AsyncStorage.getItem(draftStorageKey(session.user.id)).then((raw) => {
      if (!isMounted) return;
      if (raw) {
        try {
          const draft: ProfileCreationDraft = JSON.parse(raw);
          setStep(draft.step);
          setUsername(draft.username);
          setDisplayName(draft.displayName);
          setLocation(draft.location);
          setSelectedGames(draft.selectedGames);
          setSelectedFormats(draft.selectedFormats);
          setSelectedBrackets(draft.selectedBrackets);
          setSelectedNoGo(draft.selectedNoGo);

          if (session.user.email) {
            setWelcomeBackEmail(session.user.email);
            setTimeout(() => setWelcomeBackEmail(null), 3000);
          }
        } catch {
          // Corrupted draft — ignore it and start fresh rather than blocking onboarding.
        }
      }
      setHasLoadedDraft(true);
    });

    return () => { isMounted = false; };
  }, [session?.user.id]);

  // Persists WIP onboarding fields so they survive the user leaving mid-creation (see
  // ProfileCreationDraft above). Gated on hasLoadedDraft so this can't fire with the initial
  // blank state before the restore effect above has had a chance to run.
  useEffect(() => {
    if (!session || !hasLoadedDraft) return;
    const draft: ProfileCreationDraft = {
      step, username, displayName, location,
      selectedGames, selectedFormats, selectedBrackets, selectedNoGo,
    };
    AsyncStorage.setItem(draftStorageKey(session.user.id), JSON.stringify(draft));
  }, [
    session, hasLoadedDraft, step, username, displayName, location,
    selectedGames, selectedFormats, selectedBrackets, selectedNoGo,
  ]);

  // Navigates to the tabs once currentUser (populated by the just-completed create-profile
  // mutation, via AppContext's useProfileQuery) has actually propagated down to this component -
  // see the awaitingHomeEntry comment in nextStep for why this can't just navigate immediately.
  useEffect(() => {
    if (awaitingHomeEntry && currentUser) {
      router.replace('/(tabs)/home');
    }
  }, [awaitingHomeEntry, currentUser, router]);

  const USERNAME_RE = /^[a-zA-Z0-9_]{1,20}$/;

  const validateUsername = (value: string) => {
    if (!value.trim()) { setUsernameError("Username is required."); return false; }
    if (!USERNAME_RE.test(value.trim())) {
      setUsernameError("Only letters, numbers, and underscores. No spaces.");
      return false;
    }
    setUsernameError("");
    return true;
  };

  const nextStep = async () => {
    if (step === 0) {
      if (!validateUsername(username)) return;
    }
    if (step === 1 && selectedGames.length === 0) return;

    if (step === 2) {
      if (!session || isSubmitting) return;

      const newProfile: UserProfile = {
        id: session.user.id,
        username: username.trim(),
        displayName: displayName.trim() || undefined,
        location: location.trim() || "Nearby",
        games: selectedGames,
        preferredFormats: selectedFormats,
        brackets: selectedBrackets.length > 0 ? selectedBrackets : [2],
        noGo: selectedNoGo,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        monthlyPoints: 0,
      };

      setSubmitError("");
      setIsSubmitting(true);
      try {
        const { id: _id, ...draft } = newProfile;
        await createProfileMutation.mutateAsync({ userId: session.user.id, draft });
      } catch (err) {
        setIsSubmitting(false);
        if (err instanceof UsernameTakenError) {
          setUsernameError(err.message);
          setStep(0);
        } else {
          setSubmitError(
            err instanceof Error ? err.message : "Couldn't save your profile. Please try again."
          );
        }
        return;
      }
      AsyncStorage.removeItem(draftStorageKey(session.user.id));

      const candidates = await fetchRivalCandidates(session.user.id);
      const rivals = findRivals(newProfile, candidates, 3);
      if (rivals.length > 0) {
        // Best-effort: the daily refresh job (see the rival-refresh Edge Function) is the
        // long-term source of truth for rival_ids, but persisting this initial match now means
        // a returning user sees rivals immediately instead of an empty state until the next run.
        updateProfile(session.user.id, { rivalIds: rivals.map((r) => r.id) }).catch((err) =>
          console.warn('Failed to persist initial rival match:', err)
        );
      }

      // No candidates to show — this is the very first profile in the table, or genuinely no
      // one else shares a game with this user yet. Either way there's nothing to pick from, so
      // the reveal step would be a dead end (canProceed requires pickedRivalId, which can never
      // be set). Skip straight to home.
      if (rivals.length === 0) {
        // Don't navigate immediately: the mutation resolving only means the query cache has
        // been written, not that AppContext's currentUser (read from that same cache by a
        // different component, higher up the tree) has actually re-rendered with it yet. If
        // /(tabs)/home's routing gate mounts before that propagates, it sees a stale null
        // currentUser, decides there's no profile, and bounces straight back here - which looks
        // like the whole flow silently restarting. Instead, stay "submitting" (keeps the button
        // spinner up and blocks a duplicate submit) and let the effect below navigate once
        // currentUser has actually caught up.
        setAwaitingHomeEntry(true);
        return;
      }

      setIsSubmitting(false);
      setComputedRivals(rivals);
      setRivals(rivals);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setStep(3);
      animateIn();

      rivalCardAnims.forEach((anim) => anim.setValue(0));
      rivals.forEach((_, i) => {
        setTimeout(() => {
          Animated.spring(rivalCardAnims[i], {
            toValue: 1,
            useNativeDriver: true,
            bounciness: 12,
          }).start();
        }, 300 + i * 200);
      });
      return;
    }

    Haptics.selectionAsync();
    setStep((s) => s + 1);
    animateIn();
  };

  const toggleGame = (game: GameType) => {
    Haptics.selectionAsync();
    setSelectedGames((prev) =>
      prev.includes(game) ? prev.filter((g) => g !== game) : [...prev, game]
    );
  };

  const toggleFormat = (game: GameType, format: string) => {
    setSelectedFormats((prev) => {
      const current = prev[game] ?? [];
      const updated = current.includes(format)
        ? current.filter((f) => f !== format)
        : [...current, format];
      return { ...prev, [game]: updated };
    });
  };

  const toggleBracket = (b: number) => {
    Haptics.selectionAsync();
    setSelectedBrackets((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
    );
  };

  const toggleNoGo = (rule: NoGoRule) => {
    Haptics.selectionAsync();
    setSelectedNoGo((prev) =>
      prev.includes(rule) ? prev.filter((r) => r !== rule) : [...prev, rule]
    );
  };

  // Escape hatch for a session with no reachable profile — e.g. the profiles row was deleted
  // directly in Supabase, or this account was never meant to be finished. Without this, a user
  // in that state has no way back to /sign-in: the session persists (by design), so index.tsx
  // always routes here instead of to sign-in, and the tabs (where the normal logout lives) are
  // unreachable without a profile.
  const handleSignOut = () => {
    if (session) AsyncStorage.removeItem(draftStorageKey(session.user.id));
    Haptics.selectionAsync();
    clearCurrentUser();
    router.replace('/sign-in');
  };

  const renderStepDots = () => (
    <View style={styles.dots}>
      {STEPS.map((_, i) => (
        <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
      ))}
    </View>
  );

  const renderIdentity = () => (
    <View>
      <Text style={styles.stepTitle}>Create Your Profile</Text>
      <Text style={styles.stepSubtitle}>Who are you at the table?</Text>

      <Text style={styles.label}>Username</Text>
      <Text style={styles.labelHint}>Letters, numbers, underscores only — no spaces</Text>
      <TextInput
        testID="profile-creation-username-input"
        style={[styles.input, !!usernameError && styles.inputError]}
        placeholder="e.g. DarkRitualDave"
        placeholderTextColor="#999"
        value={username}
        onChangeText={(v) => { setUsername(v); if (usernameError) validateUsername(v); }}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      {!!usernameError && <Text style={styles.errorText}>{usernameError}</Text>}

      <Text style={styles.label}>Display Name <Text style={styles.labelOptional}>(optional)</Text></Text>
      <Text style={styles.labelHint}>How your name appears in-app — can include spaces</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Dark Ritual Dave"
        placeholderTextColor="#999"
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={32}
      />

      <Text style={styles.label}>Your Area</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Downtown Seattle"
        placeholderTextColor="#999"
        value={location}
        onChangeText={setLocation}
      />
    </View>
  );

  const renderGameSelection = () => (
    <View>
      <Text style={styles.stepTitle}>What Do You Play?</Text>
      <Text style={styles.stepSubtitle}>Select all that apply</Text>

      {(["mtg", "pokemon", "lorcana", "onepiece"] as GameType[]).map((game) => {
        const selected = selectedGames.includes(game);
        return (
          <Pressable
            key={game}
            testID={`profile-creation-game-${game}`}
            style={[
              styles.gameOption,
              selected && {
                borderColor: GAME_COLOR[game],
                backgroundColor: GAME_COLOR[game] + "18",
              },
            ]}
            onPress={() => toggleGame(game)}
          >
            <Text style={styles.gameEmoji}>{GAME_EMOJI[game]}</Text>
            <Text
              style={[
                styles.gameLabel,
                selected && { color: GAME_COLOR[game], fontWeight: "700" },
              ]}
            >
              {GAME_LABELS[game]}
            </Text>
            {selected && (
              <Text style={[styles.gameCheck, { color: GAME_COLOR[game] }]}>✓</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  const renderPreferences = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Your Preferences</Text>
      <Text style={styles.stepSubtitle}>Help others know what to expect</Text>

      {selectedGames.map((game) => (
        <View key={game} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: GAME_COLOR[game] }]}>
            {GAME_EMOJI[game]} {GAME_LABELS[game]} Formats
          </Text>
          <View style={styles.chipRow}>
            {FORMAT_OPTIONS[game].map((fmt) => {
              const active = (selectedFormats[game] ?? []).includes(fmt);
              return (
                <Pressable
                  key={fmt}
                  style={[
                    styles.chip,
                    active && {
                      backgroundColor: GAME_COLOR[game],
                      borderColor: GAME_COLOR[game],
                    },
                  ]}
                  onPress={() => toggleFormat(game, fmt)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {fmt}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {game !== 'mtg' && (
            <Text style={styles.comingSoonNote}>
              ⏳ PlayLink is currently focused on MTG Commander. Full {GAME_LABELS[game]} support is planned — basic grouping and rival features are available now.
            </Text>
          )}
          {game === 'mtg' && !(selectedFormats['mtg'] ?? []).includes('Commander') && (
            <Text style={styles.comingSoonNote}>
              ⏳ Select Commander to unlock bracket preferences and advanced rival matching. Other MTG formats support basic grouping and rivals.
            </Text>
          )}
        </View>
      ))}

      {selectedGames.includes("mtg") && (selectedFormats["mtg"] ?? []).includes("Commander") && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚔️ Commander Bracket</Text>
          <Text style={styles.sectionHint}>Wizards 1–5 power scale — select all you play</Text>
          <View style={styles.bracketRow}>
            {[1, 2, 3, 4, 5].map((b) => {
              const active = selectedBrackets.includes(b);
              return (
                <Pressable
                  key={b}
                  style={[styles.bracketBtn, active && styles.bracketBtnActive]}
                  onPress={() => toggleBracket(b)}
                >
                  <Text style={[styles.bracketLabel, active && styles.bracketLabelActive]}>
                    {b}
                  </Text>
                  <Text style={styles.bracketDesc}>{BRACKET_INFO[b].label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚫 Won't Play Against</Text>
        <View style={styles.chipRow}>
          {NO_GO_OPTIONS.map((rule) => {
            const active = selectedNoGo.includes(rule);
            return (
              <Pressable
                key={rule}
                style={[styles.chip, active && styles.chipNoGo]}
                onPress={() => toggleNoGo(rule)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {rule}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {!!submitError && <Text style={styles.errorText}>{submitError}</Text>}
    </ScrollView>
  );

  const renderRivalReveal = () => (
    <View style={styles.rivalContainer}>
      <Text style={styles.stepTitle}>Choose Your Rival</Text>
      <Text style={styles.stepSubtitle}>
        One rival to chase. The others lurk as Contenders.
      </Text>

      {computedRivals.map((rival, i) => {
        const isPicked = pickedRivalId === rival.id;
        const isContender = pickedRivalId !== null && !isPicked;
        return (
          <Animated.View
            key={rival.id}
            style={[
              {
                opacity: rivalCardAnims[i],
                transform: [
                  {
                    scale: rivalCardAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              style={[
                styles.rivalCard,
                isPicked && styles.rivalCardPicked,
                isContender && styles.rivalCardContender,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setPickedRivalId(rival.id);
              }}
            >
              <View style={[styles.rivalAvatar, isPicked && styles.rivalAvatarPicked]}>
                <Text style={styles.rivalInitial}>{rival.username.charAt(0) || '?'}</Text>
              </View>
              <View style={styles.rivalInfo}>
                <Text style={styles.rivalName}>{rival.username}</Text>
                <Text style={styles.rivalMeta}>
                  {rival.wins}W – {rival.losses}L ·{" "}
                  {rival.games.map((g) => GAME_EMOJI[g]).join(" ")}
                </Text>
                <Text style={styles.rivalLocation}>{rival.location}</Text>
              </View>
              {isPicked ? (
                <View style={styles.rivalBadge}>
                  <Text style={styles.rivalBadgeText}>RIVAL</Text>
                </View>
              ) : (
                <View style={[styles.rivalBadge, styles.contenderBadge]}>
                  <Text style={[styles.rivalBadgeText, styles.contenderBadgeText]}>
                    {pickedRivalId !== null ? "CONTENDER" : "TAP TO PICK"}
                  </Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        );
      })}

      {computedRivals.length === 0 && (
        <Text style={styles.noRivals}>
          No rivals matched yet — play some games to find them!
        </Text>
      )}
    </View>
  );

  const canProceed =
    !isSubmitting && (
      (step === 0 && username.trim().length > 0) ||
      (step === 1 && selectedGames.length > 0) ||
      step === 2 ||
      (step === 3 && pickedRivalId !== null)
    );

  return (
    <View style={styles.container}>
      {!!welcomeBackEmail && (
        <View style={styles.welcomeBackBanner}>
          <Text style={styles.welcomeBackText}>Welcome back, {welcomeBackEmail}!</Text>
        </View>
      )}

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.brand}>PlayLink</Text>
          <Pressable testID="profile-creation-sign-out" onPress={handleSignOut} hitSlop={8}>
            <Text style={styles.signOutLink}>Sign Out</Text>
          </Pressable>
        </View>
        {renderStepDots()}
      </View>

      <Animated.View
        style={[styles.content, { transform: [{ translateY: slideAnim }] }]}
      >
        {step === 0 && renderIdentity()}
        {step === 1 && renderGameSelection()}
        {step === 2 && renderPreferences()}
        {step === 3 && renderRivalReveal()}
      </Animated.View>

      <View style={styles.footer}>
        {step < 3 ? (
          <Pressable
            testID="profile-creation-next-button"
            style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
            onPress={nextStep}
            disabled={!canProceed}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.nextBtnText}>
                {step === 2 ? "Find My Rivals →" : "Continue →"}
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            testID="profile-creation-next-button"
            style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
            disabled={!canProceed}
            onPress={() => {
              if (pickedRivalId !== null) setChosenRivalId(pickedRivalId);
              setAwaitingHomeEntry(true);
            }}
          >
            <Text style={styles.nextBtnText}>
              {pickedRivalId === null ? "Pick Your Rival First" : "Enter the Arena →"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F14",
    paddingTop: 56,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  signOutLink: {
    fontSize: 12,
    fontWeight: "700",
    color: "#888",
    textDecorationLine: "underline",
  },
  welcomeBackBanner: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: "#0A2A0A",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#1C5A1C",
  },
  welcomeBackText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#34C759",
    textAlign: "center",
  },
  brand: {
    fontSize: 13,
    fontWeight: "700",
    color: "#007AFF",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  dots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#333",
  },
  dotActive: {
    width: 20,
    backgroundColor: "#007AFF",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  stepSubtitle: {
    fontSize: 15,
    color: "#888",
    marginBottom: 28,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#AAA",
    marginBottom: 4,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  labelHint: {
    fontSize: 11,
    color: "#666",
    marginBottom: 8,
  },
  labelOptional: {
    fontSize: 11,
    color: "#666",
    fontWeight: "400",
    textTransform: "none",
    letterSpacing: 0,
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: "#1C1C24",
    borderWidth: 1,
    borderColor: "#2C2C38",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#FFF",
  },
  gameOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1C24",
    borderWidth: 2,
    borderColor: "#2C2C38",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  gameEmoji: {
    fontSize: 22,
    marginRight: 14,
  },
  gameLabel: {
    flex: 1,
    fontSize: 16,
    color: "#DDD",
    fontWeight: "600",
  },
  gameCheck: {
    fontSize: 18,
    fontWeight: "800",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#CCC",
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: "#666",
    marginBottom: 10,
  },
  comingSoonNote: {
    fontSize: 11,
    color: "#555",
    marginTop: 10,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#333",
    backgroundColor: "#1C1C24",
  },
  chipText: {
    fontSize: 13,
    color: "#AAA",
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FFF",
  },
  chipNoGo: {
    backgroundColor: "#3D1215",
    borderColor: "#C0392B",
  },
  bracketRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  bracketBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#333",
    backgroundColor: "#1C1C24",
  },
  bracketBtnActive: {
    borderColor: "#007AFF",
    backgroundColor: "#001A3D",
  },
  bracketLabel: {
    fontSize: 20,
    fontWeight: "800",
    color: "#666",
  },
  bracketLabelActive: {
    color: "#007AFF",
  },
  bracketDesc: {
    fontSize: 10,
    color: "#555",
    marginTop: 2,
  },
  rivalContainer: {
    flex: 1,
  },
  rivalCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1C24",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: "#2C2C38",
  },
  rivalCardPicked: {
    borderColor: "#FF3B30",
    backgroundColor: "#1F1012",
  },
  rivalCardContender: {
    opacity: 0.65,
  },
  rivalAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#444",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  rivalAvatarPicked: {
    backgroundColor: "#FF3B30",
  },
  rivalInitial: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFF",
  },
  rivalInfo: {
    flex: 1,
  },
  rivalName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
    marginBottom: 2,
  },
  rivalMeta: {
    fontSize: 13,
    color: "#888",
    marginBottom: 2,
  },
  rivalLocation: {
    fontSize: 12,
    color: "#555",
  },
  rivalBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#FF3B30",
  },
  rivalBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFF",
    letterSpacing: 1,
  },
  contenderBadge: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#8B6914",
  },
  contenderBadgeText: {
    color: "#C9952A",
  },
  noRivals: {
    color: "#666",
    textAlign: "center",
    marginTop: 40,
    fontSize: 15,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 16,
  },
  nextBtn: {
    backgroundColor: "#007AFF",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  nextBtnDisabled: {
    backgroundColor: "#1C2940",
  },
  nextBtnText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
