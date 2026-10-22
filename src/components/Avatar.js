import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { initials } from '../utils/format';

/**
 * Circular avatar with the raised ring from the design.
 * Shows initials when the user has no photo, and a sparkle mark for the AI assistant.
 */
export default function Avatar({ uri, name, size = 52, isBot = false, isGroup = false, ring = true, style }) {
  const inner = ring ? size - 8 : size;
  let content;
  if (isBot) {
    content = (
      <View style={[styles.fallback, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: colors.accentSoft }]}>
        <Ionicons name="sparkles" size={inner * 0.46} color={colors.accent} />
      </View>
    );
  } else if (uri) {
    content = (
      <Image
        source={{ uri }}
        style={{ width: inner, height: inner, borderRadius: inner / 2 }}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
      />
    );
  } else if (isGroup) {
    content = (
      <View style={[styles.fallback, { width: inner, height: inner, borderRadius: inner / 2 }]}>
        <Ionicons name="people" size={inner * 0.46} color={colors.textSecondary} />
      </View>
    );
  } else {
    content = (
      <View style={[styles.fallback, { width: inner, height: inner, borderRadius: inner / 2 }]}>
        <Text style={[styles.initials, { fontSize: inner * 0.36 }]}>{initials(name)}</Text>
      </View>
    );
  }

  if (!ring) return <View style={style}>{content}</View>;

  return (
    <View style={[styles.ring, raised, { width: size, height: size, borderRadius: size / 2 }, style]}>{content}</View>
  );
}

const styles = StyleSheet.create({
  ring: {
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallback: {
    backgroundColor: colors.raisedHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.text,
    fontWeight: '700',
  },
});
