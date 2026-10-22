import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import Avatar from './Avatar';

/**
 * Avatar with a coloured ring for Moments.
 * Accent ring = something new to watch, grey ring = all watched, no ring = nothing posted.
 */
export default function MomentRing({ uri, name, size = 58, state = 'none' }) {
  const ringColor = state === 'unseen' ? colors.accent : state === 'seen' ? colors.raisedHigh : 'transparent';
  return (
    <View style={[styles.ring, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderColor: ringColor }]}>
      <Avatar uri={uri} name={name} size={size} ring={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
