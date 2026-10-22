import React, { memo } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, raisedSoft } from '../theme';
import { formatBytes, formatDuration, formatTime } from '../utils/format';
import Ticks from './Ticks';
import { groupReactions } from './ReactionSheet';
import AudioMessage from './AudioMessage';

const MEDIA_WIDTH = 230;

function mediaHeight(media) {
  if (!media || !media.width || !media.height) return 230;
  const h = (MEDIA_WIDTH * media.height) / media.width;
  return Math.max(140, Math.min(320, h));
}

function Meta({ message, isMine, overlay }) {
  const color = overlay ? '#FFFFFF' : isMine ? colors.onAccentMuted : colors.textMuted;
  return (
    <View style={[styles.meta, overlay && styles.metaOverlay]}>
      <Text style={[styles.time, { color }]}>{formatTime(message.createdAt)}</Text>
      {isMine ? (
        <View style={{ marginLeft: 3 }}>
          <Ticks status={message.failed ? 'failed' : message.status} onAccent={!overlay} />
        </View>
      ) : null}
    </View>
  );
}

function ReplyQuote({ reply, isMine, myId, peerName, nameOf }) {
  if (!reply) return null;
  const fromMe = String(reply.sender) === String(myId);
  const otherName = nameOf ? nameOf(reply.sender) : peerName;
  const label =
    reply.type === 'image' ? 'Photo' : reply.type === 'video' ? 'Video' : reply.type === 'audio' ? 'Voice message' : reply.type === 'document' ? 'Document' : '';
  return (
    <View style={[styles.quote, { backgroundColor: isMine ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.06)' }]}>
      <View style={[styles.quoteBar, { backgroundColor: isMine ? '#FFFFFF' : colors.accent }]} />
      <View style={{ flex: 1, paddingVertical: 6, paddingHorizontal: 8 }}>
        <Text style={[styles.quoteName, { color: isMine ? '#FFFFFF' : colors.accent }]} numberOfLines={1}>
          {fromMe ? 'You' : otherName}
        </Text>
        <Text style={[styles.quoteText, { color: isMine ? colors.onAccentMuted : colors.textSecondary }]} numberOfLines={2}>
          {reply.text || label}
        </Text>
      </View>
      {reply.mediaThumb ? <Image source={{ uri: reply.mediaThumb }} style={styles.quoteThumb} contentFit="cover" /> : null}
    </View>
  );
}

function MomentQuote({ moment, isMine }) {
  if (!moment) return null;
  const label = moment.type === 'image' ? 'Photo' : moment.type === 'video' ? 'Video' : moment.text || 'Moment';
  return (
    <View style={[styles.quote, { backgroundColor: isMine ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.06)' }]}>
      <View style={[styles.quoteBar, { backgroundColor: isMine ? '#FFFFFF' : colors.accent }]} />
      <View style={{ flex: 1, paddingVertical: 6, paddingHorizontal: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="aperture" size={12} color={isMine ? '#FFFFFF' : colors.accent} />
          <Text style={[styles.quoteName, { color: isMine ? '#FFFFFF' : colors.accent, marginLeft: 4 }]}>Moment</Text>
        </View>
        <Text style={[styles.quoteText, { color: isMine ? colors.onAccentMuted : colors.textSecondary }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
      {moment.thumb ? <Image source={{ uri: moment.thumb }} style={styles.quoteThumb} contentFit="cover" /> : null}
    </View>
  );
}

/** Centered pill for group events ("Ali added Sara"). */
export function SystemMessage({ text }) {
  return (
    <View style={styles.systemWrap}>
      <Text style={styles.systemText}>{text}</Text>
    </View>
  );
}

function MessageBubble({ message, isMine, myId, peerName, senderName, senderColor, nameOf, onLongPress, onOpenMedia, onRetry, onReactPress }) {
  const m = message;
  const bubbleStyle = [styles.bubble, isMine ? styles.mine : [styles.theirs, raisedSoft]];
  const textColor = isMine ? colors.onAccent : colors.text;
  const uploading = m.uploading;

  const handlePress = () => {
    if (m.failed && onRetry) return onRetry(m);
    if (m.deleted || uploading) return undefined;
    if (m.type === 'image' || m.type === 'video') return onOpenMedia(m);
    if (m.type === 'document' && m.media?.url && m.media.url.startsWith('http')) return Linking.openURL(m.media.url);
    return undefined;
  };

  let body;
  if (m.deleted) {
    body = (
      <View style={styles.textRow}>
        <Ionicons name="ban-outline" size={15} color={isMine ? colors.onAccentMuted : colors.textMuted} style={{ marginRight: 6 }} />
        <Text style={[styles.deletedText, { color: isMine ? colors.onAccentMuted : colors.textMuted }]}>
          {isMine ? 'You deleted this message' : 'This message was deleted'}
        </Text>
        <Meta message={m} isMine={isMine} />
      </View>
    );
  } else if (m.type === 'image' || m.type === 'video') {
    const thumb = m.type === 'video' ? m.media?.thumbnail || m.media?.localThumb : m.media?.url;
    body = (
      <View>
        <View style={[styles.mediaBox, { height: mediaHeight(m.media) }]}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.mediaPlaceholder]}>
              <Ionicons name="videocam" size={36} color={colors.textMuted} />
            </View>
          )}
          {m.type === 'video' && !uploading ? (
            <View style={styles.playOverlay}>
              <View style={styles.playCircle}>
                <Ionicons name="play" size={26} color="#FFFFFF" style={{ marginLeft: 3 }} />
              </View>
            </View>
          ) : null}
          {m.type === 'video' && m.media?.duration ? (
            <View style={styles.durationTag}>
              <Ionicons name="videocam" size={12} color="#FFFFFF" />
              <Text style={styles.durationText}>{formatDuration(m.media.duration)}</Text>
            </View>
          ) : null}
          {uploading ? (
            <View style={styles.playOverlay}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          ) : null}
          {!m.text ? <Meta message={m} isMine={isMine} overlay /> : null}
        </View>
        {m.text ? (
          <View style={[styles.textRow, { paddingHorizontal: 6, paddingTop: 6 }]}>
            <Text style={[styles.text, { color: textColor }]}>{m.text}</Text>
            <Meta message={m} isMine={isMine} />
          </View>
        ) : null}
      </View>
    );
  } else if (m.type === 'audio') {
    body = (
      <View>
        {uploading ? (
          <View style={styles.uploadRow}>
            <ActivityIndicator color={isMine ? '#FFFFFF' : colors.accent} />
            <Text style={[styles.uploadText, { color: textColor }]}>Sending voice message</Text>
          </View>
        ) : (
          <AudioMessage uri={m.media?.url} duration={m.media?.duration} isMine={isMine} />
        )}
        <View style={{ alignSelf: 'flex-end' }}>
          <Meta message={m} isMine={isMine} />
        </View>
      </View>
    );
  } else if (m.type === 'document') {
    body = (
      <View>
        <View style={[styles.docRow, { backgroundColor: isMine ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.05)' }]}>
          <View style={[styles.docIcon, { backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : colors.accentSoft }]}>
            {uploading ? (
              <ActivityIndicator size="small" color={isMine ? '#FFFFFF' : colors.accent} />
            ) : (
              <Ionicons name="document-text" size={22} color={isMine ? '#FFFFFF' : colors.accent} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.docName, { color: textColor }]} numberOfLines={2}>
              {m.media?.name || 'Document'}
            </Text>
            <Text style={[styles.docSize, { color: isMine ? colors.onAccentMuted : colors.textMuted }]}>
              {formatBytes(m.media?.size)}
              {m.media?.name && m.media.name.includes('.') ? ` · ${m.media.name.split('.').pop().toUpperCase()}` : ''}
            </Text>
          </View>
        </View>
        <View style={{ alignSelf: 'flex-end' }}>
          <Meta message={m} isMine={isMine} />
        </View>
      </View>
    );
  } else {
    body = (
      <View style={styles.textRow}>
        <Text style={[styles.text, { color: textColor }]} selectable={false}>
          {m.text}
        </Text>
        <Meta message={m} isMine={isMine} />
      </View>
    );
  }

  const isMedia = !m.deleted && (m.type === 'image' || m.type === 'video');

  const grouped = groupReactions(m.reactions, myId);
  return (
    <View style={[styles.col, { alignItems: isMine ? 'flex-end' : 'flex-start' }]}>
    <View style={[styles.row, { justifyContent: isMine ? 'flex-end' : 'flex-start' }]}>
      <Pressable
        onPress={handlePress}
        onLongPress={() => !m.pending && !uploading && onLongPress(m)}
        delayLongPress={300}
        style={[bubbleStyle, isMedia && styles.mediaBubble]}
        accessibilityHint="Long press for options"
      >
        {senderName && !isMine ? (
          <Text style={[styles.senderName, { color: senderColor || colors.accent }, isMedia && { marginHorizontal: 6, marginTop: 2 }]} numberOfLines={1}>
            {senderName}
          </Text>
        ) : null}
        <ReplyQuote reply={m.replyTo} isMine={isMine} myId={myId} peerName={peerName} nameOf={nameOf} />
        <MomentQuote moment={m.momentRef} isMine={isMine} />
        {body}
      </Pressable>
      {m.failed ? (
        <Pressable onPress={() => onRetry(m)} style={styles.retry} accessibilityLabel="Retry sending">
          <Ionicons name="refresh-circle" size={26} color={colors.danger} />
        </Pressable>
      ) : null}
    </View>
    {grouped.length && !m.deleted ? (
      <Pressable onPress={() => onReactPress && onReactPress(m)} style={[styles.reactPill, isMine ? { marginRight: 12 } : { marginLeft: 12 }]} accessibilityLabel="Message reactions">
        {grouped.map((g) => (
          <Text key={g.emoji} style={[styles.reactText, g.mine && { color: colors.accent }]}>
            {g.emoji}
            {g.count > 1 ? g.count : ''}
          </Text>
        ))}
      </Pressable>
    ) : null}
    </View>
  );
}

export default memo(MessageBubble);

const styles = StyleSheet.create({
  col: { paddingHorizontal: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginVertical: 4,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mine: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 6,
  },
  theirs: {
    backgroundColor: colors.raised,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mediaBubble: {
    padding: 5,
  },
  textRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
    flexShrink: 1,
  },
  deletedText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    marginTop: 2,
  },
  metaOverlay: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  time: {
    fontSize: 11,
  },
  mediaBox: {
    width: MEDIA_WIDTH,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#15171A',
  },
  mediaPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  playCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationTag: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 11,
    marginLeft: 4,
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 220,
    paddingVertical: 6,
  },
  uploadText: {
    marginLeft: 10,
    fontSize: 14,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 10,
    width: 240,
  },
  docIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  docName: {
    fontSize: 14,
    fontWeight: '600',
  },
  docSize: {
    fontSize: 12,
    marginTop: 2,
  },
  quote: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 6,
    minWidth: 160,
  },
  quoteBar: {
    width: 4,
  },
  quoteName: {
    fontSize: 13,
    fontWeight: '700',
  },
  quoteText: {
    fontSize: 13,
    marginTop: 1,
  },
  quoteThumb: {
    width: 48,
    height: 48,
    alignSelf: 'center',
    marginRight: 4,
    borderRadius: 6,
  },
  retry: {
    marginLeft: 6,
  },
  reactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: -2,
    marginBottom: 2,
  },
  reactText: { fontSize: 13, color: colors.textSecondary, marginHorizontal: 1 },
  senderName: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  systemWrap: {
    alignSelf: 'center',
    maxWidth: '86%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 6,
  },
  systemText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 17,
  },
});
