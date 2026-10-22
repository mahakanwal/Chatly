import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors } from '../theme';
import { formatDuration } from '../utils/format';

/** Voice note player: play/pause, progress bar and time. */
export default function AudioMessage({ uri, duration = 0, isMine }) {
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const [barWidth, setBarWidth] = useState(1);

  const total = status.duration && status.duration > 0 ? status.duration : duration;
  const current = status.currentTime || 0;
  const progress = total > 0 ? Math.min(current / total, 1) : 0;

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (total > 0 && current >= total - 0.2) player.seekTo(0);
      player.play();
    }
  };

  const seek = (e) => {
    if (!total) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth));
    player.seekTo(ratio * total);
  };

  const fg = isMine ? colors.onAccent : colors.accent;
  const track = isMine ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)';

  return (
    <View style={styles.row}>
      <Pressable onPress={toggle} hitSlop={8} accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={28} color={fg} />
      </Pressable>
      <View style={styles.middle}>
        <Pressable onPress={seek} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width || 1)} style={styles.trackHit}>
          <View style={[styles.track, { backgroundColor: track }]}>
            <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: fg }]} />
          </View>
          <View style={[styles.knob, { left: `${progress * 100}%`, backgroundColor: fg }]} />
        </Pressable>
        <Text style={[styles.time, { color: isMine ? colors.onAccentMuted : colors.textMuted }]}>
          {formatDuration(status.playing || current > 0 ? current : total)}
        </Text>
      </View>
      <Ionicons name="mic" size={18} color={isMine ? colors.onAccentMuted : colors.textMuted} style={{ marginLeft: 6 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 220,
    paddingTop: 4,
  },
  middle: {
    flex: 1,
    marginLeft: 8,
  },
  trackHit: {
    height: 18,
    justifyContent: 'center',
  },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 3,
  },
  knob: {
    position: 'absolute',
    width: 11,
    height: 11,
    borderRadius: 6,
    marginLeft: -5,
    top: 3.5,
  },
  time: {
    fontSize: 11,
    marginTop: 2,
  },
});
