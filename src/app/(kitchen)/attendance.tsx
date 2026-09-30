// (kitchen) UC45 — Attendance ledger. Layer 11: token-based presentation only.
// Service calls and payloads unchanged (reviewAttendanceExceptionMobile /
// createVerifiedAttendanceException).
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenTodaysPunches } from '@/services/attendance';
import type { PunchRecord } from '@/services/attendance';
import {
  listenShiftRosters, listenAttendanceExceptions, reviewAttendanceExceptionMobile,
  createVerifiedAttendanceException, deriveAttendanceExceptions,
} from '@/services/increment2-services';
import type { ShiftRoster, AttendanceException } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { useStaffNames, staffNameOf } from '@/hooks/use-staff-names';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { Field } from '@/components/ui/inputs';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { DetailScreen } from '@/components/ui/detail-screen';
import { formatStatus } from '@/utils/status-labels';
import { usePermissions } from '@/context/PermissionsContext';

type Flagged = Omit<AttendanceException, 'id' | 'createdAt'> & { id: string };

export default function KitchenAttendanceScreen() {
  const theme = useAppTheme();
  const [punches, setPunches] = useState<PunchRecord[]>([]);
  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [verified, setVerified] = useState<AttendanceException[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<Flagged | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const staffNames = useStaffNames();
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });
  const { hasPermission } = usePermissions();

  useEffect(() => {
    setLoadError('');
    setLoading(true);
    const onErr = (e: Error) => { setLoadError(e.message); setLoading(false); };
    const u1 = listenTodaysPunches((list) => { setPunches(list); setLoading(false); }, onErr);
    const u2 = listenShiftRosters(setRosters, undefined, onErr);
    const u3 = listenAttendanceExceptions(setVerified, onErr);
    return () => { u1(); u2(); u3(); };
  }, [retryKey]);

  const verifiedKeys = new Set(verified.map((v) => `${v.staffId}|${v.clockInAt || ''}`));
  const derived: Flagged[] = deriveAttendanceExceptions({
    punches: punches.map((p) => ({ staffUid: p.staffUid, staffName: p.staffName, punchType: p.punchType, isoTime: p.isoTime, withinRadius: p.withinRadius, id: p.id })),
    rosters,
  })
    .filter((d) => !verifiedKeys.has(`${d.staffId}|${d.clockInAt || ''}`))
    .map((d) => {
      const match = verified.find((v) => v.staffId === d.staffId && v.clockInAt === d.clockInAt);
      return { ...d, id: match?.id || '' };
    });

  const openFlag = (d: Flagged) => {
    setSelected(d);
    setExistingId(d.id || null);
    setConfirming(false);
    setHours(d.hoursWorked != null ? String(d.hoursWorked) : '');
    setReason('');
  };

  const save = async () => {
    if (!selected) return;
    const hrs = hours.trim() === '' ? undefined : Number(hours);
    if (hrs !== undefined && !(hrs >= 0 && hrs <= 24)) { showAlert({ title: 'Invalid hours', message: 'Verified hours must be between 0 and 24.', type: 'error' }); return; }
    if (!reason.trim()) { showAlert({ title: 'Reason required', message: 'Record an adjustment reason.', type: 'error' }); return; }
    setBusy(true);
    try {
      if (existingId) {
        await reviewAttendanceExceptionMobile({ exceptionDocId: existingId, adjustedHours: hrs, reason });
      } else {
        const { id: _drop, ...seed } = selected;
        void _drop;
        await createVerifiedAttendanceException({ seed, hoursWorked: hrs, reason });
      }
      setSelected(null); setHours(''); setReason('');
      showAlert({ title: 'Attendance verified', message: 'Verified hours recorded with audit trail.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Save failed', message: e?.message || 'Could not save.', type: 'error' });
    } finally { setBusy(false); }
  };

  const staffPunches = (uid: string) => punches.filter((p) => p.staffUid === uid).sort((a, b) => a.isoTime.localeCompare(b.isoTime));
  const rosterShift = (uid: string) => rosters.flatMap((r) => r.shifts).find((s) => s.staffId === uid) || null;

  if (!hasPermission('attendance_review')) {
    return (
      <Screen>
        <PageHeader title="Attendance" showBack fallback="/(kitchen)/dashboard" />
        <EmptyState icon="lock-closed-outline" title="Restricted" message="Attendance verification is restricted to managers." />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <PageHeader title={`Attendance${derived.length ? ` (${derived.length} flagged)` : ''}`} subtitle="Review clock exceptions" showBack fallback="/(kitchen)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      {loading ? (
        <ListSkeleton rows={3} />
      ) : loadError && derived.length === 0 ? (
        <ErrorState title="Couldn't load attendance" message="Attendance data is unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : derived.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title="No flagged attendance" message="Exceptions from clock data appear here for review." />
      ) : (
        <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
          {derived.map((d, i) => (
            <View key={`${d.staffId}-${i}`} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
              <ListRow
                title={staffNameOf(staffNames, d.staffId)}
                subtitle={`In: ${d.clockInAt ? new Date(d.clockInAt).toLocaleString() : '—'} · Out: ${d.clockOutAt ? new Date(d.clockOutAt).toLocaleString() : '—'} · ${d.hoursWorked ?? '—'}h`}
                status={<StatusPill status={d.exceptionType} size="sm" />}
                onPress={() => openFlag(d)}
              />
            </View>
          ))}
        </Card>
      )}

      <SectionHeader title={`Verified (${verified.length})`} />
      {verified.length === 0 ? (
        <AppText variant="body" tone="muted">No verified exceptions yet.</AppText>
      ) : (
        <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
          {verified.map((v, i) => (
            <View key={v.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
              <ListRow
                title={`${staffNameOf(staffNames, v.staffId)} · ${v.hoursWorked ?? '—'}h`}
                subtitle={`by ${staffNameOf(staffNames, v.adjustedBy)} · ${v.adjustmentReason || '—'}`}
                status={<StatusPill status={v.exceptionType} size="sm" />}
                showChevron={false}
              />
            </View>
          ))}
        </Card>
      )}

      <DetailScreen
        visible={selected !== null}
        title={`Verify — ${selected ? staffNameOf(staffNames, selected.staffId) : ''}`}
        subtitle={selected?.exceptionType ? formatStatus(selected.exceptionType) : undefined}
        status={selected ? <StatusPill status={selected.exceptionType} /> : undefined}
        onClose={() => setSelected(null)}
      >
        {selected && !confirming ? (
          <View>
            <StatusBadge status={selected.exceptionType} />
            <SectionTitle>STAFF & SHIFT</SectionTitle>
            <KV label="Staff" value={staffNameOf(staffNames, selected.staffId)} />
            {(() => {
              const rs = rosterShift(selected.staffId);
              return <KV label="Scheduled" value={rs ? `${rs.date} ${rs.startTime}–${rs.endTime} · ${rs.role}` : 'No roster shift found'} />;
            })()}
            <SectionTitle>PUNCH EVIDENCE</SectionTitle>
            {staffPunches(selected.staffId).map((p) => (
              <View key={p.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 8 }}>
                <AppText variant="bodyStrong">{p.punchType === 'in' ? 'Clock in' : 'Clock out'} · {new Date(p.isoTime).toLocaleString()}</AppText>
                <AppText variant="caption" tone="muted">
                  {p.withinRadius === false ? 'OFF-SITE' : 'On-site'} · {p.distanceM != null ? `${p.distanceM}m from post` : 'no GPS fix'}
                </AppText>
              </View>
            ))}
            <SectionTitle>DERIVED</SectionTitle>
            <KV label="Exception" value={selected.exceptionType} />
            <KV label="Computed hours" value={selected.hoursWorked != null ? String(selected.hoursWorked) : '—'} />
            <SectionTitle>DECISION</SectionTitle>
            <View style={{ gap: theme.space.sm }}>
              <Field label="Verified hours (0–24)" value={hours} onChangeText={setHours} keyboardType="numeric" placeholder="e.g. 7.5" />
              <Field label="Adjustment reason *" value={reason} onChangeText={setReason} multiline placeholder="Why are these hours being adjusted?" />
            </View>
            <View style={{ marginTop: theme.space.md }}>
              <ModalButton label="Review verification" onPress={() => setConfirming(true)} />
            </View>
          </View>
        ) : null}
        {selected && confirming ? (
          <ConfirmBlock
            title="Verify these hours?"
            rows={[
              ['Staff', staffNameOf(staffNames, selected.staffId)],
              ['Exception', selected.exceptionType],
              ['Verified hours', hours.trim() === '' ? String(selected.hoursWorked ?? '—') : hours],
              ['Reason', reason || '(none — required)'],
              ['Effect', 'Record locks as verified with full audit trail'],
            ]}
            confirmLabel="Confirm verification" onConfirm={save} onCancel={() => setConfirming(false)} busy={busy}
          />
        ) : null}
      </DetailScreen>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
