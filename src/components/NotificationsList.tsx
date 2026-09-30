// Shared realtime notification inbox (one component, thin route per role area).
// REMEDIATED Phase D (§29): tap marks read AND navigates to the referenced
// record/workflow via targetRoute; listener failures surface with retry.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, listenForNotifications, markNotificationRead } from '@/services/firebase-services';
import { getTheme } from '@/constants/theme';
import { LiveErrorBanner } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

export function NotificationsList({ fallback }: { fallback: string }) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const [items, setItems] = useState<any[]>([]);
  const uid = auth.currentUser?.uid || '';
  const [loading, setLoading] = useState(!!uid);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    setLoadError('');
    return listenForNotifications(uid, (list: any[]) => {
      setItems([...list].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setLoading(false);
    }, (e) => { setLoadError(e.message); setLoading(false); });
  }, [uid, retryKey]);

  const openNotification = async (n: any) => {
    if (!n.read) {
      try { await markNotificationRead(n.id); } catch { /* read-state best-effort */ }
    }
    if (typeof n.targetRoute === 'string' && n.targetRoute.startsWith('/(')) {
      router.push(n.targetRoute as any);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={theme.colors.primary} />;

  return (
    <View>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, fallback)}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Notifications ({items.filter((n) => !n.read).length} unread)</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      {items.length === 0 && <Text style={styles.muted}>No notifications yet. Workflow updates (approvals, allocations, rosters) appear here.</Text>}
      {items.map((n) => (
        <TouchableOpacity
          key={n.id}
          style={[styles.card, !n.read && styles.unread]}
          onPress={() => openNotification(n)}
          activeOpacity={0.7}
        >
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{n.title || n.type}</Text>
            {!!n.targetRoute && <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />}
          </View>
          <Text style={styles.muted}>{n.message}</Text>
          <Text style={styles.time}>{n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : ''}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  card: { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  unread: { borderLeftWidth: 4, borderLeftColor: theme.colors.primary },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: theme.colors.text, fontWeight: '600', flex: 1 },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  time: { color: theme.colors.textMuted, fontSize: 11, marginTop: 4 },
});