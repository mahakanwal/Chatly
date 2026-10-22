import React, { useState } from 'react';
import {
  Alert,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { colors, raised } from '../theme';
import { api, uploadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { APP_NAME } from '../config';
import Avatar from '../components/Avatar';
import PrimaryButton from '../components/PrimaryButton';
import ActionSheet from '../components/ActionSheet';
import { captureFromCamera, pickFromLibrary } from '../utils/pickers';

export default function SettingsScreen({ navigation }) {
  const { user, updateUser, logout } = useAuth();
  const [name, setName] = useState(user.name);
  const [about, setAbout] = useState(user.about);
  const [username, setUsername] = useState(user.username || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [busyKey, setBusyKey] = useState(null);

  const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
  const dirty =
    name.trim() !== user.name ||
    about.trim() !== user.about ||
    (cleanUsername !== '' && cleanUsername !== (user.username || '')) ||
    phone.trim() !== (user.phone || '');

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name required', 'Your name cannot be empty.');
    setSaving(true);
    try {
      const body = { name: name.trim(), about: about.trim() };
      if (cleanUsername && cleanUsername !== (user.username || '')) body.username = cleanUsername;
      if (phone.trim() !== (user.phone || '')) body.phone = phone.trim();
      const { user: me } = await api('/users/me', { method: 'PATCH', body });
      updateUser(me);
      setUsername(me.username || '');
      setPhone(me.phone || '');
    } catch (err) {
      Alert.alert('Could not save', err.message);
    } finally {
      setSaving(false);
    }
  };

  const changePhoto = async (fromCamera) => {
    const file = fromCamera ? await captureFromCamera({ allowVideo: false, square: true }) : await pickFromLibrary({ allowVideo: false, square: true });
    if (!file) return;
    setPhotoBusy(true);
    try {
      const { user: me } = await uploadFile('/users/me/avatar', file);
      updateUser(me);
    } catch (err) {
      Alert.alert('Could not update photo', err.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      const { user: me } = await api('/users/me/avatar', { method: 'DELETE' });
      updateUser(me);
    } catch (err) {
      Alert.alert('Could not remove photo', err.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  // Optimistic toggle: flips instantly, rolls back if the server refuses
  const toggleSetting = async (key, value) => {
    const previous = user;
    setBusyKey(key);
    updateUser({ ...user, [key]: value });
    try {
      const { user: me } = await api('/users/me', { method: 'PATCH', body: { [key]: value } });
      updateUser(me);
    } catch (err) {
      updateUser(previous);
      Alert.alert('Could not update setting', err.message);
    } finally {
      setBusyKey(null);
    }
  };

  const settingSwitch = (key, value) => (
    <Switch
      value={Boolean(value)}
      onValueChange={(v) => toggleSetting(key, v)}
      disabled={busyKey === key}
      trackColor={{ false: colors.raisedHigh, true: colors.accentSoft }}
      thumbColor={value ? colors.accent : colors.textMuted}
    />
  );

  const wallpaperLabel = !user.wallpaper ? 'Default' : user.wallpaper.startsWith('color:') ? 'Solid colour' : 'Photo';

const confirmLogout = async () => {
  if (Platform.OS === 'web') {
    try {
      const { default: Swal } = await import('sweetalert2');

      const result = await Swal.fire({
        title: 'Log out?',
        text: 'Are you sure you want to log out of Chatly?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, log out',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#6C5CE7',
        cancelButtonColor: '#64748B',
        reverseButtons: true,
        allowOutsideClick: false,
        customClass: {
          popup: 'chatly-logout-popup',
        },
      });

      if (!result.isConfirmed) return;

      await logout();
    } catch (error) {
      console.error('Logout failed:', error);

      try {
        const { default: Swal } = await import('sweetalert2');

        await Swal.fire({
          title: 'Logout failed',
          text: 'Something went wrong. Please try again.',
          icon: 'error',
          confirmButtonColor: '#6C5CE7',
        });
      } catch (alertError) {
        console.error('Unable to display logout error:', alertError);
      }
    }

    return;
  }

  // Android / iOS
  Alert.alert(
    'Log out',
    'Are you sure you want to log out of Chatly?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch (error) {
            console.error('Logout failed:', error);
            Alert.alert('Error', 'Unable to log out. Please try again.');
          }
        },
      },
    ]
  );
};

  const deleteAccount = () =>
    Alert.alert(
      'Delete your account?',
      'Your profile, photo and AI assistant chat will be permanently deleted and you will be logged out. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              await api('/users/me', { method: 'DELETE' });
              await logout();
            } catch (err) {
              Alert.alert('Could not delete account', err.message);
            }
          },
        },
      ]
    );

  const photoOptions = [
    { label: 'Take photo', icon: 'camera', onPress: () => changePhoto(true) },
    { label: 'Choose from gallery', icon: 'images', onPress: () => changePhoto(false) },
  ];
  if (user.avatar) photoOptions.push({ label: 'Remove photo', icon: 'trash', destructive: true, onPress: removePhoto });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Settings</Text>

          <View style={styles.profile}>
            <Pressable onPress={() => setSheet(true)} disabled={photoBusy} accessibilityLabel="Change profile photo">
              <Avatar uri={user.avatar} name={user.name} size={120} style={photoBusy && { opacity: 0.5 }} />
              <View style={[styles.cameraBadge, raised]}>
                <Ionicons name="camera" size={17} color="#FFFFFF" />
              </View>
            </Pressable>
            {user.username ? <Text style={styles.phone}>@{user.username}</Text> : null}
            {user.email ? <Text style={styles.email}>{user.email}</Text> : null}
          </View>

          <View style={[styles.card, raised]}>
            <Text style={styles.label}>Name</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} maxLength={50} placeholder="Your name" placeholderTextColor={colors.textMuted} />
            <View style={styles.divider} />
            <Text style={styles.label}>Username</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              style={styles.input}
              maxLength={21}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="username"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.divider} />
            <Text style={styles.label}>Phone number (optional)</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              style={styles.input}
              keyboardType="phone-pad"
              placeholder="+92 300 1234567"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldHint}>Not verified. Lets people find you by your number.</Text>
            <View style={styles.divider} />
            <Text style={styles.label}>About</Text>
            <TextInput
              value={about}
              onChangeText={setAbout}
              style={styles.input}
              maxLength={140}
              placeholder="Available"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {dirty ? <PrimaryButton title="Save changes" onPress={save} loading={saving} style={{ marginHorizontal: 16, marginBottom: 14 }} /> : null}

          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={[styles.card, raised]}>
            <View style={styles.infoRow}>
              <Ionicons name="eye-off-outline" size={22} color={colors.accent} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Hide last seen & online</Text>
                <Text style={styles.rowHint}>Others won't see when you are online or were last online.</Text>
              </View>
              {settingSwitch('hideLastSeen', user.hideLastSeen)}
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="checkmark-done-outline" size={22} color={colors.accent} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Read receipts</Text>
                <Text style={styles.rowHint}>When off, you won't send or receive blue ticks in personal chats. Groups always show them.</Text>
              </View>
              {settingSwitch('readReceipts', user.readReceipts !== false)}
            </View>
            <View style={styles.divider} />
            <Pressable style={styles.infoRow} onPress={() => navigation.navigate('BlockedContacts')} accessibilityRole="button">
              <Ionicons name="ban-outline" size={22} color={colors.accent} />
              <Text style={[styles.rowTitle, styles.rowBody]}>Blocked contacts</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={[styles.card, raised]}>
            <View style={styles.infoRow}>
              <Ionicons name="chatbubble-outline" size={22} color={colors.accent} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Message notifications</Text>
                <Text style={styles.rowHint}>Personal chats, when the app is closed.</Text>
              </View>
              {settingSwitch('notifyMessages', user.notifyMessages !== false)}
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="people-outline" size={22} color={colors.accent} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Group notifications</Text>
              </View>
              {settingSwitch('notifyGroups', user.notifyGroups !== false)}
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="aperture-outline" size={22} color={colors.accent} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Moment notifications</Text>
                <Text style={styles.rowHint}>Get notified when your contacts share a new moment.</Text>
              </View>
              {settingSwitch('notifyMoments', user.notifyMoments)}
            </View>
          </View>

          <Text style={styles.sectionTitle}>Chats</Text>
          <View style={[styles.card, raised]}>
            <Pressable style={styles.infoRow} onPress={() => navigation.navigate('Wallpaper')} accessibilityRole="button">
              <Ionicons name="image-outline" size={22} color={colors.accent} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Chat wallpaper</Text>
                <Text style={styles.rowHint}>{wallpaperLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={[styles.card, raised]}>
            <View style={styles.infoRow}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.accent} />
              <Text style={styles.infoText}>Your account is protected with email verification.</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
              <Text style={styles.infoText}>
                {APP_NAME} version {Constants.expoConfig?.version || '1.0.0'}
              </Text>
            </View>
          </View>

          <PrimaryButton title="Log out" variant="danger" onPress={confirmLogout} style={{ marginHorizontal: 16 }} />
          <Pressable onPress={deleteAccount} style={styles.deleteLink} accessibilityRole="button">
            <Text style={styles.deleteText}>Delete my account</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <ActionSheet visible={sheet} title="Profile photo" options={photoOptions} onClose={() => setSheet(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 30, fontWeight: '700', marginHorizontal: 18, marginTop: 10 },
  profile: { alignItems: 'center', paddingVertical: 22 },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: { color: colors.textSecondary, fontSize: 15, marginTop: 14 },
  email: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  fieldHint: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4 },
  input: { color: colors.text, fontSize: 16, paddingVertical: 8 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  sectionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginHorizontal: 20, marginBottom: 8, marginTop: 4 },
  rowTitle: { color: colors.text, fontSize: 16 },
  rowBody: { flex: 1, marginLeft: 12, marginRight: 8 },
  rowHint: { color: colors.textMuted, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  deleteLink: { alignSelf: 'center', marginTop: 22, padding: 8 },
  deleteText: { color: colors.textMuted, fontSize: 14, textDecorationLine: 'underline' },
  infoText: { flex: 1, color: colors.textSecondary, fontSize: 14, marginLeft: 12, lineHeight: 20 },
});