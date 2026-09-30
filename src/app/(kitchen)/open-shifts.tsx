// (kitchen) UC44 — publish open shifts; claims arrive live via listener.
// Layer 8: native date/time pickers replace text inputs. createOpenShiftMobile
// payload unchanged (date YYYY-MM-DD, startTime/endTime HH:mm). Claimant UID
// hidden from the UI.
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Switch } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { listenOpenShifts, createOpenShiftMobile } from '@/services/increment2-services';
import type { OpenShift } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { dateToStored, timeToStored, storedDateToDate, storedTimeToDate } from '@/utils/datetime-input';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { Field } from '@/components/ui/inputs';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { formatStatus } from '@/utils/status-labels';

type PickerTarget = 'date' | 'start' | 'end' | null;

export default function KitchenOpenShiftsScreen() {
  const theme = useAppTheme();
  const [shifts, setShifts] = useState<OpenShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [form, setForm] = useState({ department: 'Food & Beverage', date: '', startTime: '08:00', endTime: '17:00', role: '', skill: '', urgent: false });
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [formError, setFormError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState<OpenShift | null>(null);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => {
    setLoading(true);
    return listenOpenShifts((list) => { setShifts(list); setLoading(false); }, false, (e) => { setLoadError(e.message); setLoading(false); });
  }, [retryKey]);

  const validForm = (): string => {
    if (!form.department.trim()) return 'Department is required.';
    if (!form.date) return 'Date is required.';
    if (form.endTime <= form.startTime) return 'End time must be after start.';
    if (!form.role.trim()) return 'Role is required.';
    return '';
  };

  const publish = async () => {
    setBusy(true);
    try {
      await createOpenShiftMobile({
        department: form.department, date: form.date, startTime: form.startTime, endTime: form.endTime,
        role: form.role, requiredSkill: form.skill || undefined,
        urgency: form.urgent ? 'urgent' : 'normal',
      });
      showAlert({ title: 'Open shift published', message: 'Eligible staff can now claim it.', type: 'success' });
      setForm({ department: 'Food & Beverage', date: '', startTime: '08:00', endTime: '17:00', role: '', skill: '', urgent: false });
      setConfirming(false);
    } catch (e: any) {
      showAlert({ title: 'Publish failed', message: e?.message || 'Could not publish.', type: 'error' });
    } finally { setBusy(false); }
  };

  const openCount = shifts.filter((s) => s.status === 'open').length;
  const prettyDate = form.date ? storedDateToDate(form.date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Pick date';

  return (
    <Screen scroll>
      <PageHeader title="Open shifts" subtitle="Publish surge shifts" showBack fallback="/(kitchen)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      {loading ? (
        <ListSkeleton rows={3} />
      ) : loadError && shifts.length === 0 ? (
        <ErrorState title="Couldn't load open shifts" message="The open shift board is unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : (
        <>
          <SectionHeader title="Publish surge shift" />
          <View style={{ gap: theme.space.sm }}>
            <Field label="Department" value={form.department} onChangeText={(v) => setForm((p) => ({ ...p, department: v }))} placeholder="Food & Beverage" />
            <TouchableOpacity onPress={() => setPicker('date')}>
              <Card padding="md" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <AppText variant="label" tone="secondary">Date</AppText>
                <AppText variant="bodyStrong" tone="primary">{prettyDate}</AppText>
              </Card>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setPicker('start')}>
                <Card padding="md" style={{ alignItems: 'center' }}>
                  <AppText variant="micro" tone="muted">START</AppText>
                  <AppText variant="bodyStrong">{form.startTime}</AppText>
                </Card>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setPicker('end')}>
                <Card padding="md" style={{ alignItems: 'center' }}>
                  <AppText variant="micro" tone="muted">END</AppText>
                  <AppText variant="bodyStrong">{form.endTime}</AppText>
                </Card>
              </TouchableOpacity>
            </View>
            <Field label="Role" value={form.role} onChangeText={(v) => setForm((p) => ({ ...p, role: v }))} placeholder="e.g. Kitchen hand" />
            <Field label="Required skill (optional)" value={form.skill} onChangeText={(v) => setForm((p) => ({ ...p, skill: v }))} placeholder="e.g. Food safety" />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="body">Urgent (surge priority)</AppText>
              <Switch value={form.urgent} onValueChange={(v) => setForm((p) => ({ ...p, urgent: v }))} />
            </View>
          </View>

          {picker === 'date' ? <DateTimePicker value={storedDateToDate(form.date)} mode="date" display="default" onChange={(_, d) => { setPicker(null); if (d) setForm((p) => ({ ...p, date: dateToStored(d) })); }} /> : null}
          {picker === 'start' ? <DateTimePicker value={storedTimeToDate(form.startTime)} mode="time" is24Hour display="default" onChange={(_, d) => { setPicker(null); if (d) setForm((p) => ({ ...p, startTime: timeToStored(d) })); }} /> : null}
          {picker === 'end' ? <DateTimePicker value={storedTimeToDate(form.endTime)} mode="time" is24Hour display="default" onChange={(_, d) => { setPicker(null); if (d) setForm((p) => ({ ...p, endTime: timeToStored(d) })); }} /> : null}

          {formError ? <AppText variant="caption" tone="error" style={{ marginTop: theme.space.sm }}>{formError}</AppText> : null}
          <View style={{ marginTop: theme.space.md }}>
            <ModalButton label="Review shift" onPress={() => { const err = validForm(); setFormError(err); if (!err) setConfirming(true); }} />
          </View>

          <SectionHeader title={`Board — ${openCount} open`} />
          {shifts.length === 0 ? (
            <EmptyState icon="lock-open-outline" title="No shifts published yet" message="Published surge shifts appear here and are claimable by staff." />
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {shifts.map((s, i) => (
                <View key={s.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={`${s.date} ${s.startTime}–${s.endTime} · ${s.role}`}
                    subtitle={`${s.department} · ${s.hours}h${s.claimedBy ? ' · claimed' : ''}`}
                    status={<StatusPill status={s.status} size="sm" />}
                    onPress={() => setSelected(s)}
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      )}

      <DetailModal visible={confirming} title="Confirm publication?" onClose={() => setConfirming(false)}>
        <ConfirmBlock
          title="Publish this open shift?"
          rows={[
            ['Shift', `${prettyDate} · ${form.startTime}–${form.endTime}`],
            ['Role', `${form.role}${form.skill ? ` (${form.skill})` : ''}`],
            ['Department', form.department],
            ['Priority', form.urgent ? 'Urgent' : 'Normal'],
            ['Effect', 'Visible to all staff to claim immediately'],
          ]}
          confirmLabel="Confirm publication" onConfirm={publish} onCancel={() => setConfirming(false)} busy={busy}
        />
      </DetailModal>

      <DetailModal visible={selected !== null} title={selected ? `${selected.date} · ${selected.role}` : ''} onClose={() => setSelected(null)}>
        {selected ? (
          <View>
            <StatusBadge status={selected.status} />
            <KV label="Time" value={`${selected.startTime}–${selected.endTime} (${selected.hours}h)`} />
            <KV label="Department" value={selected.department} />
            <KV label="Required skill" value={selected.requiredSkill || 'None'} />
            <KV label="Urgency" value={formatStatus(selected.urgency || 'normal')} />
            <KV label="Claimed" value={selected.claimedBy ? 'Yes' : 'Not yet'} />
          </View>
        ) : null}
      </DetailModal>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
