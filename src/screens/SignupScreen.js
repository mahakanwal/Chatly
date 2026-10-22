import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { api } from '../api/client';
import AuthInput from '../components/AuthInput';
import PrimaryButton from '../components/PrimaryButton';
import RoundButton from '../components/RoundButton';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignupScreen({ navigation }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [uStatus, setUStatus] = useState({ state: 'idle', message: '' }); // idle | checking | ok | bad
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');

  // Check the username a moment after the user stops typing
  useEffect(() => {
    if (!cleanUsername) return setUStatus({ state: 'idle', message: '' });
    if (!USERNAME_RE.test(cleanUsername)) {
      return setUStatus({ state: 'bad', message: '3-20 characters: letters, numbers and _ only' });
    }
    setUStatus({ state: 'checking', message: 'Checking...' });
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api(`/auth/username-available?username=${encodeURIComponent(cleanUsername)}`);
        if (!cancelled) setUStatus(res.available ? { state: 'ok', message: 'Username is available' } : { state: 'bad', message: res.message || 'Username is taken' });
      } catch {
        if (!cancelled) setUStatus({ state: 'idle', message: '' });
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cleanUsername]);

  const canSubmit = EMAIL_RE.test(email.trim()) && password.length >= 8 && USERNAME_RE.test(cleanUsername) && uStatus.state !== 'bad';

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError('');
    try {
      const body = { email: email.trim(), username: cleanUsername, password, name: name.trim() };
      const res = await api('/auth/signup', { method: 'POST', body });
      navigation.navigate('VerifyEmail', { email: res.email || email.trim().toLowerCase() });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const hintColor = uStatus.state === 'ok' ? colors.success : uStatus.state === 'bad' ? colors.danger : colors.textMuted;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.header}>
          <RoundButton icon="arrow-back" onPress={() => navigation.goBack()} size={42} accessibilityLabel="Back" />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>We will email you a 6-digit code to verify your address.</Text>

          <AuthInput
            icon="happy-outline"
            value={name}
            onChangeText={setName}
            placeholder="Your name (optional)"
            autoCapitalize="words"
            maxLength={50}
            textContentType="name"
            accessibilityLabel="Your name"
          />
          <AuthInput
            icon="at"
            value={username}
            onChangeText={(t) => {
              setUsername(t);
              setError('');
            }}
            placeholder="Username (e.g. sara_k)"
            maxLength={21}
            accessibilityLabel="Username"
          />
          {uStatus.message ? <Text style={[styles.hint, { color: hintColor }]}>{uStatus.message}</Text> : null}
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
          />
          <AuthInput
            icon="lock-closed-outline"
            secure
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError('');
            }}
            placeholder="Password (min 8 characters)"
            textContentType="newPassword"
            accessibilityLabel="Password"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton title="Send code" onPress={submit} loading={loading} disabled={!canSubmit} style={{ marginTop: 16 }} />
          <View style={styles.noteRow}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.textMuted} />
            <Text style={styles.note}>Your email is never shown to other people.</Text>
          </View>
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
  hint: { fontSize: 13, marginTop: -6, marginBottom: 12, marginLeft: 18 },
  error: { color: colors.danger, marginTop: 4, textAlign: 'center' },
  noteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  note: { color: colors.textMuted, fontSize: 12, marginLeft: 6 },
});