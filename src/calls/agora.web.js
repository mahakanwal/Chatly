// Web par react-native-agora available nahi, isliye sab stubs.
// Exports asli agora.js jaise hi hain.

export function getAgora() {
  return null;
}

export function isVoiceAvailable() {
  return false;
}

export function getRtcSurfaceView() {
  return null;
}

export const AGORA_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID || '';

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