import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { colors, raised, raisedSoft } from '../theme';
import { api, uploadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket, useSocketEvent } from '../context/SocketContext';
import { useCall } from '../context/CallContext';
import Avatar from '../components/Avatar';
import RoundButton from '../components/RoundButton';
import MessageBubble, { SystemMessage } from '../components/MessageBubble';
import EmojiPanel from '../components/EmojiPanel';
import ActionSheet from '../components/ActionSheet';
import ReactionSheet from '../components/ReactionSheet';
import ChatBackground from '../components/ChatBackground';
import { captureFromCamera, pickDocument, pickFromLibrary } from '../utils/pickers';
import { formatDayLabel, formatDuration, formatLastSeen, isSameDay, makeClientId, maxStatus, messagePreview } from '../utils/format';

const PAGE_SIZE = 40;
// Sender name colours in groups (readable on the dark theme)
const NAME_COLORS = ['#F28B82', '#8AB4F8', '#81C995', '#FDD663', '#C58AF9', '#78D9EC', '#FCAD70', '#F6AEA9'];

function colorFor(id) {
  const str = String(id || '');
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) % 997;
  return NAME_COLORS[h % NAME_COLORS.length];
}
const DELETE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Inserts or replaces a message (matched by server id or by the device clientId). */
function upsert(list, msg) {
  const idx = list.findIndex((m) => String(m._id) === String(msg._id) || (msg.clientId && m.clientId === msg.clientId));
  if (idx === -1) return [msg, ...list];
  const next = [...list];
  const old = next[idx];
  next[idx] = { ...msg, status: maxStatus(old.status, msg.status) };
  return next;
}

function replyPreview(m) {
  return {
    _id: m._id,
    sender: m.sender,
    type: m.type,
    text: m.type === 'text' ? m.text : m.text || '',
    mediaThumb: m.type === 'image' ? m.media?.url : m.type === 'video' ? m.media?.thumbnail || '' : '',
  };
}

