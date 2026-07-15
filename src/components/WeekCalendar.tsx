import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Group } from "../data/groups";
import { DAYS_OF_WEEK, DayOfWeek, GAME_EMOJI } from "../data/types";
import { formatScheduledAt, scheduleDayOfWeek } from "../utils/schedule-utils";
import { useThemeColors } from "../utils/theme-utils";

interface WeekCalendarProps {
  groups: Group[];
  selectedDay?: DayOfWeek;
  onSelectDay?: (day: DayOfWeek | undefined) => void;
  onSelectGroup?: (group: Group) => void;
  highlightGroupIds?: string[];
}

/**
 * Shows groups laid out across a Monday-Sunday week, one column per day, so a player can see (and
 * on home.tsx, join) multiple groups spread across different days instead of the app only ever
 * tracking a single "active group." Each day column is tappable as a filter when onSelectDay is
 * given (browse.tsx uses this to filter its list by day), and each group chip is tappable to
 * navigate to it when onSelectGroup is given.
 * Parameters: groups (pre-filtered by the caller — e.g. "my groups" on home.tsx, or the current
 * browse results), selectedDay (the currently active day filter, if any), onSelectDay (called
 * with the tapped day, or undefined to clear the filter by tapping the same day again),
 * onSelectGroup (called with the tapped group chip), highlightGroupIds (ids to render with a
 * highlighted border, e.g. groups a rival is in, for styling parity with browse.tsx's existing
 * rival badge).
 * Returns: a horizontally-scrolling row of 7 day columns, each listing that day's groups as
 * compact tappable chips.
 * Edge cases: a day with no groups renders an empty column rather than being hidden, so the
 * week's shape stays consistent; groups with no scheduledAt are omitted entirely since they have
 * no day to place them in.
 */
export default function WeekCalendar({
  groups,
  selectedDay,
  onSelectDay,
  onSelectGroup,
  highlightGroupIds = [],
}: WeekCalendarProps) {
  const colors = useThemeColors();

  const groupsByDay = new Map<DayOfWeek, Group[]>(DAYS_OF_WEEK.map((day) => [day, []]));
  groups.forEach((group) => {
    if (group.scheduledAt === undefined) return;
    groupsByDay.get(scheduleDayOfWeek(group.scheduledAt))?.push(group);
  });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {DAYS_OF_WEEK.map((day) => {
        const dayGroups = groupsByDay.get(day) ?? [];
        const isSelected = selectedDay === day;
        return (
          <View key={day} style={[styles.column, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable
              disabled={!onSelectDay}
              onPress={() => onSelectDay?.(isSelected ? undefined : day)}
            >
              <Text style={[styles.dayLabel, { color: isSelected ? "#007AFF" : colors.textSecondary }]}>
                {day.slice(0, 3)}
              </Text>
            </Pressable>
            {dayGroups.map((group) => (
              <Pressable
                key={group.id}
                style={[
                  styles.chip,
                  { backgroundColor: colors.bg, borderColor: colors.border },
                  highlightGroupIds.includes(group.id) && styles.chipHighlighted,
                ]}
                onPress={() => onSelectGroup?.(group)}
              >
                <Text style={[styles.chipTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {GAME_EMOJI[group.gameType]} {group.name}
                </Text>
                <Text style={[styles.chipTime, { color: colors.textMuted }]}>
                  {formatScheduledAt(group.scheduledAt)}
                </Text>
              </Pressable>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingBottom: 4,
  },
  column: {
    width: 128,
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    gap: 6,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  chipHighlighted: {
    borderColor: "#C0392B",
  },
  chipTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipTime: {
    fontSize: 11,
    marginTop: 2,
  },
});
