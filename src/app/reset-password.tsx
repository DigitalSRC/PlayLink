import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { showToast } from '../components/AppToast';
import { KeyboardAvoidingScreen } from '../components/KeyboardAvoidingScreen';
import { MIN_PASSWORD_LENGTH, setNewPassword, startPasswordReset } from '../lib/auth-api';
import { playerErrorMessage } from '../utils/error-utils';
import { ThemeColors, useThemeColors } from '../utils/theme-utils';

type Stage = 'checking' | 'ready' | 'failed';

/**
 * Picks the first value of a route parameter, which Expo Router may give as a list.
 * Parameters: value (a route parameter as Expo Router hands it over).
 * Returns: the first string, or undefined.
 * Edge cases: an empty list or an empty string gives undefined.
 */
const firstParam = (value: string | string[] | undefined): string | undefined => {
  const v = Array.isArray(value) ? value[0] : value;
  return v ? v : undefined;
};

/**
 * The screen a password-reset email links to. It signs the player in with the link's code, then
 * asks for a new password twice and saves it. It is deliberately outside Stack.Protected in the
 * root layout: the player arrives signed out, and the link is what signs them in.
 * Parameters: none; reads `code` (and, when Supabase refused the link, `error_description`) from
 * the route.
 * Returns: a spinner while the link is checked, then the new-password form, or a message saying
 * the link did not work with a way back to sign-in.
 * Edge cases: opened with no code (typed in by hand, or a link Supabase refused) shows the
 * failure message and changes nothing; an expired or already-used link, or one opened on a
 * different device from the one that asked for it, fails the same way; the code is exchanged
 * only once even if the screen renders twice (React's development mode runs effects twice, and a
 * second exchange of the same code would fail); a too-short or mismatched password is refused
 * before anything is sent; on success the player is told so and taken into the app.
 */
export default function ResetPassword() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ code?: string | string[]; error_description?: string | string[] }>();
  const code = firstParam(params.code);
  const linkError = firstParam(params.error_description);

  const [stage, setStage] = useState<Stage>(code && !linkError ? 'checking' : 'failed');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const exchangedCode = useRef<string | null>(null);

  useEffect(() => {
    if (!code || linkError || exchangedCode.current === code) return;
    exchangedCode.current = code;
    startPasswordReset(code)
      .then(() => setStage('ready'))
      .catch((err) => {
        console.warn('Password reset link failed:', err);
        setStage('failed');
      });
  }, [code, linkError]);

  /**
   * Saves the new password after checking it locally, then goes into the app.
   * Parameters: none; reads the two typed passwords from state.
   * Returns: a promise that settles once the password is saved or refused.
   * Edge cases: a second tap while saving is ignored; a refusal from the server is shown under
   * the form and the player can try again.
   */
  const handleSave = async () => {
    if (saving) return;
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await setNewPassword(password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Password changed', 'You’re signed in with your new password.');
      router.replace('/');
    } catch (err) {
      setError(playerErrorMessage(err, 'Could not change your password. Please try again.'));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingScreen style={{ backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Choose a New Password</Text>

        {stage === 'checking' && (
          <View style={styles.center}>
            <ActivityIndicator color="#007AFF" />
            <Text style={styles.body}>Checking your link…</Text>
          </View>
        )}

        {stage === 'failed' && (
          <View style={styles.form}>
            <Text style={styles.body} testID="reset-password-failed">
              This link didn’t work. It may have expired, been used already, or been opened on a
              different device from the one you asked on. Ask for a new link from the sign-in
              screen, and open it on the same device.
            </Text>
            <Pressable style={styles.button} onPress={() => router.replace('/sign-in')} accessibilityRole="button">
              <Text style={styles.buttonText}>Back to Sign In</Text>
            </Pressable>
          </View>
        )}

        {stage === 'ready' && (
          <View style={styles.form}>
            <TextInput
              testID="reset-password-new"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={`New password (min. ${MIN_PASSWORD_LENGTH} characters)`}
              placeholderTextColor={colors.placeholder}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />
            <TextInput
              testID="reset-password-confirm"
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirm new password"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            <Pressable
              testID="reset-password-save"
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Save Password</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingScreen>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  content: { flexGrow: 1, paddingTop: 72, paddingBottom: 40, paddingHorizontal: 24 },
  title: { fontSize: 26, fontWeight: '800', color: c.textPrimary, textAlign: 'center', marginBottom: 24 },
  center: { alignItems: 'center', gap: 12 },
  form: { gap: 12 },
  body: { fontSize: 15, color: c.textBody, lineHeight: 22, textAlign: 'center' },
  input: {
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, color: c.textPrimary,
  },
  errorText: { fontSize: 13, color: '#FF3B30', fontWeight: '600', textAlign: 'center' },
  button: { backgroundColor: '#007AFF', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
