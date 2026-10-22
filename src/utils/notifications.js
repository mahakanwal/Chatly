import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';

const PUSH_TOKEN_KEY = 'push_token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Asks permission, gets the Expo push token and registers it with the API. */
export async function registerForPush() {
  try {
    if (!Device.isDevice) return null;

    // Skip quietly when FCM isn't configured (dev builds without google-services.json).
    // Push simply won't work until Firebase is set up; no need to spam the logs.
    if (Platform.OS === 'android' && !Constants.expoConfig?.android?.googleServicesFile) {
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
        lightColor: '#E8473F',
      });    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('Push notifications need an EAS projectId (run: eas init).');
      return null;
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/users/me/push-token', { method: 'POST', body: { token } });
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
    return token;
  } catch (err) {
    console.warn('Push registration failed:', err.message);
    return null;
  }
}

export async function unregisterPush() {
  try {
    const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (token) await api('/users/me/push-token', { method: 'DELETE', body: { token } });
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch {
    // ignore on logout
  }
}
