import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';
import { assetToFile } from '../utils/pickers';

/** After taking a photo/video from the Camera tab, choose which chat to send it to. */
export default function SendToScreen({ route, navigation }) {
  const file = useMemo(() => assetToFile(route.params.asset), [route.params.asset]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api('/conversations')
      .then(({ conversations: list }) => setConversations(list))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? conversations.filter((c) => (c.peer.name || '').toLowerCase().includes(q)) : conversations;
  }, [conversations, query]);

  const choose = (conv) => {
    navigation.replace('Chat', { conversationId: conv._id, conversation: conv, pendingAsset: file });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Send to" onBack={() => navigation.goBack()} />
      <View style={styles.preview}>
        {file.kind === 'image' ? (
          <Image source={{ uri: file.uri }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.videoThumb]}>
            <Ionicons name="videocam" size={28} color={colors.textMuted} />
          </View>
        )}
        <Text style={styles.previewText}>Choose a chat to send this {file.kind === 'image' ? 'photo' : 'video'} to.</Text>
      </View>
      <View style={[styles.search, raised]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.textMuted} style={styles.input} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => String(c._id)}
          renderItem={({ item }) => (
            <Pressable onPress={() => choose(item)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
              <Avatar uri={item.peer.avatar} name={item.peer.name} isBot={item.peer.isBot} isGroup={item.isGroup} size={48} />
              <Text style={styles.name} numberOfLines={1}>
                {item.peer.name || item.peer.phone}
              </Text>
              <Ionicons name="send" size={18} color={colors.accent} />
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{error || 'No chats yet.'}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  preview: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 14 },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.surface },
  videoThumb: { alignItems: 'center', justifyContent: 'center' },
  previewText: { flex: 1, color: colors.textSecondary, marginLeft: 14, fontSize: 14, lineHeight: 20 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.input,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, marginLeft: 10, fontSize: 15, paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10 },
  name: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600', marginLeft: 14 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
});
