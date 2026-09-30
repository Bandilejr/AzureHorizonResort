// (kitchen) UC42 — Roster builder.
// REMEDIATED Phase C (§23): week → department → build → inspect shifts →
// conflicts inline → validate → review result → PUBLISH → CONFIRM → locked.
// Publish re-validates live server-side; week+department upserts (no dupes).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenAllAvailability, listenLeaveRequests, listenShiftRosters, saveRosterMobile, publishRosterMobile } from '@/services/increment2-services';
import { db } from '@/services/firebase-services';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { todayISO } from '@/utils/dates';
import { usePermissions } from '@/context/PermissionsContext';
import type { RosterShift, ShiftRoster, StaffAvailability, LeaveRequest } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

export default function KitchenRosterBuilderScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const [weekStart, setWeekStart] = useState(() => todayISO());
  const [department, setDepartment] = useState('Food & Beverage');
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [draft, setDraft] = useState({ staffId: '', date: '', start: '08:00', end: '17:00', role: '', skill: '' });
  const [availability, setAvailability] = useState<StaffAvailability[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<ShiftRoster | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });
  const { hasPermission } = usePermissions();

  useEffect(() => {
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenAllAvailability(setAvailability, onErr);
    const u2 = listenLeaveRequests(setLeave, undefined, onErr);
    const u3 = listenShiftRosters(setRosters, weekStart, onErr);
    return () => { u1(); u2(); u3(); };
  }, [weekStart, retryKey]);

  // Resolve staff display names for the open roster (uids are cryptic).
  useEffect(() => {
    if (!selected) return;
    const ids = [...new Set((selected.shifts || []).map((s) => s.staffId).filter(Boolean))].slice(0, 10);
    if (ids.length === 0) return;
    getDocs(query(collection(db, 'users'), where('__name__', 'in', ids)))
      .then((snap) => {
        const m: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const v = d.data() as Record<string, unknown>;
          m[d.id] = String(v.displayName || v.name || v.email || d.id);
        });
        setNames(m);
      })
      .catch(() => {});
  }, [selected]);

  const staffName = (uid: string) => names[uid] || uid;

  const addShift = () => {
    if (!draft.staffId.trim() || !draft.date || !draft.role.trim()) {
      showAlert({ title: 'Incomplete shift', message: 'Staff, date and role are required.', type: 'error' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !/^\d{2}:\d{2}$/.test(draft.start) || !/^\d{2}:\d{2}$/.test(draft.end)) {
      showAlert({ title: 'Invalid format', message: 'Use YYYY-MM-DD for dates and HH:mm for times.', type: 'error' });
      return;
    }
    if (draft.start >= draft.end) {
      showAlert({ title: 'Invalid shift', message: 'End time must be after start time.', type: 'error' });
      return;
    }
    const entry: RosterShift = {
      shiftId: `SH-${Date.now().toString(36).toUpperCase()}`,
      staffId: draft.staffId.trim(), date: draft.date,
      startTime: draft.start, endTime: draft.end, role: draft.role.trim(),
    };
    if (draft.skill.trim()) entry.requiredSkill = draft.skill.trim();
    setShifts((p) => [...p, entry]);
    setDraft({ staffId: '', date: '', start: '08:00', end: '17:00', role: '', skill: '' });
  };

  const save = async () => {
    if (shifts.length === 0) {
      showAlert({ title: 'Nothing to save', message: 'Add at least one shift first.', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const { warnings: w } = await saveRosterMobile({
        weekStart, department, shifts, availability,
        approvedLeave: leave.filter((l) => l.status === 'approved'),
      });
      setWarnings(w);
      showAlert({
        title: w.length ? 'Draft saved with warnings' : 'Roster validated',
        message: w.length ? `${w.length} conflict(s) must be resolved before publishing.` : 'No conflicts — ready to publish.',
        type: w.length ? 'warning' : 'success',
      });
    } catch (e: any) {
      showAlert({ title: 'Save failed', message: e?.message || 'Could not save.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await publishRosterMobile(selected.id);
      setSelected(null); setConfirming(false);
      showAlert({ title: 'Roster published', message: 'Assigned staff notified. Roster locked.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Publish blocked', message: e?.message || 'Could not publish.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const knownStaff = [...new Map(availability.map((a) => [a.staffId, a.staffName || a.staffId])).entries()];

  // Phase 1 (§20): capability gate — only roster managers may build/publish.
  if (!hasPermission('roster_manage')) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', gap: 8 }]}>
        <Ionicons name="lock-closed" size={36} color={theme.colors.textMuted} />
        <Text style={styles.muted}>Roster management is restricted to kitchen managers.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(kitchen)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Roster Builder</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      <TextInput style={styles.input} value={weekStart} onChangeText={setWeekStart} placeholder="Week start YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted} />
      <TextInput style={styles.input} value={department} onChangeText={setDepartment} placeholder="Department" placeholderTextColor={theme.colors.textMuted} />
      <Text style={styles.section}>Add shift</Text>
      {knownStaff.length > 0 && (
        <View style={styles.chips}>
          {knownStaff.slice(0, 8).map(([uid, name]) => (
            <TouchableOpacity key={uid} style={[styles.chip, draft.staffId === uid && styles.chipOn]} onPress={() => setDraft((p) => ({ ...p, staffId: uid }))}>
              <Text style={[styles.chipText, draft.staffId === uid && styles.chipTextOn]}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TextInput style={styles.input} value={draft.staffId} onChangeText={(v) => setDraft((p) => ({ ...p, staffId: v }))} placeholder="Staff ID (uid)" placeholderTextColor={theme.colors.textMuted} />
      <TextInput style={styles.input} value={draft.date} onChangeText={(v) => setDraft((p) => ({ ...p, date: v }))} placeholder="Date YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted} />
      <View style={styles.halfRow}>
        <TextInput style={[styles.input, styles.half]} value={draft.start} onChangeText={(v) => setDraft((p) => ({ ...p, start: v }))} placeholder="Start HH:mm" placeholderTextColor={theme.colors.textMuted} />
        <TextInput style={[styles.input, styles.half]} value={draft.end} onChangeText={(v) => setDraft((p) => ({ ...p, end: v }))} placeholder="End HH:mm" placeholderTextColor={theme.colors.textMuted} />
      </View>
      <TextInput style={styles.input} value={draft.role} onChangeText={(v) => setDraft((p) => ({ ...p, role: v }))} placeholder="Role (e.g. chef)" placeholderTextColor={theme.colors.textMuted} />
      <TextInput style={styles.input} value={draft.skill} onChangeText={(v) => setDraft((p) => ({ ...p, skill: v }))} placeholder="Required skill (optional)" placeholderTextColor={theme.colors.textMuted} />
      <TouchableOpacity style={styles.secondary} onPress={addShift}><Text style={styles.secondaryText}>Add shift ({shifts.length})</Text></TouchableOpacity>
      {shifts.map((s) => (
        <View key={s.shiftId} style={styles.row}>
          <Text style={styles.cardTitle}>{s.date} {s.startTime}–{s.endTime} · {s.staffId} · {s.role}{s.requiredSkill ? ` · ${s.requiredSkill}` : ''}</Text>
          <TouchableOpacity onPress={() => setShifts((p) => p.filter((x) => x.shiftId !== s.shiftId))}><Ionicons name="trash-outline" size={20} color={theme.colors.error} /></TouchableOpacity>
        </View>
      ))}
      {warnings.length > 0 && (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Resolve before publishing</Text>
          {warnings.map((w, i) => <Text key={i} style={styles.warn}>• {w}</Text>)}
        </View>
      )}
      {busy ? <ActivityIndicator color={theme.colors.primary} /> : (
        <TouchableOpacity style={styles.button} onPress={save}><Text style={styles.buttonText}>Validate & save</Text></TouchableOpacity>
      )}
      <Text style={styles.section}>Week rosters ({rosters.length})</Text>
      {rosters.length === 0 && <Text style={styles.muted}>No rosters saved for this week yet.</Text>}
      {rosters.map((r) => (
        <TouchableOpacity key={r.id} style={styles.card} onPress={() => { setSelected(r); setConfirming(false); }} activeOpacity={0.7}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{r.rosterId}</Text>
            <StatusBadge status={r.published ? 'published' : r.validationStatus} />
          </View>
          <Text style={styles.muted}>{r.shifts.length} shifts · {r.department}</Text>
          <Text style={styles.review}>Tap to inspect ›</Text>
        </TouchableOpacity>
      ))}

      <DetailModal visible={selected !== null} title={selected?.rosterId || ''} onClose={() => setSelected(null)}>
        {selected && !confirming && (
          <View>
            <StatusBadge status={selected.published ? 'published' : selected.validationStatus} />
            <KV label="Week" value={selected.weekStart} />
            <KV label="Department" value={selected.department} />
            {!!selected.publishedBy && <KV label="Published by" value={`${selected.publishedBy}${selected.publishedAt ? ` · ${new Date(selected.publishedAt).toLocaleString()}` : ''}`} />}
            <SectionTitle>SHIFTS ({selected.shifts.length})</SectionTitle>
            {(selected.shifts || []).map((s) => (
              <View key={s.shiftId} style={styles.shiftRow}>
                <Text style={styles.cardTitle}>{s.date} {s.startTime}–{s.endTime}</Text>
                <Text style={styles.muted}>{staffName(s.staffId)} · {s.role}{s.requiredSkill ? ` · ${s.requiredSkill}` : ''} · {s.shiftId}</Text>
              </View>
            ))}
            <SectionTitle>VALIDATION</SectionTitle>
            {(selected.validationWarnings || []).length === 0
              ? <Text style={styles.muted}>No warnings — ready to publish.</Text>
              : (selected.validationWarnings || []).map((w, i) => <Text key={i} style={styles.warn}>• {w}</Text>)}
            {!selected.published && (
              <View style={{ marginTop: 12 }}>
                <ModalButton label="Review publication" onPress={() => setConfirming(true)} />
              </View>
            )}
          </View>
        )}
        {selected && confirming && (
          <ConfirmBlock
            title={`Publish ${selected.rosterId}?`}
            rows={[
              ['Week', selected.weekStart], ['Department', selected.department],
              ['Shifts', String(selected.shifts.length)],
              ['Staff notified', String(new Set(selected.shifts.map((s) => s.staffId)).size)],
              ['Effect', 'Roster locks; staff see it in My Roster'],
            ]}
            warning="Publishing notifies every assigned staff member. Re-validated live before locking."
            confirmLabel="Confirm publication" onConfirm={publish} onCancel={() => setConfirming(false)} busy={busy}
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
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, color: theme.colors.text, marginBottom: 10, backgroundColor: theme.colors.surface },
  halfRow: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  secondary: { borderWidth: 1, borderColor: theme.colors.primary, padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 8 },
  secondaryText: { color: theme.colors.primary, fontWeight: '600' },
  button: { backgroundColor: theme.colors.primary, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 8 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: theme.colors.text, fontWeight: '600', flex: 1 },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
  shiftRow: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 8 },
  warnBox: { borderWidth: 1, borderColor: '#f59e0b', backgroundColor: '#fffbeb', borderRadius: 8, padding: 12, marginTop: 8 },
  warnTitle: { fontWeight: '700', color: '#92400e' },
  warn: { color: '#92400e', fontSize: 12, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '1A' },
  chipText: { fontSize: 12, color: theme.colors.textMuted },
  chipTextOn: { color: theme.colors.primary, fontWeight: '700' },
});