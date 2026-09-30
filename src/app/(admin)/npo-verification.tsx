// (admin) UC34 — NPO Verification Queue.
// REMEDIATED Phase C (§15–§18): LIST → tappable card → full DETAIL
// (organisation, contact, compliance, submitted, history) → decision
// → CONFIRM → execute → realtime queue update.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, TextInput, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/services/firebase-services';
import { listenNpoPartners, reviewNpoApplication, markNpoUnderReview } from '@/services/increment2-services';
import type { NpoPartner } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

type Step = 'review' | 'confirm-approve' | 'confirm-reject';

export default function AdminNpoVerificationScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const { user } = useAuth();
  const [items, setItems] = useState<NpoPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<NpoPartner | null>(null);
  const [step, setStep] = useState<Step>('review');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => listenNpoPartners((list) => {
    setItems([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setLoading(false);
  }, (e) => { setLoadError(e.message); setLoading(false); }), [retryKey]);

  const openReview = (n: NpoPartner) => { setSelected(n); setStep('review'); setReason(''); setLoadError(''); };

  const decide = async (approve: boolean) => {
    if (!selected) return;
    if (!approve && !reason.trim()) {
      showAlert({ title: 'Reason required', message: 'A rejection reason is required.', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await reviewNpoApplication({
        npoDocId: selected.id, approve, reason,
        reviewerUid: user?.uid || auth.currentUser?.uid,
      });
      setSelected(null);
      showAlert({ title: approve ? 'NPO approved' : 'NPO rejected', message: approve ? 'Organisation is now active; rep login provisioned.' : 'Decision recorded with reason.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Decision failed', message: e?.message || 'Could not review.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const underReview = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await markNpoUnderReview(selected.id);
      setSelected(null);
      showAlert({ title: 'Marked under review', message: 'Application moved to under review.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Update failed', message: e?.message || 'Could not update.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 60 }} />;
  const pending = items.filter((i) => i.verificationStatus === 'pending' || i.verificationStatus === 'under_review');
  const decided = items.filter((i) => i.verificationStatus === 'approved' || i.verificationStatus === 'rejected');

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(admin)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>NPO Verification ({pending.length})</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      {pending.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={40} color={theme.colors.success} />
          <Text style={styles.muted}>No pending applications. New NPO applications will appear here for review.</Text>
        </View>
      )}
      {pending.map((n) => (
        <TouchableOpacity key={n.id} style={styles.card} onPress={() => openReview(n)} activeOpacity={0.7}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{n.organisationName}</Text>
            <StatusBadge status={n.verificationStatus} />
          </View>
          <Text style={styles.muted}>{n.contactName} · {n.email} · {n.phone}</Text>
          <Text style={styles.muted}>Reg {n.registrationNumber} · cap {n.beneficiaryCapacity} · {n.refrigerationAvailable ? 'cold-chain' : 'no cold-chain'} · {n.transportType}</Text>
          <Text style={styles.review}>Tap to inspect & decide ›</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.section}>Decided ({decided.length})</Text>
      {decided.length === 0 && <Text style={styles.muted}>No decisions recorded yet.</Text>}
      {decided.map((n) => (
        <View key={n.id} style={styles.decidedCard}>
          <Text style={styles.cardTitle}>{n.organisationName}</Text>
          <Text style={styles.muted}>{n.verificationStatus === 'approved' ? 'Approved' : 'Rejected'}{n.verifiedAt ? ` · ${new Date(n.verifiedAt).toLocaleString()}` : ''}</Text>
          {!!n.rejectionReason && <Text style={styles.muted}>Reason: {n.rejectionReason}</Text>}
        </View>
      ))}

      <DetailModal visible={selected !== null} title={`Review — ${selected?.organisationName || ''}`} onClose={() => setSelected(null)}>
        {selected && step === 'review' && (
          <View>
            <StatusBadge status={selected.verificationStatus} />
            <SectionTitle>ORGANISATION</SectionTitle>
            <KV label="Contact" value={`${selected.contactName} · ${selected.phone}`} />
            <KV label="Email" value={selected.email} />
            <KV label="Registration" value={selected.registrationNumber} />
            {!!selected.pboNumber && <KV label="PBO" value={selected.pboNumber} />}
            <KV label="Capacity" value={String(selected.beneficiaryCapacity ?? '—')} />
            <KV label="Service areas" value={(selected.serviceAreas || []).join(', ') || '—'} />
            <KV label="Transport" value={selected.transportType || '—'} />
            <KV label="Cold chain" value={selected.refrigerationAvailable ? 'Available' : 'Not available'} />
            <SectionTitle>COMPLIANCE ({(selected.complianceDocuments || []).length})</SectionTitle>
            {(selected.complianceDocuments || []).length === 0 && <Text style={styles.muted}>No documents attached.</Text>}
            {(selected.complianceDocuments || []).map((d, i) => (
              <TouchableOpacity key={i} style={styles.doc} onPress={() => d.url && Linking.openURL(d.url)}>
                <Ionicons name="document-text-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.docText}>{d.fileName || `Document ${i + 1}`}</Text>
              </TouchableOpacity>
            ))}
            <SectionTitle>SUBMITTED</SectionTitle>
            <KV label="Received" value={selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'} />
            {!!selected.verifiedBy && <KV label="Last reviewer" value={selected.verifiedBy} />}
            <TextInput
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
              value={reason} onChangeText={setReason}
              placeholder="Decision reason (required to reject)" placeholderTextColor={theme.colors.textMuted} multiline
            />
            <View style={styles.btnRow}>
              <ModalButton label="Reject" kind="danger" onPress={() => setStep('confirm-reject')} />
              <ModalButton label="Approve" onPress={() => setStep('confirm-approve')} />
            </View>
            {selected.verificationStatus === 'pending' && (
              <View style={{ marginTop: 8 }}>
                <ModalButton label={busy ? 'Working…' : 'Mark under review'} kind="secondary" onPress={underReview} busy={busy} />
              </View>
            )}
          </View>
        )}
        {selected && step === 'confirm-approve' && (
          <ConfirmBlock
            title={`Approve ${selected.organisationName}?`}
            rows={[['Organisation', selected.organisationName], ['Contact', selected.email], ['Effect', 'NPO becomes active; rep login is provisioned']]}
            warning="Approval grants this organisation the right to claim food donations."
            confirmLabel="Confirm approval" onConfirm={() => decide(true)} onCancel={() => setStep('review')} busy={busy}
          />
        )}
        {selected && step === 'confirm-reject' && (
          <ConfirmBlock
            title={`Reject ${selected.organisationName}?`}
            rows={[['Organisation', selected.organisationName], ['Reason', reason || '(none — required)']]}
            warning="Rejection is terminal for this application and is recorded with your reason."
            confirmLabel="Confirm rejection" danger onConfirm={() => decide(false)} onCancel={() => setStep('review')} busy={busy}
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
  decidedCard: { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12, marginBottom: 8, opacity: 0.75, borderWidth: 1, borderColor: theme.colors.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: theme.colors.text, fontWeight: '700', fontSize: 16, flex: 1 },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
  empty: { alignItems: 'center', padding: 24, gap: 8 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  docText: { color: theme.colors.primary, fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 12 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
});