import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket, useSocketEvent } from '../context/SocketContext';
import Avatar from '../components/Avatar';
import RoundButton from '../components/RoundButton';
import ChatListItem from '../components/ChatListItem';
import ActionSheet from '../components/ActionSheet';
import { maxStatus } from '../utils/format';

function sortConversations(list) {
  return [...list].sort((a, b) => {
    if (a.isAI !== b.isAI) return a.isAI ? -1 : 1;
    const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return tb - ta;
  });
}

export default function ChatsScreen({ navigation }) {
  const { user } = useAuth();
  const { typing, seedPresence, activeConversationId, connected } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | unread | favourites | groups
  const [favSheet, setFavSheet] = useState(null);

  const load = useCallback(async () => {
    try {
      const { conversations: list } = await api('/conversations');
      list.forEach((c) => seedPresence(c.peer));
      setConversations(sortConversations(list));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [seedPresence]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Reload after reconnecting so nothing missed while offline is lost
  React.useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  const convRef = React.useRef(conversations);
  convRef.current = conversations;

  useSocketEvent('message:new', (msg) => {
    // A brand new chat: fetch the list so we get the peer's profile
    if (!convRef.current.some((c) => String(c._id) === String(msg.conversation))) {
      load();
      return;
    }
    setConversations((prev) => {
      const idx = prev.findIndex((c) => String(c._id) === String(msg.conversation));
      if (idx === -1) return prev;
      const fromOther = String(msg.sender) !== String(user._id) && msg.type !== 'system';
      const isOpen = activeConversationId.current === String(msg.conversation);
      const conv = prev[idx];
      const alreadyCounted = conv.lastMessage && String(conv.lastMessage._id) === String(msg._id);
      const updated = {
        ...conv,
        lastMessage: msg,
        unread: fromOther && !isOpen && !alreadyCounted ? conv.unread + 1 : conv.unread,
      };
      const next = [...prev];
      next[idx] = updated;
      return sortConversations(next);
    });
  });

  useSocketEvent('message:status', ({ conversationId, ids, status }) => {
    setConversations((prev) =>
      prev.map((c) =>
        String(c._id) === String(conversationId) && c.lastMessage && ids.includes(String(c.lastMessage._id))
          ? { ...c, lastMessage: { ...c.lastMessage, status: maxStatus(c.lastMessage.status, status) } }
          : c
      )
    );
  });

  useSocketEvent('message:deleted', ({ conversationId, messageId }) => {
    setConversations((prev) =>
      prev.map((c) =>
        String(c._id) === String(conversationId) && c.lastMessage && String(c.lastMessage._id) === String(messageId)
          ? { ...c, lastMessage: { ...c.lastMessage, deleted: true, text: '', media: null, type: 'text' } }
          : c
      )
    );
  });

  // Groups: created, renamed, members changed, or I was removed
  useSocketEvent('group:updated', () => load());
  useSocketEvent('group:removed', ({ conversationId }) => {
    setConversations((prev) => prev.filter((c) => String(c._id) !== String(conversationId)));
  });

  useSocketEvent('conversation:read', ({ conversationId }) => {
    setConversations((prev) => prev.map((c) => (String(c._id) === String(conversationId) ? { ...c, unread: 0 } : c)));
  });

  const filtered = useMemo(() => {
    let list = conversations;
    if (filter === 'unread') list = list.filter((c) => c.unread > 0);
    else if (filter === 'favourites') list = list.filter((c) => c.isFavourite);
    else if (filter === 'groups') list = list.filter((c) => c.isGroup);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) => (c.peer.name || '').toLowerCase().includes(q) || (c.peer.phone || '').includes(q.replace(/\s/g, '')) || (c.peer.username || '').includes(q.replace(/^@/, ''))
    );
  }, [conversations, query, filter]);

  const toggleFavourite = useCallback(async () => {
    const conv = favSheet;
    setFavSheet(null);
    if (!conv) return;
    try {
      const { isFavourite } = await api(`/conversations/${conv._id}/favourite`, { method: 'POST' });
      setConversations((prev) => prev.map((c) => (String(c._id) === String(conv._id) ? { ...c, isFavourite } : c)));
    } catch (err) {
      Alert.alert('Could not update favourite', err.message);
    }
  }, [favSheet]);

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'favourites', label: 'Favourites' },
    { key: 'groups', label: 'Groups' },
  ];
  const emptyTitle =
    filter === 'unread' ? 'No unread chats' : filter === 'favourites' ? 'No favourites yet' : filter === 'groups' ? 'No groups yet' : 'No chats yet';

  const openChat = useCallback(
    (conv) => {
      setConversations((prev) => prev.map((c) => (c._id === conv._id ? { ...c, unread: 0 } : c)));
      navigation.navigate('Chat', { conversationId: conv._id, conversation: conv });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }) => (
      <ChatListItem conversation={item} myId={user._id} isTyping={typing[item._id] || false} onPress={() => openChat(item)} onLongPress={setFavSheet} />
    ),
    [user._id, typing, openChat]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate('Settings')} accessibilityLabel="Your profile">
          <Avatar uri={user?.avatar} name={user?.name} size={46} />
        </Pressable>
        <Text style={styles.title}>Chats</Text>
        <RoundButton
          icon="megaphone-outline"
          size={42}
          iconSize={20}
          onPress={() => navigation.navigate('Hub')}
          accessibilityLabel="Channels and communities"
          style={{ marginRight: 10 }}
        />
        <RoundButton
          icon="people-outline"
          size={42}
          iconSize={20}
          onPress={() => navigation.navigate('NewGroup')}
          accessibilityLabel="New group"
          style={{ marginRight: 10 }}
        />
        <RoundButton icon="add" filled size={42} iconSize={26} onPress={() => navigation.navigate('NewChat')} accessibilityLabel="New chat" />
      </View>

      <View style={[styles.search, raised]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Search chats"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {!connected && !loading ? (
        <View style={styles.banner}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={styles.bannerText}>Connecting...</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => String(c._id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.raised}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name={error ? 'cloud-offline-outline' : query ? 'search-outline' : 'chatbubbles-outline'}
                  size={34}
                  color={colors.accent}
                />
              </View>
              <Text style={styles.emptyTitle}>{error ? 'Could not load chats' : query ? 'No chats found' : emptyTitle}</Text>
              <Text style={styles.emptyText}>
                {error ||
                  (query
                    ? 'Try a different name or number.'
                    : filter === 'favourites'
                    ? 'Long-press a chat and tap Favourite to pin it here.'
                    : filter === 'groups'
                    ? 'Groups you join show up here.'
                    : 'Tap + to message someone, or start a group with several people.')}
              </Text>
            </View>
          }
        />
      )}
      <ActionSheet
        visible={Boolean(favSheet)}
        title={favSheet?.peer?.name}
        options={
          favSheet
            ? [
                {
                  label: favSheet.isFavourite ? 'Remove from favourites' : 'Add to favourites',
                  icon: 'star',
                  onPress: toggleFavourite,
                },
              ]
            : []
        }
        onClose={() => setFavSheet(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: { flex: 1, color: colors.text, fontSize: 30, fontWeight: '700', marginLeft: 14 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 18,
    marginBottom: 10,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.input,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, marginLeft: 10, paddingVertical: 0 },
  filterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 18, paddingBottom: 4 },
  chip: {
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 4,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: '#FFFFFF' },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  bannerText: { color: colors.textMuted, fontSize: 13, marginLeft: 8 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  emptyText: { color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});