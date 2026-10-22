import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

/**
 * pending  -> clock
 * sent     -> single tick
 * delivered-> double tick
 * seen     -> blue double tick
 * failed   -> alert
 */
export default function Ticks({ status, onAccent = false, size = 15 }) {
  const base = onAccent ? colors.onAccentMuted : colors.textMuted;
  const seen = onAccent ? colors.seenOnAccent : colors.seen;
  switch (status) {
    case 'pending':
      return <Ionicons name="time-outline" size={size - 2} color={base} />;
    case 'failed':
      return <Ionicons name="alert-circle" size={size} color={onAccent ? '#FFFFFF' : colors.danger} />;
    case 'sent':
      return <Ionicons name="checkmark" size={size} color={base} />;
    case 'delivered':
      return <Ionicons name="checkmark-done" size={size} color={base} />;
    case 'seen':
      return <Ionicons name="checkmark-done" size={size} color={seen} />;
    default:
      return null;
  }
}
