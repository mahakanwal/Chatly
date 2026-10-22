import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api, uploadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';
import PrimaryButton from '../components/PrimaryButton';
import { REACTIONS, groupReactions } from '../components/ReactionSheet';
import { pickFromLibrary } from '../utils/pickers';
import { formatAgo } from '../utils/format';

/** One channel: broadcast posts, followers react. Only admins can post. */
export default function ChannelDetailScreen({ route, navigation }) {
  const { channelId } = route.params;
  const { user } = useAuth();
  const [channel, setChannel] = useState(route.params.channel || null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await api(`/channels/${channelId}`);
      setChannel(c.channel);
      const p = await api(`/channels/${channelId}/posts`);
      setPosts(p.posts || []);
    } catch (err) {
      if (err.status === 404) navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [channelId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleFollow = async () => {
    try {
      const { channel: ch } = await api(`/channels/${channelId}/follow`, { method: 'POST' });
      setChannel(ch);
    } catch (err) {
      Alert.alert('Could not update', err.message);
    }
  };

  const post = async () => {
    if (!text.trim() && !photo) return;
    setPosting(true);
    try {
      let media = null;
      if (photo) {
        const up = await uploadFile('/media/upload', photo);
        media = up.media;
      }
      const type = photo ? (photo.kind === 'video' ? 'video' : 'image') : 'text';
      const { post: created } = await api(`/channels/${channelId}/posts`, {
        method: 'POST',
        body: { type, text: text.trim(), media },
      });
      setPosts((prev) => [created, ...prev]);
      setText('');
      setPhoto(null);
    } catch (err) {
      Alert.alert('Could not post', err.message);
    } finally {
      setPosting(false);
    }
  };

  const react = async (postId, emoji) => {
    try {
      const { reactions } = await api(`/channels/posts/${postId}/react`, { method: 'POST', body: { emoji } });
      setPosts((prev) =>
        prev.map((p) =>
          String(p._id) === String(postId)
            ? { ...p, reactions, myReaction: reactions.find((r) => String(r.user) === String(user._id))?.emoji || null }
            : p
        )
      );
    } catch (err) {
      Alert.alert('Could not react', err.message);
    }
  };

  const deletePost = (postId) =>
    Alert.alert('Delete this post?', 'It will be removed for all followers.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/channels/posts/${postId}`, { method: 'DELETE' });
            setPosts((prev) => prev.filter((p) => String(p._id) !== String(postId)));
          } catch (err) {
            Alert.alert('Could not delete', err.message);
          }
        },
      },
    ]);

  const deleteChannel = () =>
    Alert.alert(`Delete "${channel?.name}"?`, 'All posts will be removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/channels/${channelId}`, { method: 'DELETE' });
            navigation.navigate('Main');
          } catch (err) {
            Alert.alert('Could not delete', err.message);
          }
        },
      },
    ]);

  const changeAvatar = async () => {
    const file = await pickFromLibrary({ allowVideo: false, square: true });
    if (!file) return;
    try {
      const { channel: ch } = await uploadFile(`/channels/${channelId}/avatar`, file);
      setChannel(ch);
    } catch (err) {
      Alert.alert('Could not update photo', err.message);
    }
  };

  if (!channel) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Channel" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Channel" onBack={() => navigation.goBack()} />
      <View style={styles.top}>
        <Pressable onPress={channel.isAdmin ? changeAvatar : undefined} accessibilityLabel="Channel photo">
          {channel.avatar ? (
            <Avatar uri={channel.avatar} name={channel.name} size={96} />
          ) : (
            <View style={[styles.iconBox, raised]}>
              <Ionicons name="megaphone" size={40} color={colors.accent} />
            </View>
          )}
        </Pressable>
        <Text style={styles.name}>{channel.name}</Text>
        <Text style={styles.sub}>
          {channel.followerCount} follower{channel.followerCount === 1 ? '' : 's'}
          {channel.isAdmin ? ' · You are an admin' : ''}
        </Text>
        {channel.description ? <Text style={styles.desc}>{channel.description}</Text> : null}
        <Pressable onPress={toggleFollow} style={[styles.followBtn, channel.isFollowing && styles.followBtnOn]}>
          <Text style={[styles.followText, channel.isFollowing && styles.followTextOn]}>{channel.isFollowing ? 'Following' : 'Follow'}</Text>
        </Pressable>
      </View>

      {channel.isAdmin ? (
        <View style={[styles.composer, raised]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Broadcast a message to followers..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            maxLength={4000}
          />
          {photo ? <Text style={styles.photoName}>Photo attached: {photo.name || 'photo'}</Text> : null}
          <View style={styles.composerRow}>
            <Pressable
              onPress={async () => setPhoto((await pickFromLibrary()) || photo)}
              style={styles.attachBtn}
              accessibilityLabel="Attach photo"
            >
              <Ionicons name="images" size={22} color={colors.accent} />
            </Pressable>
            {photo ? (
              <Pressable onPress={() => setPhoto(null)} style={styles.attachBtn} accessibilityLabel="Remove photo">
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </Pressable>
            ) : null}
            <Pressable onPress={post} disabled={posting || (!text.trim() && !photo)} style={[styles.postBtn, (!text.trim() && !photo) && { opacity: 0.5 }]}>
              <Text style={styles.postBtnText}>{posting ? 'Posting...' : 'Post'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => String(p._id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No posts yet. {channel.isAdmin ? 'Be the first to broadcast.' : ''}</Text>}
          renderItem={({ item: p }) => {
            const grouped = groupReactions(p.reactions, user._id);
            const canDelete = channel.isAdmin || String(p.author?._id) === String(user._id);
            return (
              <View style={[styles.post, raised]}>
                <View style={styles.postHead}>
                  <Avatar uri={p.author?.avatar} name={p.author?.name} size={40} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.author}>{p.author?.name || 'Admin'}</Text>
                    <Text style={styles.time}>{formatAgo(p.createdAt)}</Text>
                  </View>
                  {canDelete ? (
                    <Pressable onPress={() => deletePost(p._id)} hitSlop={8} accessibilityLabel="Delete post">
                      <Ionicons name="trash-outline" size={19} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
                {p.media?.url ? (
                  <Image source={{ uri: p.media.thumbnail || p.media.url }} style={styles.postImage} contentFit="cover" cachePolicy="memory-disk" />
                ) : null}
                {p.text ? <Text style={styles.postText}>{p.text}</Text> : null}
                <View style={styles.reactRow}>
                  {REACTIONS.slice(0, 6).map((e) => {
                    const count = (p.reactions || []).filter((r) => r.emoji === e).length;
                    const mine = p.myReaction === e;
                    return (
                      <Pressable key={e} onPress={() => react(p._id, e)} style={[styles.reactBtn, mine && styles.reactBtnMine]}>
                        <Text style={styles.reactEmoji}>{e}</Text>
                        {count ? <Text style={styles.reactCount}>{count}</Text> : null}
                      </Pressable>
                    );
                  })}
                  {grouped.length ? (
                    <Text style={styles.reactSummary}>{grouped.map((g) => `${g.emoji}${g.count > 1 ? g.count : ''}`).join(' ')}</Text>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}
      {channel.isOwner ? <PrimaryButton title="Delete channel" variant="danger" onPress={deleteChannel} style={{ marginHorizontal: 16, marginBottom: 16 }} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 24 },
  iconBox: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 21, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  sub: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  desc: { color: colors.textSecondary, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  followBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.accent },
  followBtnOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  followText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  followTextOn: { color: colors.textSecondary },
  composer: { backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: colors.border },
  input: { color: colors.text, fontSize: 15, minHeight: 44, textAlignVertical: 'top' },
  photoName: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  composerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  attachBtn: { padding: 6, marginRight: 6 },
  postBtn: { marginLeft: 'auto', backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 9 },
  postBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  post: { backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border },
  postHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  author: { color: colors.text, fontSize: 15, fontWeight: '700' },
  time: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  postImage: { width: '100%', height: 220, borderRadius: 12, marginBottom: 10, backgroundColor: colors.input },
  postText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  reactRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, flexWrap: 'wrap' },
  reactBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginRight: 6, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border },
  reactBtnMine: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  reactEmoji: { fontSize: 17 },
  reactCount: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginLeft: 3 },
  reactSummary: { color: colors.textMuted, fontSize: 13, marginLeft: 4 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 24, marginHorizontal: 32, lineHeight: 20 },
});
