import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MonthCalendar from '../../components/MonthCalendar';
import { useApp } from '../../context/AppContext';
import { useLocalEventsQuery } from '../../hooks/useLocalEventQueries';
import {
  countEventsByDay,
  dateKeyFromMs,
  eventsOnDate,
  formatDayHeading,
  formatEventTime,
  formatMonthTitle,
  resolveEventArea,
  shiftMonth,
  YearMonth,
} from '../../utils/calendar-utils';
import { useThemeColors } from '../../utils/theme-utils';

// The calendar shows Commander nights only. Other formats can live in `local_events` without
// appearing here; widening this is a product decision, not a data one.
const CALENDAR_FORMAT = 'Commander';

/**
 * Calendar tab — a month view of the local Commander nights in the player's area.
 * Days that have a Commander night are marked with a dot and the current day is highlighted.
 * Tapping a day lists where to play that day: venue, event name, start time, address, and notes.
 * The events are synced automatically from the Wizards store locator (see
 * supabase/functions/sync-local-events); this screen only reads the resulting table.
 * The area comes from the player's profile location and falls back to Reno-Sparks.
 * Parameters: none; reads currentUser and getNow from global context.
 * Returns: a scrollable screen with month navigation, the month grid, and the selected day's venues.
 * Edge cases: returns null if currentUser is not yet set; shows a spinner on first load, a retry
 * card if the events can't be fetched, and an empty-state message when the area has no events or
 * the selected day has none; moving to another month clears the selected day until one is tapped.
 */
export default function CalendarScreen() {
  const { currentUser, getNow } = useApp();
  const colors = useThemeColors();

  const now = new Date(getNow());
  const todayKey = dateKeyFromMs(now.getTime());
  const todayMonth: YearMonth = { year: now.getFullYear(), month: now.getMonth() };

  const [view, setView] = useState<YearMonth>(todayMonth);
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);

  const area = resolveEventArea(currentUser?.location);
  const { data: events = [], isLoading, isError, refetch, isRefetching } = useLocalEventsQuery(
    area.id,
    CALENDAR_FORMAT
  );

  if (!currentUser) return null;

  const isCurrentMonth = view.year === todayMonth.year && view.month === todayMonth.month;
  const eventCounts = countEventsByDay(events, view.year, view.month);

  const selectedDay = selectedKey ? Number(selectedKey.slice(8, 10)) : null;
  const selectedEvents =
    selectedDay !== null ? eventsOnDate(events, view.year, view.month, selectedDay) : [];

  const changeMonth = (delta: number) => {
    setView(shiftMonth(view, delta));
    setSelectedKey(null);
  };

  const goToToday = () => {
    setView(todayMonth);
    setSelectedKey(todayKey);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Commander Nights</Text>
      <Text style={[styles.subheading, { color: colors.textSecondary }]}>{area.label}</Text>

      <View style={styles.monthRow}>
        <Pressable
          style={[styles.navButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => changeMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <Text style={[styles.navButtonText, { color: colors.textPrimary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>{formatMonthTitle(view)}</Text>
        <Pressable
          style={[styles.navButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => changeMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <Text style={[styles.navButtonText, { color: colors.textPrimary }]}>›</Text>
        </Pressable>
      </View>

      <MonthCalendar
        year={view.year}
        month={view.month}
        todayKey={todayKey}
        selectedKey={selectedKey}
        eventCounts={eventCounts}
        onSelectDay={setSelectedKey}
      />

      {!isCurrentMonth && (
        <Pressable style={styles.todayLink} onPress={goToToday} accessibilityRole="button">
          <Text style={styles.todayLinkText}>Back to today</Text>
        </Pressable>
      )}

      <View style={styles.section}>
        {isLoading ? (
          <ActivityIndicator color="#007AFF" style={styles.spinner} />
        ) : isError ? (
          <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
              {"Couldn't load Commander nights"}
            </Text>
            <Text style={[styles.messageBody, { color: colors.textSecondary }]}>
              Check your connection and try again.
            </Text>
            <Pressable
              style={[styles.retryButton, isRefetching && styles.retryButtonBusy]}
              onPress={() => refetch()}
              disabled={isRefetching}
              accessibilityRole="button"
            >
              <Text style={styles.retryButtonText}>{isRefetching ? 'Retrying…' : 'Try again'}</Text>
            </Pressable>
          </View>
        ) : events.length === 0 ? (
          <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
              No Commander nights listed yet
            </Text>
            <Text style={[styles.messageBody, { color: colors.textSecondary }]}>
              Nothing has been added for {area.label} so far.
            </Text>
          </View>
        ) : selectedKey === null ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Tap a day to see where to play.
          </Text>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {formatDayHeading(selectedKey)}
            </Text>
            {selectedEvents.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                No Commander night on this day.
              </Text>
            ) : (
              selectedEvents.map((event) => {
                const start = formatEventTime(event.startTime);
                const end = event.endTime ? formatEventTime(event.endTime) : '';
                return (
                  <View
                    key={event.id}
                    style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <Text style={[styles.eventVenue, { color: colors.textPrimary }]}>{event.venueName}</Text>
                    {event.title !== '' && (
                      <Text style={[styles.eventTitle, { color: colors.textSecondary }]}>{event.title}</Text>
                    )}
                    {start !== '' && (
                      <Text style={styles.eventTime}>{end !== '' ? `${start} – ${end}` : start}</Text>
                    )}
                    {event.address !== '' && (
                      <Text style={[styles.eventDetail, { color: colors.textSecondary }]}>{event.address}</Text>
                    )}
                    {event.notes !== '' && (
                      <Text style={[styles.eventDetail, { color: colors.textMuted }]}>{event.notes}</Text>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
  },
  subheading: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 20,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonText: {
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 28,
  },
  todayLink: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  todayLinkText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '700',
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  spinner: {
    marginTop: 12,
  },
  hint: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  messageCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  messageBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryButtonBusy: {
    opacity: 0.6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  eventCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    padding: 16,
    marginBottom: 10,
  },
  eventVenue: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  eventDetail: {
    fontSize: 13,
    lineHeight: 19,
  },
});
