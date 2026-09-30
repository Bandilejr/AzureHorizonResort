// (staff) Sync Queue — offline operation visibility (remediation Phase E, §34).
// Pending (queued/sending/retrying) + failed dead-letter queue with manual
// retry/discard. Nothing disappears silently.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOfflineQueue, QueueItem, FailedItem } from '@/services/offline-queue';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { SectionTitle, StatusBadge } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

function age(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export default function SyncQueueScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const { queue, failed, isOnline, retryFailed, discardFailed, removeItem } = useOfflineQueue();
  const [alertConfig, setAlertConfig] = React.useState<AlertConfig>({ visible: false, title: '', message: '' });

  const act = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); }
    catch (e: any) {
      setAlertConfig({ visible: true, title: `${label} failed`, message: e?.message || 'Could not complete.', type: 'error' });
    }
  };

  const renderPending = (q: QueueItem) => (
    <View key={q.id} style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{q.type.replace(/_/g, ' ')}</Text>
        <StatusBadge status={q.status} />
      </View>
      <Text style={styles.muted}>Queued {age(q.timestamp)}{q.retries > 0 ? ` · attempt ${q.retries + 1}` : ''}</Text>
      {!!q.lastError && <Text style={styles.warn}>Last error: {q.lastError}</Text>}
      {!!q.nextAttemptAt && q.nextAttemptAt > Date.now() && (
        <Text style={styles.muted}>Retrying in {Math.max(1, Math.round((q.nextAttemptAt - Date.now()) / 1000))}s</Text>
      )}
      <TouchableOpacity style={styles.link} onPress={() => act('Discard', () => removeItem(q.id))}>
        <Text style={styles.linkText}>Discard</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFailed = (f: FailedItem) => (
    <View key={f.item.id} style={[styles.card, styles.failedCard]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{f.item.type.replace(/_/g, ' ')}</Text>
        <StatusBadge status="failed" />
      </View>
      <Text style={styles.muted}>Failed {age(f.failedAt)} after {f.item.retries} attempt(s)</Text>
      <Text style={styles.warn}>{f.error}</Text>
      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.small, styles.ok]} onPress={() => act('Retry', () => retryFailed(f.item.id))}>
          <Text style={styles.buttonText}>Retry now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.small, styles.danger]} onPress={() => act('Discard', () => discardFailed(f.item.id))}>
          <Text style={styles.buttonText}>Discard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(staff)/staff-dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Sync Queue</Text>
        <View style={[styles.net, { borderColor: isOnline ? '#16a34a' : '#d97706' }]}>
          <Text style={{ color: isOnline ? '#16a34a' : '#d97706', fontSize: 11, fontWeight: '700' }}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </Text>
        </View>
      </View>
      {!isOnline && (
        <Text style={styles.muted}>Offline — actions queue locally and replay automatically on reconnect.</Text>
      )}
      <SectionTitle>PENDING ({queue.length})</SectionTitle>
      {queue.length === 0 && <Text style={styles.muted}>Nothing queued. Offline scans and punches appear here.</Text>}
      {queue.map(renderPending)}
      <SectionTitle>NEEDS ATTENTION ({failed.length})</SectionTitle>
      {failed.length === 0 && <Text style={styles.muted}>No failed operations.</Text>}
      {failed.map(renderFailed)}
      <View style={{ height: 40 }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, flex: 1 },
  net: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  failedCard: { borderColor: theme.colors.error },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: theme.colors.text, fontWeight: '700', flex: 1 },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  warn: { color: '#92400e', fontSize: 12, marginTop: 4 },
  link: { marginTop: 8 },
  linkText: { color: theme.colors.error, fontSize: 12, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  small: { padding: 10, borderRadius: 8, flex: 1, alignItems: 'center' },
  ok: { backgroundColor: '#16a34a' },
  danger: { backgroundColor: '#dc2626' },
  buttonText: { color: '#fff', fontWeight: '700' },
});