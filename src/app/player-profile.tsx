import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import {
  BRACKET_INFO,
  GAME_COLOR,
  GAME_EMOJI,
  GAME_LABELS,
  UserProfile,
} from '../data/types';
import { SEED_PROFILES } from '../data/seed-profiles';

/**
 * Read-only public profile view for any player.
 * Looks up the player by username from the rivals list first, then from seed profiles.
 * If the player is one of the current user's rivals, shows a Set as Rival / Current Rival button.
 * Parameters: username (route param — the player to view).
 * Returns: a scrollable read-only profile screen.
 * Edge cases: shows a minimal "profile not found" state when username has no matching data.
 */
export default function PlayerProfileScreen() {
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const { rivals, chosenRivalId, setChosenRivalId } = useApp();

  const profile =
    rivals.find((r) => r.username === username) ||
    SEED_PROFILES.find((p) => p.username === username) ||
    null;

  const isRival = rivals.some((r) => r.username === username);
  const isChosenRival = profile ? profile.id === chosenRivalId : false;

  const totalGames = profile ? profile.wins + profile.losses : 0;
  const winPct = totalGames === 0 ? 0 : Math.round((profile!.wins / totalGames) * 100);

  const initials = username
    ? username.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const theirRivals: UserProfile[] = (profile?.rivalIds ?? [])
    .map((id) => SEED_PROFILES.find((p) => p.id === id))
    .filter((p): p is UserProfile => p !== undefined);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.navRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>
          <Pressable style={styles.homeBtn} onPress={() => router.replace('/(tabs)/home')}>
            <Text style={styles.homeBtnText}>🏠 Home</Text>
          </Pressable>
        </View>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, isChosenRival && styles.avatarRival]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.displayName}>{profile?.displayName ?? username}</Text>
          <Text style={styles.usernameTag}>@{username}</Text>
          {profile && <Text style={styles.location}>{profile.location}</Text>}
          {isChosenRival && (
            <View style={styles.rivalBannerPill}>
              <Text style={styles.rivalBannerText}>⚔️ YOUR RIVAL</Text>
            </View>
          )}
          {isRival && !isChosenRival && (
            <View style={styles.contenderPill}>
              <Text style={styles.contenderPillText}>CONTENDER</Text>
            </View>
          )}
        </View>

        {profile ? (
          <>
            {/* Stats */}
            <View style={styles.statsCard}>
              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{profile.wins}</Text>
                  <Text style={styles.statLabel}>Wins</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{profile.losses}</Text>
                  <Text style={styles.statLabel}>Losses</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{winPct}%</Text>
                  <Text style={styles.statLabel}>Win Rate</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={[styles.statNum, styles.pointsColor]}>{profile.points}</Text>
                  <Text style={styles.statLabel}>Points</Text>
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
                {profile.games.map((g) => (
                  <View key={g} style={[styles.gamePill, { borderColor: GAME_COLOR[g] }]}>
                    <Text style={styles.gamePillText}>{GAME_EMOJI[g]} {GAME_LABELS[g]}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Formats */}
            {Object.entries(profile.preferredFormats).some(([, fmts]) => fmts && fmts.length > 0) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Preferred Formats</Text>
                {profile.games.map((game) => {
                  const fmts = profile.preferredFormats[game] ?? [];
                  if (fmts.length === 0) return null;
                  return (
                    <View key={game} style={styles.gameFormatBlock}>
                      <Text style={[styles.gameFormatTitle, { color: GAME_COLOR[game] }]}>
                        {GAME_EMOJI[game]} {GAME_LABELS[game]}
                      </Text>
                      <View style={styles.chipRow}>
                        {fmts.map((fmt) => (
                          <View key={fmt} style={[styles.chip, { backgroundColor: GAME_COLOR[game] + '22', borderColor: GAME_COLOR[game] }]}>
                            <Text style={[styles.chipText, { color: GAME_COLOR[game] }]}>{fmt}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Commander Bracket */}
            {(profile.preferredFormats?.mtg ?? []).includes('Commander') && profile.brackets.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Commander Bracket</Text>
                <View style={styles.bracketRow}>
                  {profile.brackets.sort((a, b) => a - b).map((b) => (
                    <View key={b} style={styles.bracketBadge}>
                      <Text style={styles.bracketNum}>{b}</Text>
                      <Text style={styles.bracketLabel}>{BRACKET_INFO[b].label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Won't play against */}
            {profile.noGo.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Won't Play Against</Text>
                <View style={styles.chipRow}>
                  {profile.noGo.map((rule) => (
                    <View key={rule} style={styles.noGoChip}>
                      <Text style={styles.noGoText}>{rule}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Their rivals */}
            {theirRivals.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Rivals</Text>
                {theirRivals.map((rival, index) => (
                  <Pressable
                    key={rival.id}
                    style={[styles.rivalMiniCard, index === 0 && styles.rivalMiniCardMain]}
                    onPress={() => router.push({ pathname: '/player-profile', params: { username: rival.username } })}
                  >
                    <View style={[styles.rivalMiniAvatar, index === 0 && styles.rivalMiniAvatarMain]}>
                      <Text style={styles.rivalMiniInitial}>{rival.username.charAt(0) || '?'}</Text>
                    </View>
                    <View style={styles.rivalMiniInfo}>
                      <Text style={styles.rivalMiniName}>{rival.displayName ?? rival.username}</Text>
                      <Text style={styles.rivalMiniMeta}>
                        {rival.wins}W – {rival.losses}L · {rival.games.map((g) => GAME_EMOJI[g]).join(' ')}
                      </Text>
                    </View>
                    <View style={[styles.rivalMiniBadge, index > 0 && styles.rivalMiniContenderBadge]}>
                      <Text style={[styles.rivalMiniBadgeText, index > 0 && styles.rivalMiniContenderBadgeText]}>
                        {index === 0 ? 'RIVAL' : 'CONTENDER'}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.notFoundBox}>
            <Text style={styles.notFoundText}>Full profile not available</Text>
            <Text style={styles.notFoundSub}>This player hasn't set up their full profile yet.</Text>
          </View>
        )}

        {/* Set as rival button — only for players already in your rivals list */}
        {isRival && profile && (
          <Pressable
            style={[styles.rivalBtn, isChosenRival && styles.rivalBtnActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setChosenRivalId(profile.id);
              router.back();
            }}
          >
            <Text style={styles.rivalBtnText}>
              {isChosenRival ? '⚔️ Current Rival' : 'Set as Your Rival'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
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
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backBtn: {},
  backBtnText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  homeBtn: {
    backgroundColor: '#1C1C24',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  homeBtnText: {
    color: '#AAA',
    fontSize: 14,
    fontWeight: '600',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarRival: {
    backgroundColor: '#FF3B30',
  },
  avatarText: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFF',
  },
  displayName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 2,
  },
  usernameTag: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    marginBottom: 6,
  },
  location: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  rivalBannerPill: {
    backgroundColor: '#FF3B30',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  rivalBannerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 1,
  },
  contenderPill: {
    backgroundColor: 'transparent',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#8B6914',
  },
  contenderPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C9952A',
    letterSpacing: 1,
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
  pointsColor: {
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
    fontWeight: '600',
    color: '#AAA',
  },
  bracketRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  bracketBadge: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#007AFF',
    backgroundColor: '#001A3D',
  },
  bracketNum: {
    fontSize: 20,
    fontWeight: '800',
    color: '#007AFF',
  },
  bracketLabel: {
    fontSize: 9,
    color: '#555',
    marginTop: 2,
  },
  noGoChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#3D1215',
    borderWidth: 1.5,
    borderColor: '#C0392B',
  },
  noGoText: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: '600',
  },
  notFoundBox: {
    alignItems: 'center',
    marginTop: 40,
    padding: 24,
    backgroundColor: '#1C1C24',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  notFoundText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#888',
    marginBottom: 8,
  },
  notFoundSub: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
  },
  rivalMiniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  rivalMiniCardMain: {
    borderColor: '#FF3B30',
    backgroundColor: '#1F1012',
    borderWidth: 1.5,
  },
  rivalMiniAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rivalMiniAvatarMain: {
    backgroundColor: '#FF3B30',
  },
  rivalMiniInitial: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  rivalMiniInfo: {
    flex: 1,
  },
  rivalMiniName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 2,
  },
  rivalMiniMeta: {
    fontSize: 12,
    color: '#666',
  },
  rivalMiniBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  rivalMiniContenderBadge: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#8B6914',
  },
  rivalMiniBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.8,
  },
  rivalMiniContenderBadgeText: {
    color: '#C9952A',
  },
  rivalBtn: {
    backgroundColor: '#1C1C24',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#FF3B30',
  },
  rivalBtnActive: {
    backgroundColor: '#1F1012',
  },
  rivalBtnText: {
    color: '#FF3B30',
    fontWeight: '700',
    fontSize: 15,
  },
});
