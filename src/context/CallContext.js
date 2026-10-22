import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { useSocket, useSocketEvent } from './SocketContext';
import { AGORA_APP_ID, describeAgoraError, describeConnectionReason, getAgora, isVoiceAvailable } from '../calls/agora';

const CallContext = createContext(null);

/**
 * Call state (null when idle):
 * { phase: 'outgoing', callId, peer, callType }
 * { phase: 'incoming', callId, peer, callType }
 * { phase: 'active', callId, peer, callType, acceptedAt }
 *
 * Signaling runs over Socket.IO (works everywhere). Real voice/video transport
 * uses Agora, which needs the native module — available in EAS dev builds, NOT
 * in Expo Go. Without it the full call UX still works (ringing, timer,
 * history) and the UI is marked as preview.
 */
export function CallProvider({ children }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [call, setCall] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState(null);
  const [media, setMedia] = useState({ joined: false, remoteUid: null, error: null });
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const callRef = useRef(null);
  callRef.current = call;
  const noticeTimer = useRef(null);
  const engineRef = useRef(null);
  const engineAppIdRef = useRef('');
  const mutedRef = useRef(false);
  const speakerRef = useRef(false);

  // Real audio/video needs the native Agora module (dev build / store build, not Expo Go).
  // The App ID can come from the app (.env) or from the server (/calls/:id/token).
  const voiceAvailable = isVoiceAvailable();

  // ---------- ringtones ----------
  // incoming: classic ringtone + vibration (callee hears this)
  // outgoing: ringback tone (caller hears "trrr" while waiting, like WhatsApp)
  const player = useAudioPlayer(require('../../assets/ringtone.wav'));
  const playerStatus = useAudioPlayerStatus(player);
  const ringbackPlayer = useAudioPlayer(require('../../assets/ringback.wav'));
  const ringbackStatus = useAudioPlayerStatus(ringbackPlayer);
  const callPhase = call && call.phase;
  const callId = call && call.callId;

  const safeAudio = (fn) => {
    try {
      fn();
    } catch {
      // player not ready or already released (e.g. fast refresh)
    }
  };

  useEffect(() => {
    if (callPhase === 'incoming') {
      safeAudio(() => player.play());
      safeAudio(() => ringbackPlayer.pause());
      Vibration.vibrate([0, 900, 400, 900], true);
    } else if (callPhase === 'outgoing') {
      safeAudio(() => ringbackPlayer.play());
      safeAudio(() => player.pause());
      Vibration.cancel();
    } else {
      safeAudio(() => player.pause());
      safeAudio(() => player.seekTo(0));
      safeAudio(() => ringbackPlayer.pause());
      safeAudio(() => ringbackPlayer.seekTo(0));
      Vibration.cancel();
    }
    return () => {
      safeAudio(() => player.pause());
      safeAudio(() => ringbackPlayer.pause());
      Vibration.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callPhase]);

  // loop both tones
  useEffect(() => {
    if (callPhase === 'incoming' && playerStatus.didJustFinish) {
      safeAudio(() => {
        player.seekTo(0);
        player.play();
      });
    }
    if (callPhase === 'outgoing' && ringbackStatus.didJustFinish) {
      safeAudio(() => {
        ringbackPlayer.seekTo(0);
        ringbackPlayer.play();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callPhase, playerStatus.didJustFinish, ringbackStatus.didJustFinish]);

  // ---------- active-call timer ----------
  useEffect(() => {
    if (callPhase !== 'active') {
      setElapsed(0);
      return undefined;
    }
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [callPhase, callId]);

  const flashNotice = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2200);
  }, []);

  const clearCall = useCallback(() => setCall(null), []);

  // ---------- Agora media engine (dev builds only) ----------
  const requestCallPermissions = useCallback(async (video) => {
    if (Platform.OS !== 'android') return true; // iOS shows the system prompt when Agora opens the mic
    try {
      const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
      if (video) perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      const res = await PermissionsAndroid.requestMultiple(perms);
      return perms.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED);
    } catch {
      return false;
    }
  }, []);

  const reportMediaError = useCallback(
    (text) => {
      if (!text) return;
      setMedia((m) => ({ ...m, error: text }));
      flashNotice(text);
    },
    [flashNotice]
  );

  const ensureEngine = useCallback(
    (appId) => {
      const agora = getAgora();
      if (!agora || !appId) return null;
      if (engineRef.current && engineAppIdRef.current === appId) return engineRef.current;
      if (engineRef.current) {
        try {
          engineRef.current.release();
        } catch {
          // ignore
        }
        engineRef.current = null;
      }
      try {
        const engine = agora.createAgoraRtcEngine();
        const code = engine.initialize({
          appId,
          channelProfile: agora.ChannelProfileType.ChannelProfileCommunication,
          audioScenario: agora.AudioScenarioType ? agora.AudioScenarioType.AudioScenarioDefault : undefined,
        });
        if (typeof code === 'number' && code < 0) {
          reportMediaError(describeAgoraError(-code) || `Call engine failed to start (${code})`);
          return null;
        }
        engine.registerEventHandler({
          onJoinChannelSuccess: () => {
            setMedia((m) => ({ ...m, joined: true, error: null }));
            // Audio route + mute can only be applied reliably after joining
            try {
              engine.setEnableSpeakerphone(speakerRef.current);
            } catch {
              // ignore
            }
            try {
              engine.muteLocalAudioStream(mutedRef.current);
            } catch {
              // ignore
            }
          },
          onUserJoined: (_conn, uid) => setMedia((m) => ({ ...m, remoteUid: uid })),
          onUserOffline: (_conn, uid) => setMedia((m) => (m.remoteUid === uid ? { ...m, remoteUid: null } : m)),
          onError: (err, msg) => {
            console.warn('Agora error', err, msg);
            const text = describeAgoraError(err);
            if (text) reportMediaError(text);
          },
          onConnectionStateChanged: (_conn, state, reason) => {
            const text = describeConnectionReason(reason);
            if (text) reportMediaError(text);
          },
        });
        engineRef.current = engine;
        engineAppIdRef.current = appId;
        return engine;
      } catch (e) {
        console.warn('Agora init failed:', e.message);
        reportMediaError('Call engine failed to start. Rebuild the app with react-native-agora.');
        return null;
      }
    },
    [reportMediaError]
  );

  const joinAgoraChannel = useCallback(
    async (id, callType) => {
      const agora = getAgora();
      if (!agora) return; // Expo Go: preview mode
      const video = callType === 'video';
      const ok = await requestCallPermissions(video);
      if (!ok) {
        reportMediaError(video ? 'Microphone and camera permission needed' : 'Microphone permission needed');
        return;
      }

      // Token + App ID from the server (works for both Agora "Testing" and "Secure" mode)
      let info = { appId: null, token: null, channel: String(id), uid: 0 };
      try {
        info = { ...info, ...(await api(`/calls/${id}/token`)) };
      } catch (e) {
        if (e.status === 410) return; // call already ended
        console.warn('Call token request failed:', e.message);
      }
      if (!callRef.current || String(callRef.current.callId) !== String(id)) return; // hung up meanwhile

      const appId = info.appId || AGORA_APP_ID;
      if (!appId) {
        reportMediaError('Agora App ID missing. Set AGORA_APP_ID in server/.env.');
        return;
      }
      const engine = ensureEngine(appId);
      if (!engine) return;

      // Make sure the ringtone players have released the speaker before the call audio starts
      safeAudio(() => player.pause());
      safeAudio(() => ringbackPlayer.pause());

      try {
        engine.enableAudio();
        engine.setDefaultAudioRouteToSpeakerphone(video);
        if (video) {
          engine.enableVideo();
          engine.startPreview();
        } else {
          engine.disableVideo();
        }
        const code = engine.joinChannel(info.token || '', info.channel || String(id), Number(info.uid) || 0, {
          clientRoleType: agora.ClientRoleType.ClientRoleBroadcaster,
          channelProfile: agora.ChannelProfileType.ChannelProfileCommunication,
          publishMicrophoneTrack: true,
          publishCameraTrack: video,
          autoSubscribeAudio: true,
          autoSubscribeVideo: video,
        });
        if (typeof code === 'number' && code < 0) {
          reportMediaError(describeAgoraError(-code) || `Could not join the call (${code})`);
        }
      } catch (e) {
        console.warn('Agora join failed:', e.message);
        reportMediaError('Could not connect the call audio. Please try again.');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ensureEngine, requestCallPermissions, reportMediaError]
  );

  const leaveAgoraChannel = useCallback(() => {
    const engine = engineRef.current;
    if (engine) {
      try {
        engine.stopPreview();
      } catch {
        // ignore
      }
      try {
        engine.leaveChannel();
      } catch {
        // ignore
      }
    }
    setMedia({ joined: false, remoteUid: null, error: null });
    setMuted(false);
    setSpeaker(false);
    setCameraOff(false);
    mutedRef.current = false;
    speakerRef.current = false;
  }, []);

  // Join media when the call becomes active; leave when it ends.
  useEffect(() => {
    if (callPhase === 'active' && callId) {
      const c = callRef.current;
      // Video calls start on the loudspeaker, voice calls on the earpiece (like WhatsApp)
      const video = c.callType === 'video';
      speakerRef.current = video;
      setSpeaker(video);
      joinAgoraChannel(callId, c.callType);
    } else if (!call) {
      leaveAgoraChannel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callPhase, callId]);

  // Free the native engine when the provider unmounts (logout)
  useEffect(
    () => () => {
      try {
        engineRef.current?.leaveChannel();
        engineRef.current?.release();
      } catch {
        // ignore
      }
      engineRef.current = null;
    },
    []
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      try {
        engineRef.current?.muteLocalAudioStream(next);
      } catch {
        // preview mode
      }
      return next;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeaker((s) => {
      const next = !s;
      speakerRef.current = next;
      try {
        engineRef.current?.setEnableSpeakerphone(next);
      } catch {
        // preview mode
      }
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraOff((c) => {
      try {
        engineRef.current?.muteLocalVideoStream(!c);
        if (!c) engineRef.current?.stopPreview();
        else engineRef.current?.startPreview();
      } catch {
        // preview mode
      }
      return !c;
    });
  }, []);

  const switchCamera = useCallback(() => {
    try {
      engineRef.current?.switchCamera();
    } catch {
      // preview mode
    }
  }, []);

  // ---------- actions ----------
  const startCall = useCallback(
    (peer, callType = 'audio') => {
      if (!socket) return;
      if (callRef.current) {
        Alert.alert('Already in a call', 'End the current call first.');
        return;
      }
      if (!peer || peer.isBot) {
        Alert.alert('Cannot call', 'You cannot call this contact.');
        return;
      }
      const type = callType === 'video' ? 'video' : 'audio';
      socket.emit('call:invite', { calleeId: peer._id, callType: type }, (res) => {
        if (res && res.ok) {
          setCall({ phase: 'outgoing', callId: res.call._id, peer: res.call.callee, callType: res.call.callType });
        } else {
          Alert.alert('Could not start call', (res && res.message) || 'Please try again.');
        }
      });
    },
    [socket]
  );

  const acceptCall = useCallback(() => {
    const c = callRef.current;
    if (!c || c.phase !== 'incoming' || !socket) return;
    socket.emit('call:accept', { callId: c.callId });
    setCall({ ...c, phase: 'active', acceptedAt: Date.now() });
  }, [socket]);

  const endCall = useCallback(() => {
    const c = callRef.current;
    if (!c || !socket) return;
    if (c.phase === 'outgoing') socket.emit('call:cancel', { callId: c.callId });
    else if (c.phase === 'incoming') socket.emit('call:decline', { callId: c.callId });
    else socket.emit('call:end', { callId: c.callId });
    setCall(null);
  }, [socket]);

  // ---------- incoming signaling ----------
  useSocketEvent('call:incoming', (payload) => {
    if (callRef.current) return;
    setCall({ phase: 'incoming', callId: payload._id, peer: payload.caller, callType: payload.callType });
  });

  useSocketEvent('call:accepted', () => {
    const c = callRef.current;
    if (c && c.phase === 'outgoing') setCall({ ...c, phase: 'active', acceptedAt: Date.now() });
  });

  useSocketEvent('call:declined', () => {
    if (callRef.current && callRef.current.phase === 'outgoing') {
      flashNotice('Declined');
      setCall(null);
    }
  });

  useSocketEvent('call:cancelled', () => {
    if (callRef.current && callRef.current.phase === 'incoming') {
      flashNotice('Call cancelled');
      setCall(null);
    }
  });

  useSocketEvent('call:missed', () => {
    if (callRef.current && callRef.current.phase === 'incoming') {
      flashNotice('Missed call');
      setCall(null);
    }
  });

  useSocketEvent('call:timeout', () => {
    if (callRef.current && callRef.current.phase === 'outgoing') {
      flashNotice('No answer');
      setCall(null);
    }
  });

  useSocketEvent('call:ended', () => {
    if (callRef.current) setCall(null);
  });

  useSocketEvent('call:error', ({ message } = {}) => {
    Alert.alert('Call failed', message || 'Please try again.');
  });

  // ---------- open incoming call from a tapped push notification ----------
  useEffect(() => {
    if (!user) return undefined;
    const openFromPush = async (data) => {
      if (!data || !data.incomingCall || !data.callId || callRef.current) return;
      try {
        const { call: info } = await api(`/calls/${data.callId}`);
        if (info && info.status === 'ringing' && String(info.callee._id) === String(user._id)) {
          setCall({ phase: 'incoming', callId: info._id, peer: info.caller, callType: info.callType });
        }
      } catch {
        // call already gone
      }
    };
    Notifications.getLastNotificationResponseAsync()
      .then((r) => openFromPush(r && r.notification && r.notification.request.content.data))
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      openFromPush(r.notification.request.content.data)
    );
    return () => sub.remove();
  }, [user]);

  const value = useMemo(
    () => ({
      call,
      elapsed,
      notice,
      media,
      muted,
      speaker,
      cameraOff,
      voiceAvailable,
      startCall,
      acceptCall,
      endCall,
      clearCall,
      toggleMute,
      toggleSpeaker,
      toggleCamera,
      switchCamera,
    }),
    [call, elapsed, notice, media, muted, speaker, cameraOff, voiceAvailable, startCall, acceptCall, endCall, clearCall, toggleMute, toggleSpeaker, toggleCamera, switchCamera]
  );

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  );
}

export const useCall = () => useContext(CallContext);
