import { useSyncExternalStore } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../utils/theme-utils';

export interface DialogButton {
  text: string;
  /** 'cancel' is the quiet way out, 'destructive' is drawn in red; anything else is the main action. */
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
}

// Dialogs waiting to be shown, oldest first, and whoever is drawing them (the mounted
// DialogHost). Kept at module level, as a small store, so any screen can ask for a dialog
// without threading a context through.
let queue: DialogRequest[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

const setQueue = (next: DialogRequest[]) => {
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
const removeDialog = (id: number) => setQueue(queue.filter((d) => d.id !== id));

/**
 * Shows a pop-up with a title, a message, and one or more buttons, on every platform.
 * This replaces React Native's Alert.alert, which draws nothing at all in a web browser: every
 * confirmation, warning, and error in the app was silently skipped there, so a tap that should
 * have asked "Delete this posting?" simply did nothing.
 * The arguments are the same as Alert.alert's, so a call site only changes the function name.
 * Parameters: title, message (optional), buttons (optional; a single "OK" when left out).
 * Returns: void; the chosen button's onPress runs after the dialog closes.
 * Edge cases: dialogs requested while one is open wait their turn and appear in order; if no
 * DialogHost is mounted (a screen rendered on its own, as in a unit test) it falls back to
 * Alert.alert so the request is never dropped.
 */
export const showDialog = (title: string, message?: string, buttons?: DialogButton[]): void => {
  if (listeners.size === 0) {
    Alert.alert(title, message, buttons);
    return;
  }
  setQueue([
    ...queue,
    { id: nextId++, title, message, buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }] },
  ]);
};

/**
 * Draws the dialogs requested through showDialog. Mounted once, at the root of the app, above
 * every screen and the tab bar.
 * Tapping outside the card, or the hardware back button, takes the "cancel" button if the
 * dialog has one, or the only button if there is just one. A dialog with a real choice and no
 * cancel must be answered.
 * Parameters: none; reads the theme from global context.
 * Returns: a transparent modal holding the oldest waiting dialog, or nothing when none is waiting.
 * Edge cases: a button's onPress runs after the dialog has been removed from the queue, so an
 * onPress that opens another dialog shows it next instead of being swallowed; only one host is
 * expected, and a second one would draw the same dialog twice.
 */
export function DialogHost() {
  const colors = useThemeColors();
  const pending = useSyncExternalStore(subscribe, getQueue, getQueue);

  const current = pending[0];
  if (!current) return null;

  const choose = (button: DialogButton | undefined) => {
    removeDialog(current.id);
    button?.onPress?.();
  };

  const dismiss = () => {
    const cancel = current.buttons.find((b) => b.style === 'cancel');
    if (cancel) choose(cancel);
    else if (current.buttons.length === 1) choose(current.buttons[0]);
  };

  const stacked = current.buttons.length > 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Close">
        <Pressable
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="alert"
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>{current.title}</Text>
          {!!current.message && (
            <ScrollView style={styles.messageScroll}>
              <Text style={[styles.message, { color: colors.textBody }]}>{current.message}</Text>
            </ScrollView>
          )}
          <View style={[styles.buttonRow, stacked && styles.buttonColumn]}>
            {current.buttons.map((button, index) => {
              const quiet = button.style === 'cancel';
              const danger = button.style === 'destructive';
              return (
                <Pressable
                  key={`${index}-${button.text}`}
                  style={[
                    styles.button,
                    !stacked && styles.buttonInRow,
                    quiet && { backgroundColor: colors.bg, borderColor: colors.border },
                    danger && styles.buttonDanger,
                  ]}
                  onPress={() => choose(button)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.buttonText, quiet && { color: colors.textSecondary }]}>{button.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  messageScroll: {
    marginTop: 8,
    flexGrow: 0,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  buttonColumn: {
    flexDirection: 'column',
  },
  button: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  buttonInRow: {
    flex: 1,
  },
  buttonDanger: {
    backgroundColor: '#C0392B',
    borderColor: '#C0392B',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
