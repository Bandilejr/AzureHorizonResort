// (kitchen) UC36 — Allocation workspace. Layer 6 presentation rebuild.
// allocateDonationBatchMobile payload unchanged.
import React, { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { listenDonationBatches, listenNpoPartners, rankNpoPartners, allocateDonationBatchMobile, NpoMatchScore } from '@/services/increment2-services';
import type { DonationBatch } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { DetailScreen } from '@/components/ui/detail-screen';
import { usePermissions } from '@/context/PermissionsContext';

type Step = 'detail' | 'confirm';

export default function KitchenAllocationsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
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
    setLoading(true);
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
    } finally { setBusy(false); }
  };

  if (!hasPermission('donation_allocate')) {
    return (
      <Screen>
        <PageHeader title="Allocate" showBack fallback="/(kitchen)/dashboard" />
        <EmptyState icon="lock-closed-outline" title="Restricted" message="Donation allocation is restricted to food managers." />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <PageHeader title={`Allocate${batches.length ? ` (${batches.length})` : ''}`} subtitle="Assign verified donations to NPO partners" showBack fallback="/(kitchen)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => setRetryKey((k) => k + 1)} />

      {loading ? (
        <ListSkeleton rows={3} />
      ) : loadError && batches.length === 0 ? (
        <ErrorState title="Couldn't load batches" message="Unassigned donations are unavailable right now." details={loadError} onRetry={() => setRetryKey((k) => k + 1)} />
      ) : batches.length === 0 ? (
        <EmptyState icon="fast-food-outline" title="No unassigned batches" message="Log a donation first — verified batches appear here for allocation." actionLabel="Log donation" onAction={() => router.push('/(kitchen)/donation-log' as any)} />
      ) : (
        <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
          {batches.map((b, i) => (
            <View key={b.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
              <ListRow
                title={`${b.batchId} — ${b.itemName}`}
                subtitle={`${b.portionCount} portions · ${b.estimatedWeightKg}kg · allergens: ${b.allergens.join(', ') || 'None recorded'}`}
                status={<StatusPill status={b.status} size="sm" />}
                onPress={() => openBatch(b)}
              />
            </View>
          ))}
        </Card>
      )}

      <DetailScreen
        visible={selected !== null}
        title={selected ? selected.itemName : 'Batch'}
        subtitle={selected?.batchId}
        status={selected ? <StatusPill status={selected.status} /> : undefined}
        onClose={() => setSelected(null)}
      >
        {selected && step === 'detail' ? (
          <View>
            <StatusBadge status={selected.status} />
            <SectionTitle>DONATION</SectionTitle>
            <KV label="Category" value={selected.mealCategory} />
            <KV label="Portions" value={String(selected.portionCount)} />
            <KV label="Weight" value={`${selected.estimatedWeightKg} kg`} />
            <KV label="Allergens" value={(selected.allergens || []).join(', ') || 'None recorded'} />
            <KV label="Prepared" value={selected.preparedAt ? new Date(selected.preparedAt).toLocaleString() : '—'} />
            <KV label="Use by" value={selected.expiryAt ? new Date(selected.expiryAt).toLocaleString() : '—'} />
            <SectionTitle>SAFETY CHECKS</SectionTitle>
            <KV label="Core temperature" value={selected.safetyChecklist?.coreTemperatureVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Packaging integrity" value={selected.safetyChecklist?.packagingIntegrityVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Allergen labelling" value={selected.safetyChecklist?.allergenLabelsVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Prep window" value={selected.safetyChecklist?.safePreparationWindowVerified ? 'Verified ✓' : 'NOT verified'} />
            {selected.safetyPhotoUrl ? (
              <>
                <SectionTitle>PHOTO EVIDENCE</SectionTitle>
                <Image source={{ uri: selected.safetyPhotoUrl }} style={{ width: '100%', height: 180, borderRadius: theme.radius.sm, marginTop: 4 }} resizeMode="cover" />
              </>
            ) : null}
            <SectionTitle>{`ELIGIBLE NPOS (${ranked.length})`}</SectionTitle>
            {ranked.length === 0 ? <AppText variant="body" tone="muted">No approved NPOs available.</AppText> : null}
            {ranked.map((r) => {
              const picked = chosen?.npo.npoId === r.npo.npoId;
              return (
                <View key={r.npo.id} style={{ marginBottom: theme.space.sm }}>
                  <Card
                    tone={picked ? 'primarySoft' : 'surface'}
                    bordered
                    style={picked ? { borderColor: theme.colors.primary, borderWidth: 2 } : undefined}
                  >
                    <ListRow
                      title={`${r.npo.organisationName} · score ${r.score}`}
                      subtitle={`${r.reasons.join(' · ')}\nCap ${r.npo.beneficiaryCapacity} · ${(r.npo.serviceAreas || []).join(', ') || '—'} · ${r.npo.transportType || 'no transport'} · ${r.npo.refrigerationAvailable ? 'cold-chain' : 'no cold-chain'}`}
                      showChevron={!picked}
                      trailing={picked ? <Ionicons name="checkmark-circle" size={theme.iconSize.md} color={theme.colors.primary} /> : undefined}
                      onPress={() => setChosen(r)}
                    />
                  </Card>
                </View>
              );
            })}
            <View style={{ marginTop: theme.space.md }}>
              <ModalButton label={chosen ? `Review allocation to ${chosen.npo.organisationName}` : 'Select an NPO above'} onPress={() => chosen && setStep('confirm')} disabled={!chosen} />
            </View>
          </View>
        ) : null}
        {selected && chosen && step === 'confirm' ? (
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
        ) : null}
      </DetailScreen>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
