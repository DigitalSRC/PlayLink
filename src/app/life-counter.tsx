import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';

const STARTING_LIFE = 40;

/**
 * Full-screen MTG life counter for an active group session.
 * Players are split across two rows: the top half are rotated 180° so each player faces their own panel.
 * One player is randomly chosen as the first to play and highlighted with a gold GOES FIRST badge.
 * Short-press +/− adjusts by 1; long-press adjusts by 5 for faster changes.
 * Parameters: groupId — route param matching the active group's id in global context.
 * Returns: a full-screen life tracker with a reset button and a close button on the centre divider.
 * Edge cases: if the group is not found, renders with an empty player list; StatusBar is hidden for immersion.
 */
export default function LifeCounter() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { groups } = useApp();

  const group = groups.find((g) => g.id === Number(groupId));
  const players = group?.players ?? [];

  const [lifeTotals, setLifeTotals] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    players.forEach((p) => { init[p.username] = STARTING_LIFE; });
    return init;
  });

  const [firstPlayer] = useState<string>(() => {
    if (players.length === 0) return '';
    return players[Math.floor(Math.random() * players.length)].username;
  });

  const adjustLife = (username: string, delta: number) => {
    Haptics.selectionAsync();
    setLifeTotals((prev) => ({ ...prev, [username]: (prev[username] ?? STARTING_LIFE) + delta }));
  };

  const resetAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const reset: Record<string, number> = {};
    players.forEach((p) => { reset[p.username] = STARTING_LIFE; });
    setLifeTotals(reset);
  };

  // Top half rotated 180° so those players face their own panels across the table
  const topPlayers = players.slice(0, Math.floor(players.length / 2));
  const bottomPlayers = players.slice(Math.floor(players.length / 2));

  const renderCell = (username: string, rotated: boolean) => {
    const life = lifeTotals[username] ?? STARTING_LIFE;
    const isFirst = username === firstPlayer;
    const isDead = life <= 0;

    return (
      <View
        key={username}
        style={[styles.cell, isFirst && styles.cellFirst, rotated && styles.cellRotated]}
      >
        <Text style={styles.playerName}>{username}</Text>
        {isFirst && (
          <View style={styles.firstBadge}>
            <Text style={styles.firstBadgeText}>GOES FIRST</Text>
          </View>
        )}
        <Text style={[styles.lifeTotal, isDead && styles.lifeDead]}>{life}</Text>
        <View style={styles.btnRow}>
          <Pressable
            style={styles.lifeBtn}
            onPress={() => adjustLife(username, -1)}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              adjustLife(username, -5);
            }}
          >
            <Text style={styles.lifeBtnText}>−</Text>
          </Pressable>
          <Pressable
            style={styles.lifeBtn}
            onPress={() => adjustLife(username, +1)}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              adjustLife(username, +5);
            }}
          >
            <Text style={styles.lifeBtnText}>+</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {topPlayers.length > 0 && (
        <View style={styles.row}>
          {topPlayers.map((p) => renderCell(p.username, true))}
        </View>
      )}

      <View style={styles.divider}>
        <Pressable style={styles.dividerBtn} onPress={resetAll}>
          <Text style={styles.dividerBtnText}>↺</Text>
        </Pressable>
        <Pressable style={styles.dividerBtn} onPress={() => router.back()}>
          <Text style={styles.dividerBtnText}>✕</Text>
        </Pressable>
      </View>

      <View style={[styles.row, topPlayers.length === 0 && styles.rowFull]}>
        {bottomPlayers.map((p) => renderCell(p.username, false))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  rowFull: {
    flex: 1,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#1E1E2A',
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 10,
  },
  cellRotated: {
    transform: [{ rotate: '180deg' }],
  },
  cellFirst: {
    borderColor: '#FFD700',
    borderWidth: 1.5,
    backgroundColor: '#0C0900',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  firstBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  firstBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1.5,
  },
  lifeTotal: {
    fontSize: 86,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 92,
    textAlign: 'center',
  },
  lifeDead: {
    color: '#FF3B30',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 20,
  },
  lifeBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1C1C28',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2C2C3C',
  },
  lifeBtnText: {
    fontSize: 32,
    color: '#FFF',
    fontWeight: '300',
    lineHeight: 36,
    textAlign: 'center',
  },
  divider: {
    height: 44,
    backgroundColor: '#050508',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#1E1E2A',
  },
  dividerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C28',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2C2C3C',
  },
  dividerBtnText: {
    fontSize: 16,
    color: '#888',
  },
});
