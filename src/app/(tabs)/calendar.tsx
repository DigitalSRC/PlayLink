import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MonthCalendar from '../../components/MonthCalendar';
import { useApp } from '../../context/AppContext';
import { useLocalEventsQuery } from '../../hooks/useLocalEventQueries';
import {
  dateKeyFromMs,
  eventsOnDate,
  formatDayHeading,
  formatEventTime,
  formatMonthTitle,
  listFormats,
  resolveEventArea,
  upcomingAgenda,
  venueLabelsByDay,
} from '../../utils/calendar-utils';
import { useThemeColors } from '../../utils/theme-utils';

// The format shown when the tab opens. Commander is what PlayLink is built around; the others
// are a tap away in the switcher.
const DEFAULT_FORMAT = 'Commander';

/**
 * Calendar tab — this month's local game-store events for the player's area.
 * The top says which format is showing (Commander by default) with a row of chips to switch.
 * The month grid writes the stores that have an event on each day and highlights today.
 * Below it is a "coming up" list: every remaining day this month with an event, in order, with
 * each event's store, name, start time, address, and notes. Tapping a day narrows the list to it.
 * Only the current month is shown; there is no month navigation yet.
 * The events are synced automatically from the Wizards store locator (see
 * supabase/functions/sync-local-events); this screen only reads the resulting table. The area
 * comes from the player's profile location and falls back to Reno-Sparks.
 * Parameters: none; reads currentUser and getNow from global context.
 * Returns: a scrollable screen with the format switcher, the month grid, and the upcoming list.
 * Edge cases: returns null if currentUser is not yet set; shows a spinner on first load and a
 * retry card if the events can't be fetched; the switcher is hidden when only one format exists;
 * if the chosen format has nothing left this month, or the tapped day has no event, it says so
 * instead of showing an empty list; if Commander has no events at all, the first available
 * format is shown instead.
 */
export default function CalendarScreen() {
  const { currentUser, getNow } = useApp();
  const colors = useThemeColors();

  const now = new Date(getNow());
  const todayKey = dateKeyFromMs(now.getTime());
  const year = now.getFullYear();
  const month = now.getMonth();

  const [chosenFormat, setChosenFormat] = useState<string>(DEFAULT_FORMAT);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const area = resolveEventArea(currentUser?.location);
  const { data: allEvents = [], isLoading, isError, refetch, isRefetching } = useLocalEventsQuery(
    area.id
  );

  if (!currentUser) return null;

  const formats = listFormats(allEvents, DEFAULT_FORMAT);
  const format = formats.includes(chosenFormat) ? chosenFormat : formats[0] ?? DEFAULT_FORMAT;
  const events = allEvents.filter((event) => event.format === format);

  const venueLabels = venueLabelsByDay(events, year, month);
  const agenda =
    selectedKey !== null
      ? [
          {
            dateKey: selectedKey,
            day: Number(selectedKey.slice(8, 10)),
            events: eventsOnDate(events, year, month, Number(selectedKey.slice(8, 10))),
          },
        ]
      : upcomingAgenda(events, year, month, now.getDate());
  const agendaIsEmpty = agenda.every((day) => day.events.length === 0);

  const chooseFormat = (next: string) => {
    setChosenFormat(next);
    setSelectedKey(null);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Calendar</Text>
      <Text style={[styles.subheading, { color: colors.textSecondary }]}>{area.label}</Text>

      <Text style={[styles.showing, { color: colors.textPrimary }]}>Showing {format} events</Text>
      {formats.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {formats.map((option) => {
            const active = option === format;
            return (
              <Pressable
                key={option}
                style={[
                  styles.chip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  active && styles.chipActive,
                ]}
                onPress={() => chooseFormat(option)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${option} events`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <Text style={[styles.monthTitle, { color: colors.textPrimary }]}>
        {formatMonthTitle({ year, month })}
      </Text>

      <MonthCalendar
        year={year}
        month={month}
        todayKey={todayKey}
        selectedKey={selectedKey}
        venueLabels={venueLabels}
        onSelectDay={(key) => setSelectedKey(key === selectedKey ? null : key)}
      />

      <View style={styles.section}>
        {isLoading ? (
          <ActivityIndicator color="#007AFF" style={styles.spinner} />
        ) : isError ? (
          <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
              {"Couldn't load events"}
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
        ) : allEvents.length === 0 ? (
          <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>No events listed yet</Text>
            <Text style={[styles.messageBody, { color: colors.textSecondary }]}>
              Nothing has been added for {area.label} so far.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {selectedKey !== null ? 'Selected day' : 'Coming up this month'}
              </Text>
              {selectedKey !== null && (
                <Pressable onPress={() => setSelectedKey(null)} accessibilityRole="button">
                  <Text style={styles.link}>Show all upcoming</Text>
                </Pressable>
              )}
            </View>

            {agendaIsEmpty ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {selectedKey !== null
                  ? `No ${format} event on ${formatDayHeading(selectedKey)}.`
                  : `No more ${format} events this month.`}
              </Text>
            ) : (
              agenda.map((day) => (
                <View key={day.dateKey} style={styles.agendaDay}>
                  <Text style={[styles.dayHeading, { color: colors.textPrimary }]}>
                    {day.dateKey === todayKey ? 'Today · ' : ''}
                    {formatDayHeading(day.dateKey)}
                  </Text>
                  {day.events.map((event) => {
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
                          <Text style={[styles.eventDetail, { color: colors.textMuted }]} numberOfLines={4}>
                            {event.notes}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))
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
    paddingHorizontal: 16,
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
    marginBottom: 18,
  },
  showing: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  chipRow: {
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 10,
  },
  section: {
    marginTop: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  link: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '700',
  },
  spinner: {
    marginTop: 12,
  },
  hint: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  agendaDay: {
    marginBottom: 14,
  },
  dayHeading: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
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
    padding: 14,
    marginBottom: 8,
  },
  eventVenue: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
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
