import { NativeModules, TurboModuleRegistry } from 'react-native';

/**
 * Lazy access to react-native-agora.
 * The native module is NOT linked inside Expo Go, so everything here must be
 * loaded lazily and guarded — never import 'react-native-agora' at the top
 * level of a file that runs in Expo Go.
 */

let cached = null;
let checked = false;

/** True when the Agora native module is linked (dev build / store build). */
function nativeModulePresent() {
  // New Architecture (React Native 0.76+) registers Agora as a TurboModule,
  // old architecture as a classic NativeModule — check both.
  try {
    if (TurboModuleRegistry && typeof TurboModuleRegistry.get === 'function' && TurboModuleRegistry.get('AgoraRtcNg')) return true;
  } catch {
    // not available
  }
  return Boolean(NativeModules.AgoraRtcNg);
}

/** Returns the agora module, or null when the native side is unavailable (Expo Go). */
export function getAgora() {
  if (checked) return cached;
  checked = true;
  try {
    if (!nativeModulePresent()) return null;
    // eslint-disable-next-line global-require, import/no-unresolved
    cached = require('react-native-agora');
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

/** True only in a dev build / standalone build with the native module linked. */
export function isVoiceAvailable() {
  return getAgora() !== null;
}

/** RtcSurfaceView component, or null in Expo Go. */
export function getRtcSurfaceView() {
  const agora = getAgora();
  return agora ? agora.RtcSurfaceView : null;
}

/** App ID baked into the app. The server can also provide it (GET /calls/:id/token). */
export const AGORA_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID || '';

/** Human-readable reason for common Agora error codes (so a silent call never stays silent). */
export function describeAgoraError(code) {
  switch (Number(code)) {
    case 101:
      return 'Invalid Agora App ID. Check EXPO_PUBLIC_AGORA_APP_ID / AGORA_APP_ID.';
    case 109:
    case 110:
      return 'Agora rejected the call token. If your Agora project uses Secure mode, add AGORA_APP_CERTIFICATE to server/.env.';
    case 17:
      return 'Could not join the call channel. Please try again.';
    case 1501:
      return 'Camera permission is blocked. Allow it in phone Settings.';
    default:
      return '';
  }
}

/** Reason codes from onConnectionStateChanged that mean the call can never connect. */
export function describeConnectionReason(reason) {
  switch (Number(reason)) {
    case 6:
      return describeAgoraError(101);
    case 8:
    case 9:
      return describeAgoraError(110);
    case 10:
      return 'The call server rejected this device. Please try again.';
    default:
      return '';
  }
}
