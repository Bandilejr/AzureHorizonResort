// (kitchen) UC36 — Allocation workspace.
// REMEDIATED Phase C (§20): batch card → DONATION DETAIL (item, category,
// portions, weight, allergens, prepared/expiry, safety checks, photo, status,
// lifecycle) → eligible NPOs → tap NPO for detail → review → CONFIRM → execute.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenDonationBatches, listenNpoPartners, rankNpoPartners, allocateDonationBatchMobile, NpoMatchScore } from '@/services/increment2-services';
import type { DonationBatch } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { usePermissions } from '@/context/PermissionsContext';
import { useRouter } from 'expo-router';

type Step = 'detail' | 'confirm';

export default function KitchenAllocationsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const [batches, setBatches] = useState<DonationBatch[]>([]);
  const [npos, setNpos] = useState<Parameters<typeof rankNpoPartners>[1]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<DonationBatch | null>(null);
  const [chosen, setChosen] = useState<NpoMatchScore | null>(null);
  const [step, setStep] = useState<Step>('detail');
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });
  const { hasPermission } = usePermissions();

  useEffect(() => {
    setLoadError('');
    const onErr = (e: Error) => { setLoadError(e.message); setLoading(false); };
    const u1 = listenDonationBatches((list) => {
      setBatches(list.filter((b) => b.status === 'safety_verified_unassigned'));
      setLoading(false);
    }, 'safety_verified_unassigned', onErr);
    const u2 = listenNpoPartners(setNpos, onErr);
    return () => { u1(); u2(); };
  }, [retryKey]);

  const ranked = selected ? rankNpoPartners(selected, npos) : [];

  const openBatch = (b: DonationBatch) => { setSelected(b); setChosen(null); setStep('detail'); };

  const allocate = async () => {
    if (!selected || !chosen) return;
    setBusy(true);
    try {
      await allocateDonationBatchMobile({ batchDocId: selected.id, npoId: chosen.npo.npoId });
      setSelected(null); setChosen(null);
      showAlert({ title: 'Batch allocated', message: `${chosen.npo.organisationName} has been notified to claim.`, type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Allocation failed', message: e?.message || 'Batch may have just been allocated.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 60 }} />;

  // Phase 1 (§20): capability gate — only food managers may allocate.
  if (!hasPermission('donation_allocate')) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', gap: 8 }]}>
        <Ionicons name="lock-closed" size={36} color={theme.colors.textMuted} />
        <Text style={styles.muted}>Donation allocation is restricted to food managers.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(kitchen)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Allocate ({batches.length})</Text>
      </View>
      {!!loadError && (
        <LiveErrorBanner error={loadError} onRetry={() => setRetryKey((k) => k + 1)} />
      )}
      {batches.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="fast-food-outline" size={40} color={theme.colors.textMuted} />
          <Text style={styles.muted}>No unassigned batches. Log a donation first — verified batches appear here for allocation.</Text>
        </View>
      )}
      {batches.map((b) => (
        <TouchableOpacity key={b.id} style={styles.card} onPress={() => openBatch(b)} activeOpacity={0.7}>
          <Text style={styles.cardTitle}>{b.batchId} — {b.itemName}</Text>
          <Text style={styles.muted}>{b.portionCount} portions · {b.estimatedWeightKg}kg · allergens: {b.allergens.join(', ') || 'none'}</Text>
          <Text style={styles.review}>Tap to inspect ›</Text>
        </TouchableOpacity>
      ))}

      <DetailModal visible={selected !== null} title={selected ? `${selected.batchId} — ${selected.itemName}` : ''} onClose={() => setSelected(null)}>
        {selected && step === 'detail' && (
          <View>
            <StatusBadge status={selected.status} />
            <SectionTitle>DONATION</SectionTitle>
            <KV label="Category" value={selected.mealCategory} />
            <KV label="Portions" value={String(selected.portionCount)} />
            <KV label="Weight" value={`${selected.estimatedWeightKg} kg`} />
            <KV label="Allergens" value={(selected.allergens || []).join(', ') || 'none'} />
            <KV label="Prepared" value={selected.preparedAt ? new Date(selected.preparedAt).toLocaleString() : '—'} />
            <KV label="Use by" value={selected.expiryAt ? new Date(selected.expiryAt).toLocaleString() : '—'} />
            <SectionTitle>SAFETY CHECKS</SectionTitle>
            <KV label="Core temperature" value={selected.safetyChecklist?.coreTemperatureVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Packaging integrity" value={selected.safetyChecklist?.packagingIntegrityVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Allergen labelling" value={selected.safetyChecklist?.allergenLabelsVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Prep window" value={selected.safetyChecklist?.safePreparationWindowVerified ? 'Verified ✓' : 'NOT verified'} />
            {!!selected.safetyPhotoUrl && (
              <>
                <SectionTitle>PHOTO EVIDENCE</SectionTitle>
                <Image source={{ uri: selected.safetyPhotoUrl }} style={styles.photo} resizeMode="cover" />
              </>
            )}
            <SectionTitle>LIFECYCLE</SectionTitle>
            <KV label="Status" value={selected.status} />
            <KV label="Logged" value={selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'} />
            <SectionTitle>ELIGIBLE NPOS ({ranked.length})</SectionTitle>
            {ranked.length === 0 && <Text style={styles.muted}>No approved NPOs available.</Text>}
            {ranked.map((r) => (
              <TouchableOpacity
                key={r.npo.id} style={[styles.npo, chosen?.npo.npoId === r.npo.npoId && styles.picked]}
                onPress={() => setChosen(r)} activeOpacity={0.7}
              >
                <Text style={styles.cardTitle}>{r.npo.organisationName} <Text style={styles.score}>· score {r.score}</Text></Text>
                <Text style={styles.muted}>{r.reasons.join(' · ')}</Text>
                <Text style={styles.muted}>Cap {r.npo.beneficiaryCapacity} · {(r.npo.serviceAreas || []).join(', ') || '—'} · {r.npo.transportType || 'no transport'} · {r.npo.refrigerationAvailable ? 'cold-chain' : 'no cold-chain'}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ marginTop: 12 }}>
              <ModalButton label={chosen ? `Review allocation to ${chosen.npo.organisationName}` : 'Select an NPO above'} onPress={() => chosen && setStep('confirm')} disabled={!chosen} />
            </View>
          </View>
        )}
        {selected && chosen && step === 'confirm' && (
          <ConfirmBlock
            title="Confirm allocation?"
            rows={[
              ['Batch', `${selected.batchId} — ${selected.itemName}`],
              ['Quantity', `${selected.portionCount} portions · ${selected.estimatedWeightKg}kg`],
              ['NPO', chosen.npo.organisationName],
              ['Match score', `${chosen.score} (${chosen.reasons.join('; ')})`],
              ['Effect', 'NPO is notified to claim; batch leaves this board'],
            ]}
            warning="Allocation assigns this food to one organisation. Verify quantity and match before confirming."
            confirmLabel="Confirm allocation" onConfirm={allocate} onCancel={() => setStep('detail')} busy={busy}
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
  card: { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  npo: { backgroundColor: theme.colors.background, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  picked: { borderColor: theme.colors.primary, borderWidth: 2 },
  cardTitle: { color: theme.colors.text, fontWeight: '700' },
  score: { color: theme.colors.primary, fontWeight: '700' },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
  empty: { alignItems: 'center', padding: 24, gap: 8 },
  error: { backgroundColor: (theme.colors.error || '#dc2626') + '1A', borderRadius: 8, padding: 12, marginBottom: 8 },
  errorText: { color: theme.colors.error || '#dc2626', fontSize: 12 },
  photo: { width: '100%', height: 180, borderRadius: 8, marginTop: 4 },
});