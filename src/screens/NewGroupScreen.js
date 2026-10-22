import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { colors, raised } from '../theme';
import { api, uploadFile } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';
import RoundButton from '../components/RoundButton';
import PrimaryButton from '../components/PrimaryButton';
import ActionSheet from '../components/ActionSheet';
import { captureFromCamera, pickFromLibrary } from '../utils/pickers';

/**
 * Create a group (pick members -> name + photo), or add members to an existing group
 * (route.params.groupId + existingIds).
 */
export default function NewGroupScreen({ route, navigation }) {
  const { groupId, existingIds = [] } = route.params || {};
  const addMode = Boolean(groupId);

  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]); // user objects
  const [step, setStep] = useState('select'); // select | details
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  // People you chat with + phone contacts that are on the app
  const loadPeople = useCallback(async () => {
    const map = new Map();
    try {
      const { conversations } = await api('/conversations');
      conversations
        .filter((c) => !c.isAI && !c.isGroup && c.peer && !c.peer.isDeleted && !c.peer.isBot)
        .forEach((c) => map.set(String(c.peer._id), c.peer));
    } catch {
      // continue with contacts
    }
    try {
      const perm = await Contacts.getPermissionsAsync();
      const granted = perm.status === 'granted' || (perm.canAskAgain && (await Contacts.requestPermissionsAsync()).status === 'granted');
      if (granted) {
        const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
        const phones = [];
        data.forEach((c) => (c.phoneNumbers || []).forEach((p) => p.number && phones.push(p.number)));
        if (phones.length) {
          const { users } = await api('/users/sync', { method: 'POST', body: { phones } });
          users.forEach((u) => map.set(String(u._id), u));
        }
      }
    } catch {
      // contacts are optional
    }
    const excluded = new Set(existingIds.map(String));
    setPeople([...map.values()].filter((u) => !excluded.has(String(u._id))).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((u) => (u.name || '').toLowerCase().includes(q) || (u.phone || '').includes(q.replace(/\s/g, '')));
  }, [people, query]);

  const isSelected = (u) => selected.some((s) => String(s._id) === String(u._id));
  const toggle = (u) =>
    setSelected((prev) => (prev.some((s) => String(s._id) === String(u._id)) ? prev.filter((s) => String(s._id) !== String(u._id)) : [...prev, u]));

  const addMembers = async () => {
    setSaving(true);
    try {
      await api(`/groups/${groupId}/members`, { method: 'POST', body: { userIds: selected.map((u) => u._id) } });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not add members', err.message);
      setSaving(false);
    }
  };

  const createGroup = async () => {
    if (!name.trim()) return Alert.alert('Group name needed', 'Give your group a name.');
    setSaving(true);
    try {
      let { conversation } = await api('/groups', {
        method: 'POST',
        body: { name: name.trim(), description: description.trim(), memberIds: selected.map((u) => u._id) },
      });
      if (photo) {
        try {
          ({ conversation } = await uploadFile(`/groups/${conversation._id}/avatar`, photo));
        } catch (err) {
          Alert.alert('Group created', `The photo could not be uploaded: ${err.message}`);
        }
      }
      navigation.popToTop();
      navigation.navigate('Chat', { conversationId: conversation._id, conversation });
    } catch (err) {
      Alert.alert('Could not create group', err.message);
      setSaving(false);
    }
  };

  const photoOptions = [
    { label: 'Take photo', icon: 'camera', onPress: async () => setPhoto((await captureFromCamera({ allowVideo: false, square: true })) || photo) },
    { label: 'Choose from gallery', icon: 'images', onPress: async () => setPhoto((await pickFromLibrary({ allowVideo: false, square: true })) || photo) },
  ];
  if (photo) photoOptions.push({ label: 'Remove photo', icon: 'trash', destructive: true, onPress: () => setPhoto(null) });

  // ---------- Step 2: group details ----------
  if (step === 'details') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="New group" onBack={() => setStep('select')} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            <View style={styles.detailsTop}>
              <Pressable onPress={() => setPhotoSheet(true)} accessibilityLabel="Group photo">
                {photo ? (
                  <Avatar uri={photo.uri} name={name} size={112} />
                ) : (
                  <View style={[styles.photoPlaceholder, raised]}>
                    <Ionicons name="camera" size={34} color={colors.accent} />
                  </View>
                )}
              </Pressable>
              <Text style={styles.photoHint}>{photo ? 'Tap to change photo' : 'Add group photo'}</Text>
            </View>

            <View style={[styles.card, raised]}>
              <Text style={styles.label}>Group name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Family, Office team"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                maxLength={60}
                autoFocus
              />
              <View style={styles.divider} />
              <Text style={styles.label}>Description (optional)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What is this group about?"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { maxHeight: 100 }]}
                maxLength={500}
                multiline
              />
            </View>

            <Text style={styles.section}>Members: {selected.length + 1}</Text>
            <View style={styles.memberWrap}>
              {selected.map((u) => (
                <View key={String(u._id)} style={styles.memberChip}>
                  <Avatar uri={u.avatar} name={u.name} size={52} />
                  <Text style={styles.memberName} numberOfLines={1}>
                    {(u.name || u.phone || '').split(' ')[0]}
                  </Text>
                </View>
              ))}
            </View>

            <PrimaryButton title="Create group" onPress={createGroup} loading={saving} disabled={!name.trim()} style={{ marginHorizontal: 16, marginTop: 18 }} />
          </ScrollView>
        </KeyboardAvoidingView>
        <ActionSheet visible={photoSheet} title="Group photo" options={photoOptions} onClose={() => setPhotoSheet(false)} />
      </SafeAreaView>
    );
  }

  // ---------- Step 1: choose people ----------
  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={addMode ? 'Add members' : 'New group'} onBack={() => navigation.goBack()} />
      <Text style={styles.subtitle}>{selected.length ? `${selected.length} selected` : addMode ? 'Choose people to add' : 'Choose group members'}</Text>

      {selected.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {selected.map((u) => (
            <Pressable key={String(u._id)} onPress={() => toggle(u)} style={styles.chip} accessibilityLabel={`Remove ${u.name}`}>
              <View>
                <Avatar uri={u.avatar} name={u.name} size={50} />
                <View style={styles.chipX}>
                  <Ionicons name="close" size={12} color="#FFFFFF" />
                </View>
              </View>
              <Text style={styles.chipName} numberOfLines={1}>
                {(u.name || u.phone || '').split(' ')[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={[styles.search, raised]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or number"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => String(u._id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 110 }}
          renderItem={({ item }) => {
            const on = isSelected(item);
            return (
              <Pressable
                onPress={() => toggle(item)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.03)' }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Avatar uri={item.avatar} name={item.name} size={50} />
                <View style={styles.rowBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name || item.phone}
                  </Text>
                  <Text style={styles.about} numberOfLines={1}>
                    {item.about || item.phone}
                  </Text>
                </View>
                <View style={[styles.check, on && styles.checkOn]}>{on ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}</View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {query
                ? 'No matching people.'
                : addMode
                ? 'Everyone you chat with is already in this group.'
                : 'Start a chat with someone first, or allow contacts access, to add them to a group.'}
            </Text>
          }
        />
      )}

      {selected.length ? (
        <View style={styles.fabWrap}>
          <RoundButton
            icon={addMode ? 'checkmark' : 'arrow-forward'}
            filled
            size={58}
            iconSize={26}
            disabled={saving}
            onPress={addMode ? addMembers : () => setStep('details')}
            accessibilityLabel={addMode ? 'Add members' : 'Next'}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  subtitle: { color: colors.textMuted, fontSize: 13, marginHorizontal: 20, marginTop: -6, marginBottom: 10 },
  chips: { flexGrow: 0, marginBottom: 10 },
  chip: { width: 64, alignItems: 'center', marginRight: 6 },
  chipX: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.raisedHigh,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipName: { color: colors.textSecondary, fontSize: 12, marginTop: 4, maxWidth: 60 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.input,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, marginLeft: 10, fontSize: 15, paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8 },
  rowBody: { flex: 1, marginLeft: 14, marginRight: 10 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  about: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 24, marginHorizontal: 32, lineHeight: 20 },
  fabWrap: { position: 'absolute', right: 22, bottom: 32 },
  detailsTop: { alignItems: 'center', paddingVertical: 18 },
  photoPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: { color: colors.textMuted, fontSize: 13, marginTop: 10 },
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
  section: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginHorizontal: 20, marginBottom: 10, marginTop: 4 },
  memberWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14 },
  memberChip: { width: 70, alignItems: 'center', marginBottom: 12 },
  memberName: { color: colors.textSecondary, fontSize: 12, marginTop: 4, maxWidth: 64 },
});
