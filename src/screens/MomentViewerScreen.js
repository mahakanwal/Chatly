import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocketEvent } from '../context/SocketContext';
import Avatar from '../components/Avatar';
import { formatAgo, makeClientId } from '../utils/format';
import { REACTIONS, groupReactions } from '../components/ReactionSheet';

const PHOTO_MS = 6000;
const TEXT_MS = 6000;

function firstUnseen(group) {
  const idx = group.moments.findIndex((m) => !m.seen);
  return idx === -1 ? 0 : idx;
}

function durationFor(moment) {
  if (moment.type === 'video') {
    const secs = Math.min(Math.max(Number(moment.media?.duration) || 15, 3), 60);
    return secs * 1000;
  }
  return moment.type === 'text' ? TEXT_MS : PHOTO_MS;
}

function VideoMoment({ uri, paused, onReady }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') onReady();
      if (status === 'error') onReady();
    });
    return () => sub.remove();
  }, [player, onReady]);
  useEffect(() => {
    try {
      if (paused) player.pause();
      else player.play();
    } catch {
      // player released
    }
  }, [paused, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

/** Full-screen Moment viewer: tap right/left to move, hold to pause, reply or see viewers. */
export default function MomentViewerScreen({ route, navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState(route.params.groups || []);
  const [gi, setGi] = useState(route.params.index || 0);
  const [mi, setMi] = useState(() => (route.params.groups?.[route.params.index || 0] ? firstUnseen(route.params.groups[route.params.index || 0]) : 0));
  const [ready, setReady] = useState(false);
  const [holding, setHolding] = useState(false);
  const [typingReply, setTypingReply] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState('');

  const progress = useRef(new Animated.Value(0)).current;
  const progressValue = useRef(0);
  const anim = useRef(null);

  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      progressValue.current = value;
    });
    return () => progress.removeListener(id);
  }, [progress]);

  const group = groups[gi];
  const moment = group ? group.moments[mi] : null;
  const isMine = group ? String(group.user._id) === String(user._id) : false;
  const paused = holding || typingReply || viewersOpen || !ready;
  useSocketEvent('moment:reacted', ({ momentId, reactions }) => {
    setGroups((prev) =>
      prev.map((g) => ({ ...g, moments: g.moments.map((m) => (String(m._id) === String(momentId) ? { ...m, reactions } : m)) }))
    );
  });

  const close = useCallback(() => navigation.goBack(), [navigation]);

  const goNext = useCallback(() => {
    if (!group) return close();
    if (mi < group.moments.length - 1) return setMi(mi + 1);
    if (gi < groups.length - 1) {
      setGi(gi + 1);
      return setMi(firstUnseen(groups[gi + 1]));
    }
    return close();
  }, [group, groups, gi, mi, close]);

  const goPrev = useCallback(() => {
    if (mi > 0) return setMi(mi - 1);
    if (gi > 0) {
      setGi(gi - 1);
      return setMi(groups[gi - 1].moments.length - 1);
    }
    progress.setValue(0);
    progressValue.current = 0;
    return undefined;
  }, [gi, mi, groups, progress]);

  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  // New moment on screen: reset the bar, mark as viewed
  useEffect(() => {
    if (!moment) return;
    anim.current?.stop();
    progress.setValue(0);
    progressValue.current = 0;
    setReady(moment.type === 'text');
    if (!isMine && !moment.seen) {
      api(`/moments/${moment._id}/view`, { method: 'POST' }).catch(() => {});
      setGroups((prev) =>
        prev.map((g, i) => (i === gi ? { ...g, moments: g.moments.map((m, j) => (j === mi ? { ...m, seen: true } : m)) } : g))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment?._id]);

  // Progress bar timer (pauses while holding, typing a reply or viewing the viewers list)
  useEffect(() => {
    if (!moment || paused) return undefined;
    const total = durationFor(moment);
    const remaining = Math.max(50, total * (1 - progressValue.current));
    anim.current = Animated.timing(progress, { toValue: 1, duration: remaining, easing: Easing.linear, useNativeDriver: false });
    anim.current.start(({ finished }) => {
      if (finished) goNextRef.current();
    });
    return () => anim.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment?._id, paused]);

  // A moment can disappear (deleted) — keep indexes valid
  useEffect(() => {
    if (!groups.length) close();
    else if (!group) close();
    else if (!moment && group.moments.length) setMi(group.moments.length - 1);
  }, [groups, group, moment, close]);

  const onReady = useCallback(() => setReady(true), []);

  const flash = (text) => {
    setToast(text);
    setTimeout(() => setToast(''), 1800);
  };

  const sendReply = async () => {
    const body = reply.trim();
    if (!body || sending || !moment) return;
    setSending(true);
    try {
      const { conversation } = await api('/conversations', { method: 'POST', body: { userId: group.user._id } });
      await api(`/conversations/${conversation._id}/messages`, {
        method: 'POST',
        body: {
          type: 'text',
          text: body,
          clientId: makeClientId(),
          momentRef: {
            momentId: moment._id,
            type: moment.type,
            text: moment.text,
            thumb: moment.type === 'image' ? moment.media?.url : moment.media?.thumbnail || '',
          },
        },
      });
      setReply('');
      Keyboard.dismiss();
      flash('Reply sent');
    } catch (err) {
      Alert.alert('Could not send reply', err.message);
    } finally {
      setSending(false);
    }
  };

  const reactToMoment = async (emoji) => {
    if (!moment || isMine) return;
    try {
      const { reactions } = await api(`/moments/${moment._id}/react`, { method: 'POST', body: { emoji } });
      setGroups((prev) =>
        prev.map((g, i) => (i === gi ? { ...g, moments: g.moments.map((m, j) => (j === mi ? { ...m, reactions, myReaction: reactions.find((r) => String(r.user) === String(user._id))?.emoji || null } : m)) } : g))
      );
    } catch (err) {
      Alert.alert('Could not react', err.message);
    }
  };

  const openViewers = async () => {
    setViewersOpen(true);
    setViewers(null);
    try {
      const { viewers: list } = await api(`/moments/${moment._id}/viewers`);
      setViewers(list);
    } catch (err) {
      setViewers([]);
      Alert.alert('Could not load viewers', err.message);
    }
  };

  const deleteMoment = () => {
    setHolding(true);
    Alert.alert('Delete this moment?', 'It will be removed for everyone.', [
      { text: 'Cancel', style: 'cancel', onPress: () => setHolding(false) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/moments/${moment._id}`, { method: 'DELETE' });
            setGroups((prev) =>
              prev
                .map((g, i) => (i === gi ? { ...g, moments: g.moments.filter((m) => m._id !== moment._id) } : g))
                .filter((g) => g.moments.length)
            );
            setMi((i) => Math.max(0, i - 1));
          } catch (err) {
            Alert.alert('Could not delete', err.message);
          } finally {
            setHolding(false);
          }
        },
      },
    ]);
  };

  if (!group || !moment) return <View style={styles.root} />;

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[styles.root, moment.type === 'text' && { backgroundColor: moment.bgColor || colors.accent }]}>
      <StatusBar style="light" />

      {/* Content */}
      {moment.type === 'image' ? (
        <Image
          key={moment._id}
          source={{ uri: moment.media?.url }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="memory-disk"
          onLoad={onReady}
          onError={onReady}
        />
      ) : moment.type === 'video' ? (
        <VideoMoment key={moment._id} uri={moment.media?.url} paused={paused && ready} onReady={onReady} />
      ) : (
        <View style={styles.textMoment}>
          <Text style={styles.textMomentText}>{moment.text}</Text>
        </View>
      )}
      {!ready ? <ActivityIndicator size="large" color="#FFFFFF" style={StyleSheet.absoluteFill} /> : null}

      {/* Tap zones: left = previous, right = next, hold = pause */}
      <View style={StyleSheet.absoluteFill} pointerEvents={typingReply ? 'none' : 'auto'}>
        <View style={styles.zones}>
          <Pressable
            style={{ flex: 3 }}
            onPress={goPrev}
            onLongPress={() => setHolding(true)}
            onPressOut={() => setHolding(false)}
            delayLongPress={200}
            accessibilityLabel="Previous moment"
          />
          <Pressable
            style={{ flex: 7 }}
            onPress={goNext}
            onLongPress={() => setHolding(true)}
            onPressOut={() => setHolding(false)}
            delayLongPress={200}
            accessibilityLabel="Next moment"
          />
        </View>
      </View>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {group.moments.map((m, i) => (
            <View key={m._id} style={styles.barTrack}>
              {i < mi ? <View style={[styles.barFill, { width: '100%' }]} /> : null}
              {i === mi ? <Animated.View style={[styles.barFill, { width: barWidth }]} /> : null}
            </View>
          ))}
        </View>
        <View style={styles.headerRow}>
          <Avatar uri={group.user.avatar} name={group.user.name} size={40} ring={false} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.headerName} numberOfLines={1}>
              {isMine ? 'My moment' : group.user.name || group.user.phone}
            </Text>
            <Text style={styles.headerTime}>{formatAgo(moment.createdAt)}</Text>
          </View>
          {isMine ? (
            <Pressable onPress={deleteMoment} hitSlop={10} style={styles.headerBtn} accessibilityLabel="Delete moment">
              <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
            </Pressable>
          ) : null}
          <Pressable onPress={close} hitSlop={10} style={styles.headerBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* Footer */}
      <KeyboardAvoidingView behavior="padding" style={styles.footerWrap} pointerEvents="box-none">
        {moment.type !== 'text' && moment.text ? (
          <View style={styles.captionBox} pointerEvents="none">
            <Text style={styles.captionText}>{moment.text}</Text>
          </View>
        ) : null}
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          {isMine ? (
            <View style={{ alignItems: 'center' }}>
              <Pressable onPress={openViewers} style={styles.viewsBtn} accessibilityRole="button" accessibilityLabel="Seen by">
                <Ionicons name="eye-outline" size={20} color="#FFFFFF" />
                <Text style={styles.viewsText}>{moment.viewCount || 0}</Text>
              </Pressable>
              {groupReactions(moment.reactions, user._id).length ? (
                <Text style={styles.ownerReactions}>
                  {groupReactions(moment.reactions, user._id).map((g) => `${g.emoji}${g.count > 1 ? g.count : ''}`).join('  ')}
                </Text>
              ) : null}
            </View>
          ) : (
            <View>
              <View style={styles.reactRow}>
                {REACTIONS.map((e) => {
                  const mine = moment.myReaction === e;
                  const count = (moment.reactions || []).filter((r) => r.emoji === e).length;
                  return (
                    <Pressable key={e} onPress={() => reactToMoment(e)} style={[styles.reactBtn, mine && styles.reactBtnMine]} accessibilityLabel={`React ${e}`}>
                      <Text style={styles.reactEmoji}>{e}</Text>
                      {count ? <Text style={styles.reactCount}>{count}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.replyRow}>
              <TextInput
                value={reply}
                onChangeText={setReply}
                onFocus={() => setTypingReply(true)}
                onBlur={() => setTypingReply(false)}
                placeholder="Reply privately"
                placeholderTextColor="rgba(255,255,255,0.7)"
                style={styles.replyInput}
                maxLength={2000}
                accessibilityLabel="Reply to moment"
              />
              <Pressable
                onPress={sendReply}
                disabled={!reply.trim() || sending}
                style={[styles.replySend, (!reply.trim() || sending) && { opacity: 0.5 }]}
                accessibilityLabel="Send reply"
              >
                {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
              </Pressable>
              </View>
            </View>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* Viewers list (own moments) */}
      <Modal visible={viewersOpen} transparent animationType="slide" onRequestClose={() => setViewersOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setViewersOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Viewed by {viewers ? viewers.length : ''}</Text>
            {!viewers ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={viewers}
                keyExtractor={(v) => String(v.user._id)}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => (
                  <View style={styles.viewerRow}>
                    <Avatar uri={item.user.avatar} name={item.user.name} size={44} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.viewerName}>{item.user.name || item.user.phone}</Text>
                      <Text style={styles.viewerTime}>{formatAgo(item.at)}</Text>
                    </View>
                  </View>
                )}
                ListEmptyComponent={<Text style={styles.noViewers}>No views yet</Text>}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  zones: { flex: 1, flexDirection: 'row' },
  textMoment: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  textMomentText: { color: '#FFFFFF', fontSize: 28, fontWeight: '600', lineHeight: 38, textAlign: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.25)', paddingBottom: 10 },
  bars: { flexDirection: 'row', marginBottom: 10 },
  barTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', marginHorizontal: 2, overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: '#FFFFFF' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  headerName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerTime: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  headerBtn: { padding: 6, marginLeft: 6 },
  toast: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  toastText: { color: '#FFFFFF', fontWeight: '600' },
  footerWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  captionBox: { backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 18, paddingVertical: 12 },
  captionText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21, textAlign: 'center' },
  footer: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.25)' },
  viewsBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewsText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginLeft: 8 },
  reactRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 10 },
  reactBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 999, marginHorizontal: 2, backgroundColor: 'rgba(0,0,0,0.35)' },
  reactBtnMine: { backgroundColor: 'rgba(232,71,63,0.55)' },
  reactEmoji: { fontSize: 20 },
  reactCount: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginLeft: 2 },
  ownerReactions: { color: '#FFFFFF', fontSize: 14, marginTop: 8 },
  replyRow: { flexDirection: 'row', alignItems: 'center' },
  replyInput: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    color: '#FFFFFF',
    paddingHorizontal: 18,
    fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  replySend: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 10 },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  viewerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  viewerName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  viewerTime: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  noViewers: { color: colors.textMuted, textAlign: 'center', marginVertical: 24 },
});
