// (kitchen) UC38 — Logistics.
// REMEDIATED Phase C (§22): card → COLLECTION DETAIL (donation, window, bay,
// courier, facility, QR status/expiry, collection state) → schedule form
// (always editable — reschedule supported) → CONFIRM → signed QR result.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { listenDonationBatches, scheduleDonationCollectionMobile } from '@/services/increment2-services';
import type { DonationBatch } from '@/types/increment2';
import { todayISO } from '@/utils/dates';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

type Step = 'detail' | 'confirm' | 'done';

export default function KitchenLogisticsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const [items, setItems] = useState<DonationBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<DonationBatch | null>(null);
  const [step, setStep] = useState<Step>('detail');
  const [form, setForm] = useState({ date: '', start: '', end: '', bay: 'Bay A', courier: '' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => listenDonationBatches((list) => {
    setItems(list.filter((b) => b.status === 'claimed_ready_for_scheduling' || b.status === 'collection_scheduled'));
    setLoading(false);
  }, undefined, (e) => { setLoadError(e.message); setLoading(false); }), [retryKey]);

  const openBatch = (b: DonationBatch) => {
    setSelected(b); setStep('detail'); setQr(b.collectionQr || null); setFormError('');
    setForm({
      date: b.pickupDate || todayISO(),
      start: b.pickupWindowStart ? b.pickupWindowStart.slice(0, 16) : '',
      end: b.pickupWindowEnd ? b.pickupWindowEnd.slice(0, 16) : '',
      bay: b.loadingBay || 'Bay A', courier: b.courierName || '',
    });
  };

  const validForm = (): string => {
    if (!form.date) return 'Pickup date is required.';
    const s = new Date(form.start).getTime();
    const e = new Date(form.end).getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) return 'Window start/end must be valid dates (YYYY-MM-DDTHH:mm).';
    if (e <= s) return 'Window end must be after start.';
    if (!form.bay.trim()) return 'Loading bay is required.';
    return '';
  };

  const schedule = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const code = await scheduleDonationCollectionMobile({
        batchDocId: selected.id, pickupDate: form.date,
        windowStart: new Date(form.start).toISOString(), windowEnd: new Date(form.end).toISOString(),
        loadingBay: form.bay, courierName: form.courier,
      });
      setQr(code); setStep('done');
    } catch (e: any) {
      showAlert({ title: 'Scheduling failed', message: e?.message || 'Could not schedule.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 60 }} />;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(kitchen)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Logistics ({items.length})</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      {items.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name={"truck-outline" as any} size={40} color={theme.colors.textMuted} />
          <Text style={styles.muted}>Nothing awaiting scheduling. Claimed donations appear here for collection planning.</Text>
        </View>
      )}
      {items.map((b) => (
        <TouchableOpacity key={b.id} style={styles.card} onPress={() => openBatch(b)} activeOpacity={0.7}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{b.batchId}</Text>
            <StatusBadge status={b.status} />
          </View>
          <Text style={styles.muted}>{b.itemName} → {b.receivingFacility || '—'}</Text>
          {b.status === 'collection_scheduled' && (
            <Text style={styles.muted}>{b.pickupWindowStart ? new Date(b.pickupWindowStart).toLocaleString() : ''} → {b.pickupWindowEnd ? new Date(b.pickupWindowEnd).toLocaleString() : ''} · {b.loadingBay}</Text>
          )}
          <Text style={styles.review}>Tap to inspect ›</Text>
        </TouchableOpacity>
      ))}

      <DetailModal visible={selected !== null} title={selected?.batchId || ''} onClose={() => { setSelected(null); setQr(null); }}>
        {selected && step === 'detail' && (
          <View>
            <StatusBadge status={selected.status} />
            <SectionTitle>DONATION</SectionTitle>
            <KV label="Item" value={`${selected.itemName} · ${selected.portionCount} portions · ${selected.estimatedWeightKg}kg`} />
            <KV label="Allergens" value={(selected.allergens || []).join(', ') || 'none'} />
            <KV label="Use by" value={selected.expiryAt ? new Date(selected.expiryAt).toLocaleString() : '—'} />
            <KV label="NPO" value={selected.allocatedNpoId || '—'} />
            <KV label="Facility" value={selected.receivingFacility || '—'} />
            <SectionTitle>CURRENT SCHEDULE</SectionTitle>
            <KV label="Window" value={selected.pickupWindowStart ? `${new Date(selected.pickupWindowStart).toLocaleString()} → ${selected.pickupWindowEnd ? new Date(selected.pickupWindowEnd).toLocaleString() : '—'}` : 'Not scheduled'} />
            <KV label="Bay" value={selected.loadingBay || '—'} />
            <KV label="Courier" value={selected.courierName || '—'} />
            <KV label="QR pass" value={selected.collectionQr ? (selected.qrConsumed ? 'Used' : 'Issued, unused') : 'None'} />
            <SectionTitle>{selected.collectionQr ? 'RESCHEDULE (rotates the pass)' : 'SCHEDULE PICKUP'}</SectionTitle>
            <TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} value={form.date} onChangeText={(v) => setForm((p) => ({ ...p, date: v }))} placeholder="Pickup date YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted} />
            <TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} value={form.start} onChangeText={(v) => setForm((p) => ({ ...p, start: v }))} placeholder="Window start YYYY-MM-DDTHH:mm" placeholderTextColor={theme.colors.textMuted} />
            <TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} value={form.end} onChangeText={(v) => setForm((p) => ({ ...p, end: v }))} placeholder="Window end YYYY-MM-DDTHH:mm" placeholderTextColor={theme.colors.textMuted} />
            <TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} value={form.bay} onChangeText={(v) => setForm((p) => ({ ...p, bay: v }))} placeholder="Loading bay" placeholderTextColor={theme.colors.textMuted} />
            <TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} value={form.courier} onChangeText={(v) => setForm((p) => ({ ...p, courier: v }))} placeholder="Courier (optional)" placeholderTextColor={theme.colors.textMuted} />
            {!!formError && <Text style={styles.error}>{formError}</Text>}
            <View style={{ marginTop: 8 }}>
              <ModalButton
                label={selected.collectionQr ? 'Review reschedule' : 'Review schedule'}
                onPress={() => { const err = validForm(); setFormError(err); if (!err) setStep('confirm'); }}
              />
            </View>
          </View>
        )}
        {selected && step === 'confirm' && (
          <ConfirmBlock
            title={selected.collectionQr ? 'Confirm reschedule?' : 'Confirm schedule?'}
            rows={[
              ['Batch', `${selected.batchId} — ${selected.itemName}`],
              ['Window', `${form.start} → ${form.end}`],
              ['Bay', form.bay], ['Courier', form.courier || '—'],
              ['Effect', 'Signed single-use QR pass is (re-)issued; old pass invalidates'],
            ]}
            warning={selected.collectionQr ? 'Rescheduling rotates the QR nonce — the previous pass stops working.' : undefined}
            confirmLabel={selected.collectionQr ? 'Confirm reschedule' : 'Generate QR pass'}
            onConfirm={schedule} onCancel={() => setStep('detail')} busy={busy}
          />
        )}
        {step === 'done' && !!qr && (
          <View style={styles.qrBox}>
            <Text style={[styles.title, { marginBottom: 8 }]}>Collection pass ready</Text>
            <QRCode value={qr} size={220} />
            <Text style={styles.muted}>Single-use pass for the courier. Show this at {form.bay}.</Text>
            <View style={{ marginTop: 12, width: '100%' }}>
              <ModalButton label="Done" onPress={() => { setSelected(null); setQr(null); }} />
            </View>
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
  card: { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: theme.colors.text, fontWeight: '700', flex: 1 },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
  empty: { alignItems: 'center', padding: 24, gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 8 },
  error: { color: theme.colors.error || '#dc2626', fontSize: 12, marginTop: 6 },
  qrBox: { alignItems: 'center', marginVertical: 12 },
});