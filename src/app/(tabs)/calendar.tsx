import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MonthCalendar from '../../components/MonthCalendar';
import { useApp } from '../../context/AppContext';
import { LocalEvent } from '../../data/local-events';
import {
  useEventAreaQuery,
  useLocalEventsQuery,
  useRefreshEventAreaMutation,
} from '../../hooks/useLocalEventQueries';
import { useUpdateProfileMutation } from '../../hooks/useProfileQueries';
import {
  dateKeyFromMs,
  eventsOnDate,
  formatAgo,
  formatDayHeading,
  formatEventTime,
  formatMonthTitle,
  listFormats,
  upcomingAgenda,
  venueLabelsByDay,
} from '../../utils/calendar-utils';
import { useThemeColors } from '../../utils/theme-utils';
import { storeEventLinkParams } from '../../utils/venue-bonus-utils';

// The format shown when the tab opens. Commander is what PlayLink is built around; the others
// are a tap away in the switcher.
const DEFAULT_FORMAT = 'Commander';
const MIN_LOCATION_LENGTH = 2;
const MAX_LOCATION_LENGTH = 100;

/**
 * Calendar tab — this month's local game-store events for wherever the player is.
 * The top shows the area being displayed with a Change control: saving a new location updates
 * the player's profile (so every other tab sees it too), and the server then finds or creates
 * the matching area and pulls its events. "Update events" asks the server to refresh now.
 * Below that: which format is showing (Commander by default) with chips to switch, the month
 * grid with the stores that have an event written on each day, and a "coming up" list of every
 * remaining day this month with an event. Tapping a day narrows the list to it.
 * Every listed event from today onward has a "Create game" button, which opens the normal
 * create-group form (on the Find tab) already tied to that store and night. It is the only way
 * a group gets linked to a store event, and so the only way to earn the store-event bonus.
 * Only the current month is shown; there is no month navigation yet.
 * Events come from the Wizards store locator via supabase/functions/sync-local-events; which
 * area a location belongs to is decided by supabase/functions/resolve-area. This screen only
 * reads the results.
 * Parameters: none; reads currentUser, session, and getNow from global context.
 * Returns: a scrollable screen with the location controls, format switcher, month grid, and list.
 * Edge cases: returns null if currentUser is not yet set; with no location saved it asks for
 * one; while the area is being worked out it shows a spinner; a place the server can't identify
 * gets a "couldn't find" message with the editor, while an outage gets a retry; a refresh that
 * the server declines (too soon) or that fails still leaves the last saved events on screen with
 * a note; the editor rejects text shorter than 2 or longer than 100 characters; the format
 * switcher is hidden when only one format exists; an event on a day that has already passed has
 * no "Create game" button; tapping it while already in a group explains why instead of opening
 * the form.
 */
