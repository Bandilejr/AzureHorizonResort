// (kitchen) UC38 — Logistics. Layer 8: native date/time pickers replace the
// raw 'YYYY-MM-DDTHH:mm' text inputs. Stored payload is IDENTICAL:
//   pickupDate      = 'YYYY-MM-DD'
//   windowStart/End = localWindowToIso(date, 'HH:mm') === old new Date(`${date}T${time}`).toISOString()
// (proven by scripts/test-datetime-helpers.js). Raw NPO id still hidden.
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import QRCode from 'react-native-qrcode-svg';
import { listenDonationBatches, scheduleDonationCollectionMobile } from '@/services/increment2-services';
import type { DonationBatch } from '@/types/increment2';
import { todayISO, parseISOLocal } from '@/utils/dates';
import { localWindowToIso, isoToStoredTime, storedTimeToDate, storedDateToDate, dateToStored, timeToStored } from '@/utils/datetime-input';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { Field } from '@/components/ui/inputs';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';

type Step = 'detail' | 'confirm' | 'done';
type PickerTarget = 'date' | 'start' | 'end' | null;

export default function KitchenLogisticsScreen() {
  const theme = useAppTheme();
  const [items, setItems] = useState<DonationBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<DonationBatch | null>(null);
  const [step, setStep] = useState<Step>('detail');
  const [form, setForm] = useState({ date: '', startTime: '08:00', endTime: '17:00', bay: 'Bay A', courier: '' });
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => {
    setLoading(true);
    return listenDonationBatches((list) => {
      setItems(list.filter((b) => b.status === 'claimed_ready_for_scheduling' || b.status === 'collection_scheduled'));
      setLoading(false);
    }, undefined, (e) => { setLoadError(e.message); setLoading(false); });
  }, [retryKey]);

  const openBatch = (b: DonationBatch) => {
    setSelected(b); setStep('detail'); setQr(b.collectionQr || null); setFormError('');
    setForm({
      date: b.pickupDate || todayISO(),
      startTime: isoToStoredTime(b.pickupWindowStart) || '08:00',
      endTime: isoToStoredTime(b.pickupWindowEnd) || '17:00',
      bay: b.loadingBay || 'Bay A', courier: b.courierName || '',
    });
  };

  const validForm = (): string => {
    if (!form.date) return 'Pickup date is required.';
    if (form.endTime <= form.startTime) return 'Window end must be after start.';
    if (!form.bay.trim()) return 'Loading bay is required.';
    return '';
  };

  const schedule = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const code = await scheduleDonationCollectionMobile({
        batchDocId: selected.id, pickupDate: form.date,
        windowStart: localWindowToIso(form.date, form.startTime), windowEnd: localWindowToIso(form.date, form.endTime),
        loadingBay: form.bay, courierName: form.courier,
      });
      setQr(code); setStep('done');
    } catch (e: any) {
      showAlert({ title: 'Scheduling failed', message: e?.message || 'Could not schedule.', type: 'error' });
    } finally { setBusy(false); }
  };

  const prettyDate = form.date ? parseISOLocal(form.date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Pick date';

  return (
    <Screen scroll>
      <PageHeader title={`Logistics${items.length ? ` (${items.length})` : ''}`} subtitle="Plan pickups & issue collection passes" showBack fallback="/(kitchen)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      {loading ? (
        <ListSkeleton rows={3} />
      ) : loadError && items.length === 0 ? (
        <ErrorState title="Couldn't load collections" message="Collection planning is unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : items.length === 0 ? (
        <EmptyState icon="bus-outline" title="Nothing awaiting scheduling" message="Claimed donations appear here for collection planning." />
      ) : (
        <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
          {items.map((b, i) => (
            <View key={b.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
              <ListRow
                title={`${b.batchId} — ${b.itemName}`}
                subtitle={
                  b.status === 'collection_scheduled' && b.pickupWindowStart
                    ? `${new Date(b.pickupWindowStart).toLocaleString()} → ${b.pickupWindowEnd ? new Date(b.pickupWindowEnd).toLocaleString() : '—'} · ${b.loadingBay || 'Bay TBC'}`
                    : `${b.receivingFacility || 'NPO partner'} · not scheduled`
                }
                status={<StatusPill status={b.status} size="sm" />}
                onPress={() => openBatch(b)}
              />
            </View>
          ))}
        </Card>
      )}

      <DetailModal visible={selected !== null} title={selected?.batchId || ''} onClose={() => { setSelected(null); setQr(null); setPicker(null); }}>
        {selected && step === 'detail' ? (
          <View>
            <StatusBadge status={selected.status} />
            <SectionTitle>DONATION</SectionTitle>
            <KV label="Item" value={`${selected.itemName} · ${selected.portionCount} portions · ${selected.estimatedWeightKg}kg`} />
            <KV label="Allergens" value={(selected.allergens || []).join(', ') || 'None recorded'} />
            <KV label="Use by" value={selected.expiryAt ? new Date(selected.expiryAt).toLocaleString() : '—'} />
            <KV label="Facility" value={selected.receivingFacility || '—'} />
            <SectionTitle>CURRENT SCHEDULE</SectionTitle>
            <KV label="Window" value={selected.pickupWindowStart ? `${new Date(selected.pickupWindowStart).toLocaleString()} → ${selected.pickupWindowEnd ? new Date(selected.pickupWindowEnd).toLocaleString() : '—'}` : 'Not scheduled'} />
            <KV label="Bay" value={selected.loadingBay || '—'} />
            <KV label="Courier" value={selected.courierName || '—'} />
            <KV label="QR pass" value={selected.collectionQr ? (selected.qrConsumed ? 'Used' : 'Issued, unused') : 'None'} />
            <SectionTitle>{selected.collectionQr ? 'RESCHEDULE (rotates the pass)' : 'SCHEDULE PICKUP'}</SectionTitle>

            <View style={{ gap: theme.space.sm, marginTop: theme.space.sm }}>
              <TouchableOpacity onPress={() => setPicker('date')}>
                <Card padding="md" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AppText variant="label" tone="secondary">Pickup date</AppText>
                  <AppText variant="bodyStrong" tone="primary">{prettyDate}</AppText>
                </Card>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setPicker('start')}>
                  <Card padding="md" style={{ alignItems: 'center' }}>
                    <AppText variant="micro" tone="muted">FROM</AppText>
                    <AppText variant="bodyStrong">{form.startTime}</AppText>
                  </Card>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setPicker('end')}>
                  <Card padding="md" style={{ alignItems: 'center' }}>
                    <AppText variant="micro" tone="muted">TO</AppText>
                    <AppText variant="bodyStrong">{form.endTime}</AppText>
                  </Card>
                </TouchableOpacity>
              </View>
              <AppText variant="caption" tone="secondary" align="center">
                {prettyDate} · {form.startTime} → {form.endTime}
              </AppText>
              <Field label="Loading bay" value={form.bay} onChangeText={(v) => setForm((p) => ({ ...p, bay: v }))} placeholder="Bay A" />
              <Field label="Courier (optional)" value={form.courier} onChangeText={(v) => setForm((p) => ({ ...p, courier: v }))} placeholder="Courier name" />
            </View>

            {picker === 'date' ? (
              <DateTimePicker
                value={storedDateToDate(form.date)}
                mode="date" display="default"
                onChange={(_, d) => { setPicker(null); if (d) setForm((p) => ({ ...p, date: dateToStored(d) })); }}
              />
            ) : null}
            {picker === 'start' ? (
              <DateTimePicker
                value={storedTimeToDate(form.startTime)}
                mode="time" is24Hour display="default"
                onChange={(_, d) => { setPicker(null); if (d) setForm((p) => ({ ...p, startTime: timeToStored(d) })); }}
              />
            ) : null}
            {picker === 'end' ? (
              <DateTimePicker
                value={storedTimeToDate(form.endTime)}
                mode="time" is24Hour display="default"
                onChange={(_, d) => { setPicker(null); if (d) setForm((p) => ({ ...p, endTime: timeToStored(d) })); }}
              />
            ) : null}

            {formError ? <AppText variant="caption" tone="error" style={{ marginTop: theme.space.sm }}>{formError}</AppText> : null}
            <View style={{ marginTop: theme.space.md }}>
              <ModalButton
                label={selected.collectionQr ? 'Review reschedule' : 'Review schedule'}
                onPress={() => { const err = validForm(); setFormError(err); if (!err) setStep('confirm'); }}
              />
            </View>
          </View>
        ) : null}
        {selected && step === 'confirm' ? (
          <ConfirmBlock
            title={selected.collectionQr ? 'Confirm reschedule?' : 'Confirm schedule?'}
            rows={[
              ['Batch', `${selected.batchId} — ${selected.itemName}`],
              ['Window', `${prettyDate} · ${form.startTime} → ${form.endTime}`],
              ['Bay', form.bay], ['Courier', form.courier || '—'],
              ['Effect', 'Signed single-use QR pass is (re-)issued; old pass invalidates'],
            ]}
            warning={selected.collectionQr ? 'Rescheduling rotates the QR nonce — the previous pass stops working.' : undefined}
            confirmLabel={selected.collectionQr ? 'Confirm reschedule' : 'Generate QR pass'}
            onConfirm={schedule} onCancel={() => setStep('detail')} busy={busy}
          />
        ) : null}
        {step === 'done' && qr ? (
          <View style={{ alignItems: 'center', marginVertical: theme.space.md, gap: theme.space.sm }}>
            <AppText variant="title">Collection pass ready</AppText>
            <QRCode value={qr} size={220} />
            <AppText variant="body" tone="muted" align="center">Single-use pass for the courier. Show this at {form.bay}.</AppText>
            <View style={{ marginTop: theme.space.md, width: '100%' }}>
              <ModalButton label="Done" onPress={() => { setSelected(null); setQr(null); }} />
            </View>
          </View>
        ) : null}
      </DetailModal>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
