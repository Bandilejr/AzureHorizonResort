// Open Shifts — calendar-first. Layer 6 presentation rebuild; claim/eligibility
// service calls unchanged.
import React, { useState, useEffect, useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth } from '@/services/firebase-services';
import { listenOpenShiftsBoard, listenPublishedRosters, claimOpenShiftMobile, checkOpenShiftEligibility, ShiftEligibility } from '@/services/increment2-services';
import type { OpenShift, ShiftRoster } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { SearchField } from '@/components/ui/inputs';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { todayISO, localDateISO, addDaysISO, parseISOLocal } from '@/utils/dates';
import { formatStatus } from '@/utils/status-labels';
import { Calendar, CalendarIndicator } from '@/components/Calendar';
import { WeekStrip, type WeekDay, type WeekBlock } from '@/components/WeekStrip';

function mondayOf(iso: string): string {
  const d = parseISOLocal(iso);
  const dow = (d.getDay() + 6) % 7;
  return localDateISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow));
}

export default function StaffOpenShiftsCalendarScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const staffId = auth.currentUser?.uid || '';

  const [open, setOpen] = useState<OpenShift[]>([]);
  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<OpenShift | null>(null);
  const [elig, setElig] = useState<ShiftEligibility | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => {
    setLoadError('');
    setLoaded(false);
    const onErr = (e: Error) => { setLoadError(e.message); setLoaded(true); };
    const u1 = listenOpenShiftsBoard((l) => { setOpen(l); setLoaded(true); }, onErr);
    const u2 = listenPublishedRosters(setRosters, onErr);
    return () => { u1(); u2(); };
  }, []);

  const myShifts = useMemo(() => rosters.flatMap((r) => (r.shifts || []).filter((s) => s.staffId === staffId).map((s) => ({ ...s, date: s.date }))), [rosters, staffId]);

  const indicators: CalendarIndicator[] = useMemo(() => {
    const byDate = new Map<string, { total: number; urgent: number }>();
    open.forEach((o) => {
      const cur = byDate.get(o.date) || { total: 0, urgent: 0 };
      cur.total += 1;
      if (o.urgency === 'urgent' || o.urgency === 'critical') cur.urgent += 1;
      byDate.set(o.date, cur);
    });
    const mySet = new Set(myShifts.map((s) => s.date));
    const y = month.getFullYear(), m = month.getMonth(), dim = new Date(y, m + 1, 0).getDate();
    const res: CalendarIndicator[] = [];
    for (let d = 1; d <= dim; d++) {
      const iso = localDateISO(new Date(y, m, d));
      const info = byDate.get(iso);
      if (!info) {
        res.push({ date: iso, type: mySet.has(iso) ? 'scheduled' : 'none' });
      } else if (mySet.has(iso) && info.total > 0) {
        res.push({ date: iso, type: 'conflict', count: info.total });
      } else if (info.urgent > 0) {
        res.push({ date: iso, type: 'pending', count: info.total });
      } else {
        res.push({ date: iso, type: 'open', count: info.total });
      }
    }
    return res;
  }, [open, myShifts, month]);

  const weekStart = useMemo(() => mondayOf(selectedDate), [selectedDate]);
  const weekDays: WeekDay[] = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
    const today = todayISO();
    return dates.map((date) => {
      const blocks: WeekBlock[] = [];
      if (myShifts.some((m) => m.date === date)) blocks.push({ label: 'My shift', tone: 'shift' });
      open.filter((o) => o.date === date).forEach((o) => {
        const urgent = o.urgency === 'urgent' || o.urgency === 'critical';
        blocks.push({ label: `${o.startTime}`, tone: urgent ? 'pending' : 'open' });
      });
      return { date, blocks, isToday: date === today };
    });
  }, [weekStart, open, myShifts]);

  const filtered = useMemo(() => {
    let base = showAll ? open : open.filter((s) => s.date === selectedDate);
    if (query) base = base.filter((s) => `${s.role} ${s.department} ${s.date}`.toLowerCase().includes(query.toLowerCase()));
    return base.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  }, [open, selectedDate, showAll, query]);

  const openShift = async (s: OpenShift) => {
    setSelected(s); setConfirming(false); setElig(null); setChecking(true);
    if (s.date < todayISO()) { setChecking(false); return; }
    try { setElig(await checkOpenShiftEligibility(s, staffId)); } catch { setElig(null); } finally { setChecking(false); }
  };
  const claim = async () => {
    if (!selected) return;
    setBusy(true);
    try { await claimOpenShiftMobile(selected.id); setSelected(null); setConfirming(false); showAlert({ title: 'Shift claimed', message: 'Added to your roster.', type: 'success' }); }
    catch (e: any) { showAlert({ title: 'Claim failed', message: e?.message || 'Shift may have just been filled.', type: 'error' }); }
    finally { setBusy(false); }
  };

  const selectedLabel = new Date(selectedDate).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen scroll>
      <PageHeader
        title="Open shifts"
        subtitle="Claim available shifts"
        showBack
        fallback="/(staff)/staff-dashboard"
        right={
          <AppText variant="label" tone="primary" weight="600" onPress={() => setShowAll((v) => !v)}>
            {showAll ? 'Selected date' : 'All dates'}
          </AppText>
        }
      />
      <LiveErrorBanner error={loadError} onRetry={() => setLoadError('')} />

      {loadError && !loaded ? (
        <ErrorState title="Couldn't load open shifts" message="The open shift board is unavailable right now." details={loadError} onRetry={() => setLoadError('')} />
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

          <View style={{ marginTop: theme.space.md }}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Search role or department" />
          </View>

          <SectionHeader title={showAll ? `All open (${filtered.length})` : `${selectedLabel} — ${filtered.length} shift${filtered.length !== 1 ? 's' : ''}`} />
          {filtered.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title={open.length === 0 ? 'No open shifts right now' : 'No matching shifts'}
              message={open.length === 0 ? 'Managers publish surge shifts and they appear here.' : showAll ? 'No shifts match your filter.' : 'No open shifts on this date. Try another date or view all.'}
              actionLabel={!showAll ? 'View all open shifts' : undefined}
              onAction={() => setShowAll(true)}
            />
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {filtered.map((s, i) => {
                const mineThatDay = myShifts.some((m) => m.date === s.date);
                return (
                  <View key={s.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                    <ListRow
                      title={`${s.startTime}–${s.endTime} · ${s.role}`}
                      subtitle={`${s.department} · ${s.hours}h · ${s.requiredSkill || 'no skill req'}${mineThatDay ? " · you're scheduled this day" : ''}`}
                      status={<StatusPill status={s.urgency === 'critical' ? 'critical' : s.urgency === 'urgent' ? 'urgent' : 'open'} size="sm" />}
                      onPress={() => openShift(s)}
                    />
                  </View>
                );
              })}
            </Card>
          )}
        </>
      )}

      <DetailModal visible={selected !== null} title={selected ? `${selected.date} • ${selected.role}` : ''} onClose={() => setSelected(null)}>
        {selected && !confirming ? (
          <View>
            <StatusBadge status={selected.status} />
            <SectionTitle>SHIFT</SectionTitle>
            <KV label="Date" value={selected.date} />
            <KV label="Time" value={`${selected.startTime}–${selected.endTime} (${selected.hours}h)`} />
            <KV label="Role" value={selected.role} />
            <KV label="Skill" value={selected.requiredSkill || 'None'} />
            <KV label="Department" value={selected.department} />
            <KV label="Urgency" value={formatStatus(selected.urgency || 'normal')} />
            {selected.date < todayISO() ? (
              <View style={{ backgroundColor: theme.colors.errorSoft, borderRadius: theme.radius.md, padding: theme.space.md, marginTop: theme.space.md }}>
                <AppText variant="label" color={theme.colors.errorStrong} weight="700">PAST DATE</AppText>
                <AppText variant="caption" color={theme.colors.errorStrong}>This shift date has passed and can no longer be claimed.</AppText>
              </View>
            ) : null}
            <SectionTitle>ELIGIBILITY</SectionTitle>
            {checking ? <AppText variant="body" tone="muted">Checking eligibility…</AppText> : null}
            {!checking && elig && elig.eligible ? (
              <View style={{ backgroundColor: theme.colors.successSoft, borderRadius: theme.radius.md, padding: theme.space.md }}>
                <AppText variant="label" color={theme.colors.successStrong} weight="700">YOU CAN CLAIM THIS SHIFT</AppText>
                {['Qualified', 'Available', 'No schedule conflict', 'Leave does not overlap', 'Within working-hour limits'].map((t) => (
                  <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Ionicons name="checkmark-circle" size={14} color={theme.colors.successStrong} />
                    <AppText variant="caption" color={theme.colors.successStrong}>{t}</AppText>
                  </View>
                ))}
              </View>
            ) : null}
            {!checking && elig && !elig.eligible ? (
              <View style={{ backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.md, padding: theme.space.md }}>
                <AppText variant="label" color={theme.colors.warningStrong} weight="700">{"CAN'T CLAIM"}</AppText>
                {elig.reasons.map((r, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Ionicons name="close-circle" size={14} color={theme.colors.errorStrong} />
                    <AppText variant="caption" color={theme.colors.warningStrong}>{r}</AppText>
                  </View>
                ))}
              </View>
            ) : null}
            {!checking && !elig && selected.date >= todayISO() ? (
              <AppText variant="body" tone="muted">Checking eligibility failed — please retry. Claim is blocked until check passes.</AppText>
            ) : null}
            <View style={{ marginTop: theme.space.md }}>
              <ModalButton label={checking ? 'Checking…' : 'Review claim'} onPress={() => setConfirming(true)} disabled={checking || !elig || !elig.eligible || selected.date < todayISO()} />
            </View>
          </View>
        ) : null}
        {selected && confirming ? (
          <ConfirmBlock
            title="Claim this shift?"
            rows={[['Shift', `${selected.date} ${selected.startTime}–${selected.endTime}`], ['Role', `${selected.role}${selected.requiredSkill ? ` (${selected.requiredSkill})` : ''}`], ['Department', selected.department], ['Effect', 'Shift fills immediately and links into your roster']]}
            confirmLabel="Confirm claim" onConfirm={claim} onCancel={() => setConfirming(false)} busy={busy}
          />
        ) : null}
      </DetailModal>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
