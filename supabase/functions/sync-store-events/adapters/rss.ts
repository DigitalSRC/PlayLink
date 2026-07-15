import { XMLParser } from 'npm:fast-xml-parser@4';
import { FeedAdapter, FeedEvent } from './types.ts';

interface RssItem {
  title?: string;
  description?: string;
  pubDate?: string;
  guid?: string | { '#text': string };
  link?: string;
}

const parser = new XMLParser({ ignoreAttributes: false });

const itemUid = (item: RssItem): string | undefined => {
  if (typeof item.guid === 'string') return item.guid;
  if (item.guid && typeof item.guid === 'object') return item.guid['#text'];
  return item.link;
};

/**
 * Parses an RSS 2.0 feed into FeedEvents using each <item>'s <pubDate> as its start time. This is
 * the fallback structured-feed format for stores whose event platform doesn't publish iCal -
 * unlike a recurring iCal VEVENT, an RSS item is always a single concrete occurrence, so there's
 * no recurrence expansion to do here.
 * Parameters: feedText (raw RSS/XML body), windowEndMs (upper bound epoch ms - items whose
 * pubDate is after this are excluded).
 * Returns: a FeedEvent per <item> with a parseable pubDate within [now, windowEndMs].
 * Edge cases: an item with a missing or unparseable pubDate, or missing title, is skipped rather
 * than aborting the whole feed; a malformed XML document returns an empty array.
 */
export const rssAdapter: FeedAdapter = {
  parse(feedText: string, windowEndMs: number): FeedEvent[] {
    const nowMs = Date.now();
    let parsed: { rss?: { channel?: { item?: RssItem | RssItem[] } } };
    try {
      parsed = parser.parse(feedText);
    } catch {
      return [];
    }

    const rawItems = parsed.rss?.channel?.item;
    if (!rawItems) return [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    const events: FeedEvent[] = [];
    for (const item of items) {
      if (!item.title || !item.pubDate) continue;
      const startAt = new Date(item.pubDate);
      if (Number.isNaN(startAt.getTime())) continue;
      if (startAt.getTime() < nowMs || startAt.getTime() > windowEndMs) continue;

      const uid = itemUid(item);
      if (!uid) continue;

      events.push({
        externalUid: uid,
        title: item.title,
        description: item.description,
        startAt,
      });
    }

    return events;
  },
};
