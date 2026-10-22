import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, raised } from '../theme';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import Avatar from '../components/Avatar';

export default function BlockedContactsScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const { users: list } = await api('/users/blocked');
      setUsers(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unblock = (u) =>
    Alert.alert(`Unblock ${u.name || u.phone}?`, 'They will be able to message and call you again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          setBusyId(u._id);
          try {
            await api(`/users/${u._id}/block`, { method: 'DELETE' });
            setUsers((prev) => prev.filter((x) => x._id !== u._id));
          } catch (err) {
            Alert.alert('Could not unblock', err.message);
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Blocked contacts" onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Could not load</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable onPress={load} style={{ marginTop: 14 }} hitSlop={8}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, raised]}>
            <Ionicons name="ban-outline" size={30} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>No blocked contacts</Text>
          <Text style={styles.emptyText}>People you block from a chat will show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u._id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar uri={item.avatar} name={item.name} size={52} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name || item.phone}
                </Text>
                {item.phone ? (
                  <Text style={styles.phone} numberOfLines={1}>
                    {item.phone}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => unblock(item)} disabled={busyId === item._id} style={[styles.btn, busyId === item._id && { opacity: 0.5 }]} hitSlop={6}>
                <Text style={styles.btnText}>Unblock</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  phone: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.accentSoft },
  btnText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptyText: { color: colors.textMuted, fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  link: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
