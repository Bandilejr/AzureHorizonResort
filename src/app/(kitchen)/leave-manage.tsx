// (kitchen) manager — leave approvals (UC41) + swap approvals (UC43).
// Layer 6 presentation rebuild; reviewLeaveMobile/reviewSwapMobile payloads
// unchanged. Raw shift IDs/UIDs replaced with human shift lines and names.
import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenLeaveQueue, listenPendingSwaps, listenPublishedRosters, reviewLeaveMobile, reviewSwapMobile } from '@/services/increment2-services';
import type { LeaveRequest, ShiftSwap, ShiftRoster } from '@/types/increment2';
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
import { useStaffNames, staffNameOf } from '@/hooks/use-staff-names';
import { usePermissions } from '@/context/PermissionsContext';

type Step = 'detail' | 'confirm-approve' | 'confirm-reject';

export default function LeaveManageScreen() {
  const theme = useAppTheme();

  const [queue, setQueue] = useState<LeaveRequest[]>([]);
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [selLeave, setSelLeave] = useState<LeaveRequest | null>(null);
  const [leaveStep, setLeaveStep] = useState<Step>('detail');
  const [leaveReason, setLeaveReason] = useState('');
  const [selSwap, setSelSwap] = useState<ShiftSwap | null>(null);
  const [swapStep, setSwapStep] = useState<Step>('detail');
  const [swapReason, setSwapReason] = useState('');
  const [busy, setBusy] = useState(false);
  const staffNames = useStaffNames();
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });
  const { hasPermission } = usePermissions();

  useEffect(() => {
    setLoadError('');
    setLoaded(false);
    const onErr = (e: Error) => { setLoadError(e.message); setLoaded(true); };
    const u1 = listenLeaveQueue((l) => { setQueue(l); setLoaded(true); }, onErr);
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
  const shiftLine = (id: string) => {
    const s = shiftDetail(id);
    return s ? `${s.date} ${s.startTime}–${s.endTime} · ${s.role}` : 'Shift not found on published rosters';
  };

  const openLeave = (l: LeaveRequest) => { setSelLeave(l); setLeaveStep('detail'); setLeaveReason(''); };
  const openSwap = (s: ShiftSwap) => { setSelSwap(s); setSwapStep('detail'); setSwapReason(''); };

  const reviewLeave = async (approve: boolean) => {
    if (!selLeave) return;
    if (!approve && !leaveReason.trim()) { showAlert({ title: 'Reason required', message: 'Enter a rejection reason for this leave request.', type: 'error' }); return; }
    setBusy(true);
    try {
      await reviewLeaveMobile({ leaveDocId: selLeave.id, approve, reason: leaveReason });
      setSelLeave(null); setLeaveReason('');
      showAlert({ title: approve ? 'Leave approved' : 'Leave rejected', message: 'Staff member notified.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Review failed', message: e?.message || 'Could not review.', type: 'error' });
    } finally { setBusy(false); }
  };

  const reviewSwap = async (approve: boolean) => {
    if (!selSwap) return;
    if (!approve && !swapReason.trim()) { showAlert({ title: 'Reason required', message: 'Enter a rejection reason for this swap.', type: 'error' }); return; }
    setBusy(true);
    try {
      await reviewSwapMobile({ swapDocId: selSwap.id, approve, reason: swapReason });
      setSelSwap(null); setSwapReason('');
      showAlert({ title: approve ? 'Swap approved' : 'Swap rejected', message: approve ? 'Both assignments updated.' : 'Parties notified.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Review failed', message: e?.message || 'Could not review.', type: 'error' });
    } finally { setBusy(false); }
  };

  if (!hasPermission('leave_approve')) {
    return (
      <Screen>
        <PageHeader title="Approvals" showBack fallback="/(kitchen)/dashboard" />
        <EmptyState icon="lock-closed-outline" title="Restricted" message="Leave and swap approvals are restricted to managers." />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <PageHeader title="Approvals" subtitle="Leave & shift swaps awaiting decision" showBack fallback="/(kitchen)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      {loadError && !loaded ? (
        <ErrorState title="Couldn't load approvals" message="The approvals queue is unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : !loaded ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          <SectionHeader title={`Leave review (${queue.length})`} />
          {queue.length === 0 ? (
            <AppText variant="body" tone="muted">No pending leave requests.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {queue.map((l, i) => (
                <View key={l.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={`${staffNameOf(staffNames, l.staffId)} — ${l.leaveType}`}
                    subtitle={`${l.startDate} → ${l.endDate}`}
                    status={<StatusPill status={l.status} size="sm" />}
                    onPress={() => openLeave(l)}
                  />
                </View>
              ))}
            </Card>
          )}

          <SectionHeader title={`Swap review (${swaps.length})`} />
          {swaps.length === 0 ? (
            <AppText variant="body" tone="muted">Nothing awaiting decision.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {swaps.map((s, i) => (
                <View key={s.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title={`${staffNameOf(staffNames, s.requesterStaffId)} ⇄ ${staffNameOf(staffNames, s.targetStaffId)}`}
                    subtitle={`${shiftLine(s.requesterShiftId)}  ⇄  ${shiftLine(s.targetShiftId)}`}
                    status={<StatusPill status={s.status} size="sm" />}
                    onPress={() => openSwap(s)}
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      )}

      <DetailModal visible={selLeave !== null} title={selLeave ? `Leave — ${staffNameOf(staffNames, selLeave.staffId)}` : ''} onClose={() => setSelLeave(null)}>
        {selLeave && leaveStep === 'detail' ? (
          <View>
            <StatusBadge status={selLeave.status} />
            <SectionTitle>REQUEST</SectionTitle>
            <KV label="Staff" value={staffNameOf(staffNames, selLeave.staffId)} />
            <KV label="Type" value={selLeave.leaveType} />
            <KV label="Dates" value={`${selLeave.startDate} → ${selLeave.endDate}`} />
            <KV label="Submitted" value={selLeave.submittedAt ? new Date(selLeave.submittedAt).toLocaleString() : '—'} />
            <SectionTitle>{`EVIDENCE (${(selLeave.supportingDocuments || []).length})`}</SectionTitle>
            {(selLeave.supportingDocuments || []).length === 0 ? <AppText variant="body" tone="muted">No supporting documents.</AppText> : null}
            {(selLeave.supportingDocuments || []).map((d, i) => (
              <TouchableOpacity key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, paddingVertical: 6 }} onPress={() => d.url && Linking.openURL(d.url)}>
                <Ionicons name="document-text-outline" size={18} color={theme.colors.primary} />
                <AppText variant="body" tone="primary" weight="600">{d.fileName || `Document ${i + 1}`}</AppText>
              </TouchableOpacity>
            ))}
            <View style={{ marginTop: theme.space.md }}>
              <Field label="Decision reason (required to reject)" value={leaveReason} onChangeText={setLeaveReason} multiline />
            </View>
            <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.md }}>
              <ModalButton label="Reject" kind="danger" onPress={() => setLeaveStep('confirm-reject')} />
              <ModalButton label="Approve" onPress={() => setLeaveStep('confirm-approve')} />
            </View>
          </View>
        ) : null}
        {selLeave && leaveStep === 'confirm-approve' ? (
          <ConfirmBlock
            title="Approve this leave?"
            rows={[['Staff', staffNameOf(staffNames, selLeave.staffId)], ['Leave', `${selLeave.leaveType}: ${selLeave.startDate} → ${selLeave.endDate}`], ['Effect', 'Staff notified; roster validation will respect it']]}
            confirmLabel="Confirm approval" onConfirm={() => reviewLeave(true)} onCancel={() => setLeaveStep('detail')} busy={busy}
          />
        ) : null}
        {selLeave && leaveStep === 'confirm-reject' ? (
          <ConfirmBlock
            title="Reject this leave?"
            rows={[['Staff', staffNameOf(staffNames, selLeave.staffId)], ['Leave', `${selLeave.leaveType}: ${selLeave.startDate} → ${selLeave.endDate}`], ['Reason', leaveReason || '(none — required)']]}
            warning="Rejection is terminal for this request and is shown to the staff member."
            confirmLabel="Confirm rejection" danger onConfirm={() => reviewLeave(false)} onCancel={() => setLeaveStep('detail')} busy={busy}
          />
        ) : null}
      </DetailModal>

      <DetailModal visible={selSwap !== null} title="Swap review" onClose={() => setSelSwap(null)}>
        {selSwap && swapStep === 'detail' ? (
          <View>
            <StatusBadge status={selSwap.status} />
            <SectionTitle>REQUESTER SHIFT</SectionTitle>
            <KV label="Staff" value={staffNameOf(staffNames, selSwap.requesterStaffId)} />
            <KV label="Shift" value={shiftLine(selSwap.requesterShiftId)} />
            <SectionTitle>TARGET SHIFT</SectionTitle>
            <KV label="Staff" value={staffNameOf(staffNames, selSwap.targetStaffId)} />
            <KV label="Shift" value={shiftLine(selSwap.targetShiftId)} />
            <View style={{ marginTop: theme.space.md }}>
              <Field label="Decision reason (required to reject)" value={swapReason} onChangeText={setSwapReason} multiline />
            </View>
            <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.md }}>
              <ModalButton label="Reject" kind="danger" onPress={() => setSwapStep('confirm-reject')} />
              <ModalButton label="Approve" onPress={() => setSwapStep('confirm-approve')} />
            </View>
          </View>
        ) : null}
        {selSwap && swapStep === 'confirm-approve' ? (
          <ConfirmBlock
            title="Approve this swap?"
            rows={[['Swap', `${shiftLine(selSwap.requesterShiftId)} ⇄ ${shiftLine(selSwap.targetShiftId)}`], ['Parties', `${staffNameOf(staffNames, selSwap.requesterStaffId)} ⇄ ${staffNameOf(staffNames, selSwap.targetStaffId)}`], ['Effect', 'Roster assignments swap; both parties notified']]}
            confirmLabel="Confirm approval" onConfirm={() => reviewSwap(true)} onCancel={() => setSwapStep('detail')} busy={busy}
          />
        ) : null}
        {selSwap && swapStep === 'confirm-reject' ? (
          <ConfirmBlock
            title="Reject this swap?"
            rows={[['Swap', `${shiftLine(selSwap.requesterShiftId)} ⇄ ${shiftLine(selSwap.targetShiftId)}`], ['Reason', swapReason || '(none — required)']]}
            warning="Rejection is terminal for this request."
            confirmLabel="Confirm rejection" danger onConfirm={() => reviewSwap(false)} onCancel={() => setSwapStep('detail')} busy={busy}
          />
        ) : null}
      </DetailModal>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
