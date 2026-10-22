// Set EXPO_PUBLIC_API_URL in app/.env (local) and in eas.json (store builds).
// Example: https://chatly-api.onrender.com  (no trailing slash)
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.10:5000').replace(/\/+$/, '');

export const APP_NAME = 'Chatly';

export const DEFAULT_COUNTRY_CODE = '+92';
