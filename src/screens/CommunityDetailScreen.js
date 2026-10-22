import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';
import PrimaryButton from '../components/PrimaryButton';
import ActionSheet from '../components/ActionSheet';

/** One community: its groups, its members, and admin controls. */
export default function CommunityDetailScreen({ route, navigation }) {
  const { communityId } = route.params;
  const { user } = useAuth();
  const [community, setCommunity] = useState(route.params.community || null);
  const [members, setMembers] = useState([]);
  const [myGroups, setMyGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [memberSheet, setMemberSheet] = useState(null);

  const load = useCallback(async () => {
    try {
      const { community: com, members: mem } = await api(`/communities/${communityId}`);
      setCommunity(com);
      setMembers(mem || []);
      if (com.isAdmin) {
        const { conversations } = await api('/conversations');
        setMyGroups(conversations.filter((c) => c.isGroup && c.isAdmin));
      }
    } catch (err) {
      if (err.status === 404) navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [communityId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const run = async (fn, failTitle) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && res.community) setCommunity(res.community);
      if (res && res.deleted) navigation.navigate('Main');
      return res;
    } catch (err) {
      Alert.alert(failTitle, err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addGroup = (g) => run(() => api(`/communities/${communityId}/groups`, { method: 'POST', body: { groupId: g._id } }), 'Could not add group');
  const removeGroup = (g) =>
    Alert.alert(`Remove "${g.name}"?`, 'The group itself stays — it is only unlinked from this community.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(() => api(`/communities/${communityId}/groups/${g._id}`, { method: 'DELETE' }), 'Could not remove group') },
    ]);

  const admins = useMemo(() => new Set((community?.admins || []).map(String)), [community]);
  const memberOptions = useMemo(() => {
    const m = memberSheet;
    if (!m || !community?.isAdmin) return [];
    const opts = [];
    if (admins.has(String(m._id))) {
      opts.push({ label: 'Dismiss as admin', icon: 'shield-outline', onPress: () => run(() => api(`/communities/${communityId}/admins/${m._id}`, { method: 'DELETE' }), 'Could not update admin') });
    } else {
      opts.push({ label: 'Make community admin', icon: 'shield-checkmark', onPress: () => run(() => api(`/communities/${communityId}/admins/${m._id}`, { method: 'POST' }), 'Could not update admin') });
    }
    opts.push({
      label: `Remove ${m.name || 'member'}`,
      icon: 'person-remove',
      destructive: true,
      onPress: () =>
        Alert.alert(`Remove ${m.name || 'this member'}?`, 'They will also leave all groups in this community.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => run(() => api(`/communities/${communityId}/members/${m._id}`, { method: 'DELETE' }), 'Could not remove member') },
        ]),
    });
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberSheet, community, admins, communityId]);

  const availableGroups = myGroups.filter((g) => !(community?.groups || []).some((x) => String(x._id) === String(g._id)));

  if (!community) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Community" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Community" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.top}>
          {community.avatar ? (
            <Avatar uri={community.avatar} name={community.name} size={96} />
          ) : (
            <View style={[styles.iconBox, raised]}>
              <Ionicons name="people" size={40} color={colors.accent} />
            </View>
          )}
          <Text style={styles.name}>{community.name}</Text>
          <Text style={styles.sub}>
            {community.memberCount} member{community.memberCount === 1 ? '' : 's'} · {(community.groups || []).length} groups
            {community.isAdmin ? ' · You are an admin' : ''}
          </Text>
          {community.description ? <Text style={styles.desc}>{community.description}</Text> : null}
          {busy ? <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} /> : null}
        </View>

        <Text style={styles.note}>Joining adds you to all groups in this community. Leaving removes you from them.</Text>

        <View style={[styles.card, raised]}>
          <Text style={styles.cardLabel}>Groups</Text>
          {(community.groups || []).length ? (
            community.groups.map((g) => (
              <View key={String(g._id)} style={styles.groupRow}>
                <Avatar uri={g.avatar} name={g.name} isGroup size={46} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.groupName} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={styles.groupSub}>
                    {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
                  </Text>
                </View>
                {g.isMember ? (
                  <Pressable onPress={() => navigation.navigate('Chat', { conversationId: g._id })} style={styles.openBtn}>
                    <Text style={styles.openText}>Open</Text>
                  </Pressable>
                ) : community.isMember ? (
                  <Text style={styles.groupSub}>Member soon</Text>
                ) : null}
                {community.isAdmin ? (
                  <Pressable onPress={() => removeGroup(g)} hitSlop={8} style={{ marginLeft: 10 }} accessibilityLabel="Remove group from community">
                    <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={styles.cardText}>No groups linked yet.</Text>
          )}
        </View>

        {community.isAdmin && availableGroups.length ? (
          <View style={[styles.card, raised]}>
            <Text style={styles.cardLabel}>Add one of your groups</Text>
            <Text style={styles.cardHint}>Only groups you admin can be linked.</Text>
            {availableGroups.map((g) => (
              <Pressable key={String(g._id)} onPress={() => addGroup(g)} style={styles.groupRow} disabled={busy}>
                <Avatar uri={g.peer?.avatar} name={g.peer?.name} isGroup size={46} />
                <Text style={[styles.groupName, { flex: 1, marginLeft: 12 }]} numberOfLines={1}>
                  {g.peer?.name}
                </Text>
                <Ionicons name="add-circle" size={24} color={colors.accent} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={[styles.card, raised, { paddingHorizontal: 0, paddingBottom: 6 }]}>
          <Text style={[styles.cardLabel, { paddingHorizontal: 16 }]}>Members ({members.length})</Text>
          {members.map((m) => {
            const me = String(m._id) === String(user._id);
            return (
              <Pressable
                key={String(m._id)}
                onPress={() => !me && community.isAdmin && setMemberSheet(m)}
                disabled={me || !community.isAdmin}
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

        {community.isMember ? (
          <PrimaryButton
            title="Leave community"
            variant="danger"
            onPress={() =>
              Alert.alert(`Leave "${community.name}"?`, 'You will also leave all groups in this community.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Leave', style: 'destructive', onPress: () => run(() => api(`/communities/${communityId}/leave`, { method: 'POST' }), 'Could not leave') },
              ])
            }
            disabled={busy}
            style={{ marginHorizontal: 16, marginTop: 8 }}
          />
        ) : (
          <PrimaryButton title="Join community" onPress={() => run(() => api(`/communities/${communityId}/join`, { method: 'POST' }), 'Could not join')} disabled={busy} style={{ marginHorizontal: 16, marginTop: 8 }} />
        )}
        {community.isOwner ? (
          <PrimaryButton
            title="Delete community"
            variant="danger"
            onPress={() =>
              Alert.alert(`Delete "${community.name}"?`, 'Its groups stay — only the community is removed.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await api(`/communities/${communityId}`, { method: 'DELETE' });
                      navigation.navigate('Main');
                    } catch (err) {
                      Alert.alert('Could not delete', err.message);
                    }
                  },
                },
              ])
            }
            style={{ marginHorizontal: 16, marginTop: 12 }}
          />
        ) : null}
      </ScrollView>
      <ActionSheet visible={Boolean(memberSheet)} options={memberOptions} onClose={() => setMemberSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 24 },
  iconBox: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 21, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  sub: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  desc: { color: colors.textSecondary, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  note: { color: colors.textMuted, fontSize: 13, marginHorizontal: 20, marginBottom: 12, lineHeight: 18, textAlign: 'center' },
  card: { backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 14, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border },
  cardLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  cardText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  cardHint: { color: colors.textMuted, fontSize: 13, marginBottom: 6 },
  groupRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  groupName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  groupSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  openBtn: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  openText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  memberName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  memberAbout: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  adminTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: 'rgba(232,71,63,0.35)' },
  adminText: { color: colors.accent, fontSize: 11, fontWeight: '700' },
});
