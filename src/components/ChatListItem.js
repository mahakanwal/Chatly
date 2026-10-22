import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import Avatar from './Avatar';
import Ticks from './Ticks';
import { formatListTime, messagePreview } from '../utils/format';

const TYPE_ICONS = { image: 'camera', video: 'videocam', audio: 'mic', document: 'document-text' };

function memberName(conversation, id) {
  const m = (conversation.members || []).find((x) => String(x._id) === String(id));
  return m ? (m.name || m.phone || '').split(' ')[0] : '';
}

function ChatListItem({ conversation, myId, isTyping, onPress, onLongPress }) {
  const { peer, lastMessage, unread, isAI, isGroup } = conversation;
  const mine = lastMessage && String(lastMessage.sender) === String(myId);
  const hasUnread = unread > 0;
  const time = lastMessage ? lastMessage.createdAt : null;

  let preview;
  if (isTyping) {
    const who = isGroup && typeof isTyping === 'string' ? memberName(conversation, isTyping) : '';
    preview = <Text style={[styles.preview, { color: colors.accent }]}>{who ? `${who} is typing...` : 'typing...'}</Text>;
  } else if (lastMessage) {
    const icon = !lastMessage.deleted ? TYPE_ICONS[lastMessage.type] : 'ban-outline';
    const isSystem = lastMessage.type === 'system';
    const prefix = isGroup && !mine && !isSystem && !lastMessage.deleted ? memberName(conversation, lastMessage.sender) : '';
    preview = (
      <View style={styles.previewRow}>
        {mine && !lastMessage.deleted && !isSystem ? (
          <View style={{ marginRight: 4 }}>
            <Ticks status={lastMessage.status} size={14} />
          </View>
        ) : null}
        {icon ? <Ionicons name={icon} size={13} color={colors.textMuted} style={{ marginRight: 4 }} /> : null}
        <Text style={[styles.preview, hasUnread && { color: colors.textSecondary }, isSystem && { fontStyle: 'italic' }]} numberOfLines={1}>
          {prefix ? `${prefix}: ` : ''}
          {messagePreview(lastMessage)}
        </Text>
      </View>
    );
  } else {
    preview = (
      <Text style={styles.preview} numberOfLines={1}>
        {isAI ? 'Ask me anything — text, photos or voice' : isGroup ? 'Group created' : 'Start chatting'}
      </Text>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress ? () => onLongPress(conversation) : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}
      accessibilityRole="button"
      accessibilityLabel={`Chat with ${peer.name}${hasUnread ? `, ${unread} unread` : ''}`}
    >
      <Avatar uri={peer.avatar} name={peer.name} isBot={peer.isBot} isGroup={isGroup} size={60} />
      <View style={styles.body}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>
            {peer.name || peer.phone}
          </Text>
          {conversation.isFavourite ? <Ionicons name="star" size={13} color={colors.accent} style={{ marginLeft: 4 }} /> : null}
          <Text style={[styles.time, hasUnread && { color: colors.accent }]}>{formatListTime(time)}</Text>
        </View>
        <View style={styles.bottomLine}>
          <View style={{ flex: 1 }}>{preview}</View>
          {hasUnread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : isAI ? (
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>AI</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default memo(ChatListItem);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingVertical: 8,
  },
  body: {
    flex: 1,
    marginLeft: 16,
    paddingRight: 18,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginRight: 8,
    letterSpacing: 0.1,
  },
  time: {
    color: colors.textMuted,
    fontSize: 13,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  preview: {
    flexShrink: 1,
    color: colors.textMuted,
    fontSize: 14,
  },
  badge: {
    minWidth: 24,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  badgeText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '700',
  },
  aiBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.accentSoft,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(232,71,63,0.35)',
  },
  aiBadgeText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
