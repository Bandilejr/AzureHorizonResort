// (staff) Home — personal operational briefing (ME / MY WORK / NEXT ACTION).
// No org-wide data. Next shift as a time block, quick actions, attention,
// upcoming shifts.
import React, { useState, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/services/firebase-services';
import { listenPublishedRosters, listenOpenShiftsBoard, listenMyLeave, listenMySwaps } from '@/services/increment2-services';
import type { ShiftRoster, OpenShift, LeaveRequest, ShiftSwap } from '@/types/increment2';
import { todayISO, addDaysISO, formatISODate } from '@/utils/dates';
import { useAppTheme } from '@/design/use-app-theme';
import { AppShell } from '@/components/ui/app-shell';
import { SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/text';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';

export default function StaffDashboardScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const theme = useAppTheme();
  const uid = auth.currentUser?.uid || '';

  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [openShifts, setOpenShifts] = useState<OpenShift[]>([]);
  const [myLeave, setMyLeave] = useState<LeaveRequest[]>([]);
  const [mySwaps, setMySwaps] = useState<ShiftSwap[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState({ roster: false, open: false, leave: false, swaps: false });
  const [refreshing, setRefreshing] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!uid) { setLoaded({ roster: true, open: true, leave: true, swaps: true }); return; }
    setLoadError('');
    setLoaded({ roster: false, open: false, leave: false, swaps: false });
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenPublishedRosters((l) => { setRosters(l); setLoaded((s) => ({ ...s, roster: true })); }, onErr);
    const u2 = listenOpenShiftsBoard((l) => { setOpenShifts(l); setLoaded((s) => ({ ...s, open: true })); }, onErr);
    const u3 = listenMyLeave(uid, (l) => { setMyLeave(l); setLoaded((s) => ({ ...s, leave: true })); }, onErr);
    const u4 = listenMySwaps(uid, (l) => { setMySwaps(l); setLoaded((s) => ({ ...s, swaps: true })); }, onErr);
    return () => { u1(); u2(); u3(); u4(); };
  }, [uid, retryKey]);

  const myShifts = useMemo(() => {
    return rosters
      .flatMap((r) => (r.shifts || []).filter((s) => s.staffId === uid).map((s) => ({ ...s, department: r.department })))
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  }, [rosters, uid]);

  const todayStr = todayISO();
  const todayShift = myShifts.find((s) => s.date === todayStr) || null;
  const nextUp = myShifts.filter((s) => s.date > todayStr).slice(0, 3);
  const weekEnd = addDaysISO(todayStr, 7);
  const openThisWeek = openShifts.filter((o) => o.date >= todayStr && o.date <= weekEnd).length;
  const pendingLeave = myLeave.filter((l) => l.status === 'pending').length;
  const pendingSwaps = mySwaps.filter((s) => ['pending_peer', 'pending_manager', 'peer_accepted'].includes(s.status)).length;

  const loading = !Object.values(loaded).every(Boolean);
  const anyLoaded = Object.values(loaded).some(Boolean);
  const showFullError = !!loadError && !anyLoaded;

  const onRefresh = () => {
    setRefreshing(true);
    setRetryKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <AppShell
      context="Staff · FixedFunding"
      title={`${(profile?.displayName || '').trim().split(/\s+/)[0] || 'there'}`}
      subtitle={`${(profile?.position || profile?.subRole?.replace(/_/g, ' ') || 'Staff')} · My work`}
      onNotifications={() => router.push('/(staff)/notifications' as any)}
      onProfile={() => router.push('/(staff)/profile' as any)}
      onSync={() => router.push('/(staff)/sync-queue' as any)}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {showFullError ? (
        <ErrorState
          title="Couldn't load your schedule"
          message="Your shifts and requests are unavailable right now."
          details={loadError}
          onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }}
        />
      ) : (
        <>
          <SectionHeader title="Today" />
          {loading ? (
            <Skeleton width="100%" height={140} radius={theme.radius.xl} />
          ) : todayShift ? (
            <Card radius="xl" elevation="subtle" style={{ gap: theme.space.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <AppText variant="micro" tone="primary" weight="700">
                    TODAY · {formatISODate(todayShift.date, { weekday: 'short' }).toUpperCase()}
                  </AppText>
                </View>
                <AppText variant="caption" tone="secondary">{todayShift.department}</AppText>
              </View>
              <AppText variant="display">{todayShift.startTime} – {todayShift.endTime}</AppText>
              <AppText variant="body" tone="secondary">
                {todayShift.role}{todayShift.requiredSkill ? ` · ${todayShift.requiredSkill}` : ''}
              </AppText>
              <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.xs }}>
                <Button label="Clock in / out" icon="finger-print-outline" onPress={() => router.push('/(staff)/clock-in-out' as any)} fullWidth={false} style={{ flex: 1 }} />
                <Button label="My schedule" variant="secondary" onPress={() => router.push('/(staff)/my-roster' as any)} fullWidth={false} style={{ flex: 1 }} />
              </View>
            </Card>
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="No shift today"
              message="Enjoy your day off — see what's next below."
              actionLabel="Open shifts"
              onAction={() => router.push('/(staff)/open-shifts' as any)}
            />
          )}

          <SectionHeader title="Needs your attention" />
          {pendingLeave === 0 && pendingSwaps === 0 ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
              <Ionicons name="checkmark-circle" size={theme.iconSize.md} color={theme.colors.successStrong} />
              <AppText variant="bodyStrong">All caught up — no pending requests.</AppText>
            </Card>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {pendingLeave > 0 ? (
                <ListRow
                  title={`${pendingLeave} leave request${pendingLeave > 1 ? 's' : ''} pending`}
                  subtitle="Tap to review your request"
                  leading={<Ionicons name="time-outline" size={theme.iconSize.md} color={theme.colors.warningStrong} />}
                  onPress={() => router.push('/(staff)/availability-leave' as any)}
                />
              ) : null}
              {pendingSwaps > 0 ? (
                <View style={pendingLeave > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={`${pendingSwaps} shift swap${pendingSwaps > 1 ? 's' : ''} in progress`}
                    subtitle="Tap to track"
                    leading={<Ionicons name="swap-horizontal-outline" size={theme.iconSize.md} color={theme.colors.infoStrong} />}
                    onPress={() => router.push('/(staff)/shift-swaps' as any)}
                  />
                </View>
              ) : null}
            </Card>
          )}

          <SectionHeader title="Next up" />
          {nextUp.length === 0 ? (
            <AppText variant="body" tone="muted">Nothing scheduled after today.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {nextUp.map((s, i) => (
                <View key={s.shiftId} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={`${s.startTime} – ${s.endTime}`}
                    subtitle={`${formatISODate(s.date, { weekday: 'long' })} · ${s.role} · ${s.department}`}
                    onPress={() => router.push('/(staff)/my-roster' as any)}
                  />
                </View>
              ))}
            </Card>
          )}

          <SectionHeader title="Open shifts" actionLabel="View all" onAction={() => router.push('/(staff)/open-shifts' as any)} />
          <ListRow
            title={openThisWeek === 0 ? 'No openings this week' : `${openThisWeek} available this week`}
            subtitle={`${openShifts.length} open shift${openShifts.length === 1 ? '' : 's'} in total`}
            leading={<Ionicons name="lock-open-outline" size={theme.iconSize.md} color={theme.colors.primary} />}
            onPress={() => router.push('/(staff)/open-shifts' as any)}
          />

          <SectionHeader title="Quick actions" />
          <View style={{ gap: theme.space.sm }}>
            <ListRow title="My schedule" subtitle="Roster & calendar" leading={<Ionicons name="calendar-outline" size={theme.iconSize.md} color={theme.colors.primary} />} onPress={() => router.push('/(staff)/my-roster' as any)} />
            <ListRow title="Clock in / out" subtitle="Attendance" leading={<Ionicons name="finger-print-outline" size={theme.iconSize.md} color={theme.colors.primary} />} onPress={() => router.push('/(staff)/clock-in-out' as any)} />
            <ListRow title="Availability & leave" subtitle="Set availability, request leave" leading={<Ionicons name="time-outline" size={theme.iconSize.md} color={theme.colors.primary} />} onPress={() => router.push('/(staff)/availability-leave' as any)} />
            <ListRow title="Shift swaps" subtitle="Request or accept swaps" leading={<Ionicons name="swap-horizontal-outline" size={theme.iconSize.md} color={theme.colors.primary} />} onPress={() => router.push('/(staff)/shift-swaps' as any)} />
            <ListRow title="Activity" subtitle="Notifications" leading={<Ionicons name="notifications-outline" size={theme.iconSize.md} color={theme.colors.primary} />} onPress={() => router.push('/(staff)/notifications' as any)} />
          </View>
        </>
      )}
    </AppShell>
  );
}
