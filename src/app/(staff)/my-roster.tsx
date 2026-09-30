// My Schedule — calendar-first (transformed from My Roster list).
// Layer 6: presentation rebuilt on the design system; queries unchanged.
import React, { useState, useEffect, useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth } from '@/services/firebase-services';
import { listenPublishedRosters, listenOpenShiftsBoard, listenMySwaps, listenMyLeave } from '@/services/increment2-services';
import type { ShiftRoster, OpenShift, ShiftSwap, LeaveRequest } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { DetailModal, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { Calendar, CalendarIndicator } from '@/components/Calendar';
import { WeekStrip, type WeekDay, type WeekBlock } from '@/components/WeekStrip';
import { localDateISO, todayISO, parseISOLocal, addDaysISO, daysInclusive } from '@/utils/dates';
import { formatStatus } from '@/utils/status-labels';

type MyShift = ShiftRoster['shifts'][number] & { rosterDocId: string; week: string; department: string };

// Monday of the week containing `iso` (week view is Mon–Sun, matching the month grid).
function mondayOf(iso: string): string {
  const d = parseISOLocal(iso);
  const dow = (d.getDay() + 6) % 7;
  return localDateISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow));
}

export default function MyScheduleScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const staffId = auth.currentUser?.uid || '';

  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [openShifts, setOpenShifts] = useState<OpenShift[]>([]);
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [selectedShift, setSelectedShift] = useState<MyShift | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!staffId) { setLoaded(true); return; }
    setLoadError('');
    setLoaded(false);
    const onErr = (e: Error) => { setLoadError(e.message); setLoaded(true); };
    const u1 = listenPublishedRosters((l) => { setRosters(l); setLoaded(true); }, onErr);
    const u2 = listenOpenShiftsBoard(setOpenShifts, onErr);
    const u3 = listenMySwaps(staffId, setSwaps, onErr);
    const u4 = listenMyLeave(staffId, setLeaves, onErr);
    return () => { u1(); u2(); u3(); u4(); };
  }, [staffId, retryKey]);

  const myShifts: MyShift[] = useMemo(
    () => rosters.flatMap((r) => (r.shifts || []).filter((s) => s.staffId === staffId).map((s) => ({ ...s, rosterDocId: r.id, week: r.weekStart, department: r.department }))),
    [rosters, staffId],
  );

  const indicators: CalendarIndicator[] = useMemo(() => {
    const map = new Map<string, CalendarIndicator>();
    const leaveDates = new Set<string>();
    leaves.filter((l) => l.status === 'approved').forEach((l) => {
      const n = daysInclusive(l.startDate, l.endDate);
      for (let i = 0; i < n; i++) leaveDates.add(addDaysISO(l.startDate, i));
    });
    const pendingDates = new Set(swaps.filter((s) => ['pending_peer', 'pending_manager', 'peer_accepted'].includes(s.status)).flatMap((s) => {
      const a = myShifts.find((x) => x.shiftId === s.requesterShiftId)?.date;
      const b = myShifts.find((x) => x.shiftId === s.targetShiftId)?.date;
      return [a, b].filter(Boolean) as string[];
    }));
    const openByDate = new Map<string, number>();
    openShifts.forEach((o) => openByDate.set(o.date, (openByDate.get(o.date) || 0) + 1));
    const myByDate = new Map<string, MyShift[]>();
    myShifts.forEach((s) => { const arr = myByDate.get(s.date) || []; arr.push(s); myByDate.set(s.date, arr); });

    const y = month.getFullYear(), m = month.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const iso = localDateISO(new Date(y, m, d));
      if (myByDate.has(iso)) {
        const dayList = myByDate.get(iso)!;
        const onLeave = leaveDates.has(iso);
        const overlaps = dayList.some((a, i) => dayList.some((b, j) => i < j && a.startTime < b.endTime && b.startTime < a.endTime));
        if (onLeave || overlaps) map.set(iso, { date: iso, type: 'conflict', count: dayList.length });
        else map.set(iso, { date: iso, type: 'scheduled', count: dayList.length });
      } else if (leaveDates.has(iso)) map.set(iso, { date: iso, type: 'leave' });
      else if (pendingDates.has(iso)) map.set(iso, { date: iso, type: 'pending' });
      else if (openByDate.has(iso)) map.set(iso, { date: iso, type: 'open', count: openByDate.get(iso) });
      else map.set(iso, { date: iso, type: 'none' });
    }
    return Array.from(map.values());
  }, [myShifts, openShifts, swaps, leaves, month]);

  const dayShifts = myShifts.filter((s) => s.date === selectedDate);
  const dayOpen = openShifts.filter((o) => o.date === selectedDate);
  const dayPending = swaps.filter((s) => myShifts.some((m) => m.shiftId === s.requesterShiftId && m.date === selectedDate) || myShifts.some((m) => m.shiftId === s.targetShiftId && m.date === selectedDate));
  const dayLeave = leaves.filter((l) => l.status === 'approved' && selectedDate >= l.startDate && selectedDate <= l.endDate);

  const weekStart = useMemo(() => mondayOf(selectedDate), [selectedDate]);
  const weekDays: WeekDay[] = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
    const today = todayISO();
    const pendingStatuses = ['pending_peer', 'pending_manager', 'peer_accepted'];
    return dates.map((date) => {
      const blocks: WeekBlock[] = [];
      const shiftsToday = myShifts.filter((s) => s.date === date);
      const onLeave = leaves.find((l) => l.status === 'approved' && date >= l.startDate && date <= l.endDate) || null;
      const overlap = shiftsToday.some((a, i) => shiftsToday.some((b, j) => i < j && a.startTime < b.endTime && b.startTime < a.endTime));
      if (overlap) blocks.push({ label: 'Conflict', tone: 'conflict' });
      shiftsToday.forEach((s) => blocks.push({ label: `${s.startTime}–${s.endTime}`, tone: 'shift' }));
      openShifts.filter((o) => o.date === date).forEach(() => blocks.push({ label: 'Open', tone: 'open' }));
      swaps
        .filter((s) => pendingStatuses.includes(s.status)
          && (myShifts.find((x) => x.shiftId === s.requesterShiftId)?.date === date || myShifts.find((x) => x.shiftId === s.targetShiftId)?.date === date))
        .forEach(() => blocks.push({ label: 'Swap', tone: 'pending' }));
      if (onLeave) blocks.push({ label: onLeave.leaveType || 'Leave', tone: 'leave' });
      return { date, blocks, isToday: date === today };
    });
  }, [weekStart, myShifts, openShifts, swaps, leaves]);

  const formattedSelected = parseISOLocal(selectedDate).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen scroll>
      <PageHeader title="My schedule" subtitle="Your roster, shifts & time off" showBack fallback="/(staff)/staff-dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      {loadError && !loaded ? (
        <ErrorState title="Couldn't load your schedule" message="Your roster is unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : !loaded ? (
        <Skeleton width="100%" height={280} radius={theme.radius.lg} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: theme.space.xs, backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.radius.md, padding: 4, marginBottom: theme.space.sm }}>
            {(['week', 'month'] as const).map((v) => {
              const active = view === v;
              return (
                <TouchableOpacity
                  key={v}
                  onPress={() => setView(v)}
                  style={{ flex: 1, paddingVertical: theme.space.sm, borderRadius: theme.radius.sm, backgroundColor: active ? theme.colors.surface : 'transparent', alignItems: 'center' }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <AppText variant="label" tone={active ? 'primary' : 'secondary'} weight="600">{v === 'week' ? 'Week' : 'Month'}</AppText>
                </TouchableOpacity>
              );
            })}
          </View>
          {view === 'week' ? (
            <WeekStrip days={weekDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
          ) : (
            <Calendar month={month} selectedDate={selectedDate} indicators={indicators} onSelectDate={setSelectedDate} onMonthChange={setMonth} />
          )}

          <SectionHeader title={formattedSelected} style={{ marginTop: theme.space.lg }} />

          {dayLeave.length > 0 ? (
            <Card style={{ backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warningSoft, flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, marginBottom: theme.space.md }}>
              <Ionicons name="calendar-outline" size={theme.iconSize.md} color={theme.colors.warningStrong} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" color={theme.colors.warningStrong}>On leave</AppText>
                <AppText variant="caption" color={theme.colors.warningStrong}>{dayLeave[0].leaveType}: {dayLeave[0].startDate} → {dayLeave[0].endDate}</AppText>
              </View>
            </Card>
          ) : null}

          <SectionHeader title={`Your shifts${dayShifts.length ? ` (${dayShifts.length})` : ''}`} />
          {dayShifts.length === 0 ? (
            <AppText variant="body" tone="muted">No shifts scheduled.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {dayShifts.map((s, i) => (
                <View key={s.shiftId} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={`${s.startTime} – ${s.endTime}`}
                    subtitle={`${s.department} · ${s.role}${s.requiredSkill ? ` · ${s.requiredSkill}` : ''}`}
                    status={<StatusPill status="published" size="sm" label="Scheduled" />}
                    onPress={() => setSelectedShift(s)}
                  />
                </View>
              ))}
            </Card>
          )}

          <SectionHeader title={`Open shifts${dayOpen.length ? ` (${dayOpen.length})` : ''}`} actionLabel={dayOpen.length > 3 ? 'View all' : undefined} onAction={() => router.push('/(staff)/open-shifts' as any)} />
          {dayOpen.length === 0 ? (
            <AppText variant="body" tone="muted">No open shifts.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {dayOpen.slice(0, 3).map((o, i) => (
                <View key={o.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={`${o.startTime}–${o.endTime} · ${o.role}`}
                    subtitle={`${o.department} · ${o.hours}h`}
                    status={<StatusPill status={o.urgency === 'critical' ? 'critical' : o.urgency === 'urgent' ? 'urgent' : 'open'} size="sm" />}
                    onPress={() => router.push('/(staff)/open-shifts' as any)}
                  />
                </View>
              ))}
            </Card>
          )}

          {dayPending.length > 0 ? (
            <>
              <SectionHeader title="Pending swaps" />
              <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
                {dayPending.map((sw, i) => (
                  <View key={sw.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                    <ListRow title="Shift swap" subtitle="Tap to track in Shift swaps" status={<StatusPill status={sw.status} size="sm" />} onPress={() => router.push('/(staff)/shift-swaps' as any)} />
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}

      <DetailModal visible={selectedShift !== null} title={selectedShift ? `${selectedShift.date} ${selectedShift.startTime}–${selectedShift.endTime}` : ''} onClose={() => setSelectedShift(null)}>
        {selectedShift ? (
          <View>
            <StatusBadge status="published" />
            <SectionTitle>SHIFT</SectionTitle>
            <KV label="Date" value={selectedShift.date} />
            <KV label="Time" value={`${selectedShift.startTime}–${selectedShift.endTime}`} />
            <KV label="Role" value={selectedShift.role} />
            <KV label="Skill" value={selectedShift.requiredSkill || 'None'} />
            <KV label="Department" value={selectedShift.department} />
            <KV label="Week" value={selectedShift.week} />
            <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.md }}>
              <ModalButton label="Request swap" kind="secondary" onPress={() => { const id = selectedShift.shiftId; setSelectedShift(null); router.push({ pathname: '/(staff)/shift-swaps', params: { myShiftId: id } } as any); }} />
              <ModalButton label="Open shifts" kind="secondary" onPress={() => { setSelectedShift(null); router.push('/(staff)/open-shifts' as any); }} />
            </View>
          </View>
        ) : null}
      </DetailModal>
      <View style={{ height: theme.space['4xl'] }} />
    </Screen>
  );
}
