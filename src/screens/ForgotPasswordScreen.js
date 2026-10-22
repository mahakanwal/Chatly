import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import AuthInput from '../components/AuthInput';
import PrimaryButton from '../components/PrimaryButton';
import RoundButton from '../components/RoundButton';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_SECONDS = 60;

/** Step 1: enter email -> code is e-mailed. Step 2: enter code + new password. */
export default function ForgotPasswordScreen({ navigation }) {
  const { login } = useAuth();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const cleanEmail = email.trim().toLowerCase();

  const sendCode = async () => {
    if (!EMAIL_RE.test(cleanEmail) || loading) return;
    setLoading(true);
    setError('');
    setInfo('');
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: cleanEmail } });
      setStep(2);
      setSeconds(RESEND_SECONDS);
      setInfo('If this email has an account, a code is on its way.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    if (code.length !== 6 || password.length < 8 || loading) return;
    setLoading(true);
    setError('');
    try {
      const { token, user } = await api('/auth/reset-password', { method: 'POST', body: { email: cleanEmail, code, password } });
      await login(token, user);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.header}>
          <RoundButton icon="arrow-back" onPress={() => (step === 2 ? setStep(1) : navigation.goBack())} size={42} accessibilityLabel="Back" />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{step === 1 ? 'Forgot password?' : 'Set a new password'}</Text>
          <Text style={styles.subtitle}>
            {step === 1 ? 'Enter your email and we will send you a 6-digit code.' : `Enter the code sent to ${cleanEmail} and choose a new password.`}
          </Text>

          {step === 1 ? (
            <>
              <AuthInput
                icon="mail-outline"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setError('');
                }}
                placeholder="Email address"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                accessibilityLabel="Email address"
                returnKeyType="done"
                onSubmitEditing={sendCode}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton title="Send code" onPress={sendCode} loading={loading} disabled={!EMAIL_RE.test(cleanEmail)} style={{ marginTop: 16 }} />
            </>
          ) : (
            <>
              <AuthInput
                icon="keypad-outline"
                value={code}
                onChangeText={(t) => {
                  setCode(t.replace(/\D/g, '').slice(0, 6));
                  setError('');
                }}
                placeholder="6-digit code"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                accessibilityLabel="Code"
              />
              <AuthInput
                icon="lock-closed-outline"
                secure
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setError('');
                }}
                placeholder="New password (min 8 characters)"
                textContentType="newPassword"
                accessibilityLabel="New password"
                returnKeyType="done"
                onSubmitEditing={reset}
              />
              {info ? <Text style={styles.info}>{info}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PrimaryButton title="Save password" onPress={reset} loading={loading} disabled={code.length !== 6 || password.length < 8} style={{ marginTop: 16 }} />
              <View style={styles.resendRow}>
                {seconds > 0 ? (
                  <Text style={styles.muted}>Resend code in {seconds}s</Text>
                ) : (
                  <Pressable onPress={sendCode} hitSlop={8}>
                    <Text style={styles.link}>Resend code</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 18, paddingTop: 8 },
  content: { padding: 24, paddingTop: 16 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 24 },
  error: { color: colors.danger, marginTop: 4, textAlign: 'center' },
  info: { color: colors.success, marginBottom: 8, textAlign: 'center' },
  resendRow: { alignItems: 'center', marginTop: 22 },
  muted: { color: colors.textMuted, fontSize: 14 },
  link: { color: colors.accent, fontSize: 14, fontWeight: '700' },
});