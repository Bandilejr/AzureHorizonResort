// (admin) Overview — high-level oversight. Contextual metrics, never bare
// numbers; skeleton while loading, ErrorState on failure, true 0 when zero.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import {
  listenNpoPartners,
  listenDonationBatches,
  listenLeaveQueue,
  listenAttendanceExceptions,
} from '@/services/increment2-services';
import { useAppTheme } from '@/design/use-app-theme';
import { AppShell } from '@/components/ui/app-shell';
import { SectionHeader } from '@/components/ui/screen';
import { MetricCard } from '@/components/ui/metric-card';
import { ListRow } from '@/components/ui/list-row';
import { ErrorState, Skeleton } from '@/components/ui/states';

export default function AdminDashboardScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { profile } = useAuth();
  const [pendingNpo, setPendingNpo] = useState(0);
  const [activeDonations, setActiveDonations] = useState(0);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [openExceptions, setOpenExceptions] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState({ npo: false, donations: false, leave: false, exceptions: false });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setLoadError('');
    setLoaded({ npo: false, donations: false, leave: false, exceptions: false });
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenNpoPartners((list) => {
      setPendingNpo(list.filter((n) => n.verificationStatus === 'pending' || n.verificationStatus === 'under_review').length);
      setLoaded((s) => ({ ...s, npo: true }));
    }, onErr);
    const u2 = listenDonationBatches((list) => {
      setActiveDonations(list.filter((b) => b.status !== 'collected_completed' && b.status !== 'cancelled').length);
      setLoaded((s) => ({ ...s, donations: true }));
    }, undefined, onErr);
    const u3 = listenLeaveQueue((list) => {
      setPendingLeave(list.length);
      setLoaded((s) => ({ ...s, leave: true }));
    }, onErr);
    const u4 = listenAttendanceExceptions((list) => {
      setOpenExceptions(list.filter((e) => e.reviewStatus !== 'verified').length);
      setLoaded((s) => ({ ...s, exceptions: true }));
    }, onErr);
    return () => { u1(); u2(); u3(); u4(); };
  }, [retryKey]);

  const loading = !Object.values(loaded).every(Boolean);
  const anyLoaded = Object.values(loaded).some(Boolean);
  const showFullError = !!loadError && !anyLoaded;

  const links: [string, string, string, string][] = [
    ['NPO verification', 'Review & approve partners', 'business-outline', '/(admin)/npo-verification'],
    ['Refund management', 'Guest refund approvals', 'cash-outline', '/(admin)/refund-management'],
    ['Impact reports', 'Food rescue metrics', 'bar-chart-outline', '/(admin)/impact'],
    ['Notifications', 'System inbox', 'notifications-outline', '/(admin)/notifications'],
  ];

  return (
    <AppShell
      context="Administrator · FixedFunding"
      title="Overview"
      subtitle={profile?.displayName ? `Signed in as ${profile.displayName}` : undefined}
      onNotifications={() => router.push('/(admin)/notifications' as any)}
      onProfile={() => router.push('/(admin)/profile' as any)}
    >
      {showFullError ? (
        <ErrorState
          title="Couldn't load oversight data"
          message="Live metrics are unavailable right now."
          details={loadError}
          onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }}
        />
      ) : loading ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="47%" height={104} radius={theme.radius.lg} />
          ))}
        </View>
      ) : (
        <>
          <SectionHeader title="Requires attention" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md }}>
            <MetricCard
              value={pendingNpo}
              label="Pending NPO reviews"
              icon="business-outline"
              tone={pendingNpo > 0 ? 'warning' : 'default'}
              onPress={() => router.push('/(admin)/npo-verification' as any)}
            />
            <MetricCard
              value={openExceptions}
              label="Attendance exceptions"
              icon="alert-circle-outline"
              tone={openExceptions > 0 ? 'error' : 'default'}
              onPress={() => router.push('/(kitchen)/attendance' as any)}
            />
            <MetricCard
              value={pendingLeave}
              label="Leave requests"
              icon="calendar-outline"
              tone={pendingLeave > 0 ? 'warning' : 'default'}
              onPress={() => router.push('/(kitchen)/leave-manage' as any)}
            />
            <MetricCard
              value={activeDonations}
              label="Active donations"
              icon="fast-food-outline"
              tone="info"
              onPress={() => router.push('/(admin)/impact' as any)}
            />
          </View>

          <SectionHeader title="Manage" />
          <View style={{ gap: theme.space.sm }}>
            {links.map(([title, sub, icon, route]) => (
              <ListRow
                key={route}
                title={title}
                subtitle={sub}
                leading={
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: theme.radius.md,
                      backgroundColor: theme.colors.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={icon as any} size={theme.iconSize.md} color={theme.colors.primary} />
                  </View>
                }
                onPress={() => router.push(route as any)}
              />
            ))}
          </View>
        </>
      )}
    </AppShell>
  );
}
