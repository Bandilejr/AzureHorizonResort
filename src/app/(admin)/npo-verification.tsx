// (admin) UC34 — NPO Verification Queue. Layer 6 presentation rebuild.
// reviewNpoApplication / markNpoUnderReview payloads unchanged. Raw reviewer
// UID removed from the UI.
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/services/firebase-services';
import { listenNpoPartners, reviewNpoApplication, markNpoUnderReview } from '@/services/increment2-services';
import type { NpoPartner } from '@/types/increment2';
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

type Step = 'review' | 'confirm-approve' | 'confirm-reject';

export default function AdminNpoVerificationScreen() {
  const theme = useAppTheme();
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

  useEffect(() => {
    setLoading(true);
    return listenNpoPartners((list) => {
      setItems([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoading(false);
    }, (e) => { setLoadError(e.message); setLoading(false); });
  }, [retryKey]);

  const openReview = (n: NpoPartner) => { setSelected(n); setStep('review'); setReason(''); setLoadError(''); };

  const decide = async (approve: boolean) => {
    if (!selected) return;
    if (!approve && !reason.trim()) { showAlert({ title: 'Reason required', message: 'A rejection reason is required.', type: 'error' }); return; }
    setBusy(true);
    try {
      await reviewNpoApplication({ npoDocId: selected.id, approve, reason, reviewerUid: user?.uid || auth.currentUser?.uid });
      setSelected(null);
      showAlert({ title: approve ? 'NPO approved' : 'NPO rejected', message: approve ? 'Organisation is now active; rep login provisioned.' : 'Decision recorded with reason.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Decision failed', message: e?.message || 'Could not review.', type: 'error' });
    } finally { setBusy(false); }
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
    } finally { setBusy(false); }
  };

  const pending = items.filter((i) => i.verificationStatus === 'pending' || i.verificationStatus === 'under_review');
  const decided = items.filter((i) => i.verificationStatus === 'approved' || i.verificationStatus === 'rejected');

  return (
    <Screen scroll>
      <PageHeader title={`Organizations${pending.length ? ` (${pending.length})` : ''}`} subtitle="NPO verification queue" showBack fallback="/(admin)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      {loading ? (
        <ListSkeleton rows={3} />
      ) : loadError && items.length === 0 ? (
        <ErrorState title="Couldn't load applications" message="The NPO review queue is unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : (
        <>
          {pending.length === 0 ? (
            <EmptyState icon="checkmark-circle-outline" title="No pending applications" message="New NPO applications will appear here for review." />
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {pending.map((n, i) => (
                <View key={n.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={n.organisationName}
                    subtitle={`${n.contactName} · ${n.email} · ${n.phone}\nReg ${n.registrationNumber} · cap ${n.beneficiaryCapacity} · ${n.refrigerationAvailable ? 'cold-chain' : 'no cold-chain'} · ${n.transportType}`}
                    status={<StatusPill status={n.verificationStatus} size="sm" />}
                    onPress={() => openReview(n)}
                  />
                </View>
              ))}
            </Card>
          )}

          <SectionHeader title={`Decided (${decided.length})`} />
          {decided.length === 0 ? (
            <AppText variant="body" tone="muted">No decisions recorded yet.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {decided.map((n, i) => (
                <View key={n.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={n.organisationName}
                    subtitle={`${n.verifiedAt ? new Date(n.verifiedAt).toLocaleString() : ''}${n.rejectionReason ? `\nReason: ${n.rejectionReason}` : ''}`}
                    status={<StatusPill status={n.verificationStatus} size="sm" />}
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      )}

      <DetailModal visible={selected !== null} title={`Review — ${selected?.organisationName || ''}`} onClose={() => setSelected(null)}>
        {selected && step === 'review' ? (
          <View>
            <StatusBadge status={selected.verificationStatus} />
            <SectionTitle>ORGANISATION</SectionTitle>
            <KV label="Contact" value={`${selected.contactName} · ${selected.phone}`} />
            <KV label="Email" value={selected.email} />
            <KV label="Registration" value={selected.registrationNumber} />
            {selected.pboNumber ? <KV label="PBO" value={selected.pboNumber} /> : null}
            <KV label="Capacity" value={String(selected.beneficiaryCapacity ?? '—')} />
            <KV label="Service areas" value={(selected.serviceAreas || []).join(', ') || '—'} />
            <KV label="Transport" value={selected.transportType || '—'} />
            <KV label="Cold chain" value={selected.refrigerationAvailable ? 'Available' : 'Not available'} />
            <SectionTitle>{`COMPLIANCE (${(selected.complianceDocuments || []).length})`}</SectionTitle>
            {(selected.complianceDocuments || []).length === 0 ? <AppText variant="body" tone="muted">No documents attached.</AppText> : null}
            {(selected.complianceDocuments || []).map((d, i) => (
              <TouchableOpacity key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, paddingVertical: 6 }} onPress={() => d.url && Linking.openURL(d.url)}>
                <Ionicons name="document-text-outline" size={18} color={theme.colors.primary} />
                <AppText variant="body" tone="primary" weight="600">{d.fileName || `Document ${i + 1}`}</AppText>
              </TouchableOpacity>
            ))}
            <SectionTitle>SUBMITTED</SectionTitle>
            <KV label="Received" value={selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'} />
            <View style={{ marginTop: theme.space.md }}>
              <Field label="Decision reason (required to reject)" value={reason} onChangeText={setReason} multiline />
            </View>
            <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.md }}>
              <ModalButton label="Reject" kind="danger" onPress={() => setStep('confirm-reject')} />
              <ModalButton label="Approve" onPress={() => setStep('confirm-approve')} />
            </View>
            {selected.verificationStatus === 'pending' ? (
              <View style={{ marginTop: theme.space.sm }}>
                <ModalButton label={busy ? 'Working…' : 'Mark under review'} kind="secondary" onPress={underReview} busy={busy} />
              </View>
            ) : null}
          </View>
        ) : null}
        {selected && step === 'confirm-approve' ? (
          <ConfirmBlock
            title={`Approve ${selected.organisationName}?`}
            rows={[['Organisation', selected.organisationName], ['Contact', selected.email], ['Effect', 'NPO becomes active; rep login is provisioned']]}
            warning="Approval grants this organisation the right to claim food donations."
            confirmLabel="Confirm approval" onConfirm={() => decide(true)} onCancel={() => setStep('review')} busy={busy}
          />
        ) : null}
        {selected && step === 'confirm-reject' ? (
          <ConfirmBlock
            title={`Reject ${selected.organisationName}?`}
            rows={[['Organisation', selected.organisationName], ['Reason', reason || '(none — required)']]}
            warning="Rejection is terminal for this application and is recorded with your reason."
            confirmLabel="Confirm rejection" danger onConfirm={() => decide(false)} onCancel={() => setStep('review')} busy={busy}
          />
        ) : null}
      </DetailModal>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