export default function CalendarScreen() {
  const router = useRouter();
  const { currentUser, session, getNow, groups } = useApp();
  const colors = useThemeColors();
  const updateProfileMutation = useUpdateProfileMutation();
  const refreshMutation = useRefreshEventAreaMutation();

  const nowMs = getNow();
  const now = new Date(nowMs);
  const todayKey = dateKeyFromMs(nowMs);
  const year = now.getFullYear();
  const month = now.getMonth();

  const [chosenFormat, setChosenFormat] = useState<string>(DEFAULT_FORMAT);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftLocation, setDraftLocation] = useState('');

  const location = currentUser?.location?.trim() ?? '';
  const areaQuery = useEventAreaQuery(location);
  const area = areaQuery.data?.area;
  const {
    data: allEvents = [],
    isLoading: eventsLoading,
    isError: eventsError,
    refetch: refetchEvents,
    isRefetching: eventsRefetching,
  } = useLocalEventsQuery(area?.id ?? '');

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

  /**
   * Starts a new group for a store event: opens the create-group form on the Find tab with the
   * store, night, start time, game, and format carried over, so the group that gets posted is
   * linked to this event. Nothing is created here - the player still fills in and posts the form.
   * Parameters: event (the listing that was tapped), dateKey (the "YYYY-MM-DD" day it is listed
   * under, which pins a weekly event to one night).
   * Returns: void.
   * Edge cases: a player who is already in a group gets an alert instead, since they can only
   * be in one; if the groups list hasn't loaded yet the form opens and its own check (and the
   * database's one-group rule) still applies.
   */
  const createGameAt = (event: LocalEvent, dateKey: string) => {
    if (groups.some((g) => g.players.some((p) => p.id === currentUser.id))) {
      Alert.alert('Already in a group', 'Leave your current group before creating another.');
      return;
    }
    router.push({ pathname: '/(tabs)/browse', params: storeEventLinkParams(event, dateKey) });
  };

  const openEditor = () => {
    setDraftLocation(currentUser.location);
    setEditing(true);
  };

  const draft = draftLocation.trim();
  const draftValid = draft.length >= MIN_LOCATION_LENGTH && draft.length <= MAX_LOCATION_LENGTH;

  const saveLocation = () => {
    if (!draftValid || !session) return;
    if (draft !== location) {
      updateProfileMutation.mutate({ userId: session.user.id, patch: { location: draft } });
      setSelectedKey(null);
      refreshMutation.reset();
    }
    setEditing(false);
  };

  const areaNotFound =
    areaQuery.error?.code === 'location_not_found' || areaQuery.error?.code === 'invalid_location';
  const refreshed = refreshMutation.data;
  const lastSyncedAt = refreshed?.lastSyncedAt ?? areaQuery.data?.lastSyncedAt ?? null;
  const refreshNote = refreshMutation.isError
    ? "Couldn't update just now. Showing the last saved events."
    : refreshed?.syncError
      ? "Couldn't update just now. Showing the last saved events."
      : refreshed && !refreshed.synced
        ? 'Already up to date.'
        : null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Calendar</Text>

      <View style={styles.locationRow}>
        <Text style={[styles.locationLabel, { color: colors.textBody }]} numberOfLines={1}>
          {area?.label ?? (location !== '' ? location : 'No location set')}
        </Text>
        {!editing && (
          <Pressable onPress={openEditor} accessibilityRole="button" accessibilityLabel="Change location">
            <Text style={[styles.link, { color: colors.accentText }]}>Change</Text>
          </Pressable>
        )}
      </View>

      {editing && (
        <View style={[styles.editor, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
          <Text style={[styles.editorLabel, { color: colors.textBody }]}>Where are you playing?</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bg, color: colors.textPrimary, borderColor: colors.border }]}
            value={draftLocation}
            onChangeText={setDraftLocation}
            placeholder="City, State — e.g. Reno, NV"
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={MAX_LOCATION_LENGTH}
            returnKeyType="done"
            onSubmitEditing={saveLocation}
            accessibilityLabel="Location"
          />
          <Text style={[styles.editorHint, { color: colors.textSecondary }]}>
            This updates your location everywhere in PlayLink.
          </Text>
          <View style={styles.editorButtons}>
            <Pressable
              style={[styles.secondaryButton, { borderColor: colors.border }]}
              onPress={() => setEditing(false)}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryButtonText, { color: colors.textBody }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, !draftValid && styles.buttonDisabled]}
              onPress={saveLocation}
              disabled={!draftValid}
              accessibilityRole="button"
              accessibilityLabel="Save location"
            >
              <Text style={styles.primaryButtonText}>Save</Text>
            </Pressable>
          </View>
        </View>
      )}

      {location === '' ? (
        <View style={[styles.messageCard, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>Set your location</Text>
          <Text style={[styles.messageBody, { color: colors.textBody }]}>
            Tell us what city you&apos;re in to see events near you.
          </Text>
        </View>
      ) : areaQuery.isPending ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#007AFF" />
          <Text style={[styles.hint, { color: colors.textBody }]}>Finding events near {location}…</Text>
        </View>
      ) : areaQuery.isError ? (
        <View style={[styles.messageCard, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
            {areaNotFound ? `We couldn't find “${location}”` : "Couldn't load your area"}
          </Text>
          <Text style={[styles.messageBody, { color: colors.textBody }]}>
            {areaNotFound
              ? 'Try a city and state, like “Reno, NV”.'
              : 'Check your connection and try again.'}
          </Text>
          {areaNotFound ? (
            !editing && (
              <Pressable style={styles.primaryButtonSpaced} onPress={openEditor} accessibilityRole="button">
                <Text style={styles.primaryButtonText}>Change location</Text>
              </Pressable>
            )
          ) : (
            <Pressable
              style={[styles.primaryButtonSpaced, areaQuery.isRefetching && styles.buttonDisabled]}
              onPress={() => areaQuery.refetch()}
              disabled={areaQuery.isRefetching}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>
                {areaQuery.isRefetching ? 'Retrying…' : 'Try again'}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          <View style={styles.updateRow}>
            <Text style={[styles.updatedText, { color: colors.textSecondary }]}>
              Events updated {formatAgo(lastSyncedAt, nowMs)}
            </Text>
            <Pressable
              style={[
                styles.secondaryButton,
                { borderColor: colors.border, backgroundColor: colors.cardRaised },
                refreshMutation.isPending && styles.buttonDisabled,
              ]}
              onPress={() => refreshMutation.mutate({ location })}
              disabled={refreshMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Update events"
            >
              <Text style={[styles.secondaryButtonText, { color: colors.accentText }]}>
                {refreshMutation.isPending ? 'Updating…' : 'Update events'}
              </Text>
            </Pressable>
          </View>
          {refreshNote !== null && (
            <Text style={[styles.refreshNote, { color: colors.textBody }]}>{refreshNote}</Text>
          )}

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
                      { backgroundColor: colors.cardRaised, borderColor: colors.border },
                      active && styles.chipActive,
                    ]}
                    onPress={() => chooseFormat(option)}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${option} events`}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.textBody }]}>
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
            {eventsLoading ? (
              <ActivityIndicator color="#007AFF" style={styles.spinner} />
            ) : eventsError ? (
              <View style={[styles.messageCard, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
                <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
                  {"Couldn't load events"}
                </Text>
                <Text style={[styles.messageBody, { color: colors.textBody }]}>
                  Check your connection and try again.
                </Text>
                <Pressable
                  style={[styles.primaryButtonSpaced, eventsRefetching && styles.buttonDisabled]}
                  onPress={() => refetchEvents()}
                  disabled={eventsRefetching}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryButtonText}>{eventsRefetching ? 'Retrying…' : 'Try again'}</Text>
                </Pressable>
              </View>
            ) : allEvents.length === 0 ? (
              <View style={[styles.messageCard, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
                <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>No events found here yet</Text>
                <Text style={[styles.messageBody, { color: colors.textBody }]}>
                  No store near {area?.label} has posted events. Try “Update events”, or a larger city nearby.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textBody }]}>
                    {selectedKey !== null ? 'Selected day' : 'Coming up this month'}
                  </Text>
                  {selectedKey !== null && (
                    <Pressable onPress={() => setSelectedKey(null)} accessibilityRole="button">
                      <Text style={[styles.link, { color: colors.accentText }]}>Show all upcoming</Text>
                    </Pressable>
                  )}
                </View>

                {agendaIsEmpty ? (
                  <Text style={[styles.hint, { color: colors.textBody }]}>
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
                            style={[styles.eventCard, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}
                          >
                            <View style={styles.eventHeader}>
                              <Text style={[styles.eventVenue, { color: colors.textPrimary }]}>{event.venueName}</Text>
                              {day.dateKey >= todayKey && start !== '' && (
                                <Pressable
                                  style={styles.createGameButton}
                                  onPress={() => createGameAt(event, day.dateKey)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Create a game at ${event.venueName}`}
                                >
                                  <Text style={styles.createGameText}>+ Create game</Text>
                                </Pressable>
                              )}
                            </View>
                            {event.title !== '' && (
                              <Text style={[styles.eventTitle, { color: colors.textBody }]}>{event.title}</Text>
                            )}
                            {start !== '' && (
                              <Text style={[styles.eventTime, { color: colors.accentText }]}>
                                {end !== '' ? `${start} – ${end}` : start}
                              </Text>
                            )}
                            {event.address !== '' && (
                              <Text style={[styles.eventDetail, { color: colors.textBody }]}>{event.address}</Text>
                            )}
                            {event.notes !== '' && (
                              <Text style={[styles.eventNotes, { color: colors.textBody }]} numberOfLines={4}>
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
        </>
      )}
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  locationLabel: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  link: {
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 6,
  },
  editor: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  editorLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
  },
  editorHint: {
    fontSize: 12,
    marginTop: 8,
  },
  editorButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  primaryButtonSpaced: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  updatedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  refreshNote: {
    fontSize: 12,
    marginBottom: 4,
  },
  centered: {
    alignItems: 'center',
    marginTop: 30,
    gap: 12,
  },
  showing: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
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
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  messageCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
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
  eventCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    padding: 14,
    marginBottom: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 3,
  },
  eventVenue: {
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  createGameButton: {
    borderWidth: 1.5,
    borderColor: '#007AFF',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  createGameText: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '700',
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  eventDetail: {
    fontSize: 14,
    lineHeight: 20,
  },
  eventNotes: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
    opacity: 0.85,
  },
});
