import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '../context/AuthContext';

/** Shrinks Cloudinary wallpapers so chats open fast on mobile data. */
export function optimizeWallpaperUrl(url, width = 1080) {
  if (typeof url !== 'string' || !url.includes('/res.cloudinary.com/') || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/w_${width},c_limit,q_auto,f_auto/`);
}

/** Renders the user's chosen chat wallpaper behind the whole chat screen (nothing = default dark). */
export default function ChatBackground({ wallpaper }) {
  const { user } = useAuth();
  const value = wallpaper !== undefined ? wallpaper : user?.wallpaper || '';
  if (!value) return null;

  if (value.startsWith('color:')) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: value.slice(6) }]} />;
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={{ uri: optimizeWallpaperUrl(value) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
      {/* Slight dark tint so message text stays readable on bright photos */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
    </View>
  );
}
