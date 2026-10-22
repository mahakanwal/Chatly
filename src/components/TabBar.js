import React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, raised, raisedSoft } from '../theme';

/**
 * Bottom bar from the reference: raised round buttons.
 * Chats | Moments | Calls | Camera (capture and send) | AI Assistant | Settings
 */
export default function TabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index].name;

  const openCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8, videoMaxDuration: 120 });
    if (!result.canceled && result.assets?.length) {
      navigation.navigate('SendTo', { asset: result.assets[0] });
    }
  };

  const items = [
    { key: 'Chats', icon: 'chatbox', label: 'Chats', onPress: () => navigation.navigate('Chats') },
    { key: 'Moments', icon: 'aperture-outline', label: 'Moments', onPress: () => navigation.navigate('Moments') },
    { key: 'Calls', icon: 'call-outline', label: 'Calls', onPress: () => navigation.navigate('Calls') },
    { key: 'Camera', icon: 'camera-outline', label: 'Camera', onPress: openCamera },
    { key: 'AI', icon: 'sparkles-outline', label: 'AI Assistant', onPress: () => navigation.navigate('Chat', { ai: true }) },
    { key: 'Settings', icon: 'settings-outline', label: 'Settings', onPress: () => navigation.navigate('Settings') },
  ];

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.bar, raised]}>
        {items.map((item) => {
          const active = current === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.btn,
                active && styles.btnActive,
                pressed && !active && { backgroundColor: colors.raised },
              ]}
            >
              <Ionicons
                name={active && item.icon.endsWith('-outline') ? item.icon.replace('-outline', '') : item.icon}
                size={21}
                color={active ? '#FFFFFF' : colors.textMuted}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 36,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: colors.accent,
    ...raisedSoft,
  },
});
