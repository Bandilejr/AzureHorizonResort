// Kitchen Operations — role home.
// Kitchen Manager: command center (attention + tappable metric rail + today).
// Chef: food-focused home (intake, safety, expiry, rescue activity). Chef must
// NOT inherit manager controls.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';
import {
  listenDonationBatches,
  listenLeaveQueue,
  listenAttendanceExceptions,
  listenOpenShiftsBoard,
  listenPublishedRosters,
} from '@/services/increment2-services';
import type { DonationBatch } from '@/types/increment2';
import { todayISO, localDateTimeISO } from '@/utils/dates';
import { useAppTheme } from '@/design/use-app-theme';
import { AppShell } from '@/components/ui/app-shell';
import { SectionHeader } from '@/components/ui/screen';
import { MetricCard } from '@/components/ui/metric-card';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { Card } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/text';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';

interface AttentionItem {
  key: string;
  label: string;
  count: number;
  route: string;
  tone: 'warning' | 'error' | 'info';
}

export default function KitchenDashboardScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { profile } = useAuth();
  const { hasPermission } = usePermissions();
  const isManager = profile?.role === 'kitchen_manager' || profile?.role === 'admin';
  const isFoodLead = isManager || profile?.role === 'chef';

  const [batches, setBatches] = useState<DonationBatch[]>([]);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [openExceptions, setOpenExceptions] = useState(0);
  const [openShifts, setOpenShifts] = useState(0);
  const [todayRoster, setTodayRoster] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState({ donations: false, leave: false, exceptions: false, shifts: false, roster: false });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const today = todayISO();
    setLoadError('');
    setLoaded({ donations: false, leave: false, exceptions: false, shifts: false, roster: false });
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenDonationBatches((list) => {
      setBatches(list);
      setLoaded((s) => ({ ...s, donations: true }));
    }, undefined, onErr);
    const u2 = listenLeaveQueue((list) => {
      setPendingLeave(list.length);
      setLoaded((s) => ({ ...s, leave: true }));
    }, onErr);
    const u3 = listenAttendanceExceptions((list) => {
      setOpenExceptions(list.filter((e) => e.reviewStatus !== 'verified').length);
      setLoaded((s) => ({ ...s, exceptions: true }));
    }, onErr);
    const u4 = listenOpenShiftsBoard((list) => {
      setOpenShifts(list.length);
      setLoaded((s) => ({ ...s, shifts: true }));
    }, onErr);
    const u5 = listenPublishedRosters((list) => {
      setTodayRoster(list.flatMap((r) => r.shifts || []).filter((s) => s.date === today).length);
      setLoaded((s) => ({ ...s, roster: true }));
    }, onErr);
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [retryKey]);

  const today = todayISO();
  const unassigned = batches.filter((b) => b.status === 'safety_verified_unassigned').length;
  const toSchedule = batches.filter((b) => b.status === 'claimed_ready_for_scheduling').length;
  const collectionsToday = batches.filter(
    (b) => b.status === 'collection_scheduled' && (b.pickupDate === today || (b.pickupWindowStart || '').slice(0, 10) === today),
  ).length;
  const overdue = batches.filter(
    (b) =>
      b.status === 'collection_scheduled' &&
      (b.pickupWindowEnd || b.pickupDate || '') < localDateTimeISO(new Date()) &&
      (b.pickupWindowStart || b.pickupDate || '').slice(0, 10) < today,
  ).length;

  const in24h = Date.now() + 24 * 3600 * 1000;
  const expiringSoon = batches.filter(
    (b) => b.status !== 'collected_completed' && b.status !== 'cancelled' && b.expiryAt && new Date(b.expiryAt).getTime() <= in24h,
  ).length;
  const recent = [...batches].sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')).slice(0, 4);

  const needsAttention = unassigned + pendingLeave + openExceptions + overdue;
  const loading = !Object.values(loaded).every(Boolean);
  const anyLoaded = Object.values(loaded).some(Boolean);
  const showFullError = !!loadError && !anyLoaded;

  const attentionAll: AttentionItem[] = [
    { key: 'leave', label: 'Leave requests awaiting decision', count: pendingLeave, route: '/(kitchen)/leave-manage', tone: 'warning' },
    { key: 'alloc', label: 'Donations awaiting allocation', count: unassigned, route: '/(kitchen)/allocations', tone: 'warning' },
    { key: 'exc', label: 'Attendance exceptions to review', count: openExceptions, route: '/(kitchen)/attendance', tone: 'error' },
    { key: 'overdue', label: 'Collections overdue', count: overdue, route: '/(kitchen)/logistics', tone: 'error' },
  ];
  const attention = attentionAll.filter((a) => a.count > 0);

  const onNotifications = () => router.push('/(kitchen)/notifications' as any);
  const onProfile = () => router.push('/(kitchen)/profile' as any);
  const onSync = () => router.push('/(kitchen)/sync-queue' as any);

  const donationRow = (b: DonationBatch) => (
    <ListRow
      key={b.id}
      title={b.itemName}
      subtitle={`${b.portionCount || 0} portions · ${b.mealCategory || 'Meal'}${b.allergens?.length ? ` · Allergens: ${b.allergens.join(', ')}` : ''}`}
      status={<StatusPill status={b.status} size="sm" />}
      onPress={() => router.push('/(kitchen)/donation-log' as any)}
    />
  );

  return (
    <AppShell
      context={isManager ? 'Kitchen Manager · FixedFunding' : 'Chef · FixedFunding'}
      title={isManager ? 'Operations' : 'Kitchen'}
      subtitle={profile?.displayName ? `Signed in as ${profile.displayName}` : undefined}
      onNotifications={onNotifications}
      onProfile={onProfile}
      onSync={onSync}
    >
      {showFullError ? (
        <ErrorState
          title="Couldn't load operations"
          message="Live kitchen data is unavailable right now."
          details={loadError}
          onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }}
        />
      ) : loading ? (
        <>
          <Skeleton width="100%" height={72} radius={theme.radius.lg} />
          <View style={{ flexDirection: 'row', gap: theme.space.md, marginTop: theme.space.lg }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width="31%" height={104} radius={theme.radius.lg} />
            ))}
          </View>
        </>
      ) : isManager ? (
        /* ─────────── KITCHEN MANAGER: COMMAND CENTER ─────────── */
        <>
          <SectionHeader title="Requires attention" />
          {needsAttention === 0 ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
              <Ionicons name="checkmark-circle" size={theme.iconSize.md} color={theme.colors.successStrong} />
              <AppText variant="bodyStrong">All clear — nothing needs your attention.</AppText>
            </Card>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {attention.map((a, i) => (
                <View key={a.key} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={a.label}
                    trailing={
                      <View style={{ backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                        <AppText variant="bodyStrong">{a.count}</AppText>
                      </View>
                    }
                    onPress={() => router.push(a.route as any)}
                  />
                </View>
              ))}
            </Card>
          )}

          <SectionHeader title="Today" />
          <View style={{ flexDirection: 'row', gap: theme.space.md }}>
            <MetricCard value={collectionsToday} label="Collections scheduled" icon="cube-outline" tone={overdue > 0 ? 'warning' : 'info'} onPress={() => router.push('/(kitchen)/logistics' as any)} />
            <MetricCard value={todayRoster} label="Staff on roster" icon="people-outline" tone="default" onPress={() => router.push('/(kitchen)/roster-builder' as any)} />
            <MetricCard value={openShifts} label="Open shifts" icon="lock-open-outline" tone="default" onPress={() => router.push('/(kitchen)/open-shifts' as any)} />
          </View>

          <SectionHeader title="Food rescue" />
          <View style={{ flexDirection: 'row', gap: theme.space.md }}>
            <MetricCard value={unassigned} label="Awaiting allocation" icon="fast-food-outline" tone={unassigned > 0 ? 'warning' : 'default'} onPress={() => router.push('/(kitchen)/allocations' as any)} />
            <MetricCard value={toSchedule} label="Ready to schedule" icon="calendar-outline" tone="info" onPress={() => router.push('/(kitchen)/logistics' as any)} />
          </View>

          <SectionHeader title="Quick actions" />
          <View style={{ gap: theme.space.sm }}>
            <ListRow title="Log donation" subtitle="Camera → AI → safety → review" leading={<Ionicons name="camera-outline" size={theme.iconSize.md} color={theme.colors.primary} />} onPress={() => router.push('/(kitchen)/donation-log' as any)} />
            <ListRow title="Schedule collection" subtitle="Pickup window & collection pass" leading={<Ionicons name="bus-outline" size={theme.iconSize.md} color={theme.colors.primary} />} onPress={() => router.push('/(kitchen)/logistics' as any)} />
            <ListRow title="Approve leave & swaps" subtitle="Workforce requests" leading={<Ionicons name="time-outline" size={theme.iconSize.md} color={theme.colors.primary} />} onPress={() => router.push('/(kitchen)/leave-manage' as any)} />
            {hasPermission('kitchen_orders') ? (
              <ListRow title="Kitchen orders" subtitle="Live order queue" leading={<Ionicons name="list-outline" size={theme.iconSize.md} color={theme.colors.primary} />} onPress={() => router.push('/(kitchen)/order-queue' as any)} />
            ) : null}
          </View>
        </>
      ) : (
        /* ─────────── CHEF: FOOD-FOCUSED ─────────── */
        <>
          <Button label="Log donation" icon="camera-outline" size="lg" onPress={() => router.push('/(kitchen)/donation-log' as any)} />

          <SectionHeader title="Food rescue" />
          <View style={{ flexDirection: 'row', gap: theme.space.md }}>
            <MetricCard value={unassigned} label="Awaiting allocation" icon="fast-food-outline" tone={unassigned > 0 ? 'warning' : 'default'} onPress={() => router.push('/(kitchen)/allocations' as any)} />
            <MetricCard value={toSchedule} label="Ready to schedule" icon="calendar-outline" tone="info" onPress={() => router.push('/(kitchen)/logistics' as any)} />
            <MetricCard value={collectionsToday} label="Collections today" icon="cube-outline" tone="default" onPress={() => router.push('/(kitchen)/logistics' as any)} />
          </View>

          {expiringSoon > 0 ? (
            <Card bordered={false} style={{ backgroundColor: theme.colors.warningSoft, flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, marginTop: theme.space.lg }}>
              <Ionicons name="alarm-outline" size={theme.iconSize.md} color={theme.colors.warningStrong} />
              <AppText variant="bodyStrong" color={theme.colors.warningStrong}>
                {expiringSoon} batch{expiringSoon === 1 ? '' : 'es'} expiring within 24 hours
              </AppText>
            </Card>
          ) : null}

          <SectionHeader title="Recent rescue activity" />
          {recent.length === 0 ? (
            <EmptyState icon="fast-food-outline" title="No donations logged yet" message="Captured donations and their safety checks appear here." actionLabel="Log donation" onAction={() => router.push('/(kitchen)/donation-log' as any)} />
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {recent.map((b, i) => (
                <View key={b.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  {donationRow(b)}
                </View>
              ))}
            </Card>
          )}

          <SectionHeader title="Quick actions" />
          <View style={{ gap: theme.space.sm }}>
            <ListRow title="Scan collection pass" subtitle="Verify a collection" leading={<Ionicons name="qr-code-outline" size={theme.iconSize.md} color={theme.colors.primary} />} onPress={() => router.push('/(kitchen)/donation-scan' as any)} />
            <ListRow title="Kitchen orders" subtitle="Live order queue" leading={<Ionicons name="list-outline" size={theme.iconSize.md} color={theme.colors.primary} />} onPress={() => router.push('/(kitchen)/order-queue' as any)} />
          </View>
        </>
      )}
    </AppShell>
  );
}
