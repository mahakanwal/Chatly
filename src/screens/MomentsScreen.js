import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocketEvent } from '../context/SocketContext';
import RoundButton from '../components/RoundButton';
import MomentRing from '../components/MomentRing';
import ActionSheet from '../components/ActionSheet';
import { captureFromCamera, pickFromLibrary } from '../utils/pickers';
import { formatAgo } from '../utils/format';

const MAX_VIDEO_SECONDS = 60;

/** Moments: photo, video and text updates that disappear after 24 hours. */
export default function MomentsScreen({ navigation }) {
  const { user } = useAuth();
  const [mine, setMine] = useState([]);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api('/moments');
      setMine(data.mine || []);
      setFeed(data.feed || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useSocketEvent('moment:new', () => load());
  useSocketEvent('moment:deleted', () => load());
  useSocketEvent('moment:viewed', ({ momentId, viewCount }) => {
    setMine((prev) => prev.map((m) => (String(m._id) === String(momentId) ? { ...m, viewCount } : m)));
  });

  const openComposerWithFile = (file) => {
    if (!file) return;
    if (file.kind === 'video' && file.duration && file.duration > MAX_VIDEO_SECONDS) {
      Alert.alert('Video too long', `Moments can be up to ${MAX_VIDEO_SECONDS} seconds. Choose a shorter video.`);
      return;
    }
    if (file.kind !== 'image' && file.kind !== 'video') return;
    navigation.navigate('MomentComposer', { file });
  };

  const addOptions = [
    { label: 'Write a text moment', icon: 'create', onPress: () => navigation.navigate('MomentComposer', { mode: 'text' }) },
    { label: 'Photo or video from gallery', icon: 'images', onPress: async () => openComposerWithFile(await pickFromLibrary()) },
    { label: 'Camera', icon: 'camera', onPress: async () => openComposerWithFile(await captureFromCamera()) },
  ];

  const openViewer = (groups, index) => navigation.navigate('MomentViewer', { groups, index });
  const openMine = () => {
    if (!mine.length) return setAddOpen(true);
    return openViewer([{ user, moments: mine }], 0);
  };

  const recent = feed.filter((g) => !g.allSeen);
  const viewed = feed.filter((g) => g.allSeen);
  const totalViews = mine.reduce((sum, m) => sum + (m.viewCount || 0), 0);

  const renderRow = (group, list) => {
    const latest = group.moments[group.moments.length - 1];
    return (
      <Pressable
        key={String(group.user._id)}
        onPress={() => openViewer(list, list.indexOf(group))}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}
        accessibilityRole="button"
        accessibilityLabel={`View moments from ${group.user.name}`}
      >
        <MomentRing uri={group.user.avatar} name={group.user.name} size={54} state={group.allSeen ? 'seen' : 'unseen'} />
        <View style={styles.rowBody}>
          <Text style={styles.name} numberOfLines={1}>
            {group.user.name || group.user.phone}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {formatAgo(latest.createdAt)}
            {group.moments.length > 1 ? `  ·  ${group.moments.length} moments` : ''}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Moments</Text>
        <RoundButton
          icon="create-outline"
          size={42}
          iconSize={20}
          onPress={() => navigation.navigate('MomentComposer', { mode: 'text' })}
          accessibilityLabel="New text moment"
          style={{ marginRight: 10 }}
        />
        <RoundButton icon="camera" filled size={42} iconSize={20} onPress={() => setAddOpen(true)} accessibilityLabel="New moment" />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
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
        >
          {/* My moment */}
          <View style={[styles.myCard, raised]}>
            <Pressable onPress={openMine} style={styles.myRow} accessibilityRole="button" accessibilityLabel="My moment">
              <View>
                <MomentRing uri={user.avatar} name={user.name} size={56} state={mine.length ? 'seen' : 'none'} />
                {!mine.length ? (
                  <View style={styles.plusBadge}>
                    <Ionicons name="add" size={16} color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.name}>My moment</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {mine.length
                    ? `${formatAgo(mine[mine.length - 1].createdAt)}  ·  ${totalViews} view${totalViews === 1 ? '' : 's'}`
                    : 'Share a photo, video or text for 24 hours'}
                </Text>
              </View>
            </Pressable>
            {mine.length ? (
              <Pressable onPress={() => setAddOpen(true)} hitSlop={8} style={styles.addMore} accessibilityLabel="Add another moment">
                <Ionicons name="add-circle" size={30} color={colors.accent} />
              </Pressable>
            ) : null}
          </View>

          {recent.length ? <Text style={styles.section}>Recent</Text> : null}
          {recent.map((g) => renderRow(g, recent))}

          {viewed.length ? <Text style={styles.section}>Viewed</Text> : null}
          {viewed.map((g) => renderRow(g, viewed))}

          {!feed.length ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name={error ? 'cloud-offline-outline' : 'aperture-outline'} size={34} color={colors.accent} />
              </View>
              <Text style={styles.emptyTitle}>{error ? 'Could not load moments' : 'No moments yet'}</Text>
              <Text style={styles.emptyText}>
                {error || 'Moments from people you chat with show up here. They disappear after 24 hours.'}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      <ActionSheet visible={addOpen} title="New moment" options={addOptions} onClose={() => setAddOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14 },
  title: { flex: 1, color: colors.text, fontSize: 30, fontWeight: '700' },
  myCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  myRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  plusBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMore: { padding: 4 },
  section: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  rowBody: { flex: 1, marginLeft: 14 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 },
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
