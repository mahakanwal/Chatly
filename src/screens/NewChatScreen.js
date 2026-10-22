import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api } from '../api/client';
import { useSocket } from '../context/SocketContext';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';

/** Find people by @username (starts with) or by a full phone number. */
export default function NewChatScreen({ navigation }) {
  const { seedPresence } = useSocket();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.replace(/^@/, '').length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const { users } = await api(`/users/search?q=${encodeURIComponent(q)}`);
        if (!cancelled) {
          setResults(users);
          setSearched(true);
        }
      } catch (err) {
        if (!cancelled) {
          setResults([]);
          setSearched(true);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const openChatWith = async (u) => {
    if (opening) return;
    setOpening(true);
    try {
      const { conversation } = await api('/conversations', { method: 'POST', body: { userId: u._id } });
      seedPresence(conversation.peer);
      navigation.replace('Chat', { conversationId: conversation._id, conversation });
    } catch (err) {
      Alert.alert('Could not open chat', err.message);
      setOpening(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="New chat" onBack={() => navigation.goBack()} />

      <Pressable
        onPress={() => navigation.navigate('NewGroup')}
        style={({ pressed }) => [styles.groupRow, raised, pressed && { backgroundColor: colors.raised }]}
        accessibilityRole="button"
        accessibilityLabel="New group"
      >
        <View style={styles.groupIcon}>
          <Ionicons name="people" size={22} color={colors.onAccent} />
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.name}>New group</Text>
          <Text style={styles.about}>Chat with several people at once</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>

      <Text style={styles.section}>Find people</Text>
      <View style={[styles.field, raised, { marginHorizontal: 16, marginBottom: 8 }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Username or full phone number"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search by username or phone number"
        />
        {searching ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={(u) => String(u._id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable onPress={() => openChatWith(item)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}>
            <Avatar uri={item.avatar} name={item.name} size={50} />
            <View style={styles.rowBody}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.about} numberOfLines={1}>
                {item.username ? `@${item.username}` : item.phone}
                {item.about ? `  ·  ${item.about}` : ''}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {searched
              ? 'No one found. Check the spelling, or ask your friend for their exact username.'
              : 'Type a username (like sara_k) or a full phone number to find someone.'}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  section: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.input,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: 15, marginLeft: 10, paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8 },
  rowBody: { flex: 1, marginLeft: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  about: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 24, marginHorizontal: 32, lineHeight: 20 },
});