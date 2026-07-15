import ICAL from 'npm:ical.js@2';
import { FeedAdapter, FeedEvent } from './types.ts';

// Hard cap per source VEVENT so a malformed or absurdly-frequent RRULE (e.g. "every minute
// forever") can't hang the sync or flood `groups` with occurrences.
const MAX_OCCURRENCES_PER_EVENT = 60;

/**
 * Parses an iCal/.ics feed into concrete per-occurrence FeedEvents, expanding any recurring
 * VEVENT (the common case for a weekly store event) into one FeedEvent per occurrence rather
 * than modeling true recurrence - each occurrence becomes an ordinary one-off `groups` row once
 * mapped, which is also what lets the group_players_one_per_day database constraint (see
 * CLAUDE.md's calendar-system notes) apply to store events with zero special-casing.
 * Parameters: feedText (raw .ics body), windowEndMs (upper bound epoch ms - occurrences starting
 * after this are excluded, since a weekly recurrence would otherwise expand indefinitely).
 * Returns: a FeedEvent per occurrence, chronologically ordered, excluding anything already in
 * the past relative to when this function runs.
 * Edge cases: a VEVENT that fails to parse (malformed dates, unsupported RRULE parts) is skipped
 * rather than aborting the whole feed; non-recurring VEVENTs in the past are silently excluded.
 */
export const icalAdapter: FeedAdapter = {
  parse(feedText: string, windowEndMs: number): FeedEvent[] {
    const events: FeedEvent[] = [];
    const nowMs = Date.now();

    let root: unknown;
    try {
      root = ICAL.parse(feedText);
    } catch {
      return [];
    }

    const comp = new ICAL.Component(root as unknown[]);
    const vevents = comp.getAllSubcomponents('vevent');

    for (const vevent of vevents) {
      try {
        const icalEvent = new ICAL.Event(vevent);
        const uid = icalEvent.uid ?? crypto.randomUUID();
        const title = icalEvent.summary ?? 'Untitled Event';
        const description = icalEvent.description || undefined;

        if (icalEvent.isRecurring()) {
          const iterator = icalEvent.iterator();
          let next: unknown;
          let count = 0;
          while (count < MAX_OCCURRENCES_PER_EVENT && (next = iterator.next())) {
            const occurrenceTime = (next as { toJSDate: () => Date }).toJSDate();
            const startAt = occurrenceTime;
            if (startAt.getTime() > windowEndMs) break;
            count++;
            if (startAt.getTime() < nowMs) continue;

            events.push({
              externalUid: `${uid}:${startAt.toISOString()}`,
              title,
              description,
              startAt,
            });
          }
        } else {
          const startAt = icalEvent.startDate.toJSDate();
          if (startAt.getTime() >= nowMs && startAt.getTime() <= windowEndMs) {
            events.push({
              externalUid: uid,
              title,
              description,
              startAt,
              endAt: icalEvent.endDate ? icalEvent.endDate.toJSDate() : undefined,
            });
          }
        }
      } catch {
        // Skip this VEVENT - one malformed entry shouldn't block the rest of the feed.
        continue;
      }
    }

    return events;
  },
};
