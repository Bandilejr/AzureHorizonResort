// (kitchen) manager — leave approvals (UC41) + swap approvals (UC43).
// REMEDIATED Phase C (§15–§17, P0-3): separate LEAVE REVIEW and SWAP REVIEW
// interaction states (no shared reason), tappable cards → DETAIL
// (staff, dates, reason, proof, conflicts / shift details) → CONFIRM → execute.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, TextInput, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenLeaveQueue, listenPendingSwaps, listenPublishedRosters, reviewLeaveMobile, reviewSwapMobile } from '@/services/increment2-services';
import type { LeaveRequest, ShiftSwap, ShiftRoster } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { useStaffNames, staffNameOf } from '@/hooks/use-staff-names';
import { goBack } from '@/utils/navigation';
import { usePermissions } from '@/context/PermissionsContext';
import { useRouter } from 'expo-router';

type LeaveStep = 'detail' | 'confirm-approve' | 'confirm-reject';
type SwapStep = 'detail' | 'confirm-approve' | 'confirm-reject';

export default function LeaveManageScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  const [queue, setQueue] = useState<LeaveRequest[]>([]);
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [selLeave, setSelLeave] = useState<LeaveRequest | null>(null);
  const [leaveStep, setLeaveStep] = useState<LeaveStep>('detail');
  const [leaveReason, setLeaveReason] = useState('');
  const [selSwap, setSelSwap] = useState<ShiftSwap | null>(null);
  const [swapStep, setSwapStep] = useState<SwapStep>('detail');
  const [swapReason, setSwapReason] = useState('');
  const [busy, setBusy] = useState(false);
  // Phase 2 (§3.A): human-readable employee names — never raw UIDs in the UI.
  const staffNames = useStaffNames();
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });
  const { hasPermission } = usePermissions();

  useEffect(() => {
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenLeaveQueue(setQueue, onErr);
    const u2 = listenPendingSwaps(setSwaps, onErr);
    const u3 = listenPublishedRosters(setRosters, onErr);
    return () => { u1(); u2(); u3(); };
  }, [retryKey]);

  const shiftDetail = (shiftId: string) => {
    for (const r of rosters) {
      const s = (r.shifts || []).find((x) => x.shiftId === shiftId);
      if (s) return { ...s, week: r.weekStart };
    }
    return null;
  };

  const openLeave = (l: LeaveRequest) => { setSelLeave(l); setLeaveStep('detail'); setLeaveReason(''); };
  const openSwap = (s: ShiftSwap) => { setSelSwap(s); setSwapStep('detail'); setSwapReason(''); };

  const reviewLeave = async (approve: boolean) => {
    if (!selLeave) return;
    if (!approve && !leaveReason.trim()) {
      showAlert({ title: 'Reason required', message: 'Enter a rejection reason for this leave request.', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await reviewLeaveMobile({ leaveDocId: selLeave.id, approve, reason: leaveReason });
      setSelLeave(null); setLeaveReason('');
      showAlert({ title: approve ? 'Leave approved' : 'Leave rejected', message: 'Staff member notified.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Review failed', message: e?.message || 'Could not review.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reviewSwap = async (approve: boolean) => {
    if (!selSwap) return;
    if (!approve && !swapReason.trim()) {
      showAlert({ title: 'Reason required', message: 'Enter a rejection reason for this swap.', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await reviewSwapMobile({ swapDocId: selSwap.id, approve, reason: swapReason });
      setSelSwap(null); setSwapReason('');
      showAlert({ title: approve ? 'Swap approved' : 'Swap rejected', message: approve ? 'Both assignments updated.' : 'Parties notified.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Review failed', message: e?.message || 'Could not review.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // Phase 1 (§20): capability gate — only leave/swap approvers may review.
  if (!hasPermission('leave_approve')) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', gap: 8 }]}>
        <Ionicons name="lock-closed" size={36} color={theme.colors.textMuted} />
        <Text style={styles.muted}>Leave and swap approvals are restricted to managers.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(kitchen)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Leave & Swap Approvals</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      <Text style={styles.section}>Leave Review · UC41 ({queue.length})</Text>
      {queue.length === 0 && <Text style={styles.muted}>No pending leave requests.</Text>}
      {queue.map((l) => (
        <TouchableOpacity key={l.id} style={styles.card} onPress={() => openLeave(l)} activeOpacity={0.7}>
          <Text style={styles.cardTitle}>{staffNameOf(staffNames, l.staffId)} — {l.leaveType}</Text>
          <Text style={styles.muted}>{l.startDate} → {l.endDate}</Text>
          <Text style={styles.review}>Tap to inspect ›</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.section}>Swap Review · UC43 ({swaps.length})</Text>
      {swaps.length === 0 && <Text style={styles.muted}>Nothing awaiting decision.</Text>}
      {swaps.map((s) => (
        <TouchableOpacity key={s.id} style={styles.card} onPress={() => openSwap(s)} activeOpacity={0.7}>
          <Text style={styles.cardTitle}>{s.requesterShiftId} ⇄ {s.targetShiftId}</Text>
          <Text style={styles.muted}>{s.status}</Text>
          <Text style={styles.review}>Tap to inspect ›</Text>
        </TouchableOpacity>
      ))}

      <DetailModal visible={selLeave !== null} title={selLeave ? `Leave — ${staffNameOf(staffNames, selLeave.staffId)}` : ''} onClose={() => setSelLeave(null)}>
        {selLeave && leaveStep === 'detail' && (
          <View>
            <StatusBadge status={selLeave.status} />
            <SectionTitle>REQUEST</SectionTitle>
            <KV label="Staff" value={staffNameOf(staffNames, selLeave.staffId)} />
            <KV label="Type" value={selLeave.leaveType} />
            <KV label="Dates" value={`${selLeave.startDate} → ${selLeave.endDate}`} />
            <KV label="Submitted" value={selLeave.submittedAt ? new Date(selLeave.submittedAt).toLocaleString() : '—'} />
            <SectionTitle>EVIDENCE ({(selLeave.supportingDocuments || []).length})</SectionTitle>
            {(selLeave.supportingDocuments || []).length === 0 && <Text style={styles.muted}>No supporting documents.</Text>}
            {(selLeave.supportingDocuments || []).map((d, i) => (
              <TouchableOpacity key={i} style={styles.doc} onPress={() => d.url && Linking.openURL(d.url)}>
                <Ionicons name={"document-text-outline" as any} size={18} color={theme.colors.primary} />
                <Text style={styles.docText}>{d.fileName || `Document ${i + 1}`}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
              value={leaveReason} onChangeText={setLeaveReason}
              placeholder="Decision reason (required to reject this leave)" placeholderTextColor={theme.colors.textMuted} multiline
            />
            <View style={styles.btnRow}>
              <ModalButton label="Reject" kind="danger" onPress={() => setLeaveStep('confirm-reject')} />
              <ModalButton label="Approve" onPress={() => setLeaveStep('confirm-approve')} />
            </View>
          </View>
        )}
        {selLeave && leaveStep === 'confirm-approve' && (
          <ConfirmBlock
            title="Approve this leave?"
            rows={[['Staff', selLeave.staffName || selLeave.staffId], ['Leave', `${selLeave.leaveType}: ${selLeave.startDate} → ${selLeave.endDate}`], ['Effect', 'Staff notified; roster validation will respect it']]}
            confirmLabel="Confirm approval" onConfirm={() => reviewLeave(true)} onCancel={() => setLeaveStep('detail')} busy={busy}
          />
        )}
        {selLeave && leaveStep === 'confirm-reject' && (
          <ConfirmBlock
            title="Reject this leave?"
            rows={[['Staff', selLeave.staffName || selLeave.staffId], ['Leave', `${selLeave.leaveType}: ${selLeave.startDate} → ${selLeave.endDate}`], ['Reason', leaveReason || '(none — required)']]}
            warning="Rejection is terminal for this request and is shown to the staff member."
            confirmLabel="Confirm rejection" danger onConfirm={() => reviewLeave(false)} onCancel={() => setLeaveStep('detail')} busy={busy}
          />
        )}
      </DetailModal>

      <DetailModal visible={selSwap !== null} title="Swap review" onClose={() => setSelSwap(null)}>
        {selSwap && swapStep === 'detail' && (() => {
          const a = shiftDetail(selSwap.requesterShiftId);
          const b = shiftDetail(selSwap.targetShiftId);
          return (
            <View>
              <StatusBadge status={selSwap.status} />
              <SectionTitle>REQUESTER SHIFT</SectionTitle>
              <KV label="Shift" value={selSwap.requesterShiftId} />
              <KV label="Staff" value={staffNameOf(staffNames, selSwap.requesterStaffId)} />
              <KV label="Detail" value={a ? `${a.date} ${a.startTime}–${a.endTime} · ${a.role} (week ${a.week})` : 'Not found on published rosters'} />
              <SectionTitle>TARGET SHIFT</SectionTitle>
              <KV label="Shift" value={selSwap.targetShiftId} />
              <KV label="Staff" value={staffNameOf(staffNames, selSwap.targetStaffId)} />
              <KV label="Detail" value={b ? `${b.date} ${b.startTime}–${b.endTime} · ${b.role} (week ${b.week})` : 'Not found on published rosters'} />
              <TextInput
                style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
                value={swapReason} onChangeText={setSwapReason}
                placeholder="Decision reason (required to reject this swap)" placeholderTextColor={theme.colors.textMuted} multiline
              />
              <View style={styles.btnRow}>
                <ModalButton label="Reject" kind="danger" onPress={() => setSwapStep('confirm-reject')} />
                <ModalButton label="Approve" onPress={() => setSwapStep('confirm-approve')} />
              </View>
            </View>
          );
        })()}
        {selSwap && swapStep === 'confirm-approve' && (
          <ConfirmBlock
            title="Approve this swap?"
            rows={[['Swap', `${selSwap.requesterShiftId} ⇄ ${selSwap.targetShiftId}`], ['Parties', `${selSwap.requesterStaffId} ⇄ ${selSwap.targetStaffId}`], ['Effect', 'Roster assignments swap; both parties notified']]}
            confirmLabel="Confirm approval" onConfirm={() => reviewSwap(true)} onCancel={() => setSwapStep('detail')} busy={busy}
          />
        )}
        {selSwap && swapStep === 'confirm-reject' && (
          <ConfirmBlock
            title="Reject this swap?"
            rows={[['Swap', `${selSwap.requesterShiftId} ⇄ ${selSwap.targetShiftId}`], ['Reason', swapReason || '(none — required)']]}
            warning="Rejection is terminal for this request."
            confirmLabel="Confirm rejection" danger onConfirm={() => reviewSwap(false)} onCancel={() => setSwapStep('detail')} busy={busy}
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
  cardTitle: { color: theme.colors.text, fontWeight: '700' },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 12, backgroundColor: 'transparent' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  docText: { color: theme.colors.primary, fontSize: 13, fontWeight: '600' },
});