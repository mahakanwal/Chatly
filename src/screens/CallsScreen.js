import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { api } from '../api/client';
import { useCall } from '../context/CallContext';
import Avatar from '../components/Avatar';
import { formatDuration, formatListTime } from '../utils/format';

function statusLabel(item) {
  if (item.status === 'missed') return 'Missed';
  if (item.status === 'declined') return 'Declined';
  if (item.status === 'cancelled') return 'Cancelled';
  if (item.direction === 'incoming') return 'Incoming';
  return 'Outgoing';
}

function CallRow({ item, onCallBack }) {
  const missed = item.status === 'missed' || item.status === 'declined';
  const isVideo = item.callType === 'video';
  const arrow = item.direction === 'incoming' ? 'arrow-down' : 'arrow-up';
  const detail =
    item.status === 'ended' && item.durationSec > 0
      ? formatDuration(item.durationSec)
      : statusLabel(item);

  return (
    <View style={styles.row}>
      <Avatar uri={item.peer?.avatar} name={item.peer?.name} size={54} />
      <Pressable style={styles.body} onPress={onCallBack} accessibilityRole="button" accessibilityLabel={`Call back ${item.peer?.name}`}>
        <Text style={styles.name} numberOfLines={1}>
          {item.peer?.name || item.peer?.phone || 'Unknown'}
        </Text>
        <View style={styles.subRow}>
          <Ionicons name={arrow} size={14} color={missed ? colors.danger : colors.success} style={{ marginRight: 5 }} />
          <Ionicons name={isVideo ? 'videocam' : 'call'} size={13} color={colors.textMuted} style={{ marginRight: 5 }} />
          <Text style={[styles.detail, missed && { color: colors.danger }]} numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </Pressable>
      <Text style={styles.time}>{formatListTime(item.createdAt)}</Text>
      <Pressable onPress={onCallBack} hitSlop={10} style={styles.callBtn} accessibilityLabel={`Call ${item.peer?.name}`}>
        <Ionicons name={isVideo ? 'videocam' : 'call'} size={20} color={colors.accent} />
      </Pressable>
    </View>
  );
}

export default function CallsScreen() {
  const { startCall } = useCall();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { calls: list } = await api('/calls?limit=60');
      setCalls(list);
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Calls</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(c) => String(c._id)}
          renderItem={({ item }) => (
            <CallRow item={item} onCallBack={() => item.peer && startCall(item.peer, item.callType)} />
          )}
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
                <Ionicons name="call-outline" size={34} color={colors.accent} />
              </View>
              <Text style={styles.emptyTitle}>{error ? 'Could not load calls' : 'No calls yet'}</Text>
              <Text style={styles.emptyText}>
                {error || 'Your recent voice and video calls will appear here.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14 },
  title: { color: colors.text, fontSize: 30, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9 },
  body: { flex: 1, marginLeft: 14, marginRight: 8 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  detail: { color: colors.textMuted, fontSize: 13, flexShrink: 1 },
  time: { color: colors.textMuted, fontSize: 12, marginRight: 10 },
  callBtn: { padding: 8 },
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
