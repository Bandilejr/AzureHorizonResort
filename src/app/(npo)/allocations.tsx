// (npo) UC37 — My Allocations: review and claim allocated batches.
// REMEDIATED Phase C (§21): LIST → DONATION DETAIL (quantity, allergens,
// expiry, safety checks, photo, collection expectations, terms, status)
// → facility + terms → CONFIRM (liability-aware) → claim → receipt state.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, TextInput, ScrollView, Switch, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '@/services/firebase-services';
import { useAuth } from '@/context/AuthContext';
import { listenNpoPartners, listenMyAllocations, claimDonationFromMobile } from '@/services/increment2-services';
import type { DonationBatch, NpoPartner } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

type Step = 'detail' | 'confirm';

export default function NpoAllocationsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
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
    const onErr = (e: Error) => setLoadError(e.message);
    return listenNpoPartners((list) => {
      setMyNpo(list.find((n) => n.verificationStatus === 'approved' && n.email.toLowerCase() === email) || null);
      setNpoKnown(true);
    }, onErr);
  }, [email]);

  useEffect(() => {
    if (!myNpo) return;
    return listenMyAllocations(myNpo.npoId, setItems, (e) => setLoadError(e.message));
  }, [myNpo]);

  const openBatch = (b: DonationBatch) => {
    setSelected(b); setStep('detail');
    setFacility(b.receivingFacility || ''); setTerms(false);
  };

  const claim = async () => {
    if (!selected || !myNpo) return;
    setBusy(true);
    try {
      await claimDonationFromMobile({
        batchDocId: selected.id, receivingFacility: facility, acceptTerms: terms,
      });
      setSelected(null); setFacility(''); setTerms(false);
      showAlert({ title: 'Allocation claimed', message: 'Kitchen management notified — collection will be scheduled.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Claim failed', message: e?.message || 'Allocation unavailable.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const awaiting = items.filter((b) => b.status === 'allocated_awaiting_claim');
  const rest = items.filter((b) => b.status !== 'allocated_awaiting_claim');

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(npo)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Donations</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => setLoadError('')} />
      {!npoKnown && <ActivityIndicator size="large" color={theme.colors.primary} />}
      {npoKnown && !myNpo && (
        <Text style={styles.muted}>No approved NPO is linked to {email || 'this account'} yet. Verification by an administrator activates this tab.</Text>
      )}
      {myNpo && <Text style={styles.org}>{myNpo.organisationName}</Text>}

      {myNpo && (
        <>
          <Text style={styles.section}>Awaiting claim ({awaiting.length})</Text>
          {awaiting.length === 0 && <Text style={styles.muted}>No allocations awaiting your claim.</Text>}
          {awaiting.map((b) => (
            <TouchableOpacity key={b.id} style={styles.card} onPress={() => openBatch(b)} activeOpacity={0.7}>
              <Text style={styles.cardTitle}>{b.batchId} — {b.itemName}</Text>
              <Text style={styles.muted}>{b.portionCount} portions · {b.estimatedWeightKg}kg · {b.mealCategory}</Text>
              <Text style={styles.review}>Tap to inspect ›</Text>
            </TouchableOpacity>
          ))}

          <Text style={styles.section}>Claimed & scheduled ({rest.length})</Text>
          {rest.length === 0 && <Text style={styles.muted}>Nothing here yet.</Text>}
          {rest.map((b) => (
            <TouchableOpacity key={b.id} style={styles.card} onPress={() => openBatch(b)} activeOpacity={0.7}>
              <Text style={styles.cardTitle}>{b.batchId} — {b.itemName}</Text>
              <Text style={styles.muted}>{b.status}{b.receivingFacility ? ` · → ${b.receivingFacility}` : ''}</Text>
              <Text style={styles.review}>Tap to inspect ›</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

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
            <SectionTitle>FOOD SAFETY</SectionTitle>
            <KV label="Temperature" value={selected.safetyChecklist?.coreTemperatureVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Packaging" value={selected.safetyChecklist?.packagingIntegrityVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Allergen labels" value={selected.safetyChecklist?.allergenLabelsVerified ? 'Verified ✓' : 'NOT verified'} />
            <KV label="Prep window" value={selected.safetyChecklist?.safePreparationWindowVerified ? 'Verified ✓' : 'NOT verified'} />
            {!!selected.safetyPhotoUrl && (
              <>
                <SectionTitle>PHOTO</SectionTitle>
                <Image source={{ uri: selected.safetyPhotoUrl }} style={styles.photo} resizeMode="cover" />
              </>
            )}
            <SectionTitle>COLLECTION EXPECTATIONS</SectionTitle>
            <KV label="Pickup" value={selected.pickupWindowStart ? `${new Date(selected.pickupWindowStart).toLocaleString()} → ${selected.pickupWindowEnd ? new Date(selected.pickupWindowEnd).toLocaleString() : '—'}` : 'Scheduled after your claim'} />
            <KV label="Bay" value={selected.loadingBay || 'Assigned at scheduling'} />
            <KV label="Deliver to" value={selected.receivingFacility || 'You choose below'} />
            {selected.status === 'allocated_awaiting_claim' && (
              <>
                <SectionTitle>YOUR FACILITY & TERMS</SectionTitle>
                {(myNpo?.facilities || []).filter((f) => f.active).length === 0 ? (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={styles.muted}>No registered facilities yet. Add your receiving facility to claim.</Text>
                    <TouchableOpacity onPress={() => router.push('/(npo)/organisation' as any)}>
                      <Text style={styles.review}>Add facility ›</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  (myNpo?.facilities || []).filter((f) => f.active).map((f) => (
                    <TouchableOpacity key={f.id} style={[styles.facilityCard, facility === f.name && styles.facilityPicked]} onPress={() => setFacility(f.name)} activeOpacity={0.7}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{f.name}</Text>
                        {!!f.address && <Text style={styles.muted}>{f.address}</Text>}
                        {!!f.capacity && <Text style={styles.muted}>Capacity: {f.capacity}</Text>}
                      </View>
                      {facility === f.name && <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />}
                    </TouchableOpacity>
                  ))
                )}
                <View style={styles.row}>
                  <Text style={[styles.checkLabel, { color: theme.colors.text }]}>Accept distribution terms (cold chain, use before expiry, confirm receipt)</Text>
                  <Switch value={terms} onValueChange={setTerms} />
                </View>
                <ModalButton
                  label="Review claim"
                  onPress={() => {
                    if (!facility.trim()) { showAlert({ title: 'Facility required', message: 'Select the receiving community facility.', type: 'error' }); return; }
                    if (!terms) { showAlert({ title: 'Terms required', message: 'You must accept the distribution terms.', type: 'error' }); return; }
                    setStep('confirm');
                  }}
                />
              </>
            )}
          </View>
        )}
        {selected && step === 'confirm' && (
          <ConfirmBlock
            title="Confirm claim?"
            rows={[
              ['Batch', `${selected.batchId} — ${selected.itemName}`],
              ['Quantity', `${selected.portionCount} portions · ${selected.estimatedWeightKg}kg`],
              ['Allergens', (selected.allergens || []).join(', ') || 'none'],
              ['Use by', selected.expiryAt ? new Date(selected.expiryAt).toLocaleString() : '—'],
              ['Facility', facility],
            ]}
            warning="Claiming accepts responsibility for safe transport, cold chain, and distribution before expiry."
            confirmLabel="Confirm claim" onConfirm={claim} onCancel={() => setStep('detail')} busy={busy}
          />
        )}
      </DetailModal>
      <View style={{ height: 60 }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.text, marginBottom: 8 },
  org: { fontSize: 14, fontWeight: '600', color: theme.colors.primary, marginBottom: 4 },
  section: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTitle: { color: theme.colors.text, fontWeight: '600' },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 8, marginBottom: 10, backgroundColor: 'transparent' },
  facilityCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  facilityPicked: { borderColor: theme.colors.primary, borderWidth: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  checkLabel: { flex: 1, marginRight: 8, fontSize: 12 },
  photo: { width: '100%', height: 180, borderRadius: 8, marginTop: 4 },
});