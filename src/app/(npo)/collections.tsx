// (npo) UC38 — Collection Schedule: read-only view of claimed batches with
// scheduled pickup windows, loading bays and courier details.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '@/services/firebase-services';
import { useAuth } from '@/context/AuthContext';
import { listenNpoPartners, listenMyAllocations } from '@/services/increment2-services';
import type { DonationBatch, NpoPartner } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { formatStatus } from '@/utils/status-labels';
import { LiveErrorBanner } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

export default function NpoCollectionsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const { profile } = useAuth();
  const email = (profile?.email || auth.currentUser?.email || '').toLowerCase();

  const [myNpo, setMyNpo] = useState<NpoPartner | null>(null);
  const [known, setKnown] = useState(false);
  const [items, setItems] = useState<DonationBatch[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!email) { setKnown(true); return; }
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    return listenNpoPartners((list) => {
      setMyNpo(list.find((n) => n.verificationStatus === 'approved' && n.email.toLowerCase() === email) || null);
      setKnown(true);
    }, onErr);
  }, [email]);

  useEffect(() => {
    if (!myNpo) return;
    return listenMyAllocations(myNpo.npoId, setItems, (e) => setLoadError(e.message));
  }, [myNpo]);

  if (!known) return <ActivityIndicator size="large" color={theme.colors.primary} />;

  const scheduled = items.filter((b) => b.status === 'claimed_ready_for_scheduling' || b.status === 'collection_scheduled');
  const done = items.filter((b) => b.status === 'collected_completed');

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(npo)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Collection Schedule</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => setLoadError('')} />
      {!myNpo && <Text style={styles.muted}>No approved NPO is linked to {email || 'this account'} yet.</Text>}
      {myNpo && <Text style={styles.org}>{myNpo.organisationName}</Text>}

      <Text style={styles.section}>Upcoming ({scheduled.length})</Text>
      {scheduled.length === 0 && <Text style={styles.muted}>No collections scheduled yet.</Text>}
      {scheduled.map((b) => (
        <View key={b.id} style={styles.card}>
          <Text style={styles.cardTitle}>{b.batchId} — {b.itemName}</Text>
          <Text style={styles.muted}>{b.portionCount} portions · {b.estimatedWeightKg}kg · {formatStatus(b.status)}</Text>
          <Text style={styles.muted}>
            Pickup {b.pickupWindowStart ? new Date(b.pickupWindowStart).toLocaleString() : 'TBC'} → {b.pickupWindowEnd ? new Date(b.pickupWindowEnd).toLocaleString() : 'TBC'}
          </Text>
          {!!b.loadingBay && <Text style={styles.muted}>Loading bay: {b.loadingBay}</Text>}
          {!!b.courierName && <Text style={styles.muted}>Courier: {b.courierName}</Text>}
          {!!b.receivingFacility && <Text style={styles.muted}>Deliver to: {b.receivingFacility}</Text>}
        </View>
      ))}

      <Text style={styles.section}>Completed ({done.length})</Text>
      {done.length === 0 && <Text style={styles.muted}>Nothing collected yet.</Text>}
      {done.map((b) => (
        <View key={b.id} style={styles.card}>
          <Text style={styles.cardTitle}>{b.batchId} — {b.itemName}</Text>
          <Text style={styles.muted}>{b.portionCount} portions · {formatStatus(b.status)}</Text>
        </View>
      ))}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  org: { fontSize: 14, fontWeight: '600', color: theme.colors.primary, marginBottom: 4 },
  section: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTitle: { color: theme.colors.text, fontWeight: '600' },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
});