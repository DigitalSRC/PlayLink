import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, StyleSheet, ViewStyle } from 'react-native';

interface KeyboardAvoidingScreenProps {
  children: ReactNode;
  /** Extra style for the wrapper, e.g. the screen's background color. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Wraps a screen so the on-screen keyboard pushes its content up instead of covering it.
 * Any screen with a text field below the top of the page needs this: without it, a field near
 * the bottom (Change Password on the Profile tab, "Players Needed" when editing a group) sat
 * under the keyboard and could not be seen while typing. Put the screen's scroll view inside it.
 * Uses the same settings as sign-in and the Find tab's pop-ups, so every screen behaves alike.
 * Parameters: children (the screen), style (optional; give it the screen's background color so
 * no gap shows while the keyboard is open).
 * Returns: the wrapped screen, filling its parent.
 * Edge cases: in a web browser it changes nothing - the browser moves the page itself.
 */
export function KeyboardAvoidingScreen({ children, style }: KeyboardAvoidingScreenProps) {
  return (
    <KeyboardAvoidingView
      style={[styles.fill, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
