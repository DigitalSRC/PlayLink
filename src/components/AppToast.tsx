import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../utils/theme-utils';

interface ToastRequest {
  id: number;
  title: string;
  message?: string;
}

/** How long a toast stays up when nobody touches the screen. */
export const TOAST_DURATION_MS = 3500;

// Toasts waiting to be shown, oldest first, kept as a small module-level store (the same shape
// as AppDialog's) so any screen or hook can raise one without a context.
let queue: ToastRequest[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

const setQueue = (next: ToastRequest[]) => {
  queue = next;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getQueue = () => queue;
const removeToast = (id: number) => setQueue(queue.filter((t) => t.id !== id));

/**
 * Shows a short message that goes away by itself: "Group posted!", "+25 points".
 * Use it to tell a player something worked. Unlike showDialog there is nothing to press: it
 * closes after a few seconds, or at once when the player taps anywhere. Use showDialog instead
 * when the player has to choose something or needs to read an error.
 * Parameters: title, message (optional second line).
 * Returns: void.
 * Edge cases: toasts raised while one is showing wait their turn and appear one after another,
 * so "Group posted!" followed by "+25 points" are both seen; with no ToastHost mounted (a
 * screen rendered alone in a unit test) the request is dropped, since nothing is waiting on it.
 */
export const showToast = (title: string, message?: string): void => {
  if (listeners.size === 0) return;
  setQueue([...queue, { id: nextId++, title, message }]);
};

/**
 * Draws the toasts raised through showToast. Mounted once, at the root of the app, after the
 * screen stack so it sits above every screen and the tab bar.
 * While a toast is up, a see-through layer covers the screen so that a tap anywhere closes it;
 * that one tap is used up by closing the toast and does not reach what is underneath.
 * Parameters: none; reads the theme from global context.
 * Returns: the oldest waiting toast near the top of the screen, or nothing when none is waiting.
 * Edge cases: the timer restarts for each toast, so a queued one gets its full time; unmounting
 * mid-toast clears the timer; a native Modal that is open at the same time draws above this.
 */
export function ToastHost() {
  const colors = useThemeColors();
  const pending = useSyncExternalStore(subscribe, getQueue, getQueue);
  const current = pending[0];
  const currentId = current?.id;

  useEffect(() => {
    if (currentId === undefined) return;
    const timer = setTimeout(() => removeToast(currentId), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [currentId]);

  if (!current) return null;

  return (
    <Pressable
      style={styles.layer}
      onPress={() => removeToast(current.id)}
      accessibilityRole="button"
      accessibilityLabel={`${current.title}. Tap to dismiss`}
    >
      <View
        style={[styles.card, { backgroundColor: colors.successBg, borderColor: colors.successText }]}
        accessibilityLiveRegion="polite"
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>{current.title}</Text>
        {!!current.message && (
          <Text style={[styles.message, { color: colors.textBody }]}>{current.message}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
});
