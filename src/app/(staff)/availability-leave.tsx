// UC41 mobile — My availability + leave requests.
// Layer 6 presentation rebuild. Write payloads unchanged (same field names and
// YYYY-MM-DD / HH:mm string formats); picker behaviour preserved.
import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auth } from '@/services/firebase-services';
import { listenMyAvailability, listenMyLeave, submitAvailabilityMobile, submitLeaveMobile } from '@/services/increment2-services';
import type { StaffAvailability, LeaveRequest } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { LiveErrorBanner } from '@/components/detail-kit';
import { todayISO, localDateISO, parseISOLocal } from '@/utils/dates';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LEAVE_TYPES = [
  { value: 'Annual', label: 'Annual', icon: 'sunny-outline' as const },
  { value: 'Sick', label: 'Sick', icon: 'medkit-outline' as const },
  { value: 'Family', label: 'Family', icon: 'people-outline' as const },
  { value: 'Unpaid', label: 'Unpaid', icon: 'cash-outline' as const },
];

export default function AvailabilityLeaveScreen() {
  const theme = useAppTheme();
  const staffId = auth.currentUser?.uid || '';

  const [weekStart, setWeekStart] = useState(() => todayISO());
  const [slots, setSlots] = useState<Record<string, { start: string; end: string; on: boolean }>>(
    Object.fromEntries(DAYS.map((d) => [d, { start: '08:00', end: '17:00', on: true }])),
  );
  const [leaveType, setLeaveType] = useState('Annual');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [showLeaveStart, setShowLeaveStart] = useState(false);
  const [showLeaveEnd, setShowLeaveEnd] = useState(false);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [timePicker, setTimePicker] = useState<{ day: string; which: 'start' | 'end' } | null>(null);
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [myLeave, setMyLeave] = useState<LeaveRequest[]>([]);
  const [myAvail, setMyAvail] = useState<StaffAvailability[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'availability' | 'leave'>('availability');
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => {
    if (!staffId) { setLoaded(true); return; }
    setLoadError('');
    setLoaded(false);
    const onErr = (e: Error) => { setLoadError(e.message); setLoaded(true); };
    const u1 = listenMyAvailability(staffId, (l) => { setMyAvail(l); setLoaded(true); }, onErr);
    const u2 = listenMyLeave(staffId, setMyLeave, onErr);
    return () => { u1(); u2(); };
  }, [staffId, retryKey]);

  const pickProof = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!res.canceled && res.assets?.[0]?.uri) setProofUri(res.assets[0].uri);
  };

  const saveAvailability = async () => {
    setBusy(true);
    try {
      await submitAvailabilityMobile({
        weekStart,
        availability: DAYS.filter((d) => slots[d].on).map((d) => ({ day: d, startTime: slots[d].start, endTime: slots[d].end })),
      });
      showAlert({ title: 'Availability saved', message: `Week of ${weekStart} submitted.`, type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Save failed', message: e?.message || 'Could not save.', type: 'error' });
    } finally { setBusy(false); }
  };

  const submitLeave = async () => {
    if (!leaveStart || !leaveEnd) { showAlert({ title: 'Dates required', message: 'Pick a leave start and end date.', type: 'error' }); return; }
    setBusy(true);
    try {
      await submitLeaveMobile({ leaveType, startDate: leaveStart, endDate: leaveEnd, proofUri: proofUri || undefined });
      setLeaveStart(''); setLeaveEnd(''); setProofUri(null);
      showAlert({ title: 'Leave submitted', message: 'Manager will review your request.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Submission failed', message: e?.message || 'Could not submit.', type: 'error' });
    } finally { setBusy(false); }
  };

  return (
    <Screen scroll>
      <PageHeader title="Availability & leave" subtitle="Set when you can work, request time off" showBack fallback="/(staff)/staff-dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      {loadError && !loaded ? (
        <ErrorState title="Couldn't load your requests" message="Availability and leave are unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : !loaded ? (
        <Skeleton width="100%" height={200} radius={theme.radius.lg} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: theme.space.xs, backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.radius.md, padding: 4, marginBottom: theme.space.md }}>
            {(['availability', 'leave'] as const).map((v) => {
              const active = tab === v;
              return (
                <TouchableOpacity
                  key={v}
                  onPress={() => setTab(v)}
                  style={{ flex: 1, paddingVertical: theme.space.sm, borderRadius: theme.radius.sm, backgroundColor: active ? theme.colors.surface : 'transparent', alignItems: 'center' }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <AppText variant="label" tone={active ? 'primary' : 'secondary'} weight="600">{v === 'availability' ? 'Availability' : 'Leave'}</AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          {tab === 'availability' ? (
            <>
          <SectionHeader title="When can you work?" />
          <TouchableOpacity onPress={() => setShowWeekPicker(true)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="body">Week start</AppText>
              <AppText variant="bodyStrong" tone="primary">{weekStart}</AppText>
            </Card>
          </TouchableOpacity>
          {showWeekPicker ? (
            <DateTimePicker value={weekStart ? parseISOLocal(weekStart) : new Date()} mode="date" display="default" onChange={(_, d) => { setShowWeekPicker(false); if (d) setWeekStart(localDateISO(d)); }} />
          ) : null}

          <View style={{ flexDirection: 'row', gap: 6, marginTop: theme.space.md, flexWrap: 'wrap' }}>
            {[
              { label: 'Weekdays 08–17', fn: () => setSlots((p) => { const n = { ...p }; ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].forEach((day) => (n[day] = { ...n[day], on: true, start: '08:00', end: '17:00' })); ['Saturday', 'Sunday'].forEach((day) => (n[day] = { ...n[day], on: false })); return n; }) },
              { label: 'All week', fn: () => setSlots((p) => { const n = { ...p }; DAYS.forEach((day) => (n[day] = { ...n[day], on: true })); return n; }) },
              { label: 'Clear', fn: () => setSlots((p) => { const n = { ...p }; DAYS.forEach((day) => (n[day] = { ...n[day], on: false })); return n; }) },
            ].map((b) => (
              <TouchableOpacity key={b.label} onPress={b.fn} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
                <AppText variant="micro" tone="secondary" weight="600">{b.label}</AppText>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ marginTop: theme.space.md, gap: theme.space.sm }}>
            {DAYS.map((d) => {
              const s = slots[d];
              const parse = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); const dt = new Date(); dt.setHours(h || 0, m || 0, 0, 0); return dt; };
              const isOpen = timePicker?.day === d;
              return (
                <Card key={d} style={{ gap: theme.space.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <AppText variant="label" weight="700">{d.slice(0, 3).toUpperCase()}</AppText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
                      <AppText variant="caption" color={s.on ? theme.colors.successStrong : theme.colors.textMuted} weight="600">{s.on ? 'Available' : 'Not available'}</AppText>
                      <Switch value={s.on} onValueChange={(v) => setSlots((p) => ({ ...p, [d]: { ...p[d], on: v } }))} />
                    </View>
                  </View>
                  {s.on ? (
                    <>
                      <View style={{ flexDirection: 'row', gap: theme.space.sm, alignItems: 'center' }}>
                        <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: theme.space.md, backgroundColor: theme.colors.surfaceVariant }} onPress={() => setTimePicker({ day: d, which: 'start' })}>
                          <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
                          <AppText variant="bodyStrong">{s.start}</AppText>
                        </TouchableOpacity>
                        <AppText variant="body" tone="muted">—</AppText>
                        <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: theme.space.md, backgroundColor: theme.colors.surfaceVariant }} onPress={() => setTimePicker({ day: d, which: 'end' })}>
                          <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
                          <AppText variant="bodyStrong">{s.end}</AppText>
                        </TouchableOpacity>
                      </View>
                      <View style={{ height: 6, backgroundColor: theme.colors.surfaceVariant, borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ position: 'absolute', top: 0, bottom: 0, backgroundColor: theme.colors.primary, borderRadius: 3, left: `${(parseInt(s.start.split(':')[0]) / 24) * 100}%`, width: `${Math.max(8, ((parseInt(s.end.split(':')[0]) - parseInt(s.start.split(':')[0])) / 24) * 100)}%` }} />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        {[
                          { l: 'Morning', v: ['08:00', '12:00'] },
                          { l: 'Afternoon', v: ['13:00', '17:00'] },
                          { l: 'Evening', v: ['18:00', '22:00'] },
                          { l: 'Full day', v: ['08:00', '17:00'] },
                        ].map((pr) => (
                          <TouchableOpacity key={pr.l} onPress={() => setSlots((p) => ({ ...p, [d]: { ...p[d], start: pr.v[0], end: pr.v[1] } }))} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
                            <AppText variant="micro" tone="secondary" weight="600">{pr.l}</AppText>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {isOpen ? (
                        <DateTimePicker
                          value={parse(timePicker.which === 'start' ? s.start : s.end)}
                          mode="time" is24Hour display="default"
                          onChange={(_, dt) => { setTimePicker(null); if (dt) { const hh = String(dt.getHours()).padStart(2, '0'); const mm = String(dt.getMinutes()).padStart(2, '0'); const val = `${hh}:${mm}`; setSlots((p) => ({ ...p, [d]: { ...p[d], [timePicker.which]: val } })); } }}
                        />
                      ) : null}
                    </>
                  ) : null}
                </Card>
              );
            })}
          </View>
          <Button label="Submit availability" onPress={saveAvailability} loading={busy} style={{ marginTop: theme.space.md }} />
          {myAvail.length > 0 ? <AppText variant="caption" tone="muted" style={{ marginTop: theme.space.sm }}>Submitted: {myAvail.length} week(s)</AppText> : null}
            </>
          ) : null}

          {tab === 'leave' ? (
            <>
          <SectionHeader title="Request leave" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginBottom: theme.space.md }}>
            {LEAVE_TYPES.map((t) => {
              const active = leaveType === t.value;
              return (
                <TouchableOpacity key={t.value} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9999, borderWidth: 1, borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primary : theme.colors.surface }} onPress={() => setLeaveType(t.value)}>
                  <Ionicons name={t.icon} size={14} color={active ? theme.colors.textInverse : theme.colors.textMuted} />
                  <AppText variant="label" color={active ? theme.colors.textInverse : theme.colors.textSecondary} weight="600">{t.label}</AppText>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
            <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.space.md, backgroundColor: theme.colors.surface }} onPress={() => setShowLeaveStart(true)}>
              <AppText variant="body" tone={leaveStart ? 'default' : 'muted'}>{leaveStart || 'Start date'}</AppText>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.space.md, backgroundColor: theme.colors.surface }} onPress={() => setShowLeaveEnd(true)}>
              <AppText variant="body" tone={leaveEnd ? 'default' : 'muted'}>{leaveEnd || 'End date'}</AppText>
            </TouchableOpacity>
          </View>
          {showLeaveStart ? <DateTimePicker value={leaveStart ? parseISOLocal(leaveStart) : new Date()} mode="date" display="default" onChange={(_, d) => { setShowLeaveStart(false); if (d) setLeaveStart(localDateISO(d)); }} /> : null}
          {showLeaveEnd ? <DateTimePicker value={leaveEnd ? parseISOLocal(leaveEnd) : new Date()} mode="date" display="default" onChange={(_, d) => { setShowLeaveEnd(false); if (d) setLeaveEnd(localDateISO(d)); }} /> : null}
          {leaveStart && leaveEnd ? (() => {
            const s = parseISOLocal(leaveStart), e = parseISOLocal(leaveEnd);
            const days = Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
            const overlaps = myLeave.some((l) => l.status !== 'rejected' && !(e < parseISOLocal(l.startDate) || s > parseISOLocal(l.endDate)));
            const warn = days > 3 && leaveType === 'Sick';
            return (
              <Card style={{ marginTop: theme.space.md, backgroundColor: warn ? theme.colors.warningSoft : theme.colors.surface, borderColor: warn ? theme.colors.warningSoft : theme.colors.border, gap: 4 }}>
                <AppText variant="bodyStrong">{days} working day{days !== 1 ? 's' : ''} · {leaveType}</AppText>
                {warn ? <AppText variant="caption" color={theme.colors.warningStrong}>Sick over 3 days — proof recommended</AppText> : null}
                {overlaps ? <AppText variant="caption" color={theme.colors.warningStrong}>Overlaps an existing request</AppText> : null}
              </Card>
            );
          })() : null}
          <Button label={proofUri ? 'Proof attached ✓' : 'Attach supporting document (optional)'} variant="secondary" icon="attach-outline" onPress={pickProof} style={{ marginTop: theme.space.md }} />
          <Button label="Submit leave request" onPress={submitLeave} loading={busy} style={{ marginTop: theme.space.sm }} />

          <SectionHeader title={`My leave (${myLeave.length})`} />
          {myLeave.length === 0 ? (
            <EmptyState icon="time-outline" title="No leave requests" message="Your submitted leave requests appear here." />
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {myLeave.map((l, i) => (
                <View key={l.id} style={[{ paddingVertical: theme.space.md, gap: 4 }, i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : null]}>
                  <AppText variant="bodyStrong">{l.leaveType}: {l.startDate} → {l.endDate}</AppText>
                  <StatusPill status={l.status} size="sm" />
                  {l.rejectionReason ? <AppText variant="caption" tone="muted">{l.rejectionReason}</AppText> : null}
                </View>
              ))}
            </Card>
          )}
            </>
          ) : null}
        </>
      )}

      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
