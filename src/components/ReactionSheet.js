import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

export const REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍', '🔥', '😍'];

/** Groups reactions into [{ emoji, count, mine }] for the pill under a bubble. */
export function groupReactions(reactions = [], myId) {
  const map = {};
  (reactions || []).forEach((r) => {
    if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, count: 0, mine: false };
    map[r.emoji].count += 1;
    if (String(r.user) === String(myId)) map[r.emoji].mine = true;
  });
  return Object.values(map);
}

/**
 * Long-press sheet for a message: reaction emojis on top (tap the same emoji
 * again to remove it), then the usual Reply / Copy / Delete options.
 * options: [{ label, icon, onPress, destructive }] — same shape as ActionSheet.
 */
export default function ReactionSheet({ visible, message, myId, onReact, options = [], onClose }) {
  const insets = useSafeAreaInsets();
  const myReaction = (message?.reactions || []).find((r) => String(r.user) === String(myId))?.emoji || null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.emojiRow}>
            {REACTIONS.map((e) => (
              <Pressable
                key={e}
                onPress={() => {
                  onClose();
                  setTimeout(() => onReact(e), 150);
                }}
                style={[styles.emojiBtn, myReaction === e && styles.emojiBtnMine]}
                accessibilityLabel={`React ${e}`}
              >
                <Text style={styles.emoji}>{e}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>{myReaction ? 'Tap the same emoji again to remove your reaction' : 'Tap an emoji to react'}</Text>
          {options.map((opt) => (
            <Pressable
              key={opt.label}
              onPress={() => {
                onClose();
                setTimeout(opt.onPress, 250);
              }}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.raisedHigh }]}
              accessibilityRole="button"
            >
              {opt.icon ? (
                <View style={[styles.iconWrap, opt.destructive && { backgroundColor: 'rgba(255,90,82,0.12)' }]}>
                  <Ionicons name={opt.icon} size={20} color={opt.destructive ? colors.danger : colors.accent} />
                </View>
              ) : null}
              <Text style={[styles.label, opt.destructive && { color: colors.danger }]}>{opt.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 8 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 8 },
  emojiBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emojiBtnMine: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  emoji: { fontSize: 24 },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md },
  iconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  label: { color: colors.text, fontSize: 16, fontWeight: '500' },
});
