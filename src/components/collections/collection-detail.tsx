// src/components/collections/collection-detail.tsx
// Shared full-screen Collection Detail, opened by thin per-role wrapper routes
// so each group's RouteGuard still applies. Structure from courier tracking
// references: header + status → key facts → who/where/when → status timeline →
// role-based primary action. Tokens + shared components only.
//
// No writes live here: the manager action routes to the existing logistics
// surface (same scheduleDonationCollectionMobile call and arguments as today).
import React, { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { auth } from '@/services/firebase-services';
import { useAuth } from '@/context/AuthContext';
import { listenDonationBatch, listenNpoPartners } from '@/services/increment2-services';
import type { DonationBatch, NpoPartner } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { DetailRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CollectionTimeline } from './collection-timeline';

export type CollectionRole = 'courier' | 'kitchen' | 'npo' | 'admin';

function fmtWindow(b: DonationBatch): string {
  if (!b.pickupWindowStart) return 'Not scheduled';
  const s = new Date(b.pickupWindowStart).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const e = b.pickupWindowEnd ? new Date(b.pickupWindowEnd).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '';
  return e ? `${s} → ${e}` : s;
}

export function CollectionDetailScreen({ batchDocId, role }: { batchDocId: string; role: CollectionRole }) {
  const router = useRouter();
  const theme = useAppTheme();
  const { profile } = useAuth();

  const [batch, setBatch] = useState<DonationBatch | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  // NPO only: resolve the caller's own approved NPO so it sees only its batches.
  const [myNpo, setMyNpo] = useState<NpoPartner | null>(null);
  const [npoKnown, setNpoKnown] = useState(role !== 'npo');

  useEffect(() => {
    if (role !== 'npo') return;
    const email = (profile?.email || auth.currentUser?.email || '').toLowerCase();
    if (!email) { setNpoKnown(true); return; }
    return listenNpoPartners((list) => {
      setMyNpo(list.find((n) => n.verificationStatus === 'approved' && n.email.toLowerCase() === email) || null);
      setNpoKnown(true);
    }, () => setNpoKnown(true));
  }, [role, profile?.email]);

  useEffect(() => {
    if (!batchDocId) { setLoaded(true); return; }
    setError(''); setLoaded(false);
    return listenDonationBatch(batchDocId, (b) => { setBatch(b); setLoaded(true); }, (e) => { setError(e.message); setLoaded(true); });
  }, [batchDocId, retryKey]);

  const backFallback =
    role === 'courier' ? '/(courier)/dashboard'
      : role === 'npo' ? '/(npo)/collections'
        : role === 'admin' ? '/(admin)/dashboard'
          : '/(kitchen)/logistics';

  const denied = role === 'npo' && npoKnown && (myNpo == null || (batch != null && batch.allocatedNpoId !== myNpo.npoId));

  return (
    <Screen scroll>
      <PageHeader
        title={batch ? batch.itemName : 'Collection'}
        subtitle={batch ? `${batch.batchId}${batch.receivingFacility ? ` · ${batch.receivingFacility}` : ''}` : undefined}
        showBack
        fallback={backFallback}
        right={batch ? <StatusPill status={batch.status} /> : undefined}
      />

      {error && !batch ? (
        <ErrorState title="Couldn't load collection" message="This collection is unavailable right now." details={error} onRetry={() => { setError(''); setRetryKey((k) => k + 1); }} />
      ) : !loaded ? (
        <ListSkeleton rows={3} />
      ) : !batch ? (
        <EmptyState icon="cube-outline" title="Collection not found" message="This batch no longer exists, or you don't have access." />
      ) : denied ? (
        <EmptyState icon="lock-closed-outline" title={myNpo == null ? 'Verification pending' : 'Not your collection'} message={myNpo == null ? 'No approved NPO is linked to this account yet.' : 'This batch is allocated to another NPO.'} />
      ) : (
        <>
          <SectionHeader title="Key facts" />
          <Card style={{ paddingVertical: theme.space.xs }}>
            <DetailRow label="Item" value={batch.itemName} />
            <DetailRow label="Portions" value={String(batch.portionCount)} />
            <DetailRow label="Weight" value={`${batch.estimatedWeightKg} kg`} />
            <DetailRow label="Category" value={batch.mealCategory} />
            <DetailRow label="Allergens" value={(batch.allergens || []).join(', ') || 'None recorded'} />
            <DetailRow label="Use by" value={batch.expiryAt ? new Date(batch.expiryAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'} />
          </Card>

          <SectionHeader title="Who, where & when" />
          <Card style={{ paddingVertical: theme.space.xs }}>
            <DetailRow label="Pickup window" value={fmtWindow(batch)} />
            <DetailRow label="Loading bay" value={batch.loadingBay || '—'} />
            <DetailRow label="Courier" value={batch.courierName || '—'} />
            <DetailRow label="Receiving facility" value={batch.receivingFacility || '—'} />
            <DetailRow label="Collection pass" value={batch.collectionQr ? (batch.qrConsumed ? 'Used' : 'Issued, unused') : 'Not issued'} />
          </Card>

          <SectionHeader title="Status timeline" />
          <Card>
            <CollectionTimeline batch={batch} />
          </Card>

          {batch.safetyPhotoUrl ? (
            <>
              <SectionHeader title="Safety photo" />
              <Image source={{ uri: batch.safetyPhotoUrl }} style={{ width: '100%', height: 180, borderRadius: theme.radius.md }} resizeMode="cover" />
            </>
          ) : null}

          {role === 'courier' ? (
            <Button label="Scan Collection Pass" icon="qr-code-outline" size="lg" onPress={() => router.push('/(courier)/scan' as any)} style={{ marginTop: theme.space['2xl'] }} />
          ) : role === 'kitchen' ? (
            <Button label={batch.collectionQr ? 'Reschedule pickup' : 'Schedule pickup'} icon="calendar-outline" size="lg" onPress={() => router.push('/(kitchen)/logistics' as any)} style={{ marginTop: theme.space['2xl'] }} />
          ) : (
            <AppText variant="caption" tone="muted" align="center" style={{ marginTop: theme.space['2xl'] }}>
              {role === 'npo' ? 'Read-only — the kitchen manages scheduling.' : 'Read-only.'}
            </AppText>
          )}
          <View style={{ height: theme.space['4xl'] }} />
        </>
      )}
    </Screen>
  );
}

export default CollectionDetailScreen;
