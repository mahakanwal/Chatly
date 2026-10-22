import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useCall } from '../context/CallContext';
import { getRtcSurfaceView } from '../calls/agora';
import Avatar from '../components/Avatar';

function formatElapsed(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function CircleButton({ icon, bg, onPress, label, rotate, size = 72, iconSize = 30 }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.circle, { backgroundColor: bg, width: size, height: size, borderRadius: size / 2 }]}
    >
      <Ionicons name={icon} size={iconSize} color="#FFFFFF" style={rotate ? { transform: [{ rotate: '135deg' }] } : null} />
    </Pressable>
  );
}

function SmallButton({ icon, on, onPress, label }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.smallBtn, on && styles.smallBtnOn]}
    >
      <Ionicons name={icon} size={28} color="#FFFFFF" />
    </Pressable>
  );
}

/**
 * WhatsApp-style full-screen call UI.
 * Rendered inside a native Modal so it always covers the whole screen,
 * above navigation and every other view.
 */
function CallContent() {
  const insets = useSafeAreaInsets();
  const {
    call,
    elapsed,
    notice,
    media,
    muted,
    speaker,
    cameraOff,
    voiceAvailable,
    acceptCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    toggleCamera,
    switchCamera,
  } = useCall();

  if (!call) return null;

  const isVideo = call.callType === 'video';
  const showVideo = isVideo && voiceAvailable && call.phase === 'active';
  const RtcSurfaceView = showVideo ? getRtcSurfaceView() : null;

  const title = isVideo ? 'video call' : 'voice call';
  let statusText = '';
  if (call.phase === 'incoming') statusText = `Incoming ${title}...`;
  else if (call.phase === 'outgoing') statusText = 'Ringing...';
  else if (voiceAvailable && !media.remoteUid) statusText = media.joined ? 'Connecting...' : 'Connecting audio...';
  else statusText = formatElapsed(elapsed);

  return (
    <View style={styles.root}>
      {showVideo && RtcSurfaceView ? (
        <View style={styles.videoFill}>
          {media.remoteUid ? (
            <RtcSurfaceView canvas={{ uid: media.remoteUid }} style={StyleSheet.absoluteFill} />
          ) : (
            <RtcSurfaceView canvas={{ uid: 0 }} style={StyleSheet.absoluteFill} />
          )}
          {media.remoteUid ? (
            <View style={[styles.pip, { top: insets.top + 12 }]}>
              <RtcSurfaceView canvas={{ uid: 0 }} style={StyleSheet.absoluteFill} />
            </View>
          ) : null}
          <View style={[styles.videoTop, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.videoName} numberOfLines={1}>
              {call.peer?.name || call.peer?.phone || 'Unknown'}
            </Text>
            <Text style={styles.videoStatus}>{media.remoteUid ? formatElapsed(elapsed) : media.error || 'Connecting...'}</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.center, { paddingTop: insets.top + 28 }]}>
          <View style={styles.secureRow}>
            <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
            <Text style={styles.secure}>Secure call</Text>
          </View>
          <Avatar uri={call.peer?.avatar} name={call.peer?.name} size={148} />
          <Text style={styles.name} numberOfLines={1}>
            {call.peer?.name || call.peer?.phone || 'Unknown'}
          </Text>
          <Text style={styles.status}>{statusText}</Text>
          {call.phase === 'active' && media.error ? (
            <View style={[styles.previewPill, styles.errorPill]}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
              <Text style={[styles.previewText, { color: colors.text }]}>{media.error}</Text>
            </View>
          ) : null}
          {call.phase === 'active' && !voiceAvailable ? (
            <View style={styles.previewPill}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.previewText}>Preview — voice & video need a dev build</Text>
            </View>
          ) : null}
        </View>
      )}

      {notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 34) }]}>
        {call.phase === 'incoming' ? (
          <View style={styles.actions}>
            <View style={styles.incomingCol}>
              <CircleButton icon="call" rotate bg={colors.danger} onPress={endCall} label="Decline call" />
              <Text style={styles.actionLabel}>Decline</Text>
            </View>
            <View style={styles.incomingCol}>
              <CircleButton icon="call" bg={colors.success} onPress={acceptCall} label="Accept call" />
              <Text style={styles.actionLabel}>Accept</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.controls}>
              <SmallButton
                icon={muted ? 'mic-off' : 'mic'}
                on={muted}
                onPress={toggleMute}
                label={muted ? 'Unmute' : 'Mute'}
              />
              {isVideo ? (
                <SmallButton
                  icon={cameraOff ? 'videocam-off' : 'videocam'}
                  on={cameraOff}
                  onPress={toggleCamera}
                  label="Toggle camera"
                />
              ) : null}
              {isVideo && call.phase === 'active' ? (
                <SmallButton icon="camera-reverse" onPress={switchCamera} label="Switch camera" />
              ) : null}
              <SmallButton
                icon={speaker ? 'volume-high' : 'volume-medium'}
                on={speaker}
                onPress={toggleSpeaker}
                label="Speaker"
              />
            </View>
            <CircleButton icon="call" rotate bg={colors.danger} onPress={endCall} label="End call" size={76} iconSize={32} />
          </>
        )}
      </View>
    </View>
  );
}

export default function CallScreen() {
  const { call } = useCall();
  return (
    <Modal
      visible={!!call}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <CallContent />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0F12' },
  center: { flex: 1, alignItems: 'center' },
  secureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  secure: { color: colors.textMuted, fontSize: 12, marginLeft: 5 },
  errorPill: { maxWidth: '86%', borderColor: 'rgba(255,90,82,0.4)' },
  notice: {
    position: 'absolute',
    top: 70,
    alignSelf: 'center',
    backgroundColor: colors.raised,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 2,
  },
  noticeText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  name: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginTop: 22, paddingHorizontal: 32, textAlign: 'center' },
  status: { color: 'rgba(255,255,255,0.65)', fontSize: 16, marginTop: 8 },
  previewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewText: { color: colors.textSecondary, fontSize: 12, marginLeft: 6, flexShrink: 1 },
  videoFill: { flex: 1, backgroundColor: '#000' },
  pip: {
    position: 'absolute',
    right: 14,
    width: 110,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: '#000',
  },
  videoTop: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  videoName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  videoStatus: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottom: { alignItems: 'center', paddingTop: 16 },
  controls: { flexDirection: 'row', marginBottom: 30 },
  smallBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#2E3338',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  smallBtnOn: { backgroundColor: colors.accent },
  actions: { flexDirection: 'row', alignItems: 'center' },
  incomingCol: { alignItems: 'center', marginHorizontal: 30 },
  actionLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 8 },
  circle: { alignItems: 'center', justifyContent: 'center' },
});
