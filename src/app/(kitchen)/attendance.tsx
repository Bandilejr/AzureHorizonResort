// (kitchen) UC45 — Attendance ledger.
// REMEDIATED Phase C (§26): flagged card → EVIDENCE DETAIL (staff, scheduled
// shift, actual punches with GPS distance + site badges, duration, exception
// reason, audit history) → hours + reason → CONFIRM → verify (service-owned,
// audited). No direct Firestore writes from UI.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenTodaysPunches } from '@/services/attendance';
import type { PunchRecord } from '@/services/attendance';
import {
  listenShiftRosters, listenAttendanceExceptions, reviewAttendanceExceptionMobile,
  createVerifiedAttendanceException, deriveAttendanceExceptions,
} from '@/services/increment2-services';
import type { ShiftRoster, AttendanceException } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { useStaffNames, staffNameOf } from '@/hooks/use-staff-names';
import { goBack } from '@/utils/navigation';
import { usePermissions } from '@/context/PermissionsContext';
import { useRouter } from 'expo-router';

type Flagged = Omit<AttendanceException, 'id' | 'createdAt'> & { id: string };

export default function KitchenAttendanceScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
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
  // Phase 2 (§3.A): human-readable employee names — never raw UIDs in the UI.
  const staffNames = useStaffNames();
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });
  const { hasPermission } = usePermissions();

  useEffect(() => {
    setLoadError('');
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
    if (hrs !== undefined && !(hrs >= 0 && hrs <= 24)) {
      showAlert({ title: 'Invalid hours', message: 'Verified hours must be between 0 and 24.', type: 'error' });
      return;
    }
    if (!reason.trim()) {
      showAlert({ title: 'Reason required', message: 'Record an adjustment reason.', type: 'error' });
      return;
    }
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
    } finally {
      setBusy(false);
    }
  };

  const staffPunches = (uid: string) =>
    punches.filter((p) => p.staffUid === uid).sort((a, b) => a.isoTime.localeCompare(b.isoTime));
  const rosterShift = (uid: string) =>
    rosters.flatMap((r) => r.shifts).find((s) => s.staffId === uid) || null;

  if (loading) return <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 60 }} />;

  // Phase 1 (§20): capability gate — only attendance reviewers may verify.
  if (!hasPermission('attendance_review')) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', gap: 8 }]}>
        <Ionicons name="lock-closed" size={36} color={theme.colors.textMuted} />
        <Text style={styles.muted}>Attendance verification is restricted to managers.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(kitchen)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Attendance ({derived.length} flagged)</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      {derived.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name={"checkmark-circle-outline" as any} size={40} color={theme.colors.success} />
          <Text style={styles.muted}>No flagged attendance. Exceptions from clock data appear here for review.</Text>
        </View>
      )}
      {derived.map((d, i) => (
        <TouchableOpacity key={`${d.staffId}-${i}`} style={styles.card} onPress={() => openFlag(d)} activeOpacity={0.7}>
          <Text style={styles.cardTitle}>{staffNameOf(staffNames, d.staffId)} · {d.exceptionType}</Text>
          <Text style={styles.muted}>In: {d.clockInAt ? new Date(d.clockInAt).toLocaleString() : '—'} · Out: {d.clockOutAt ? new Date(d.clockOutAt).toLocaleString() : '—'} · {d.hoursWorked ?? '—'}h</Text>
          <Text style={styles.review}>Tap to inspect evidence ›</Text>
        </TouchableOpacity>
      ))}
      <Text style={styles.section}>Verified ({verified.length})</Text>
      {verified.map((v) => (
        <View key={v.id} style={styles.card}>
          <Text style={styles.cardTitle}>{staffNameOf(staffNames, v.staffId)} · {v.exceptionType} · {v.hoursWorked ?? '—'}h</Text>
          <Text style={styles.muted}>by {staffNameOf(staffNames, v.adjustedBy)} · {v.adjustmentReason}</Text>
        </View>
      ))}

      <DetailModal visible={selected !== null} title={`Verify — ${selected ? staffNameOf(staffNames, selected.staffId) : ''}`} onClose={() => setSelected(null)}>
        {selected && !confirming && (
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
              <View key={p.id} style={styles.punch}>
                <Text style={styles.cardTitle}>{p.punchType === 'in' ? 'Clock in' : 'Clock out'} · {new Date(p.isoTime).toLocaleString()}</Text>
                <Text style={styles.muted}>
                  {p.withinRadius === false ? 'OFF-SITE' : 'On-site'} · {p.distanceM != null ? `${p.distanceM}m from post` : 'no GPS fix'}
                </Text>
              </View>
            ))}
            <SectionTitle>DERIVED</SectionTitle>
            <KV label="Exception" value={selected.exceptionType} />
            <KV label="Computed hours" value={selected.hoursWorked != null ? String(selected.hoursWorked) : '—'} />
            <SectionTitle>DECISION</SectionTitle>
            <TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} value={hours} onChangeText={setHours} placeholder="Verified hours (0–24)" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textMuted} />
            <TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} value={reason} onChangeText={setReason} placeholder="Adjustment reason *" placeholderTextColor={theme.colors.textMuted} multiline />
            <View style={{ marginTop: 8 }}>
              <ModalButton label="Review verification" onPress={() => setConfirming(true)} />
            </View>
          </View>
        )}
        {selected && confirming && (
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
        )}
      </DetailModal>
      <View style={{ height: 40 }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  section: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTitle: { color: theme.colors.text, fontWeight: '700' },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
  empty: { alignItems: 'center', padding: 24, gap: 8 },
  punch: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 8 },
});