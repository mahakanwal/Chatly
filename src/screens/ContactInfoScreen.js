import React, { useEffect, useState } from 'react';
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api } from '../api/client';
import { useSocket } from '../context/SocketContext';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';
import PrimaryButton from '../components/PrimaryButton';
import { formatLastSeen } from '../utils/format';

const TILE = (Dimensions.get('window').width - 32 - 12) / 3;

export default function ContactInfoScreen({ route, navigation }) {
  const { conversationId, conversation } = route.params;
  const { presence } = useSocket();
  const [peer, setPeer] = useState(conversation.peer);
  const [media, setMedia] = useState([]);
  const [clearing, setClearing] = useState(false);
  const [blocked, setBlocked] = useState(Boolean(conversation.blockedByMe));
  const [busy, setBusy] = useState(false);
  const isAI = conversation.isAI;

  useEffect(() => {
    if (!isAI) {
      api(`/users/${conversation.peer._id}`)
        .then(({ user, blockedByMe }) => {
          setPeer(user);
          setBlocked(Boolean(blockedByMe));
        })
        .catch(() => {});
    }
    api(`/conversations/${conversationId}/media`)
      .then(({ messages }) => setMedia(messages))
      .catch(() => {});
  }, [conversationId, conversation.peer._id, isAI]);

  const p = presence[peer._id];
  const hidden = p ? Boolean(p.hidden) : Boolean(peer.lastSeenHidden);
  const status = isAI ? 'AI assistant' : hidden ? '' : p?.online ? 'online' : formatLastSeen(p?.lastSeen || peer.lastSeen);

  const clearChat = () => {
    Alert.alert('Clear this chat?', 'Messages will be removed from this device only. The other person will still see them.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear chat',
        style: 'destructive',
        onPress: async () => {
          setClearing(true);
          try {
            await api(`/conversations/${conversationId}/messages`, { method: 'DELETE' });
            navigation.goBack();
          } catch (err) {
            Alert.alert('Could not clear chat', err.message);
            setClearing(false);
          }
        },
      },
    ]);
  };

  const toggleBlock = async () => {
    setBusy(true);
    try {
      await api(`/users/${peer._id}/block`, { method: blocked ? 'DELETE' : 'POST' });
      setBlocked(!blocked);
    } catch (err) {
      Alert.alert('Something went wrong', err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmBlock = () => {
    if (blocked) return toggleBlock();
    return Alert.alert(`Block ${peer.name}?`, 'Blocked contacts cannot send you messages, and you cannot message them until you unblock.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: toggleBlock },
    ]);
  };

  const report = () => {
    Alert.alert(`Report ${peer.name}?`, 'Our team will review this account. The contact will also be blocked.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api(`/users/${peer._id}/report`, { method: 'POST', body: { conversationId, reason: 'Reported from contact info' } });
            setBlocked(true);
            Alert.alert('Reported', 'Thanks for letting us know. This contact has been blocked.');
          } catch (err) {
            Alert.alert('Could not report', err.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={isAI ? 'Assistant info' : 'Contact info'} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.top}>
          <Pressable
            disabled={!peer.avatar}
            onPress={() => navigation.navigate('MediaViewer', { type: 'image', url: peer.avatar })}
            accessibilityLabel="View profile photo"
          >
            <Avatar uri={peer.avatar} name={peer.name} isBot={peer.isBot} size={132} />
          </Pressable>
          <Text style={styles.name}>{peer.name}</Text>
          {peer.username ? <Text style={styles.phone}>@{peer.username}</Text> : null}
          {peer.phone ? <Text style={styles.phone}>{peer.phone}</Text> : null}
          {status ? <Text style={[styles.status, p?.online && !hidden && { color: colors.success }]}>{status}</Text> : null}
        </View>

        <View style={[styles.card, raised]}>
          <Text style={styles.cardLabel}>About</Text>
          <Text style={styles.cardText}>{peer.about || 'Available'}</Text>
        </View>

        <View style={[styles.card, raised]}>
          <Text style={styles.cardLabel}>Media ({media.length})</Text>
          {media.length ? (
            <View style={styles.grid}>
              {media.map((m) => (
                <Pressable
                  key={m._id}
                  onPress={() => navigation.navigate('MediaViewer', { type: m.type, url: m.media?.url })}
                  style={styles.tile}
                >
                  <Image
                    source={{ uri: m.type === 'video' ? m.media?.thumbnail : m.media?.url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  {m.type === 'video' ? (
                    <View style={styles.tileIcon}>
                      <Ionicons name="play" size={16} color="#FFFFFF" />
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.cardText}>No photos or videos shared yet.</Text>
          )}
        </View>

        <PrimaryButton title="Clear chat" variant="danger" onPress={clearChat} loading={clearing} style={{ marginHorizontal: 16, marginTop: 8 }} />
        {!isAI && !peer.isDeleted ? (
          <>
            <PrimaryButton
              title={blocked ? `Unblock ${peer.name}` : `Block ${peer.name}`}
              variant="danger"
              onPress={confirmBlock}
              disabled={busy}
              style={{ marginHorizontal: 16, marginTop: 12 }}
            />
            <PrimaryButton title="Report" variant="danger" onPress={report} disabled={busy} style={{ marginHorizontal: 16, marginTop: 12 }} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { alignItems: 'center', paddingVertical: 16 },
  name: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 16 },
  phone: { color: colors.textSecondary, fontSize: 15, marginTop: 4 },
  status: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  cardText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 },
  tile: { width: TILE - 8, height: TILE - 8, margin: 2, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.input },
  tileIcon: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    padding: 2,
  },
});