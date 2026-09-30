// (npo) UC38 — Collection Schedule: read-only view of claimed batches with
// scheduled pickup windows, loading bays and courier details.
// Layer 6 presentation rebuild; queries unchanged.
import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { auth } from '@/services/firebase-services';
import { useAuth } from '@/context/AuthContext';
import { listenNpoPartners, listenMyAllocations } from '@/services/increment2-services';
import type { DonationBatch, NpoPartner } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { LiveErrorBanner } from '@/components/detail-kit';

export default function NpoCollectionsScreen() {
  const theme = useAppTheme();
  const { profile } = useAuth();
  const email = (profile?.email || auth.currentUser?.email || '').toLowerCase();

  const [myNpo, setMyNpo] = useState<NpoPartner | null>(null);
  const [known, setKnown] = useState(false);
  const [items, setItems] = useState<DonationBatch[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!email) { setKnown(true); return; }
    setLoadError('');
    const onErr = (e: Error) => { setLoadError(e.message); setKnown(true); };
    return listenNpoPartners((list) => {
      setMyNpo(list.find((n) => n.verificationStatus === 'approved' && n.email.toLowerCase() === email) || null);
      setKnown(true);
    }, onErr);
  }, [email]);

  useEffect(() => {
    if (!myNpo) return;
    return listenMyAllocations(myNpo.npoId, setItems, (e) => setLoadError(e.message));
  }, [myNpo]);

  const scheduled = items.filter((b) => b.status === 'claimed_ready_for_scheduling' || b.status === 'collection_scheduled');
  const done = items.filter((b) => b.status === 'collected_completed');

  return (
    <Screen scroll>
      <PageHeader title="Collections" subtitle={myNpo?.organisationName || 'Pickup windows & loading bays'} showBack fallback="/(npo)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => setLoadError('')} />

      {!known ? (
        <ListSkeleton rows={3} />
      ) : !myNpo ? (
        loadError ? (
          <ErrorState title="Couldn't load collections" message="Collection data is unavailable right now." details={loadError} onRetry={() => setLoadError('')} />
        ) : (
          <EmptyState icon="hourglass-outline" title="Verification pending" message="No approved NPO is linked to this account yet." />
        )
      ) : (
        <>
          <SectionHeader title={`Upcoming (${scheduled.length})`} />
          {scheduled.length === 0 ? (
            <AppText variant="body" tone="muted">No collections scheduled yet.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {scheduled.map((b, i) => (
                <View key={b.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={`${b.batchId} — ${b.itemName}`}
                    subtitle={[
                      `${b.portionCount} portions · ${b.estimatedWeightKg}kg`,
                      `Pickup ${b.pickupWindowStart ? new Date(b.pickupWindowStart).toLocaleString() : 'TBC'} → ${b.pickupWindowEnd ? new Date(b.pickupWindowEnd).toLocaleString() : 'TBC'}`,
                      b.loadingBay ? `Loading bay: ${b.loadingBay}` : null,
                      b.courierName ? `Courier: ${b.courierName}` : null,
                      b.receivingFacility ? `Deliver to: ${b.receivingFacility}` : null,
                    ].filter(Boolean).join('\n')}
                    status={<StatusPill status={b.status} size="sm" />}
                  />
                </View>
              ))}
            </Card>
          )}

          <SectionHeader title={`Completed (${done.length})`} />
          {done.length === 0 ? (
            <AppText variant="body" tone="muted">Nothing collected yet.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {done.map((b, i) => (
                <View key={b.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={`${b.batchId} — ${b.itemName}`}
                    subtitle={`${b.portionCount} portions`}
                    status={<StatusPill status={b.status} size="sm" />}
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      )}
      <View style={{ height: theme.space['4xl'] }} />
    </Screen>
  );
}
