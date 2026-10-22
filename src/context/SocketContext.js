import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { API_URL } from '../config';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);
const TYPING_TIMEOUT_MS = 7000;

export function SocketProvider({ children }) {
  const { token, status } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [presence, setPresenceState] = useState({}); // userId -> { online, lastSeen }
  const [typing, setTyping] = useState({}); // conversationId -> userId of the person typing (false when nobody)
  const typingTimers = useRef({});
  const activeConversationId = useRef(null);

  useEffect(() => {
    if (status !== 'signedIn' || !token) return undefined;

    const s = io(API_URL, {
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('presence', ({ userId, online, lastSeen, hidden }) => {
      setPresenceState((prev) => ({
        ...prev,
        [userId]: hidden
          ? { online: false, lastSeen: null, hidden: true } // contact turned off "last seen & online"
          : { online, lastSeen: lastSeen || prev[userId]?.lastSeen, hidden: false },
      }));
    });

    s.on('typing', ({ conversationId, userId, isTyping }) => {
      clearTimeout(typingTimers.current[conversationId]);
      if (isTyping) {
        typingTimers.current[conversationId] = setTimeout(() => {
          setTyping((prev) => ({ ...prev, [conversationId]: false }));
        }, TYPING_TIMEOUT_MS);
      }
      setTyping((prev) => ({ ...prev, [conversationId]: isTyping ? String(userId || true) : false }));
    });

    // A new message from someone always ends their "typing..."
    s.on('message:new', (msg) => {
      setTyping((prev) => (prev[msg.conversation] ? { ...prev, [msg.conversation]: false } : prev));
    });

    // Online only while the app is in the foreground (like WhatsApp)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (!s.connected) s.connect();
      } else if (state === 'background') {
        s.disconnect();
      }
    });

    return () => {
      sub.remove();
      s.removeAllListeners();
      s.disconnect();
      Object.values(typingTimers.current).forEach(clearTimeout);
      typingTimers.current = {};
      setSocket(null);
      setConnected(false);
      setTyping({});
    };
  }, [status, token]);

  /** Seeds presence from REST data so the header is right before any socket event. */
  const seedPresence = useCallback((user) => {
    if (!user || !user._id) return;
    if (user.isGroup) return;
    setPresenceState((prev) => ({ ...prev, [user._id]: { online: user.online, lastSeen: user.lastSeen, hidden: Boolean(user.lastSeenHidden) } }));
  }, []);

  const value = useMemo(
    () => ({ socket, connected, presence, typing, seedPresence, activeConversationId }),
    [socket, connected, presence, typing, seedPresence]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);

/** Subscribes to a socket event for the lifetime of the component. */
export function useSocketEvent(event, handler) {
  const { socket } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return undefined;
    const fn = (...args) => ref.current(...args);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}
