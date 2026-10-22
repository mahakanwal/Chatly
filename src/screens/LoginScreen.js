import React, { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api } from '../api/client';
import { APP_NAME } from '../config';
import { useAuth } from '../context/AuthContext';
import AuthInput from '../components/AuthInput';
import PrimaryButton from '../components/PrimaryButton';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = identifier.trim().length >= 3 && password.length >= 1;

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError('');
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { identifier: identifier.trim(), password } });
      await login(token, user);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.logo, raised]}>
            <Ionicons name="chatbubbles" size={38} color={colors.accent} />
          </View>
          <Text style={styles.title}>Welcome to {APP_NAME}</Text>
          <Text style={styles.subtitle}>Log in with your email or username.</Text>

          <AuthInput
            icon="person-outline"
            value={identifier}
            onChangeText={(t) => {
              setIdentifier(t);
              setError('');
            }}
            placeholder="Email or username"
            keyboardType="email-address"
            textContentType="username"
            autoComplete="username"
            accessibilityLabel="Email or username"
            returnKeyType="next"
          />
          <AuthInput
            icon="lock-closed-outline"
            secure
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError('');
            }}
            placeholder="Password"
            textContentType="password"
            autoComplete="password"
            accessibilityLabel="Password"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton title="Log in" onPress={submit} loading={loading} disabled={!canSubmit} style={{ marginTop: 16 }} />

          <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={styles.linkWrap} hitSlop={8}>
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.muted}>New here? </Text>
            <Pressable onPress={() => navigation.navigate('Signup')} hitSlop={8}>
              <Text style={styles.link}>Create an account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 56 },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, marginBottom: 28 },
  error: { color: colors.danger, marginTop: 4, textAlign: 'center' },
  linkWrap: { alignSelf: 'center', marginTop: 20 },
  link: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 14 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
});