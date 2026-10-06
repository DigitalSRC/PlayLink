import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buildMonthGrid, toDateKey } from '../utils/calendar-utils';
import { useThemeColors } from '../utils/theme-utils';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const ACCENT = '#007AFF';

interface MonthCalendarProps {
  year: number;
  /** 0 = January ... 11 = December. */
  month: number;
  /** "YYYY-MM-DD" key of the current day, so it can be highlighted. */
  todayKey: string;
  /** "YYYY-MM-DD" key of the day the user tapped, if any. */
  selectedKey: string | null;
  /** Day-of-month -> number of events that day; days absent from the map show no marker. */
  eventCounts: Map<number, number>;
  onSelectDay: (dateKey: string) => void;
}

/**
 * Renders one month as a Sunday-first grid of tappable days. The current day is drawn as a
 * filled blue circle, the tapped day gets a blue ring, and any day with at least one event shows
 * a small dot beneath its number. It is a display component only: the caller owns which month is
 * showing, which day is selected, and what the events are.
 * Parameters: year, month (0-11), todayKey, selectedKey, eventCounts, onSelectDay (called with
 * the tapped day's "YYYY-MM-DD" key).
 * Returns: a weekday header row followed by 4 to 6 week rows.
 * Edge cases: the blank cells padding the first and last weeks are not tappable; when today is
 * in a different month than the one shown, no day is highlighted; when today is also the
 * selected day it keeps the filled "today" style.
 */
export default function MonthCalendar({
  year,
  month,
  todayKey,
  selectedKey,
  eventCounts,
  onSelectDay,
}: MonthCalendarProps) {
  const colors = useThemeColors();
  const weeks = buildMonthGrid(year, month);

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.week}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text key={index} style={[styles.weekdayLabel, { color: colors.textMuted }]}>
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
            const hasEvents = eventCounts.has(day);

            return (
              <Pressable
                key={dayIndex}
                style={styles.cell}
                onPress={() => onSelectDay(key)}
                accessibilityRole="button"
                accessibilityLabel={`${key}${isToday ? ', today' : ''}${hasEvents ? ', has events' : ''}`}
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={[
                    styles.dayCircle,
                    isSelected && styles.dayCircleSelected,
                    isToday && styles.dayCircleToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      { color: isToday ? '#FFFFFF' : colors.textPrimary },
                      (isToday || hasEvents) && styles.dayNumberBold,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
                <View style={[styles.dot, hasEvents && styles.dotVisible]} />
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
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  week: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dayCircleSelected: {
    borderColor: ACCENT,
  },
  dayCircleToday: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  dayNumber: {
    fontSize: 15,
  },
  dayNumberBold: {
    fontWeight: '800',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 3,
    backgroundColor: 'transparent',
  },
  dotVisible: {
    backgroundColor: ACCENT,
  },
});
