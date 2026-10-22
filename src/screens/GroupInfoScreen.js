import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api, uploadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocketEvent } from '../context/SocketContext';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';
import PrimaryButton from '../components/PrimaryButton';
import ActionSheet from '../components/ActionSheet';
import { captureFromCamera, pickFromLibrary } from '../utils/pickers';
import { formatDayLabel } from '../utils/format';

const TILE = (Dimensions.get('window').width - 32 - 12) / 3;

export default function GroupInfoScreen({ route, navigation }) {
  const { conversationId } = route.params;
  const { user } = useAuth();
  const [conv, setConv] = useState(route.params.conversation || null);
  const [media, setMedia] = useState([]);
  const [busy, setBusy] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [memberSheet, setMemberSheet] = useState(null);
  const [edit, setEdit] = useState(null); // { field, value }

  const load = useCallback(async () => {
    try {
      const { conversation } = await api(`/conversations/${conversationId}`);
      setConv(conversation);
    } catch (err) {
      if (err.status === 404) navigation.navigate('Main');
    }
    api(`/conversations/${conversationId}/media`)
      .then(({ messages }) => setMedia(messages))
      .catch(() => {});
  }, [conversationId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useSocketEvent('group:updated', ({ conversationId: cid }) => {
    if (String(cid) === String(conversationId)) load();
  });
  useSocketEvent('group:removed', ({ conversationId: cid }) => {
    if (String(cid) === String(conversationId)) navigation.navigate('Main');
  });

  const isAdmin = Boolean(conv?.isAdmin);
  const admins = useMemo(() => new Set((conv?.group?.admins || []).map(String)), [conv]);
  const members = useMemo(() => {
    const list = [...(conv?.members || [])];
    // Me first, then admins, then by name
    return list.sort((a, b) => {
      const meA = String(a._id) === String(user._id);
      const meB = String(b._id) === String(user._id);
      if (meA !== meB) return meA ? -1 : 1;
      const adA = admins.has(String(a._id));
      const adB = admins.has(String(b._id));
      if (adA !== adB) return adA ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [conv, admins, user._id]);

  const run = async (fn, failTitle) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && res.conversation) setConv(res.conversation);
      return res;
    } catch (err) {
      Alert.alert(failTitle, err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async (fromCamera) => {
    const file = fromCamera ? await captureFromCamera({ allowVideo: false, square: true }) : await pickFromLibrary({ allowVideo: false, square: true });
    if (!file) return;
    run(() => uploadFile(`/groups/${conversationId}/avatar`, file), 'Could not update photo');
  };

  const photoOptions = [];
  if (conv?.group?.avatar) photoOptions.push({ label: 'View photo', icon: 'expand', onPress: () => navigation.navigate('MediaViewer', { type: 'image', url: conv.group.avatar }) });
  if (isAdmin) {
    photoOptions.push({ label: 'Take photo', icon: 'camera', onPress: () => changePhoto(true) });
    photoOptions.push({ label: 'Choose from gallery', icon: 'images', onPress: () => changePhoto(false) });
    if (conv?.group?.avatar) {
      photoOptions.push({
        label: 'Remove photo',
        icon: 'trash',
        destructive: true,
        onPress: () => run(() => api(`/groups/${conversationId}/avatar`, { method: 'DELETE' }), 'Could not remove photo'),
      });
    }
  }

  const saveEdit = async () => {
    if (!edit) return;
    const value = edit.value.trim();
    if (edit.field === 'name' && !value) return Alert.alert('Name required', 'The group name cannot be empty.');
    const res = await run(() => api(`/groups/${conversationId}`, { method: 'PATCH', body: { [edit.field]: value } }), 'Could not save');
    if (res) setEdit(null);
    return undefined;
  };

  const toggleOnlyAdmins = async (value) => {
    const res = await run(() => api(`/groups/${conversationId}`, { method: 'PATCH', body: { onlyAdminsCanSend: value } }), 'Could not save permission');
    if (!res) setConv((c) => (c ? { ...c, group: { ...c.group, onlyAdminsCanSend: !value } } : c));
  };

  const messageMember = async (m) => {
    try {
      const { conversation } = await api('/conversations', { method: 'POST', body: { userId: m._id } });
      navigation.navigate('Chat', { conversationId: conversation._id, conversation });
    } catch (err) {
      Alert.alert('Could not open chat', err.message);
    }
  };

  const memberOptions = useMemo(() => {
    const m = memberSheet;
    if (!m) return [];
    const opts = [{ label: `Message ${m.name || m.phone}`, icon: 'chatbubble', onPress: () => messageMember(m) }];
    if (isAdmin) {
      if (admins.has(String(m._id))) {
        opts.push({
          label: 'Dismiss as admin',
          icon: 'shield-outline',
          onPress: () => run(() => api(`/groups/${conversationId}/admins/${m._id}`, { method: 'DELETE' }), 'Could not update admin'),
        });
      } else {
        opts.push({
          label: 'Make group admin',
          icon: 'shield-checkmark',
          onPress: () => run(() => api(`/groups/${conversationId}/admins/${m._id}`, { method: 'POST' }), 'Could not update admin'),
        });
      }
      opts.push({
        label: `Remove ${m.name || 'member'}`,
        icon: 'person-remove',
        destructive: true,
        onPress: () =>
          Alert.alert(`Remove ${m.name || 'this member'}?`, 'They will no longer get messages from this group.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () => run(() => api(`/groups/${conversationId}/members/${m._id}`, { method: 'DELETE' }), 'Could not remove member'),
            },
          ]),
      });
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberSheet, isAdmin, admins, conversationId]);

  const clearChat = () =>
    Alert.alert('Clear this chat?', 'Messages will be removed from this device only. Other members will still see them.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear chat',
        style: 'destructive',
        onPress: async () => {
          const res = await run(() => api(`/conversations/${conversationId}/messages`, { method: 'DELETE' }), 'Could not clear chat');
          if (res) navigation.goBack();
        },
      },
    ]);

  const exitGroup = () =>
    Alert.alert(`Exit "${conv?.group?.name}"?`, 'You will stop getting messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Exit group',
        style: 'destructive',
        onPress: async () => {
          const res = await run(() => api(`/groups/${conversationId}/members/${user._id}`, { method: 'DELETE' }), 'Could not exit group');
          if (res) navigation.navigate('Main');
        },
      },
    ]);

  if (!conv) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Group info" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const group = conv.group || {};

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Group info" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.top}>
          <Pressable onPress={() => photoOptions.length && setPhotoSheet(true)} disabled={busy} accessibilityLabel="Group photo">
            {group.avatar ? (
              <Avatar uri={group.avatar} name={group.name} size={132} />
            ) : (
              <View style={[styles.groupAvatar, raised]}>
                <Ionicons name="people" size={56} color={colors.accent} />
              </View>
            )}
            {isAdmin ? (
              <View style={[styles.cameraBadge, raised]}>
                <Ionicons name="camera" size={17} color="#FFFFFF" />
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={() => isAdmin && setEdit({ field: 'name', value: group.name || '' })} disabled={!isAdmin} style={styles.nameRow}>
            <Text style={styles.name}>{group.name}</Text>
            {isAdmin ? <Ionicons name="pencil" size={16} color={colors.textMuted} style={{ marginLeft: 8 }} /> : null}
          </Pressable>
          <Text style={styles.sub}>
            Group · {members.length} member{members.length === 1 ? '' : 's'}
          </Text>
          {group.onlyAdminsCanSend ? <Text style={[styles.sub, { marginTop: 2 }]}>Only admins can send messages</Text> : null}
          {busy ? <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} /> : null}
        </View>

        <Pressable
          onPress={() => isAdmin && setEdit({ field: 'description', value: group.description || '' })}
          disabled={!isAdmin}
          style={[styles.card, raised]}
        >
          <View style={styles.cardHead}>
            <Text style={styles.cardLabel}>Description</Text>
            {isAdmin ? <Ionicons name="pencil" size={14} color={colors.textMuted} /> : null}
          </View>
          <Text style={[styles.cardText, !group.description && { color: colors.textMuted }]}>
            {group.description || (isAdmin ? 'Add a group description' : 'No description')}
          </Text>
          {group.createdAt ? <Text style={styles.created}>Created {formatDayLabel(group.createdAt)}</Text> : null}
        </Pressable>

        <View style={[styles.card, raised]}>
          <Text style={styles.cardLabel}>Group permissions</Text>
          {isAdmin ? (
            <View style={styles.permRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.cardText}>Only admins can send messages</Text>
                <Text style={styles.permHint}>When on, other members can read but cannot send messages.</Text>
              </View>
              <Switch value={Boolean(group.onlyAdminsCanSend)} onValueChange={toggleOnlyAdmins} disabled={busy} />
            </View>
          ) : (
            <Text style={styles.cardText}>
              {group.onlyAdminsCanSend ? 'Only admins can send messages in this group.' : 'All members can send messages in this group.'}
            </Text>
          )}
          {!isAdmin ? (
            <Text style={[styles.permHint, { marginTop: 6 }]}>Only group admins can change this.</Text>
          ) : null}
        </View>

        <View style={[styles.card, raised]}>
          <Text style={styles.cardLabel}>Media ({media.length})</Text>
          {media.length ? (
            <View style={styles.grid}>
              {media.map((m) => (
                <Pressable key={m._id} onPress={() => navigation.navigate('MediaViewer', { type: m.type, url: m.media?.url })} style={styles.tile}>
                  <Image
                    source={{ uri: m.type === 'video' ? m.media?.thumbnail : m.media?.url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  {m.type === 'video' ? (
                    <View style={styles.tileIcon}>
                      <Ionicons name="play" size={16} color="#FFFFFF" />
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.cardText}>No photos or videos shared yet.</Text>
          )}
        </View>

        <View style={[styles.card, raised, { paddingHorizontal: 0, paddingBottom: 6 }]}>
          <Text style={[styles.cardLabel, { paddingHorizontal: 16 }]}>
            {members.length} member{members.length === 1 ? '' : 's'}
          </Text>
          {isAdmin ? (
            <Pressable
              onPress={() => navigation.navigate('NewGroup', { groupId: conversationId, existingIds: members.map((m) => m._id) })}
              style={({ pressed }) => [styles.memberRow, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}
              accessibilityRole="button"
            >
              <View style={styles.addIcon}>
                <Ionicons name="person-add" size={20} color="#FFFFFF" />
              </View>
              <Text style={[styles.memberName, { marginLeft: 12, color: colors.accent }]}>Add members</Text>
            </Pressable>
          ) : null}
          {members.map((m) => {
            const me = String(m._id) === String(user._id);
            return (
              <Pressable
                key={String(m._id)}
                onPress={() => !me && setMemberSheet(m)}
                disabled={me}
                style={({ pressed }) => [styles.memberRow, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}
              >
                <Avatar uri={m.avatar} name={m.name} size={46} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {me ? 'You' : m.name || m.phone}
                  </Text>
                  <Text style={styles.memberAbout} numberOfLines={1}>
                    {m.about || m.phone}
                  </Text>
                </View>
                {admins.has(String(m._id)) ? (
                  <View style={styles.adminTag}>
                    <Text style={styles.adminText}>Admin</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <PrimaryButton title="Clear chat" variant="danger" onPress={clearChat} disabled={busy} style={{ marginHorizontal: 16, marginTop: 8 }} />
        <PrimaryButton title="Exit group" variant="danger" onPress={exitGroup} disabled={busy} style={{ marginHorizontal: 16, marginTop: 12 }} />
      </ScrollView>

      <ActionSheet visible={photoSheet} title="Group photo" options={photoOptions} onClose={() => setPhotoSheet(false)} />
      <ActionSheet visible={Boolean(memberSheet)} options={memberOptions} onClose={() => setMemberSheet(null)} />

      {/* Edit name / description */}
      <Modal visible={Boolean(edit)} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalBackdrop}>
          <View style={[styles.modalCard, raised]}>
            <Text style={styles.modalTitle}>{edit?.field === 'name' ? 'Group name' : 'Group description'}</Text>
            <TextInput
              value={edit?.value || ''}
              onChangeText={(v) => setEdit((e) => ({ ...e, value: v }))}
              style={[styles.modalInput, edit?.field === 'description' && { minHeight: 90, textAlignVertical: 'top' }]}
              maxLength={edit?.field === 'name' ? 60 : 500}
              multiline={edit?.field === 'description'}
              autoFocus
              placeholder={edit?.field === 'name' ? 'Group name' : 'What is this group about?'}
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setEdit(null)} style={styles.modalBtn} hitSlop={6}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveEdit} style={styles.modalBtn} disabled={busy} hitSlop={6}>
                {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.modalSave}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { alignItems: 'center', paddingVertical: 16 },
  groupAvatar: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 24 },
  name: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  sub: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  permRow: { flexDirection: 'row', alignItems: 'center' },
  permHint: { color: colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  cardText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  created: { color: colors.textMuted, fontSize: 12, marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 },
  tile: { width: TILE - 8, height: TILE - 8, margin: 2, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.input },
  tileIcon: { position: 'absolute', right: 4, bottom: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 2 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  addIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  memberName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  memberAbout: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  adminTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: 'rgba(232,71,63,0.35)' },
  adminText: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  modalInput: {
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.input,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  modalBtn: { paddingHorizontal: 14, paddingVertical: 8, marginLeft: 8, minWidth: 60, alignItems: 'center' },
  modalCancel: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  modalSave: { color: colors.accent, fontSize: 15, fontWeight: '700' },
});
