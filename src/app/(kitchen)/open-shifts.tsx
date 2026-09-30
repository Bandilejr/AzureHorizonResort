// (kitchen) UC44 — publish open shifts; claims arrive live via listener.
// REMEDIATED Phase C (§25): full publish form (role, skill, urgency, date,
// time, department) → REVIEW → CONFIRM → publish; board rows tappable →
// shift detail (incl. claimant).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, TextInput, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenOpenShifts, createOpenShiftMobile } from '@/services/increment2-services';
import type { OpenShift } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

export default function KitchenOpenShiftsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const [shifts, setShifts] = useState<OpenShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [form, setForm] = useState({ department: 'Food & Beverage', date: '', start: '08:00', end: '17:00', role: '', skill: '', urgent: false });
  const [formError, setFormError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState<OpenShift | null>(null);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => listenOpenShifts((list) => { setShifts(list); setLoading(false); },
    false, (e) => { setLoadError(e.message); setLoading(false); }), [retryKey]);

  const validForm = (): string => {
    if (!form.department.trim()) return 'Department is required.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return 'Date must be YYYY-MM-DD.';
    if (!/^\d{2}:\d{2}$/.test(form.start) || !/^\d{2}:\d{2}$/.test(form.end)) return 'Times must be HH:mm.';
    if (form.end <= form.start) return 'End time must be after start.';
    if (!form.role.trim()) return 'Role is required.';
    return '';
  };

  const publish = async () => {
    setBusy(true);
    try {
      await createOpenShiftMobile({
        department: form.department, date: form.date, startTime: form.start, endTime: form.end,
        role: form.role, requiredSkill: form.skill || undefined,
        urgency: form.urgent ? 'urgent' : 'normal',
      });
      showAlert({ title: 'Open shift published', message: 'Eligible staff can now claim it.', type: 'success' });
      setForm({ department: 'Food & Beverage', date: '', start: '08:00', end: '17:00', role: '', skill: '', urgent: false });
      setConfirming(false);
    } catch (e: any) {
      showAlert({ title: 'Publish failed', message: e?.message || 'Could not publish.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 60 }} />;

  const openCount = shifts.filter((s) => s.status === 'open').length;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(kitchen)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Open Shifts</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      <Text style={styles.section}>Publish surge shift</Text>
      <TextInput style={styles.input} value={form.department} onChangeText={(v) => setForm((p) => ({ ...p, department: v }))} placeholder="Department" placeholderTextColor={theme.colors.textMuted} />
      <TextInput style={styles.input} value={form.date} onChangeText={(v) => setForm((p) => ({ ...p, date: v }))} placeholder="Date YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted} />
      <View style={styles.halfRow}>
        <TextInput style={[styles.input, styles.half]} value={form.start} onChangeText={(v) => setForm((p) => ({ ...p, start: v }))} placeholder="Start HH:mm" placeholderTextColor={theme.colors.textMuted} />
        <TextInput style={[styles.input, styles.half]} value={form.end} onChangeText={(v) => setForm((p) => ({ ...p, end: v }))} placeholder="End HH:mm" placeholderTextColor={theme.colors.textMuted} />
      </View>
      <TextInput style={styles.input} value={form.role} onChangeText={(v) => setForm((p) => ({ ...p, role: v }))} placeholder="Role" placeholderTextColor={theme.colors.textMuted} />
      <TextInput style={styles.input} value={form.skill} onChangeText={(v) => setForm((p) => ({ ...p, skill: v }))} placeholder="Required skill (optional)" placeholderTextColor={theme.colors.textMuted} />
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.colors.text }]}>Urgent (surge priority)</Text>
        <Switch value={form.urgent} onValueChange={(v) => setForm((p) => ({ ...p, urgent: v }))} />
      </View>
      {!!formError && <Text style={styles.error}>{formError}</Text>}
      <ModalButton label="Review shift" onPress={() => { const err = validForm(); setFormError(err); if (!err) setConfirming(true); }} />

      <DetailModal visible={confirming} title="Confirm publication?" onClose={() => setConfirming(false)}>
        <ConfirmBlock
          title="Publish this open shift?"
          rows={[
            ['Shift', `${form.date} ${form.start}–${form.end}`],
            ['Role', `${form.role}${form.skill ? ` (${form.skill})` : ''}`],
            ['Department', form.department],
            ['Priority', form.urgent ? 'Urgent' : 'Normal'],
            ['Effect', 'Visible to all staff to claim immediately'],
          ]}
          confirmLabel="Confirm publication" onConfirm={publish} onCancel={() => setConfirming(false)} busy={busy}
        />
      </DetailModal>

      <Text style={styles.section}>Board — {openCount} open</Text>
      {shifts.length === 0 && <Text style={styles.muted}>No shifts published yet.</Text>}
      {shifts.map((s) => (
        <TouchableOpacity key={s.id} style={styles.card} onPress={() => setSelected(s)} activeOpacity={0.7}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{s.date} {s.startTime}–{s.endTime} · {s.role}</Text>
            <StatusBadge status={s.status} />
          </View>
          <Text style={styles.muted}>{s.department} · {s.hours}h{s.claimedBy ? ` · claimed` : ''}</Text>
          <Text style={styles.review}>Tap to inspect ›</Text>
        </TouchableOpacity>
      ))}

      <DetailModal visible={selected !== null} title={selected ? `${selected.date} · ${selected.role}` : ''} onClose={() => setSelected(null)}>
        {selected && (
          <View>
            <StatusBadge status={selected.status} />
            <KV label="Time" value={`${selected.startTime}–${selected.endTime} (${selected.hours}h)`} />
            <KV label="Department" value={selected.department} />
            <KV label="Required skill" value={selected.requiredSkill || 'None'} />
            <KV label="Urgency" value={selected.urgency || 'normal'} />
            <KV label="Claimed by" value={selected.claimedBy || '—'} />
          </View>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 14 },
  error: { color: theme.colors.error || '#dc2626', fontSize: 12, marginBottom: 6 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: theme.colors.text, fontWeight: '700', flex: 1 },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
});