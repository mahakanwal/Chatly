import React, { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api, uploadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import PrimaryButton from '../components/PrimaryButton';
import ActionSheet from '../components/ActionSheet';
import { captureFromCamera, pickFromLibrary } from '../utils/pickers';

export default function ProfileSetupScreen() {
  const { user, updateUser, logout } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [photo, setPhoto] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const choose = async (fromCamera) => {
    const file = fromCamera ? await captureFromCamera({ allowVideo: false, square: true }) : await pickFromLibrary({ allowVideo: false, square: true });
    if (file) setPhoto(file);
  };

  const save = async () => {
    if (!name.trim()) return setError('Please enter your name');
    setLoading(true);
    setError('');
    try {
      if (photo) await uploadFile('/users/me/avatar', photo);
      const { user: me } = await api('/users/me', { method: 'PATCH', body: { name: name.trim() } });
      updateUser(me);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Profile info</Text>
          <Text style={styles.subtitle}>Add your name and an optional profile photo. People you chat with will see them.</Text>

          <Pressable onPress={() => setSheet(true)} style={styles.avatarWrap} accessibilityLabel="Choose profile photo">
            <Avatar uri={photo?.uri || user?.avatar} name={name} size={128} />
            <View style={[styles.cameraBadge, raised]}>
              <Ionicons name="camera" size={18} color="#FFFFFF" />
            </View>
          </Pressable>

          <View style={[styles.field, raised]}>
            <TextInput
              value={name}
              onChangeText={(t) => {
                setName(t);
                setError('');
              }}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              maxLength={50}
              autoFocus
              textContentType="name"
              autoComplete="name"
              returnKeyType="done"
              onSubmitEditing={save}
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton title="Continue" onPress={save} loading={loading} disabled={!name.trim()} style={{ marginTop: 28 }} />
          <Pressable onPress={logout} style={{ marginTop: 20, alignSelf: 'center' }} hitSlop={8}>
            <Text style={styles.link}>Use a different account</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <ActionSheet
        visible={sheet}
        title="Profile photo"
        onClose={() => setSheet(false)}
        options={[
          { label: 'Take photo', icon: 'camera', onPress: () => choose(true) },
          { label: 'Choose from gallery', icon: 'images', onPress: () => choose(false) },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingTop: 48 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, marginBottom: 28 },
  avatarWrap: { alignSelf: 'center', marginBottom: 32 },
  cameraBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.input,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { color: colors.text, fontSize: 17 },
  error: { color: colors.danger, marginTop: 12, textAlign: 'center' },
  link: { color: colors.accent, fontSize: 14, fontWeight: '700' },
});