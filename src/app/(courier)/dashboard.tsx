// (courier) UC38/39 — Courier & Collections home (Phase 1 §24).
// Collector-specific workflow: today's collections, upcoming, history,
// QR/collection pass scan, sync queue. No manager-only controls.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { listenDonationBatches } from '@/services/increment2-services';
import type { DonationBatch } from '@/types/increment2';
import { ROLE_AREA_META } from '@/utils/role-home';
import { todayISO } from '@/utils/dates';
import { getTheme } from '@/constants/theme';
import { LiveErrorBanner } from '@/components/detail-kit';
import { useRouter } from 'expo-router';

export default function CourierDashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const { profile, signOut } = useAuth();
  const [batches, setBatches] = useState<DonationBatch[]>([]);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    return listenDonationBatches(setBatches, undefined, onErr);
  }, [retryKey]);

  const today = todayISO();
  // Pickup date prefers the window start date (local, matches kitchen dashboard).
  const dateOf = (b: DonationBatch) => (b.pickupWindowStart || b.pickupDate || '').slice(0, 10);
  const scheduled = batches.filter((b) => b.status === 'collection_scheduled');
  const todays = scheduled.filter((b) => dateOf(b) === today);
  const upcoming = scheduled.filter((b) => dateOf(b) > today);
  const history = batches.filter((b) => b.status === 'collected_completed').slice(0, 5);

  const timeOf = (b: DonationBatch) => {
    const s = (b.pickupWindowStart || '').slice(11, 16);
    const e = (b.pickupWindowEnd || '').slice(11, 16);
    return s ? `${s}${e ? `–${e}` : ''}` : 'window TBC';
  };

  const collectionRow = (b: DonationBatch) => (
    <TouchableOpacity key={b.id} style={styles.card} onPress={() => router.push('/(kitchen)/logistics' as any)} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{b.itemName}</Text>
        <Text style={styles.muted}>{timeOf(b)} · {b.loadingBay || 'Bay TBC'} · NPO: {b.allocatedNpoId || 'TBC'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{ROLE_AREA_META.courier.title}</Text>
      <Text style={styles.sub}>Signed in as {profile?.displayName || profile?.email}</Text>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      <Text style={styles.groupTitle}>{`Today's Collections (${todays.length})`}</Text>
      {todays.length === 0 && <Text style={styles.muted}>No collections scheduled for today.</Text>}
      {todays.map(collectionRow)}

      <Text style={styles.groupTitle}>Upcoming ({upcoming.length})</Text>
      {upcoming.length === 0 && <Text style={styles.muted}>No upcoming collections.</Text>}
      {upcoming.slice(0, 5).map(collectionRow)}

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.action} onPress={() => router.push('/(kitchen)/donation-scan' as any)}>
          <Ionicons name="qr-code" size={22} color={theme.colors.primary} />
          <Text style={styles.actionText}>Scan / Collection Pass</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={() => router.push('/(staff)/sync-queue' as any)}>
          <Ionicons name="sync" size={22} color={theme.colors.primary} />
          <Text style={styles.actionText}>Sync Queue</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.groupTitle}>Recent History</Text>
      {history.length === 0 && <Text style={styles.muted}>No completed collections yet.</Text>}
      {history.map((b) => (
        <View key={b.id} style={styles.card}>
          <Text style={styles.cardTitle}>{b.itemName}</Text>
          <Text style={styles.muted}>{b.collectedAt ? `Collected ${new Date(b.collectedAt).toLocaleDateString('en-ZA')}` : 'Collected'} · {b.portionCount || 0} portions</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.signout} onPress={() => { signOut().then(() => router.replace('/login' as any)); }}>
        <Text style={styles.signoutText}>Sign out</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  sub: { color: theme.colors.textMuted, marginBottom: 12 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTitle: { color: theme.colors.text, fontWeight: '700' },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  action: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border },
  actionText: { color: theme.colors.text, fontWeight: '600', fontSize: 12, textAlign: 'center' },
  signout: { marginTop: 16, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.error },
  signoutText: { color: theme.colors.error, fontWeight: '700' },
});