export default function ChatScreen({ route, navigation }) {
  const params = route.params || {};
  const { user } = useAuth();
  const { socket, presence, typing, seedPresence, activeConversationId } = useSocket();
  const { startCall, call: activeCall } = useCall();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [conversation, setConversation] = useState(params.conversation || null);
  const conversationId = conversation?._id || params.conversationId || null;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [removed, setRemoved] = useState(false); // removed from / left this group

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordStart = useRef(0);
  const typingSent = useRef(false);
  const typingTimer = useRef(null);
  const inputRef = useRef(null);
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;
  const pendingAssetHandled = useRef(false);

  const peer = conversation?.peer;
  const isAI = Boolean(conversation?.isAI);
  const isGroup = Boolean(conversation?.isGroup);

  // Group members by id -> name (for sender names, replies and "typing")
  const memberMap = useMemo(() => {
    const map = {};
    (conversation?.members || []).forEach((m) => {
      map[String(m._id)] = m;
    });
    return map;
  }, [conversation?.members]);
  const nameOf = useCallback(
    (id) => {
      if (String(id) === String(user._id)) return 'You';
      const m = memberMap[String(id)];
      return m ? m.name || m.phone : isGroup ? 'Former member' : peer?.name || '';
    },
    [memberMap, user._id, isGroup, peer?.name]
  );

  // ---------- Load conversation ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const path = params.ai ? '/conversations/ai' : `/conversations/${params.conversationId}`;
        const { conversation: conv } = await api(path);
        if (cancelled) return;
        setConversation(conv);
        seedPresence(conv.peer);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.ai, params.conversationId, seedPresence]);

  // ---------- Messages ----------
  const loadLatest = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { messages: list, hasMore: more } = await api(`/conversations/${conversationId}/messages?limit=${PAGE_SIZE}`);
      setMessages((prev) => {
        // Keep messages still sending from this device
        const local = prev.filter((m) => (m.pending || m.failed) && !list.some((s) => s.clientId && s.clientId === m.clientId));
        return [...local, ...list];
      });
      setHasMore(more);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingMore || !conversationId) return;
    const oldest = [...messages].reverse().find((m) => !m.pending && !m.failed);
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const { messages: list, hasMore: more } = await api(
        `/conversations/${conversationId}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldest.createdAt)}`
      );
      setMessages((prev) => [...prev, ...list.filter((m) => !prev.some((p) => String(p._id) === String(m._id)))]);
      setHasMore(more);
    } catch {
      // keep current list, user can scroll again
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, conversationId, messages]);

  const markSeen = useCallback(() => {
    if (socket && conversationId && AppState.currentState === 'active') {
      socket.emit('messages:seen', { conversationId });
    }
  }, [socket, conversationId]);

  // Refresh block status / profile when coming back from Contact info
  const reloadConversation = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { conversation: conv } = await api(`/conversations/${conversationId}`);
      setConversation(conv);
      setRemoved(false);
    } catch (err) {
      // 404 on a group = I'm no longer a member; otherwise keep the current header
      if (err.status === 404 && conversation?.isGroup) setRemoved(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const unblock = async () => {
    try {
      await api(`/users/${peer._id}/block`, { method: 'DELETE' });
      setConversation((c) => ({ ...c, blockedByMe: false }));
    } catch (err) {
      Alert.alert('Could not unblock', err.message);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!conversationId) return undefined;
      activeConversationId.current = String(conversationId);
      loadLatest();
      reloadConversation();
      markSeen();
      return () => {
        if (activeConversationId.current === String(conversationId)) activeConversationId.current = null;
      };
    }, [conversationId, loadLatest, reloadConversation, markSeen, activeConversationId])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && focusedRef.current) markSeen();
    });
    return () => sub.remove();
  }, [markSeen]);

  // ---------- Real-time ----------
  useSocketEvent('connect', () => {
    if (focusedRef.current) {
      loadLatest();
      markSeen();
    }
  });

  useSocketEvent('message:new', (msg) => {
    if (String(msg.conversation) !== String(conversationId)) return;
    setMessages((prev) => upsert(prev, msg));
    if (String(msg.sender) !== String(user._id) && focusedRef.current) markSeen();
  });

  useSocketEvent('message:status', ({ conversationId: cid, ids, status }) => {
    if (String(cid) !== String(conversationId)) return;
    setMessages((prev) => prev.map((m) => (ids.includes(String(m._id)) ? { ...m, status: maxStatus(m.status, status) } : m)));
  });

  useSocketEvent('group:updated', ({ conversationId: cid }) => {
    if (String(cid) === String(conversationId)) reloadConversation();
  });

  useSocketEvent('group:removed', ({ conversationId: cid }) => {
    if (String(cid) === String(conversationId)) setRemoved(true);
  });

  useSocketEvent('message:deleted', ({ conversationId: cid, messageId }) => {
    if (String(cid) !== String(conversationId)) return;
    setMessages((prev) =>
      prev.map((m) => (String(m._id) === String(messageId) ? { ...m, deleted: true, text: '', media: null, replyTo: null, type: 'text' } : m))
    );
  });

  useSocketEvent('message:reacted', ({ conversationId: cid, messageId, reactions }) => {
    if (String(cid) !== String(conversationId)) return;
    setMessages((prev) => prev.map((m) => (String(m._id) === String(messageId) ? { ...m, reactions } : m)));
  });

  // ---------- Typing ----------
  const stopTyping = useCallback(() => {
    clearTimeout(typingTimer.current);
    if (typingSent.current && socket && conversationId) socket.emit('typing', { conversationId, isTyping: false });
    typingSent.current = false;
  }, [socket, conversationId]);

  useEffect(() => stopTyping, [stopTyping]);

  const onChangeText = (t) => {
    setText(t);
    if (!socket || !conversationId || isAI) return;
    if (!t.length) {
      stopTyping();
      return;
    }
    if (!typingSent.current) {
      socket.emit('typing', { conversationId, isTyping: true });
      typingSent.current = true;
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 2500);
  };

  // ---------- Sending ----------
  const markFailed = (clientId) =>
    setMessages((prev) =>
      prev.map((m) => (m.clientId === clientId ? { ...m, pending: false, uploading: false, failed: true, status: 'failed' } : m))
    );

  const postMessage = useCallback(
    async (clientId, payload) => {
      try {
        const { message } = await api(`/conversations/${conversationId}/messages`, {
          method: 'POST',
          body: { ...payload, clientId },
        });
        setMessages((prev) => upsert(prev, message));
      } catch {
        markFailed(clientId);
      }
    },
    [conversationId]
  );

  const uploadAndSend = useCallback(
    async (msg) => {
      const { file, caption, replyToId } = msg.retryData;
      try {
        const { media, type } = await uploadFile('/media/upload', file, { duration: file.duration });
        const finalMedia = {
          ...media,
          width: media.width || file.width,
          height: media.height || file.height,
          duration: media.duration || file.duration,
        };
        setMessages((prev) => prev.map((m) => (m.clientId === msg.clientId ? { ...m, media: finalMedia, uploading: false } : m)));
        await postMessage(msg.clientId, {
          type: file.kind === 'audio' ? 'audio' : type,
          text: caption,
          media: finalMedia,
          replyTo: replyToId,
        });
      } catch (err) {
        markFailed(msg.clientId);
        Alert.alert('Could not send file', err.message);
      }
    },
    [postMessage]
  );

  const sendText = () => {
    const body = text.trim();
    if (!body || !conversationId) return;
    const clientId = makeClientId();
    const payload = { type: 'text', text: body, replyTo: replyTo?._id };
    const optimistic = {
      _id: clientId,
      clientId,
      conversation: conversationId,
      sender: user._id,
      type: 'text',
      text: body,
      media: null,
      replyTo: replyTo ? replyPreview(replyTo) : null,
      status: 'pending',
      pending: true,
      createdAt: new Date().toISOString(),
      retryData: { payload },
    };
    setMessages((prev) => [optimistic, ...prev]);
    setText('');
    setReplyTo(null);
    stopTyping();
    postMessage(clientId, payload);
  };

  const sendFile = useCallback(
    (file, caption = '') => {
      if (!conversationId || !file) return;
      const clientId = makeClientId();
      const type = ['image', 'video', 'audio'].includes(file.kind) ? file.kind : 'document';
      const optimistic = {
        _id: clientId,
        clientId,
        conversation: conversationId,
        sender: user._id,
        type,
        text: caption,
        media: { url: file.uri, name: file.name, size: file.size, width: file.width, height: file.height, duration: file.duration },
        replyTo: replyTo ? replyPreview(replyTo) : null,
        status: 'pending',
        pending: true,
        uploading: true,
        createdAt: new Date().toISOString(),
        retryData: { file, caption, replyToId: replyTo?._id },
      };
      setMessages((prev) => [optimistic, ...prev]);
      setReplyTo(null);
      uploadAndSend(optimistic);
    },
    [conversationId, user._id, replyTo, uploadAndSend]
  );

  const retry = useCallback(
    (m) => {
      const uploaded = m.media?.url && m.media.url.startsWith('https://');
      setMessages((prev) =>
        prev.map((x) =>
          x.clientId === m.clientId ? { ...x, failed: false, pending: true, status: 'pending', uploading: Boolean(m.retryData?.file) && !uploaded } : x
        )
      );
      if (m.retryData?.file && !uploaded) uploadAndSend(m);
      else if (m.retryData?.file) {
        postMessage(m.clientId, {
          type: m.type,
          text: m.retryData.caption,
          media: m.media,
          replyTo: m.retryData.replyToId,
        });
      } else postMessage(m.clientId, m.retryData.payload);
    },
    [uploadAndSend, postMessage]
  );

  // Photo/video captured from the Camera tab
  useEffect(() => {
    if (conversationId && params.pendingAsset && !pendingAssetHandled.current) {
      pendingAssetHandled.current = true;
      sendFile(params.pendingAsset);
      navigation.setParams({ pendingAsset: undefined });
    }
  }, [conversationId, params.pendingAsset, sendFile, navigation]);

  // ---------- Voice notes ----------
  useEffect(() => {
    if (!recording) return undefined;
    const i = setInterval(() => setRecordSecs(Math.floor((Date.now() - recordStart.current) / 1000)), 300);
    return () => clearInterval(i);
  }, [recording]);

  const startRecording = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone access needed', 'Allow microphone access in Settings to send voice messages.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStart.current = Date.now();
      setRecordSecs(0);
      setRecording(true);
      setEmojiOpen(false);
    } catch (err) {
      Alert.alert('Could not start recording', err.message);
    }
  };

  const stopRecording = async (send) => {
    const secs = Math.round((Date.now() - recordStart.current) / 1000);
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      // already stopped
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    if (!send || !uri) return;
    if (secs < 1) {
      Alert.alert('Too short', 'Hold the recording for at least 1 second.');
      return;
    }
    sendFile({ uri, name: `voice_${Date.now()}.m4a`, type: 'audio/mp4', kind: 'audio', duration: secs });
  };

  // ---------- Attachments ----------
  const attachOptions = [
    { label: 'Document', icon: 'document-text', onPress: async () => sendFile(await pickDocument()) },
    { label: 'Photos & videos', icon: 'images', onPress: async () => sendFile(await pickFromLibrary()) },
    { label: 'Camera', icon: 'camera', onPress: async () => sendFile(await captureFromCamera()) },
  ];

  // ---------- Message actions ----------
  const deleteMessage = async (m, scope) => {
    if (m.failed || m.pending) {
      setMessages((prev) => prev.filter((x) => x.clientId !== m.clientId));
      return;
    }
    try {
      await api(`/messages/${m._id}?scope=${scope}`, { method: 'DELETE' });
      if (scope === 'me') setMessages((prev) => prev.filter((x) => String(x._id) !== String(m._id)));
      else setMessages((prev) => prev.map((x) => (String(x._id) === String(m._id) ? { ...x, deleted: true, text: '', media: null, type: 'text' } : x)));
    } catch (err) {
      Alert.alert('Could not delete', err.message);
    }
  };

  const reactMessage = useCallback(
    async (emoji) => {
      const m = actionMsg;
      if (!m || m.failed || m.pending) return;
      try {
        const { reactions } = await api(`/messages/${m._id}/react`, { method: 'POST', body: { emoji } });
        setMessages((prev) => prev.map((x) => (String(x._id) === String(m._id) ? { ...x, reactions } : x)));
      } catch (err) {
        Alert.alert('Could not react', err.message);
      } finally {
        setActionMsg(null);
      }
    },
    [actionMsg]
  );

  const actionOptions = useMemo(() => {
    if (!actionMsg) return [];
    const m = actionMsg;
    const mine = String(m.sender) === String(user._id);
    const opts = [];
    if (!m.deleted && !m.failed) {
      opts.push({
        label: 'Reply',
        icon: 'arrow-undo',
        onPress: () => {
          setReplyTo(m);
          inputRef.current?.focus();
        },
      });
    }
    if (!m.deleted && m.text) opts.push({ label: 'Copy', icon: 'copy', onPress: () => Clipboard.setStringAsync(m.text) });
    opts.push({ label: 'Delete for me', icon: 'trash', destructive: true, onPress: () => deleteMessage(m, 'me') });
    if (mine && !m.deleted && !m.failed && !isAI && Date.now() - new Date(m.createdAt).getTime() < DELETE_WINDOW_MS) {
      opts.push({ label: 'Delete for everyone', icon: 'trash-bin', destructive: true, onPress: () => deleteMessage(m, 'everyone') });
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionMsg, user._id, isAI]);

  const openMedia = useCallback(
    (m) => navigation.navigate('MediaViewer', { type: m.type, url: m.media?.url, name: m.media?.name }),
    [navigation]
  );
  const onLongPress = useCallback((m) => {
    Keyboard.dismiss();
    setActionMsg(m);
  }, []);

  // ---------- List items with day separators ----------
  const items = useMemo(() => {
    const out = [];
    for (let i = 0; i < messages.length; i += 1) {
      const m = messages[i];
      const older = messages[i + 1];
      // In groups, show the sender name on the first message of each run
      const showName = !older || older.type === 'system' || String(older.sender) !== String(m.sender) || !isSameDay(m.createdAt, older.createdAt);
      out.push({ kind: 'msg', key: m.clientId || String(m._id), m, showName });
      if (!older || !isSameDay(m.createdAt, older.createdAt)) {
        out.push({ kind: 'day', key: `day_${m.createdAt}_${i}`, label: formatDayLabel(m.createdAt) });
      }
    }
    return out;
  }, [messages]);

  const peerName = peer?.name || peer?.phone || '';
  const renderItem = useCallback(
    ({ item }) => {
      if (item.kind === 'day') {
        return (
          <View style={styles.dayWrap}>
            <Text style={styles.dayText}>{item.label}</Text>
          </View>
        );
      }
      if (item.m.type === 'system') return <SystemMessage text={item.m.text} />;
      const mine = String(item.m.sender) === String(user._id);
      return (
        <MessageBubble
          message={item.m}
          isMine={mine}
          myId={user._id}
          peerName={peerName}
          senderName={isGroup && !mine && item.showName ? nameOf(item.m.sender) : null}
          senderColor={isGroup ? colorFor(item.m.sender) : null}
          nameOf={isGroup ? nameOf : null}
          onLongPress={onLongPress}
          onOpenMedia={openMedia}
          onRetry={retry}
          onReactPress={onLongPress}
        />
      );
    },
    [user._id, peerName, isGroup, nameOf, onLongPress, openMedia, retry]
  );

  // ---------- Header status ----------
  const peerPresence = peer ? presence[peer._id] : null;
  const typingWho = conversationId ? typing[conversationId] : false;
  const isTyping = Boolean(typingWho);
  let statusText = '';
  if (isTyping && isGroup) statusText = `${(nameOf(typingWho) || 'Someone').split(' ')[0]} is typing...`;
  else if (isTyping) statusText = 'typing...';
  else if (isGroup) {
    const others = (conversation?.members || []).filter((m) => String(m._id) !== String(user._id)).map((m) => (m.name || m.phone || '').split(' ')[0]);
    statusText = removed ? "You're no longer a member" : ['You', ...others].join(', ');
  } else if (isAI) statusText = 'AI assistant · always available';
  else if (peerPresence?.hidden) statusText = ''; // contact hides last seen & online
  else if (peerPresence?.online) statusText = 'online';
  else if (peerPresence) statusText = formatLastSeen(peerPresence.lastSeen);

  const openInfo = () => {
    if (!conversation) return;
    if (isGroup) {
      if (!removed) navigation.navigate('GroupInfo', { conversationId, conversation });
      return;
    }
    navigation.navigate('ContactInfo', { conversationId, conversation });
  };
  const hasText = text.trim().length > 0;
  // WhatsApp-style group permission: only admins may send when the toggle is on
  const canSend = !isGroup || !conversation?.group?.onlyAdminsCanSend || Boolean(conversation?.isAdmin);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ChatBackground />
      {/* Header */}
      <View style={styles.header}>
        <RoundButton icon="arrow-back" onPress={() => navigation.goBack()} size={42} accessibilityLabel="Back" />
        <Pressable onPress={openInfo} style={styles.headerInfo} accessibilityLabel={isGroup ? 'Group info' : 'Contact info'}>
          <Avatar uri={peer?.avatar} name={peer?.name} isBot={peer?.isBot} isGroup={isGroup} size={46} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerName} numberOfLines={1}>
              {peerName || ' '}
            </Text>
            {statusText ? (
              <Text style={[styles.headerStatus, isTyping && { color: colors.accent }]} numberOfLines={1}>
                {statusText}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {!isAI && !isGroup && !peer?.isDeleted ? (
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => startCall(peer, 'video')}
              disabled={Boolean(activeCall)}
              hitSlop={8}
              style={[styles.headerAction, activeCall && { opacity: 0.4 }]}
              accessibilityLabel="Video call"
            >
              <Ionicons name="videocam" size={23} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={() => startCall(peer, 'audio')}
              disabled={Boolean(activeCall)}
              hitSlop={8}
              style={[styles.headerAction, activeCall && { opacity: 0.4 }]}
              accessibilityLabel="Voice call"
            >
              <Ionicons name="call" size={21} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}
        <RoundButton icon="ellipsis-vertical" onPress={openInfo} size={42} iconSize={20} accessibilityLabel="Chat options" />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {/* Messages */}
        <View style={{ flex: 1 }}>
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : messages.length === 0 ? (
            <View style={styles.empty}>
              {error ? (
                <>
                  <Text style={styles.emptyTitle}>Could not load messages</Text>
                  <Text style={styles.emptyText}>{error}</Text>
                  <Pressable onPress={loadLatest} style={{ marginTop: 14 }} hitSlop={8}>
                    <Text style={styles.link}>Try again</Text>
                  </Pressable>
                </>
              ) : isAI ? (
                <>
                  <View style={[styles.emptyIcon, raised]}>
                    <Ionicons name="sparkles" size={30} color={colors.accent} />
                  </View>
                  <Text style={styles.emptyTitle}>How can I help you today?</Text>
                  <Text style={styles.emptyText}>Ask questions, send a photo to describe, or record a voice message.</Text>
                </>
              ) : isGroup ? (
                <>
                  <Text style={styles.emptyTitle}>{peerName}</Text>
                  <Text style={styles.emptyText}>Messages you send here are delivered to every member of the group.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Say hello</Text>
                  <Text style={styles.emptyText}>Messages, photos, videos, voice notes and documents you share appear here.</Text>
                </>
              )}
            </View>
          ) : (
            <FlatList
              data={items}
              inverted
              keyExtractor={(it) => it.key}
              renderItem={renderItem}
              onEndReached={loadOlder}
              onEndReachedThreshold={0.3}
              contentContainerStyle={{ paddingVertical: 10 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} /> : null}
              initialNumToRender={20}
              windowSize={11}
            />
          )}
        </View>

        {/* Reply preview */}
        {replyTo ? (
          <View style={styles.replyBar}>
            <View style={styles.replyAccent} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.replyName}>{String(replyTo.sender) === String(user._id) ? 'You' : isGroup ? nameOf(replyTo.sender) : peerName}</Text>
              <Text style={styles.replyText} numberOfLines={1}>
                {messagePreview(replyTo)}
              </Text>
            </View>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={10} accessibilityLabel="Cancel reply">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {/* Composer (or blocked / deleted notice) */}
        {removed ? (
          <View style={[styles.blockedBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <Text style={styles.blockedText}>You can't send messages to this group because you're no longer a member.</Text>
          </View>
        ) : !canSend ? (
          <View style={[styles.blockedBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <Text style={styles.blockedText}>Only admins can send messages in this group.</Text>
          </View>
        ) : conversation?.blockedByMe || peer?.isDeleted ? (
          <Pressable
            onPress={peer?.isDeleted ? undefined : unblock}
            style={[styles.blockedBar, { paddingBottom: Math.max(insets.bottom, 14) }]}
            accessibilityRole={peer?.isDeleted ? undefined : 'button'}
          >
            <Text style={styles.blockedText}>
              {peer?.isDeleted ? 'This account has been deleted.' : 'You blocked this contact. Tap to unblock.'}
            </Text>
          </Pressable>
        ) : (
        <View style={[styles.composer, { paddingBottom: emojiOpen ? 8 : Math.max(insets.bottom, 10) }]}>
          <View style={[styles.inputPill, raisedSoft]}>
            {recording ? (
              <>
                <Pressable onPress={() => stopRecording(false)} hitSlop={8} style={styles.pillIcon} accessibilityLabel="Cancel recording">
                  <Ionicons name="trash-outline" size={22} color={colors.danger} />
                </Pressable>
                <View style={styles.recDot} />
                <Text style={styles.recText}>Recording {formatDuration(recordSecs)}</Text>
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => {
                    if (emojiOpen) {
                      setEmojiOpen(false);
                      inputRef.current?.focus();
                    } else {
                      Keyboard.dismiss();
                      setEmojiOpen(true);
                    }
                  }}
                  hitSlop={8}
                  style={styles.pillIcon}
                  accessibilityLabel={emojiOpen ? 'Show keyboard' : 'Show emoji'}
                >
                  <Ionicons name={emojiOpen ? 'keypad-outline' : 'happy-outline'} size={24} color={colors.textSecondary} />
                </Pressable>
                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={onChangeText}
                  onFocus={() => setEmojiOpen(false)}
                  placeholder="Type a message"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  multiline
                  maxLength={8000}
                  accessibilityLabel="Message"
                />
                <Pressable onPress={() => setAttachOpen(true)} hitSlop={8} style={styles.pillIcon} accessibilityLabel="Attach">
                  <Ionicons name="attach" size={24} color={colors.textSecondary} style={{ transform: [{ rotate: '45deg' }] }} />
                </Pressable>
                {!hasText ? (
                  <Pressable
                    onPress={async () => sendFile(await captureFromCamera())}
                    hitSlop={8}
                    style={styles.pillIcon}
                    accessibilityLabel="Camera"
                  >
                    <Ionicons name="camera" size={23} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
          <RoundButton
            icon={recording || hasText ? 'send' : 'mic'}
            filled
            size={54}
            iconSize={recording || hasText ? 22 : 24}
            onPress={() => {
              if (recording) stopRecording(true);
              else if (hasText) sendText();
              else startRecording();
            }}
            disabled={!conversationId}
            accessibilityLabel={recording ? 'Send voice message' : hasText ? 'Send' : 'Record voice message'}
            style={{ marginLeft: 10 }}
          />
        </View>
        )}

        {emojiOpen && !conversation?.blockedByMe && !removed && canSend ? (
          <View style={{ paddingBottom: insets.bottom }}>
            <EmojiPanel onSelect={(e) => onChangeText(text + e)} />
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <ActionSheet visible={attachOpen} title="Share" options={attachOptions} onClose={() => setAttachOpen(false)} />
      <ReactionSheet
        visible={Boolean(actionMsg)}
        message={actionMsg}
        myId={user._id}
        onReact={reactMessage}
        options={actionOptions}
        onClose={() => setActionMsg(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.chatBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerAction: { padding: 8 },
  headerName: { color: colors.text, fontSize: 17, fontWeight: '700' },
  headerStatus: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  dayWrap: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginVertical: 12,
  },
  dayText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  link: { color: colors.accent, fontWeight: '700' },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 6,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  replyAccent: { width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.accent },
  replyName: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  replyText: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: colors.input,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillIcon: { padding: 6 },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  blockedBar: {
    paddingTop: 14,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  blockedText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, marginLeft: 8, marginRight: 10 },
  recText: { color: colors.text, fontSize: 15, flex: 1 },
});
