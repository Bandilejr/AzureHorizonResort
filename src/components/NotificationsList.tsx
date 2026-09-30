// Shared realtime notification inbox (one component, thin route per role area).
// Layer 12: token-based rebuild; grouped Today / Earlier; each actionable item
// deep-links to the specific record via targetRoute. Listener failures surface
// with retry. No raw IDs.
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth, listenForNotifications, markNotificationRead } from '@/services/firebase-services';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { AppText } from '@/components/ui/text';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';

function toDate(n: any): Date | null {
  if (!n?.createdAt) return null;
  if (typeof n.createdAt.toDate === 'function') return n.createdAt.toDate();
  if (typeof n.createdAt.seconds === 'number') return new Date(n.createdAt.seconds * 1000);
  return null;
}

function iconFor(type: string): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'refund_update': return 'cash-outline';
    case 'inspection_update': return 'clipboard-outline';
    case 'damage_record': return 'warning-outline';
    case 'complaint_resolved': return 'checkmark-done-outline';
    case 'donation_allocated': return 'gift-outline';
    case 'donation_claimed': return 'bookmark-outline';
    case 'collection_scheduled': return 'calendar-outline';
    case 'collection_completed': return 'checkmark-circle-outline';
    case 'leave_submitted': return 'time-outline';
    case 'leave_approved': return 'checkmark-circle-outline';
    case 'leave_rejected': return 'close-circle-outline';
    case 'shift_swap_accepted': return 'swap-horizontal-outline';
    case 'shift_swap_rejected': return 'close-circle-outline';
    case 'shift_swap_approved': return 'checkmark-circle-outline';
    case 'roster_published': return 'megaphone-outline';
    case 'npo_approved': return 'business-outline';
    case 'npo_rejected': return 'close-circle-outline';
    default: return 'notifications-outline';
  }
}

function relativeTime(d: Date | null): string {
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

export function NotificationsList({ fallback }: { fallback: string }) {
  const router = useRouter();
  const theme = useAppTheme();
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
      try { await markNotificationRead(n.id); } catch { /* best-effort */ }
    }
    if (typeof n.targetRoute === 'string' && n.targetRoute.startsWith('/(')) {
      router.push(n.targetRoute as any);
    }
  };

  const now = new Date();
  const isToday = (d: Date | null) => !!d && d.toDateString() === now.toDateString();
  const today = items.filter((n) => isToday(toDate(n)));
  const earlier = items.filter((n) => !isToday(toDate(n)));

  const renderItem = (n: any, i: number, arr: any[]) => {
    const d = toDate(n);
    const actionable = typeof n.targetRoute === 'string' && n.targetRoute.startsWith('/(');
    return (
      <TouchableOpacity
        key={n.id}
        onPress={() => openNotification(n)}
        activeOpacity={0.7}
        accessibilityRole="button"
        style={[
          { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.md, paddingVertical: theme.space.md },
          i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : null,
        ]}
      >
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: n.read ? theme.colors.surfaceVariant : theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={iconFor(n.type)} size={theme.iconSize.sm} color={n.read ? theme.colors.textMuted : theme.colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <AppText variant={n.read ? 'body' : 'bodyStrong'} numberOfLines={1} style={{ flex: 1 }}>
              {n.title || n.type}
            </AppText>
            {!n.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary }} /> : null}
          </View>
          <AppText variant="caption" tone="secondary" numberOfLines={2}>{n.message}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <AppText variant="micro" tone="muted">{relativeTime(d)}</AppText>
            {actionable ? <AppText variant="micro" tone="primary" weight="600">· Tap to open</AppText> : null}
          </View>
        </View>
        {actionable ? <Ionicons name="chevron-forward" size={theme.iconSize.sm} color={theme.colors.textMuted} /> : null}
      </TouchableOpacity>
    );
  };

  const unread = items.filter((n) => !n.read).length;

  return (
    <Screen scroll>
      <PageHeader title="Notifications" subtitle={unread > 0 ? `${unread} unread` : 'You are all caught up'} showBack fallback={fallback} />

      {loading ? (
        <ListSkeleton rows={4} />
      ) : loadError ? (
        <ErrorState title="Couldn't load notifications" message="Live updates are unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications-off-outline" title="No notifications yet" message="Workflow updates (approvals, allocations, rosters) appear here." />
      ) : (
        <>
          {today.length > 0 ? (
            <>
              <AppText variant="micro" tone="muted" weight="700" style={{ letterSpacing: 0.6, marginTop: theme.space.md, marginBottom: theme.space.xs }}>TODAY</AppText>
              <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
                {today.map(renderItem)}
              </Card>
            </>
          ) : null}
          {earlier.length > 0 ? (
            <>
              <AppText variant="micro" tone="muted" weight="700" style={{ letterSpacing: 0.6, marginTop: theme.space['2xl'], marginBottom: theme.space.xs }}>EARLIER</AppText>
              <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
                {earlier.map(renderItem)}
              </Card>
            </>
          ) : null}
        </>
      )}
      <View style={{ height: theme.space['4xl'] }} />
    </Screen>
  );
}
