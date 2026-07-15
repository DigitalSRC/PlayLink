// The normalized shape every feed adapter produces, regardless of source format. index.ts and
// mapping.ts only ever see this shape - a future adapter (e.g. HTML scraping for a store with no
// structured feed) is just a third file implementing FeedAdapter.parse(), with no change needed
// anywhere else in the pipeline.
export interface FeedEvent {
  // A stable id for this specific occurrence (not just the parent event) - e.g. `${icalUid}:${occurrenceDateISO}`
  // for a recurring iCal VEVENT, or the RSS item's own guid/link for a one-off RSS entry. This is
  // what groups.external_uid dedupes re-syncs against.
  externalUid: string;
  title: string;
  description?: string;
  startAt: Date;
  endAt?: Date;
}

export interface FeedAdapter {
  /**
   * Parses raw feed text into a flat list of concrete occurrences within a lookahead window.
   * Parameters: feedText (the raw .ics or RSS/XML body fetched from a store's feed_url),
   * windowEndMs (epoch ms - occurrences starting after this are not returned, since a recurring
   * weekly event would otherwise expand indefinitely).
   * Returns: an array of FeedEvent, one per concrete occurrence (a recurring source event yields
   * multiple FeedEvents, one per occurrence within the window).
   * Edge cases: malformed entries within an otherwise-parseable feed are skipped rather than
   * failing the whole parse, so one bad calendar entry doesn't block a store's other events.
   */
  parse(feedText: string, windowEndMs: number): FeedEvent[];
}
