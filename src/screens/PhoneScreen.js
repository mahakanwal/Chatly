import React, { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api } from '../api/client';
import { APP_NAME, DEFAULT_COUNTRY_CODE } from '../config';
import PrimaryButton from '../components/PrimaryButton';

export default function PhoneScreen({ navigation }) {
  const [code, setCode] = useState(DEFAULT_COUNTRY_CODE);
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const digits = number.replace(/\D/g, '').replace(/^0+/, '');
  const ccDigits = code.replace(/\D/g, '');
  const canSubmit = ccDigits.length >= 1 && digits.length >= 6;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const { phone } = await api('/auth/send-otp', { method: 'POST', body: { phone: `+${ccDigits}${digits}` } });
      navigation.navigate('Otp', { phone });
    } catch (err) {
      setError(err.message);
    } finally {
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
          <Text style={styles.subtitle}>Enter your phone number. We will send you a 6-digit code by SMS to verify it.</Text>

          <View style={styles.inputRow}>
            <View style={[styles.field, styles.ccField, raised]}>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(`+${t.replace(/\D/g, '').slice(0, 4)}`)}
                keyboardType="phone-pad"
                style={styles.input}
                accessibilityLabel="Country code"
                maxLength={5}
              />
            </View>
            <View style={[styles.field, { flex: 1 }, raised]}>
              <TextInput
                value={number}
                onChangeText={(t) => {
                  setNumber(t.replace(/[^\d\s]/g, ''));
                  setError('');
                }}
                placeholder="300 1234567"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                style={styles.input}
                accessibilityLabel="Phone number"
                autoFocus
                onSubmitEditing={submit}
              />
            </View>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton title="Send code" onPress={submit} loading={loading} disabled={!canSubmit} style={{ marginTop: 28 }} />
          <Text style={styles.note}>Standard SMS rates may apply.</Text>
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
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, marginBottom: 32 },
  inputRow: { flexDirection: 'row' },
  field: {
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.input,
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ccField: { width: 92, marginRight: 12 },
  input: { color: colors.text, fontSize: 17, fontWeight: '600', letterSpacing: 0.5 },
  error: { color: colors.danger, marginTop: 12, textAlign: 'center' },
  note: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 16 },
});
