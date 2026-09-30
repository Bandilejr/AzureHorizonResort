// (courier) UC38/39 — Courier & Collections home (Phase 1 §24).
// Batch A: scoped listeners (single-equality + limit, no index) and rows open
// the shared Collection Detail. Logistics briefing: today's collections as a
// route, scan action, sync, recent history. No manager-only controls. No raw NPO ids.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { listenDonationBatchesByStatus } from '@/services/increment2-services';
import type { DonationBatch } from '@/types/increment2';
import { todayISO } from '@/utils/dates';
import { useAppTheme } from '@/design/use-app-theme';
import { AppShell } from '@/components/ui/app-shell';
import { SectionHeader } from '@/components/ui/screen';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { Card } from '@/components/ui/surface';
import { AppText } from '@/components/ui/text';

export default function CourierDashboardScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { profile } = useAuth();
  const [batches, setBatches] = useState<DonationBatch[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setLoadError(''); setLoaded(false);
    const onErr = (e: Error) => { setLoadError(e.message); setLoaded(true); };
    // Two scoped, no-index listeners (no composite index → nothing deployed).
    let scheduled: DonationBatch[] = [];
    let completed: DonationBatch[] = [];
    const emit = () => setBatches([...scheduled, ...completed]);
    const u1 = listenDonationBatchesByStatus('collection_scheduled', 50, (l) => { scheduled = l; setLoaded(true); emit(); }, onErr);
    const u2 = listenDonationBatchesByStatus('collected_completed', 20, (l) => { completed = l; emit(); }, onErr);
    return () => { u1(); u2(); };
  }, [retryKey]);

  const today = todayISO();
  const dateOf = (b: DonationBatch) => (b.pickupWindowStart || b.pickupDate || '').slice(0, 10);
  const scheduled = batches.filter((b) => b.status === 'collection_scheduled');
  const todays = scheduled.filter((b) => dateOf(b) === today);
  const upcoming = scheduled.filter((b) => dateOf(b) > today);
  const history = batches.filter((b) => b.status === 'collected_completed').slice(0, 5);

  const timeOf = (b: DonationBatch) => {
    const s = (b.pickupWindowStart || '').slice(11, 16);
    const e = (b.pickupWindowEnd || '').slice(11, 16);
    return s ? `${s}${e ? `–${e}` : ''}` : 'Window TBC';
  };
  const partnerOf = (b: DonationBatch) => b.receivingFacility || 'NPO partner';

  const openDetail = (b: DonationBatch) =>
    router.push({ pathname: '/(courier)/collection/[id]', params: { id: b.id } } as any);

  const collectionRow = (b: DonationBatch) => (
    <ListRow
      key={b.id}
      title={b.itemName}
      subtitle={`${timeOf(b)} · ${b.loadingBay || 'Bay TBC'} · ${partnerOf(b)}`}
      status={<StatusPill status={b.status} size="sm" />}
      onPress={() => openDetail(b)}
    />
  );

  const loading = !loaded;
  const showFullError = !!loadError && batches.length === 0;

  return (
    <AppShell
      context="Collector · FixedFunding"
      title="Today"
      subtitle={`${profile?.displayName ? profile.displayName + ' · ' : ''}${todays.length} collection${todays.length === 1 ? '' : 's'} scheduled`}
      onNotifications={() => router.push('/(courier)/notifications' as any)}
      onProfile={() => router.push('/(courier)/profile' as any)}
      onSync={() => router.push('/(courier)/sync' as any)}
    >
      {showFullError ? (
        <ErrorState
          title="Couldn't load collections"
          message="Live collections are unavailable right now."
          details={loadError}
          onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }}
        />
      ) : loading ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          <Button
            label="Scan Collection Pass"
            icon="qr-code-outline"
            size="lg"
            onPress={() => router.push('/(courier)/scan' as any)}
          />

          <SectionHeader title={`Today's collections (${todays.length})`} />
          {todays.length === 0 ? (
            <EmptyState
              icon="cube-outline"
              title="No collections today"
              message="Scheduled pickups will appear here with their time window and loading bay."
            />
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {todays.map((b, i) => (
                <View key={b.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  {collectionRow(b)}
                </View>
              ))}
            </Card>
          )}

          <SectionHeader title={`Upcoming (${upcoming.length})`} />
          {upcoming.length === 0 ? (
            <AppText variant="body" tone="muted">No upcoming collections.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {upcoming.slice(0, 5).map((b, i) => (
                <View key={b.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  {collectionRow(b)}
                </View>
              ))}
            </Card>
          )}

          <SectionHeader title="Recent history" />
          {history.length === 0 ? (
            <AppText variant="body" tone="muted">No completed collections yet.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {history.map((b, i) => (
                <View key={b.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={b.itemName}
                    subtitle={
                      b.collectedAt
                        ? `Collected ${new Date(b.collectedAt).toLocaleDateString('en-ZA')} · ${b.portionCount || 0} portions`
                        : `${b.portionCount || 0} portions`
                    }
                    leading={
                      <StatusPill status="collected_completed" size="sm" label="Collected" />
                    }
                    onPress={() => openDetail(b)}
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}
