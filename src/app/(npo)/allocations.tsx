// (npo) UC37 — My Allocations: review and claim allocated batches.
// Layer 6 presentation rebuild; claimDonationFromMobile payload unchanged.
import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Switch, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth } from '@/services/firebase-services';
import { useAuth } from '@/context/AuthContext';
import { listenNpoPartners, listenMyAllocations, claimDonationFromMobile } from '@/services/increment2-services';
import type { DonationBatch, NpoPartner } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';

type Step = 'detail' | 'confirm';

export default function NpoAllocationsScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { profile } = useAuth();
  const email = (profile?.email || auth.currentUser?.email || '').toLowerCase();

  const [myNpo, setMyNpo] = useState<NpoPartner | null>(null);
  const [npoKnown, setNpoKnown] = useState(false);
  const [items, setItems] = useState<DonationBatch[]>([]);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<DonationBatch | null>(null);
  const [step, setStep] = useState<Step>('detail');
  const [facility, setFacility] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => {
    if (!email) { setNpoKnown(true); return; }
    setLoadError('');
    const onErr = (e: Error) => { setLoadError(e.message); setNpoKnown(true); };
    return listenNpoPartners((list) => {
      setMyNpo(list.find((n) => n.verificationStatus === 'approved' && n.email.toLowerCase() === email) || null);
      setNpoKnown(true);
    }, onErr);
  }, [email]);

  useEffect(() => {
    if (!myNpo) return;
    return listenMyAllocations(myNpo.npoId, setItems, (e) => setLoadError(e.message));
  }, [myNpo]);

  const openBatch = (b: DonationBatch) => { setSelected(b); setStep('detail'); setFacility(b.receivingFacility || ''); setTerms(false); };

  const claim = async () => {
    if (!selected || !myNpo) return;
    setBusy(true);
    try {
      await claimDonationFromMobile({ batchDocId: selected.id, receivingFacility: facility, acceptTerms: terms });
      setSelected(null); setFacility(''); setTerms(false);
      showAlert({ title: 'Allocation claimed', message: 'Kitchen management notified — collection will be scheduled.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Claim failed', message: e?.message || 'Allocation unavailable.', type: 'error' });
    } finally { setBusy(false); }
  };

  const awaiting = items.filter((b) => b.status === 'allocated_awaiting_claim');
  const rest = items.filter((b) => b.status !== 'allocated_awaiting_claim');
  const facilities = (myNpo?.facilities || []).filter((f) => f.active);

  return (
    <Screen scroll>
      <PageHeader title="Allocations" subtitle={myNpo?.organisationName || 'Claim allocated food batches'} showBack fallback="/(npo)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => setLoadError('')} />

      {!npoKnown ? (
        <ListSkeleton rows={3} />
      ) : !myNpo ? (
        loadError ? (
          <ErrorState title="Couldn't load your organisation" message="Allocations are unavailable right now." details={loadError} onRetry={() => setLoadError('')} />
        ) : (
          <EmptyState icon="hourglass-outline" title="Verification pending" message="No approved NPO is linked to this account yet. Verification by an administrator activates this tab." />
        )
      ) : (
        <>
          <SectionHeader title={`Awaiting claim (${awaiting.length})`} />
          {awaiting.length === 0 ? (
            <AppText variant="body" tone="muted">No allocations awaiting your claim.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {awaiting.map((b, i) => (
                <View key={b.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={`${b.batchId} — ${b.itemName}`}
                    subtitle={`${b.portionCount} portions · ${b.estimatedWeightKg}kg · ${b.mealCategory}`}
                    status={<StatusPill status={b.status} size="sm" />}
                    onPress={() => openBatch(b)}
                  />
                </View>
              ))}
            </Card>
          )}

          <SectionHeader title={`Claimed & scheduled (${rest.length})`} />
          {rest.length === 0 ? (
            <AppText variant="body" tone="muted">Nothing here yet.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {rest.map((b, i) => (
                <View key={b.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={`${b.batchId} — ${b.itemName}`}
                    subtitle={`${b.portionCount} portions${b.receivingFacility ? ` · → ${b.receivingFacility}` : ''}`}
                    status={<StatusPill status={b.status} size="sm" />}
                    onPress={() => openBatch(b)}
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      )}

      <DetailModal visible={selected !== null} title={selected ? `${selected.batchId} — ${selected.itemName}` : ''} onClose={() => setSelected(null)}>
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
            <SectionTitle>FOOD SAFETY</SectionTitle>
            <KV label="Temperature" value={selected.safetyChecklist?.coreTemperatureVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Packaging" value={selected.safetyChecklist?.packagingIntegrityVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Allergen labels" value={selected.safetyChecklist?.allergenLabelsVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Prep window" value={selected.safetyChecklist?.safePreparationWindowVerified ? 'Verified ✓' : 'NOT verified'} />
            {selected.safetyPhotoUrl ? (
              <>
                <SectionTitle>PHOTO</SectionTitle>
                <Image source={{ uri: selected.safetyPhotoUrl }} style={{ width: '100%', height: 180, borderRadius: theme.radius.sm, marginTop: 4 }} resizeMode="cover" />
              </>
            ) : null}
            <SectionTitle>COLLECTION EXPECTATIONS</SectionTitle>
            <KV label="Pickup" value={selected.pickupWindowStart ? `${new Date(selected.pickupWindowStart).toLocaleString()} → ${selected.pickupWindowEnd ? new Date(selected.pickupWindowEnd).toLocaleString() : '—'}` : 'Scheduled after your claim'} />
            <KV label="Bay" value={selected.loadingBay || 'Assigned at scheduling'} />
            <KV label="Deliver to" value={selected.receivingFacility || 'You choose below'} />
            {selected.status === 'allocated_awaiting_claim' ? (
              <>
                <SectionTitle>YOUR FACILITY & TERMS</SectionTitle>
                {facilities.length === 0 ? (
                  <View style={{ marginBottom: theme.space.sm }}>
                    <AppText variant="body" tone="muted">No registered facilities yet. Add your receiving facility to claim.</AppText>
                    <TouchableOpacity onPress={() => router.push('/(npo)/organisation' as any)}>
                      <AppText variant="label" tone="primary" weight="700" style={{ marginTop: 4 }}>Add facility ›</AppText>
                    </TouchableOpacity>
                  </View>
                ) : (
                  facilities.map((f) => {
                    const picked = facility === f.name;
                    return (
                      <Card key={f.id} tone={picked ? 'primarySoft' : 'surface'} bordered style={[{ marginBottom: theme.space.sm }, picked ? { borderColor: theme.colors.primary, borderWidth: 2 } : null]}>
                        <ListRow
                          title={f.name}
                          subtitle={[f.address, f.capacity ? `Capacity: ${f.capacity}` : null].filter(Boolean).join(' · ') || undefined}
                          trailing={picked ? <Ionicons name="checkmark-circle" size={theme.iconSize.md} color={theme.colors.primary} /> : undefined}
                          showChevron={!picked}
                          onPress={() => setFacility(f.name)}
                        />
                      </Card>
                    );
                  })
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.md, marginTop: theme.space.sm }}>
                  <AppText variant="caption" style={{ flex: 1 }}>Accept distribution terms (cold chain, use before expiry, confirm receipt)</AppText>
                  <Switch value={terms} onValueChange={setTerms} />
                </View>
                <View style={{ marginTop: theme.space.md }}>
                  <ModalButton
                    label="Review claim"
                    onPress={() => {
                      if (!facility.trim()) { showAlert({ title: 'Facility required', message: 'Select the receiving community facility.', type: 'error' }); return; }
                      if (!terms) { showAlert({ title: 'Terms required', message: 'You must accept the distribution terms.', type: 'error' }); return; }
                      setStep('confirm');
                    }}
                  />
                </View>
              </>
            ) : null}
          </View>
        ) : null}
        {selected && step === 'confirm' ? (
          <ConfirmBlock
            title="Confirm claim?"
            rows={[
              ['Batch', `${selected.batchId} — ${selected.itemName}`],
              ['Quantity', `${selected.portionCount} portions · ${selected.estimatedWeightKg}kg`],
              ['Allergens', (selected.allergens || []).join(', ') || 'None recorded'],
              ['Use by', selected.expiryAt ? new Date(selected.expiryAt).toLocaleString() : '—'],
              ['Facility', facility],
            ]}
            warning="Claiming accepts responsibility for safe transport, cold chain, and distribution before expiry."
            confirmLabel="Confirm claim" onConfirm={claim} onCancel={() => setStep('detail')} busy={busy}
          />
        ) : null}
      </DetailModal>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
