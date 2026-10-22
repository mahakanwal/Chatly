import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, raised } from '../theme';

export default function PrimaryButton({ title, onPress, loading = false, disabled = false, variant = 'primary', style }) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        raised,
        isPrimary && { backgroundColor: pressed ? colors.accentPressed : colors.accent },
        !isPrimary && { backgroundColor: pressed ? colors.raisedHigh : colors.raised, borderWidth: 1, borderColor: colors.border },
        (disabled || loading) && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.accent} />
      ) : (
        <Text style={[styles.text, { color: isPrimary ? colors.onAccent : isDanger ? colors.danger : colors.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
