import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';

/**
 * Channels & Communities hub (opened from the megaphone button on Chats).
 * Channels: broadcast posts, followers react. Communities: collections of
 * groups — joining adds you to all of its groups.
 */
export default function HubScreen({ navigation }) {
  const [tab, setTab] = useState('channels');
  const [channels, setChannels] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([api('/channels'), api('/communities')]);
      setChannels(c.channels || []);
      setCommunities(m.communities || []);
    } catch {
      // keep whatever loaded; errors show on retry via focus
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const create = async () => {
    if (!name.trim()) return Alert.alert('Name needed', tab === 'channels' ? 'Give the channel a name.' : 'Give the community a name.');
    setBusy(true);
    try {
      if (tab === 'channels') {
        const { channel } = await api('/channels', { method: 'POST', body: { name: name.trim(), description: description.trim() } });
        setName('');
        setDescription('');
        setCreating(false);
        navigation.navigate('ChannelDetail', { channelId: channel._id, channel });
      } else {
        const { community } = await api('/communities', { method: 'POST', body: { name: name.trim(), description: description.trim() } });
        setName('');
        setDescription('');
        setCreating(false);
        navigation.navigate('CommunityDetail', { communityId: community._id, community });
      }
    } catch (err) {
      Alert.alert('Could not create', err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleFollow = async (ch) => {
    try {
      const { channel } = await api(`/channels/${ch._id}/follow`, { method: 'POST' });
      setChannels((prev) => prev.map((x) => (String(x._id) === String(ch._id) ? channel : x)));
    } catch (err) {
      Alert.alert('Could not update', err.message);
    }
  };

  const toggleJoin = async (com) => {
    try {
      if (com.isMember) {
        const res = await api(`/communities/${com._id}/leave`, { method: 'POST' });
        if (res.deleted) setCommunities((prev) => prev.filter((x) => String(x._id) !== String(com._id)));
        else setCommunities((prev) => prev.map((x) => (String(x._id) === String(com._id) ? res.community : x)));
      } else {
        const { community } = await api(`/communities/${com._id}/join`, { method: 'POST' });
        setCommunities((prev) => prev.map((x) => (String(x._id) === String(com._id) ? community : x)));
      }
    } catch (err) {
      Alert.alert('Could not update', err.message);
    }
  };

  const list = tab === 'channels' ? channels : communities;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Channels & Communities" onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        {[
          { key: 'channels', label: 'Channels' },
          { key: 'communities', label: 'Communities' },
        ].map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setCreating((v) => !v)} style={styles.addBtn} accessibilityLabel="Create">
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      {creating ? (
        <View style={[styles.createCard, raised]}>
          <Text style={styles.createTitle}>{tab === 'channels' ? 'New channel' : 'New community'}</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.textMuted} style={styles.input} maxLength={60} autoFocus />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
            maxLength={500}
            multiline
          />
          {tab === 'communities' ? <Text style={styles.hint}>Groups can be added inside the community after you create it.</Text> : null}
          <Pressable onPress={create} disabled={busy || !name.trim()} style={[styles.createBtn, (!name.trim() || busy) && { opacity: 0.5 }]}>
            <Text style={styles.createBtnText}>{busy ? 'Creating...' : 'Create'}</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {tab === 'communities' ? (
            <Text style={styles.note}>Joining a community adds you to all of its groups. Leaving removes you from them.</Text>
          ) : (
            <Text style={styles.note}>Channels are broadcast-only: only admins post, followers react.</Text>
          )}
          {list.map((item) => {
            const isChannel = tab === 'channels';
            const following = isChannel ? item.isFollowing : item.isMember;
            return (
              <Pressable
                key={String(item._id)}
                onPress={() => navigation.navigate(isChannel ? 'ChannelDetail' : 'CommunityDetail', isChannel ? { channelId: item._id, channel: item } : { communityId: item._id, community: item })}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}
              >
                {item.avatar ? (
                  <Avatar uri={item.avatar} name={item.name} size={54} />
                ) : (
                  <View style={styles.iconBox}>
                    <Ionicons name={isChannel ? 'megaphone' : 'people'} size={24} color={colors.accent} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {isChannel ? `${item.followerCount} follower${item.followerCount === 1 ? '' : 's'}` : `${item.memberCount} member${item.memberCount === 1 ? '' : 's'} · ${item.groups?.length || 0} groups`}
                    {item.isAdmin ? ' · Admin' : ''}
                  </Text>
                  {item.description ? (
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => (isChannel ? toggleFollow(item) : toggleJoin(item))}
                  style={[styles.followBtn, following && styles.followBtnOn]}
                  accessibilityLabel={isChannel ? 'Follow channel' : 'Join community'}
                >
                  <Text style={[styles.followText, following && styles.followTextOn]}>
                    {isChannel ? (following ? 'Following' : 'Follow') : following ? 'Joined' : 'Join'}
                  </Text>
                </Pressable>
              </Pressable>
            );
          })}
          {!list.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{tab === 'channels' ? 'No channels yet' : 'No communities yet'}</Text>
              <Text style={styles.emptyText}>{tab === 'channels' ? 'Tap + to create the first channel.' : 'Tap + to create the first community.'}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, marginRight: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  tabTextOn: { color: '#FFFFFF' },
  addBtn: { marginLeft: 'auto', width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  createCard: { backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border },
  createTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  input: { color: colors.text, fontSize: 15, backgroundColor: colors.input, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: 10, lineHeight: 18 },
  createBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  createBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  note: { color: colors.textMuted, fontSize: 13, marginHorizontal: 20, marginBottom: 8, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  iconBox: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  followBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.accent, marginLeft: 10 },
  followBtnOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  followText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  followTextOn: { color: colors.textSecondary },
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  emptyText: { color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: 'center' },
});
