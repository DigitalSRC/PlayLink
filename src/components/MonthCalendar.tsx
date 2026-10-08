import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buildMonthGrid, toDateKey } from '../utils/calendar-utils';
import { useThemeColors } from '../utils/theme-utils';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const ACCENT = '#007AFF';
// How many venue names a day cell writes out before collapsing the rest into "+N".
const MAX_LABELS_PER_DAY = 2;

interface MonthCalendarProps {
  year: number;
  /** 0 = January ... 11 = December. */
  month: number;
  /** "YYYY-MM-DD" key of the current day, so it can be highlighted. */
  todayKey: string;
  /** "YYYY-MM-DD" key of the day the user tapped, if any. */
  selectedKey: string | null;
  /** Day-of-month -> short venue names to write on that day; days absent from the map are blank. */
  venueLabels: Map<number, string[]>;
  onSelectDay: (dateKey: string) => void;
}

/**
 * Renders one month as a Sunday-first grid of tappable days, with the venues that have an event
 * written on each day. The current day's number is a filled blue circle, the tapped day's cell
 * gets a blue outline, days with an event get a slightly lighter background so they stand out,
 * and days already past are dimmed. It is a display component only: the
 * caller owns which month is showing, which day is selected, and what the labels are.
 * Parameters: year, month (0-11), todayKey, selectedKey, venueLabels (already shortened to fit a
 * cell), onSelectDay (called with the tapped day's "YYYY-MM-DD" key).
 * Returns: a weekday header row followed by 4 to 6 week rows.
 * Edge cases: a day with more than two venues shows the first two and a "+N" line, so every cell
 * keeps the same height; the blank cells padding the first and last weeks are not tappable; when
 * today is in a different month than the one shown, no day is highlighted or dimmed as past.
 */
export default function MonthCalendar({
  year,
  month,
  todayKey,
  selectedKey,
  venueLabels,
  onSelectDay,
}: MonthCalendarProps) {
  const colors = useThemeColors();
  const weeks = buildMonthGrid(year, month);
  const monthPrefix = toDateKey(year, month, 1).slice(0, 8);
  const todayInThisMonth = todayKey.startsWith(monthPrefix);

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.week}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text key={index} style={[styles.weekdayLabel, { color: colors.textSecondary }]}>
            {label}
          </Text>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.week}>
          {week.map((day, dayIndex) => {
            if (day === null) return <View key={dayIndex} style={styles.cell} />;

            const key = toDateKey(year, month, day);
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            const isPast = todayInThisMonth && key < todayKey;
            const labels = venueLabels.get(day) ?? [];
            const shown = labels.slice(0, MAX_LABELS_PER_DAY);
            const hidden = labels.length - shown.length;

            return (
              <Pressable
                key={dayIndex}
                style={[
                  styles.cell,
                  { borderColor: isSelected ? ACCENT : 'transparent' },
                  labels.length > 0 && { backgroundColor: colors.cardRaised },
                  isPast && styles.cellPast,
                ]}
                onPress={() => onSelectDay(key)}
                accessibilityRole="button"
                accessibilityLabel={`${key}${isToday ? ', today' : ''}${
                  labels.length > 0 ? `, ${labels.join(', ')}` : ''
                }`}
                accessibilityState={{ selected: isSelected }}
              >
                <View style={[styles.dayCircle, isToday && styles.dayCircleToday]}>
                  <Text
                    style={[
                      styles.dayNumber,
                      { color: isToday ? '#FFFFFF' : colors.textPrimary },
                      isToday && styles.dayNumberToday,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
                {shown.map((label) => (
                  <Text key={label} style={[styles.venueLabel, { color: colors.accentText }]} numberOfLines={1}>
                    {label}
                  </Text>
                ))}
                {hidden > 0 && (
                  <Text style={[styles.moreLabel, { color: colors.textBody }]}>+{hidden}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  week: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    // Fixed height: day number plus room for two venue lines and a "+N" line, so rows line up
    // whether or not a day has events.
    minHeight: 66,
    paddingVertical: 3,
    paddingHorizontal: 1,
    borderWidth: 1.5,
    borderRadius: 8,
  },
  cellPast: {
    opacity: 0.55,
  },
  dayCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  dayCircleToday: {
    backgroundColor: ACCENT,
  },
  dayNumber: {
    fontSize: 13,
  },
  dayNumberToday: {
    fontWeight: '800',
  },
  venueLabel: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  moreLabel: {
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '700',
  },
});
