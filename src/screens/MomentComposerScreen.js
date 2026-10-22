import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { api, uploadFile } from '../api/client';
import RoundButton from '../components/RoundButton';

// Muted, professional backgrounds for text moments
export const MOMENT_COLORS = ['#E8473F', '#1F2937', '#0F766E', '#1E3A8A', '#4C1D95', '#7C2D12', '#065F46', '#374151'];

function VideoPreview({ uri }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

/** Create a Moment: text on a colour, or a photo/video with an optional caption. */
export default function MomentComposerScreen({ route, navigation }) {
  const { mode, file } = route.params || {};
  const isText = mode === 'text' || !file;
  const [text, setText] = useState('');
  const [colorIdx, setColorIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const bgColor = MOMENT_COLORS[colorIdx];

  const share = async () => {
    if (busy) return;
    if (isText && !text.trim()) return;
    setBusy(true);
    try {
      if (isText) {
        await api('/moments', { method: 'POST', body: { type: 'text', text: text.trim(), bgColor } });
      } else {
        const { media } = await uploadFile('/media/upload', file, { duration: file.duration });
        await api('/moments', {
          method: 'POST',
          body: {
            type: file.kind === 'video' ? 'video' : 'image',
            text: text.trim(),
            media: {
              ...media,
              width: media.width || file.width,
              height: media.height || file.height,
              duration: media.duration || file.duration,
            },
          },
        });
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not share moment', err.message);
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: isText ? bgColor : '#000' }]}>
      {!isText ? (
        file.kind === 'video' ? (
          <VideoPreview uri={file.uri} />
        ) : (
          <Image source={{ uri: file.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
        )
      ) : null}

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <RoundButton icon="close" size={42} iconColor="#FFFFFF" onPress={() => navigation.goBack()} accessibilityLabel="Cancel" />
          <View style={{ flex: 1 }} />
          {isText ? (
            <RoundButton
              icon="color-palette"
              size={42}
              iconColor="#FFFFFF"
              onPress={() => setColorIdx((i) => (i + 1) % MOMENT_COLORS.length)}
              accessibilityLabel="Change background colour"
            />
          ) : null}
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          {isText ? (
            <View style={styles.textWrap}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Type a moment"
                placeholderTextColor="rgba(255,255,255,0.6)"
                style={styles.bigInput}
                multiline
                autoFocus
                maxLength={700}
                textAlign="center"
                accessibilityLabel="Moment text"
              />
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          <View style={styles.bottom}>
            {!isText ? (
              <View style={styles.captionPill}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Add a caption"
                  placeholderTextColor={colors.textMuted}
                  style={styles.caption}
                  maxLength={700}
                  multiline
                  accessibilityLabel="Caption"
                />
              </View>
            ) : (
              <Text style={styles.hint}>Visible to people you chat with for 24 hours</Text>
            )}
            <Pressable
              onPress={share}
              disabled={busy || (isText && !text.trim())}
              style={[styles.send, isText && { backgroundColor: '#FFFFFF' }, (busy || (isText && !text.trim())) && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel="Share moment"
            >
              {busy ? (
                <ActivityIndicator color={isText ? bgColor : '#FFFFFF'} />
              ) : (
                <Ionicons name="send" size={22} color={isText ? bgColor : '#FFFFFF'} />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6 },
  textWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  bigInput: { color: '#FFFFFF', fontSize: 30, fontWeight: '600', lineHeight: 40, maxHeight: '80%' },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 14, paddingBottom: 14, paddingTop: 8 },
  captionPill: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(23,28,33,0.92)',
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  caption: { color: colors.text, fontSize: 15, maxHeight: 110, paddingVertical: 12 },
  hint: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 16 },
  send: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
});
