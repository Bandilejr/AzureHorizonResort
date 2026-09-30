// (npo) Home — coordination/receiving portal. Verification status, active
// allocations, next collection, activity. NPO context always visible.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/services/firebase-services';
import { listenNpoPartners, listenMyAllocations } from '@/services/increment2-services';
import type { NpoPartner, DonationBatch } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { AppShell } from '@/components/ui/app-shell';
import { SectionHeader } from '@/components/ui/screen';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusPill } from '@/components/ui/status-pill';
import { Card } from '@/components/ui/surface';
import { AppText } from '@/components/ui/text';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';

function fmtWindow(start?: string, end?: string): string {
  if (!start) return 'Window TBC';
  const d = new Date(start);
  const day = d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  const t1 = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const t2 = end ? new Date(end).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '';
  return `${day} · ${t1}${t2 ? `–${t2}` : ''}`;
}

export default function NpoDashboardScreen() {
  const router = useRouter();
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
      setMyNpo(list.find((n) => n.email.toLowerCase() === email) || null);
      setKnown(true);
    }, onErr);
  }, [email]);

  useEffect(() => {
    if (!myNpo) return;
    return listenMyAllocations(myNpo.npoId, setItems, (e) => setLoadError(e.message));
  }, [myNpo?.npoId]);

  const awaiting = items.filter((b) => b.status === 'allocated_awaiting_claim').length;
  const scheduled = items.filter((b) => b.status === 'claimed_ready_for_scheduling' || b.status === 'collection_scheduled').length;
  const collected = items.filter((b) => b.status === 'collected_completed').length;
  const nextCollection =
    [...items]
      .filter((b) => b.pickupWindowStart && (b.status === 'collection_scheduled' || b.status === 'claimed_ready_for_scheduling'))
      .sort((a, b) => (a.pickupWindowStart || '').localeCompare(b.pickupWindowStart || ''))[0] || null;

  const showFullError = !!loadError && !myNpo && known;

  return (
    <AppShell
      context="NPO Representative · FixedFunding"
      title={myNpo ? myNpo.organisationName : 'My organisation'}
      subtitle={myNpo ? `${myNpo.serviceAreas?.slice(0, 2).join(', ') || 'Receiving partner'}` : 'Receiving partner'}
      onNotifications={() => router.push('/(npo)/notifications' as any)}
      onProfile={() => router.push('/(npo)/profile' as any)}
    >
      {showFullError ? (
        <ErrorState
          title="Couldn't load your organisation"
          message="Live allocation data is unavailable right now."
          details={loadError}
          onRetry={() => setLoadError('')}
        />
      ) : !known ? (
        <Skeleton width="100%" height={120} radius={theme.radius.lg} />
      ) : !myNpo ? (
        <Card style={{ gap: theme.space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <Ionicons name="hourglass-outline" size={theme.iconSize.md} color={theme.colors.warningStrong} />
            <StatusPill status="under_review" label="Verification pending" />
          </View>
          <AppText variant="subtitle">Verification not linked yet</AppText>
          <AppText variant="body" tone="secondary">
            No NPO record is linked to this account yet. Once an administrator verifies your
            organisation, your allocations and collections will appear here.
          </AppText>
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, marginBottom: theme.space.md }}>
            <StatusPill status={myNpo.verificationStatus} />
          </View>

          {nextCollection ? (
            <Card tone="primarySoft" bordered={false} style={{ gap: theme.space.xs }}>
              <AppText variant="micro" tone="muted" weight="700">NEXT COLLECTION</AppText>
              <AppText variant="subtitle">{fmtWindow(nextCollection.pickupWindowStart, nextCollection.pickupWindowEnd)}</AppText>
              <AppText variant="body" tone="secondary">
                {nextCollection.itemName} · {nextCollection.loadingBay || 'Bay TBC'}
              </AppText>
            </Card>
          ) : (
            <EmptyState
              icon="cube-outline"
              title="No collection scheduled"
              message="Once you claim an allocation, your pickup window will appear here."
              actionLabel="View allocations"
              onAction={() => router.push('/(npo)/allocations' as any)}
            />
          )}

          <SectionHeader title="Your activity" />
          <View style={{ flexDirection: 'row', gap: theme.space.md }}>
            <MetricCard value={awaiting} label="Awaiting claim" icon="gift-outline" tone={awaiting > 0 ? 'warning' : 'default'} onPress={() => router.push('/(npo)/allocations' as any)} />
            <MetricCard value={scheduled} label="Scheduled" icon="cube-outline" tone="info" onPress={() => router.push('/(npo)/collections' as any)} />
            <MetricCard value={collected} label="Collected" icon="checkmark-circle-outline" tone="success" onPress={() => router.push('/(npo)/collections' as any)} />
          </View>
        </>
      )}
    </AppShell>
  );
}
