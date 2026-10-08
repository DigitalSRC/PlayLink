import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { STARTER_REWARD_POINTS } from '../data/rewards';
import { PARTICIPATION_POINTS } from '../utils/scoring-utils';
import { useThemeColors } from '../utils/theme-utils';
import { VENUE_EVENT_BONUS } from '../utils/venue-bonus-utils';

interface HowItWorksSheetProps {
  visible: boolean;
  /** True the first time, straight after a player finishes creating their profile. */
  welcome: boolean;
  /** Whether to mention the starter rewards (false when the server doesn't offer them). */
  showRewards: boolean;
  onClose: () => void;
  onOpenCalendar: () => void;
  onOpenFind: () => void;
}

/**
 * The "How PlayLink works" guide: what to do first, how a game night runs, and how points are
 * earned and spent. It opens by itself once, as the last step of onboarding, with a welcome on
 * top, and afterwards from the "How PlayLink works" button on Home whenever a player wants it.
 * It used to be a card that sat on Home until a player's first round and then vanished for good.
 * Parameters: visible, welcome, showRewards, onClose, onOpenCalendar, onOpenFind (see
 * HowItWorksSheetProps).
 * Returns: a bottom sheet over the current screen, or nothing when not visible.
 * Edge cases: tapping outside the sheet or the hardware back button closes it; the two shortcut
 * buttons close it before navigating, so it is never left open behind another tab.
 */
export default function HowItWorksSheet({
  visible, welcome, showRewards, onClose, onOpenCalendar, onOpenFind,
}: HowItWorksSheetProps) {
  const colors = useThemeColors();
  if (!visible) return null;

  const steps: { title: string; body: string }[] = [
    {
      title: 'Find a game',
      body: 'The Calendar tab lists game nights at stores near you. Tap “Create game” on one to start a group there, or use the Find tab to join a group someone else posted.',
    },
    {
      title: 'Play',
      body: 'You can be in one group per day. The host confirms the game, then reports how each round finished.',
    },
    {
      title: 'Earn points',
      body: `Everyone gets ${PARTICIPATION_POINTS} points a round just for playing, more the higher you finish, and +${VENUE_EVENT_BONUS} once for a group made from a store’s calendar event.`,
    },
    {
      title: 'Spend and climb',
      body: 'Spend points in the Shop (tap your points on Home) on titles, name colors, and card borders. What you earn each month is also your Score, which ranks the leaderboard on the Stats tab. Spending never lowers it.',
    },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>
              {welcome ? 'You’re in!' : 'How PlayLink works'}
            </Text>
            {welcome && (
              <Text style={[styles.lede, { color: colors.textBody }]}>
                Make a new game or join one, and look through the events in the Calendar.
                {showRewards ? ` Your first game, your first look at the Calendar, and picking your Rival each earn ${STARTER_REWARD_POINTS} points to spend, once.` : ''}
              </Text>
            )}

            {steps.map((step, index) => (
              <View key={step.title} style={styles.step}>
                <View style={[styles.stepNumber, { backgroundColor: colors.accentBg }]}>
                  <Text style={[styles.stepNumberText, { color: colors.accentOnBg }]}>{index + 1}</Text>
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{step.title}</Text>
                  <Text style={[styles.stepBody, { color: colors.textSecondary }]}>{step.body}</Text>
                </View>
              </View>
            ))}

            <Pressable style={styles.primaryButton} onPress={onOpenCalendar} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>See what’s on near you →</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, { borderColor: colors.border }]}
              onPress={onOpenFind}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryButtonText, { color: colors.accentText }]}>Find or post a game</Text>
            </Pressable>
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button">
              <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>
                {welcome ? 'Got it' : 'Close'}
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '88%',
  },
  content: {
    padding: 22,
    paddingBottom: 36,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  lede: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 6,
  },
  step: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  stepBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 22,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  closeButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
