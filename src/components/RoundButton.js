import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';

/** Raised circular icon button from the reference design. */
export default function RoundButton({
  icon,
  onPress,
  onLongPress,
  size = 44,
  iconSize,
  filled = false,
  iconColor,
  disabled = false,
  accessibilityLabel,
  style,
}) {
  const color = iconColor || (filled ? colors.onAccent : colors.accent);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        raised,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: filled ? (pressed ? colors.accentPressed : colors.accent) : pressed ? colors.raisedHigh : colors.raised,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <View pointerEvents="none">
        <Ionicons name={icon} size={iconSize || Math.round(size * 0.45)} color={color} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
