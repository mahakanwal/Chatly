import { Platform } from 'react-native';

export const colors = {
  bg: '#0F1418',
  chatBg: '#0B1014',
  surface: '#171C21',
  raised: '#1F262D',
  raisedHigh: '#2A333C',
  input: '#1A2027',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.10)',
  divider: 'rgba(255,255,255,0.07)',
  text: '#F4F6F8',
  textSecondary: '#B9BEC6',
  textMuted: '#8A919B',
  accent: '#E8473F',
  accentPressed: '#CE3A32',
  accentSoft: 'rgba(232,71,63,0.15)',
  onAccent: '#FFFFFF',
  onAccentMuted: 'rgba(255,255,255,0.80)',
  seen: '#53C7F0',
  seenOnAccent: '#A5E3FF',
  danger: '#FF5A52',
  success: '#3DD68C',
  overlay: 'rgba(0,0,0,0.6)',
};

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const font = {
  title: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: 0.2 },
  heading: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  tiny: { fontSize: 11, color: colors.textMuted },
};

/** Soft raised shadow used for the dark look. */
export const raised = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  android: { elevation: 8, shadowColor: '#000' },
  default: {},
});

export const raisedSoft = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  android: { elevation: 4, shadowColor: '#000' },
  default: {},
});
