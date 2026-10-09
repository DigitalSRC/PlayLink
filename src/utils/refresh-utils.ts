// Pure helpers behind pull-to-refresh and the refresh that runs on every tab switch. Kept free of
// React and Supabase so the gesture math and the throttle can be unit tested.

/** How far (after resistance) the list must be pulled before letting go starts a refresh. */
export const PULL_TRIGGER_PX = 70;

/** The furthest the pull indicator stretches, however far the finger travels. */
export const PULL_MAX_PX = 110;

/** Finger travel is halved, so the list feels like it resists being pulled. */
const PULL_RESISTANCE = 0.5;

/** A tab switch within this long of the last refresh does not start another one. */
export const TAB_REFRESH_MIN_GAP_MS = 3_000;

/**
 * Turns how far a finger has dragged down into how far the pull indicator should open.
 * The drag is halved so the list resists being pulled, and capped so the indicator never grows
 * past PULL_MAX_PX however far the finger goes. Dragging up never opens it.
 * Parameters: dragPx (finger travel in pixels since the touch began; positive is downward).
 * Returns: the indicator height in pixels, from 0 to PULL_MAX_PX.
 * Edge cases: a negative, zero, or non-finite drag returns 0.
 */
export const pullDistance = (dragPx: number): number => {
  if (!Number.isFinite(dragPx) || dragPx <= 0) return 0;
  return Math.min(dragPx * PULL_RESISTANCE, PULL_MAX_PX);
};

/**
 * Decides whether letting go of a pull should refresh the screen.
 * The indicator has to have opened at least PULL_TRIGGER_PX, so a small accidental drag at the
 * top of a list does nothing.
 * Parameters: distance (the indicator height at the moment the finger lifted, from pullDistance).
 * Returns: true when the pull was far enough to refresh.
 * Edge cases: exactly PULL_TRIGGER_PX counts; a non-finite distance never triggers.
 */
export const isPullFarEnough = (distance: number): boolean =>
  Number.isFinite(distance) && distance >= PULL_TRIGGER_PX;

/**
 * Decides whether opening a tab should refresh the app's data.
 * Every tab switch refreshes, except one that comes within TAB_REFRESH_MIN_GAP_MS of the last
 * refresh: opening the app fires a tab focus right after the first load, and fast tapping
 * across tabs should not send a burst of identical requests.
 * Parameters: lastRefreshAt (when the last tab refresh started, in ms; null if never), now (current time in ms).
 * Returns: true when a refresh should start now.
 * Edge cases: no previous refresh always refreshes; a clock that went backwards (lastRefreshAt
 * in the future) also refreshes rather than waiting.
 */
export const shouldRefreshOnTabFocus = (lastRefreshAt: number | null, now: number): boolean => {
  if (lastRefreshAt === null) return true;
  const gap = now - lastRefreshAt;
  return gap < 0 || gap >= TAB_REFRESH_MIN_GAP_MS;
};
