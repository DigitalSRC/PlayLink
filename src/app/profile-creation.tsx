import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
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
import { SEED_PROFILES } from "../data/seed-profiles";
import { findRivals } from "../utils/rival-utils";

const STEPS = ["Identity", "Games", "Preferences", "Your Rivals"];

/**
 * Multi-step onboarding screen that collects the player's full profile.
 * Steps: identity (username + location), game selection, preferences (formats, bracket, no-go), rival reveal.
 * Computes rivals on completion and saves them to global context before navigating home.
 * Also supports one-tap login for any existing seed profile via the identity step.
 * Parameters: none.
 * Returns: a React Native screen with animated step transitions and haptic feedback on progression.
 * Edge cases: blocks progression if required fields are missing; rival reveal animates in automatically.
 */
export default function ProfileCreation() {
  const router = useRouter();
  const { setCurrentUser, setRivals, setChosenRivalId } = useApp();

  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [selectedGames, setSelectedGames] = useState<GameType[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<Partial<Record<GameType, string[]>>>({});
  const [selectedBrackets, setSelectedBrackets] = useState<number[]>([2]);
  const [selectedNoGo, setSelectedNoGo] = useState<NoGoRule[]>([]);
  const [computedRivals, setComputedRivals] = useState<UserProfile[]>([]);
  const [pickedRivalId, setPickedRivalId] = useState<number | null>(null);

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

  const nextStep = () => {
    if (step === 0 && !username.trim()) return;
    if (step === 1 && selectedGames.length === 0) return;

    if (step === 2) {
      const newProfile: UserProfile = {
        id: Date.now(),
        username: username.trim(),
        location: location.trim() || "Nearby",
        games: selectedGames,
        preferredFormats: selectedFormats,
        brackets: selectedBrackets.length > 0 ? selectedBrackets : [2],
        noGo: selectedNoGo,
        wins: 0,
        losses: 0,
        xp: 0,
      };

      const rivals = findRivals(newProfile, SEED_PROFILES, 3);
      setComputedRivals(rivals);
      setCurrentUser(newProfile);
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

  const loginAsExisting = (profile: UserProfile) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const rivals = findRivals(profile, SEED_PROFILES.filter((p) => p.id !== profile.id), 3);
    setCurrentUser(profile);
    setRivals(rivals);
    if (rivals.length > 0) setChosenRivalId(rivals[0].id);
    router.replace('/(tabs)/home');
  };

  const matchedProfiles = username.trim().length > 0
    ? SEED_PROFILES.filter((p) =>
        p.username.toLowerCase().includes(username.trim().toLowerCase())
      )
    : [];

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
      <TextInput
        style={styles.input}
        placeholder="e.g. DarkRitualDave"
        placeholderTextColor="#999"
        value={username}
        onChangeText={setUsername}
        autoFocus
      />

      {matchedProfiles.length > 0 && (
        <View style={styles.loginSuggestions}>
          <Text style={styles.loginSuggestionsLabel}>Returning player?</Text>
          {matchedProfiles.map((profile) => (
            <Pressable
              key={profile.id}
              style={styles.loginSuggestionRow}
              onPress={() => loginAsExisting(profile)}
            >
              <View style={styles.loginAvatar}>
                <Text style={styles.loginAvatarText}>{profile.username[0]}</Text>
              </View>
              <View style={styles.loginInfo}>
                <Text style={styles.loginName}>{profile.username}</Text>
                <Text style={styles.loginMeta}>
                  {profile.wins}W – {profile.losses}L · {profile.location}
                </Text>
              </View>
              <Text style={styles.loginArrow}>Log In →</Text>
            </Pressable>
          ))}
        </View>
      )}

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
                <Text style={styles.rivalInitial}>{rival.username[0]}</Text>
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
    (step === 0 && username.trim().length > 0) ||
    (step === 1 && selectedGames.length > 0) ||
    step === 2 ||
    (step === 3 && pickedRivalId !== null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>PlayLink</Text>
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
            style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
            onPress={nextStep}
            disabled={!canProceed}
          >
            <Text style={styles.nextBtnText}>
              {step === 2 ? "Find My Rivals →" : "Continue →"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
            disabled={!canProceed}
            onPress={() => {
              if (pickedRivalId !== null) setChosenRivalId(pickedRivalId);
              router.replace("/(tabs)/home");
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
  brand: {
    fontSize: 13,
    fontWeight: "700",
    color: "#007AFF",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 16,
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
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
  loginSuggestions: {
    marginTop: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#2C2C38",
    borderRadius: 12,
    overflow: "hidden",
  },
  loginSuggestionsLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#555",
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  loginSuggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#1E1E28",
  },
  loginAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  loginAvatarText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFF",
  },
  loginInfo: {
    flex: 1,
  },
  loginName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
  loginMeta: {
    fontSize: 11,
    color: "#666",
    marginTop: 1,
  },
  loginArrow: {
    fontSize: 12,
    fontWeight: "700",
    color: "#007AFF",
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
