import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api, setAuthToken, setUnauthorizedHandler } from '../api/client';
import { registerForPush, unregisterPush } from '../utils/notifications';

const TOKEN_KEY = 'auth_token';
const isWeb = Platform.OS === 'web';

/** Phone: encrypted SecureStore. Browser: localStorage (SecureStore does not work on web). */
const tokenStore = {
  async get() {
    if (!isWeb) return SecureStore.getItemAsync(TOKEN_KEY);
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(value) {
    if (!isWeb) return SecureStore.setItemAsync(TOKEN_KEY, value);
    try {
      window.localStorage.setItem(TOKEN_KEY, value);
    } catch {
      // storage blocked (private mode) - session lasts until the tab closes
    }
    return undefined;
  },
  async remove() {
    if (!isWeb) return SecureStore.deleteItemAsync(TOKEN_KEY);
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    return undefined;
  },
};
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // loading | signedOut | needsProfile | signedIn
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  const clearSession = useCallback(async () => {
    await tokenStore.remove();
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });
  }, [clearSession]);

  // Restore session on launch (status "offline" shows a retry screen)
  const bootstrap = useCallback(async () => {
    setStatus('loading');
    const saved = await tokenStore.get();
    if (!saved) return setStatus('signedOut');
    setAuthToken(saved);
    try {
      const { user: me } = await api('/users/me');
      setToken(saved);
      setUser(me);
      setStatus(me.name ? 'signedIn' : 'needsProfile');
    } catch (err) {
      if (err.status === 401) await clearSession();
      else setStatus('offline');
    }
  }, [clearSession]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // Push notifications only on phones
    if (status === 'signedIn' && !isWeb) registerForPush();
  }, [status]);

  const login = useCallback(async (newToken, me) => {
    await tokenStore.set(newToken);
    setAuthToken(newToken);
    setToken(newToken);
    setUser(me);
    setStatus(me.name ? 'signedIn' : 'needsProfile');
  }, []);

  const updateUser = useCallback((me) => {
    setUser(me);
    if (me.name) setStatus('signedIn');
  }, []);

  const logout = useCallback(async () => {
    if (!isWeb) await unregisterPush().catch(() => {});
    await clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({ status, user, token, login, logout, updateUser, retry: bootstrap }),
    [status, user, token, login, logout, updateUser, bootstrap]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);