import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api, uploadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ScreenHeader from '../components/ScreenHeader';
import ChatBackground from '../components/ChatBackground';
import { pickFromLibrary } from '../utils/pickers';

const PRESETS = [
  '#0B1014', '#101A2E', '#0F2A2A', '#1E1B3A', '#2B1620', '#262016',
  '#12301F', '#3A1D1D', '#1F2937', '#312E81', '#134E4A', '#4A044E',
];

export default function WallpaperScreen({ navigation }) {
  const { user, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const current = user.wallpaper || '';
  const isImage = current && !current.startsWith('color:');

  const run = async (fn, failTitle) => {
    setBusy(true);
    try {
      const { user: me } = await fn();
      updateUser(me);
    } catch (err) {
      Alert.alert(failTitle, err.message);
    } finally {
      setBusy(false);
    }
  };

  const pickColor = (hex) => run(() => api('/users/me/wallpaper', { method: 'PUT', body: { color: hex } }), 'Could not set wallpaper');
  const reset = () => run(() => api('/users/me/wallpaper', { method: 'DELETE' }), 'Could not reset wallpaper');
  const pickPhoto = async () => {
    const file = await pickFromLibrary({ allowVideo: false });
    if (!file) return;
    run(() => uploadFile('/users/me/wallpaper', file), 'Could not set wallpaper');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Chat wallpaper" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        {/* Live preview */}
        <View style={[styles.preview, raised]}>
          <ChatBackground wallpaper={current} />
          <View style={[styles.bubble, styles.bubbleIn]}>
            <Text style={styles.bubbleText}>Hey! How does this look?</Text>
          </View>
          <View style={[styles.bubble, styles.bubbleOut]}>
            <Text style={styles.bubbleText}>Looks great</Text>
          </View>
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>

        <Pressable onPress={pickPhoto} disabled={busy} style={[styles.row, raised]}>
          <Ionicons name="images" size={22} color={colors.accent} />
          <Text style={styles.rowText}>Choose from gallery</Text>
          {isImage ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null}
        </Pressable>

        <Text style={styles.section}>Solid colours</Text>
        <View style={styles.grid}>
          {PRESETS.map((hex) => {
            const selected = current === `color:${hex}`;
            return (
              <Pressable
                key={hex}
                onPress={() => pickColor(hex)}
                disabled={busy}
                style={[styles.swatch, { backgroundColor: hex }, selected && styles.swatchSelected]}
                accessibilityLabel={`Colour ${hex}`}
              >
                {selected ? <Ionicons name="checkmark" size={22} color="#fff" /> : null}
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={reset} disabled={busy || !current} style={[styles.row, { marginTop: 22 }, !current && { opacity: 0.45 }]}>
          <Ionicons name="refresh" size={22} color={colors.textSecondary} />
          <Text style={styles.rowText}>Reset to default</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  preview: {
    height: 230,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.chatBg,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    padding: 14,
    marginBottom: 16,
  },
  bubble: { maxWidth: '75%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, marginVertical: 5 },
  bubbleIn: { alignSelf: 'flex-start', backgroundColor: colors.raised },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  bubbleText: { color: '#fff', fontSize: 15 },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowText: { flex: 1, color: colors.text, fontSize: 16, marginLeft: 14 },
  section: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 22, marginBottom: 10, marginLeft: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong },
  swatchSelected: { borderWidth: 2, borderColor: colors.accent },
});
