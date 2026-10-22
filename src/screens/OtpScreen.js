import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, raised } from '../theme';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PrimaryButton from '../components/PrimaryButton';
import RoundButton from '../components/RoundButton';

const LENGTH = 6;
const RESEND_SECONDS = 60;

export default function OtpScreen({ route, navigation }) {
  const { phone } = route.params;
  const { login } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [info, setInfo] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const verify = async (value = code) => {
    if (value.length !== LENGTH || loading) return;
    setLoading(true);
    setError('');
    try {
      const { token, user } = await api('/auth/verify-otp', { method: 'POST', body: { phone, code: value } });
      await login(token, user);
    } catch (err) {
      setError(err.message);
      setCode('');
      setLoading(false);
    }
  };

  const onChange = (t) => {
    const v = t.replace(/\D/g, '').slice(0, LENGTH);
    setCode(v);
    setError('');
    if (v.length === LENGTH) verify(v);
  };

  const resend = async () => {
    setInfo('');
    setError('');
    try {
      await api('/auth/send-otp', { method: 'POST', body: { phone } });
      setSeconds(RESEND_SECONDS);
      setInfo('A new code has been sent.');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.header}>
          <RoundButton icon="arrow-back" onPress={() => navigation.goBack()} size={42} accessibilityLabel="Back" />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>Verify your number</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to{'\n'}
            <Text style={{ color: colors.text, fontWeight: '700' }}>{phone}</Text>
          </Text>

          <Pressable onPress={() => inputRef.current?.focus()} style={styles.boxes} accessibilityLabel="Verification code">
            {Array.from({ length: LENGTH }).map((_, i) => {
              const active = i === code.length && !loading;
              return (
                <View key={i} style={[styles.box, raised, active && { borderColor: colors.accent }]}>
                  <Text style={styles.digit}>{code[i] || ''}</Text>
                </View>
              );
            })}
          </Pressable>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={LENGTH}
            autoFocus
            style={styles.hiddenInput}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {info ? <Text style={styles.info}>{info}</Text> : null}

          <PrimaryButton title="Verify" onPress={() => verify()} loading={loading} disabled={code.length !== LENGTH} style={{ marginTop: 28 }} />

          <View style={styles.resendRow}>
            {seconds > 0 ? (
              <Text style={styles.muted}>Resend code in {seconds}s</Text>
            ) : (
              <Pressable onPress={resend} hitSlop={8}>
                <Text style={styles.link}>Resend code</Text>
              </Pressable>
            )}
            <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
              <Text style={styles.link}>Change number</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 18, paddingTop: 8 },
  content: { padding: 24, paddingTop: 24 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 32 },
  boxes: { flexDirection: 'row', justifyContent: 'space-between' },
  box: {
    width: 48,
    height: 58,
    borderRadius: 14,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { color: colors.text, fontSize: 24, fontWeight: '700' },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  error: { color: colors.danger, marginTop: 16, textAlign: 'center' },
  info: { color: colors.success, marginTop: 16, textAlign: 'center' },
  resendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  muted: { color: colors.textMuted, fontSize: 14 },
  link: { color: colors.accent, fontSize: 14, fontWeight: '700' },
});
