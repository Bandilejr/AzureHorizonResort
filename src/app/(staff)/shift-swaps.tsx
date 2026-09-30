// (staff) UC43 — Shift Swaps. Layer 6 presentation rebuild; swap service
// calls and peer/manager flow unchanged. No raw UIDs/shift IDs in the UI.
import React, { useState, useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth } from '@/services/firebase-services';
import { listenPublishedRosters, listenMySwaps, requestSwapMobile, peerAcceptSwapMobile } from '@/services/increment2-services';
import type { ShiftRoster, ShiftSwap, RosterShift } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { useStaffNames, staffNameOf } from '@/hooks/use-staff-names';

type Step = 'detail' | 'confirm-request' | 'confirm-peer';

export default function ShiftSwapsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ myShiftId?: string }>();
  const theme = useAppTheme();
  const staffId = auth.currentUser?.uid || '';

  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [myShiftId, setMyShiftId] = useState('');
  const [targetShiftId, setTargetShiftId] = useState('');
  const [selSwap, setSelSwap] = useState<ShiftSwap | null>(null);
  const [step, setStep] = useState<Step>('detail');
  const [peerChoice, setPeerChoice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });
  const staffNames = useStaffNames();

  useEffect(() => {
    if (!staffId) { setLoaded(true); return; }
    setLoadError('');
    setLoaded(false);
    const onErr = (e: Error) => { setLoadError(e.message); setLoaded(true); };
    const u1 = listenPublishedRosters((l) => { setRosters(l); setLoaded(true); }, onErr);
    const u2 = listenMySwaps(staffId, setSwaps, onErr);
    return () => { u1(); u2(); };
  }, [staffId, retryKey]);

  useEffect(() => {
    if (typeof params.myShiftId === 'string' && params.myShiftId) setMyShiftId(params.myShiftId);
  }, [params.myShiftId]);

  const allShifts = rosters.flatMap((r) => (r.shifts || []).map((s) => ({ ...s, rosterDocId: r.id, week: r.weekStart, department: r.department })));
  const myShifts = allShifts.filter((s) => s.staffId === staffId);
  const myShift = myShifts.find((s) => s.shiftId === myShiftId) || null;
  const targetsRaw = myShift ? allShifts.filter((s) => s.week === myShift.week && s.staffId !== staffId) : [];
  const targets = targetsRaw.sort((a, b) => {
    const aScore = (a.department === myShift?.department ? 2 : 0) + (a.role === myShift?.role ? 1 : 0);
    const bScore = (b.department === myShift?.department ? 2 : 0) + (b.role === myShift?.role ? 1 : 0);
    return bScore - aScore;
  });
  const target = targets.find((s) => s.shiftId === targetShiftId) || null;

  const shiftLine = (s: (RosterShift & { week?: string }) | null) =>
    s ? `${s.date} ${s.startTime}–${s.endTime} · ${s.role} (week ${s.week || '—'})` : '—';

  const request = async () => {
    if (!myShift || !target) return;
    setBusy(true);
    try {
      await requestSwapMobile({ requesterShiftId: myShift.shiftId, targetShiftId: target.shiftId });
      setMyShiftId(''); setTargetShiftId(''); setSelSwap(null);
      showAlert({ title: 'Swap requested', message: 'Colleague must accept before manager review.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Request failed', message: e?.message || 'Could not request.', type: 'error' });
    } finally { setBusy(false); }
  };

  const peer = async () => {
    if (!selSwap) return;
    setBusy(true);
    try {
      await peerAcceptSwapMobile(selSwap.id, peerChoice);
      setSelSwap(null);
      showAlert({ title: peerChoice ? 'Accepted' : 'Declined', message: peerChoice ? 'Sent for manager approval.' : 'Requester notified.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Action failed', message: e?.message || 'Could not update.', type: 'error' });
    } finally { setBusy(false); }
  };

  const findShift = (id: string) => allShifts.find((s) => s.shiftId === id) || null;

  return (
    <Screen scroll>
      <PageHeader title="Shift swaps" subtitle="Request or respond to swaps" showBack fallback="/(staff)/staff-dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      {loadError && !loaded ? (
        <ErrorState title="Couldn't load swaps" message="Swap data is unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : !loaded ? (
        <Skeleton width="100%" height={200} radius={theme.radius.lg} />
      ) : (
        <>
          <SectionHeader title="1 · My shift" />
          {myShifts.length === 0 ? (
            <AppText variant="body" tone="muted">No published shifts assigned to you yet.</AppText>
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {myShifts.map((s, i) => {
                const picked = myShiftId === s.shiftId;
                return (
                  <View key={s.shiftId} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                    <ListRow
                      title={`${s.date} ${s.startTime}–${s.endTime}`}
                      subtitle={`${s.role} · ${s.department}`}
                      status={picked ? <StatusPill status="approved" size="sm" label="Selected" /> : undefined}
                      trailing={picked ? <Ionicons name="checkmark-circle" size={theme.iconSize.md} color={theme.colors.primary} /> : undefined}
                      showChevron={!picked}
                      onPress={() => { setMyShiftId(s.shiftId); setTargetShiftId(''); }}
                    />
                  </View>
                );
              })}
            </Card>
          )}

          {myShift ? (
            <>
              <SectionHeader title={`2 · Colleague shift (week ${myShift.week})`} />
              {targets.length === 0 ? (
                <AppText variant="body" tone="muted">No other shifts on this roster week.</AppText>
              ) : (
                <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
                  {targets.map((s, i) => {
                    const picked = targetShiftId === s.shiftId;
                    return (
                      <View key={s.shiftId} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                        <ListRow
                          title={`${s.date} ${s.startTime}–${s.endTime} · ${s.role}`}
                          subtitle={staffNameOf(staffNames, s.staffId)}
                          status={picked ? <StatusPill status="approved" size="sm" label="Selected" /> : undefined}
                          trailing={picked ? <Ionicons name="checkmark-circle" size={theme.iconSize.md} color={theme.colors.primary} /> : undefined}
                          showChevron={!picked}
                          onPress={() => setTargetShiftId(s.shiftId)}
                        />
                      </View>
                    );
                  })}
                </Card>
              )}
              {target ? (
                <Pressable onPress={() => setStep('confirm-request')} style={{ marginTop: theme.space.md }}>
                  <View style={{ backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, padding: 14, alignItems: 'center' }}>
                    <AppText variant="bodyStrong" color={theme.colors.textInverse}>Review swap request</AppText>
                  </View>
                </Pressable>
              ) : null}
            </>
          ) : null}

          <SectionHeader title={`My swaps (${swaps.length})`} />
          {swaps.length === 0 ? (
            <EmptyState icon="swap-horizontal-outline" title="No swap requests yet" message="Requested and received swaps appear here." />
          ) : (
            <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
              {swaps.map((s, i) => (
                <View key={s.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                  <ListRow
                    title="Shift swap"
                    subtitle={`${shiftLine(findShift(s.requesterShiftId))}  ⇄  ${shiftLine(findShift(s.targetShiftId))}`}
                    status={<StatusPill status={s.status} size="sm" />}
                    onPress={() => { setSelSwap(s); setStep('detail'); }}
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      )}

      <DetailModal
        visible={step === 'confirm-request' || selSwap !== null}
        title={step === 'confirm-request' ? 'Review swap request' : 'Swap detail'}
        onClose={() => { setSelSwap(null); setStep('detail'); }}
      >
        {step === 'confirm-request' && myShift && target ? (
          <ConfirmBlock
            title="Send this swap request?"
            rows={[
              ['Your shift', shiftLine(myShift)],
              ['Their shift', shiftLine(target)],
              ['Colleague', staffNameOf(staffNames, target.staffId)],
              ['Next', 'Colleague accepts → manager approves → roster updates'],
            ]}
            confirmLabel="Send request" onConfirm={request} onCancel={() => setStep('detail')} busy={busy}
          />
        ) : null}
        {selSwap && step === 'detail' ? (() => {
          const a = findShift(selSwap.requesterShiftId);
          const b = findShift(selSwap.targetShiftId);
          const canPeer = selSwap.targetStaffId === staffId && selSwap.status === 'pending_peer';
          return (
            <View>
              <StatusBadge status={selSwap.status} />
              <SectionTitle>REQUESTER</SectionTitle>
              <KV label="Staff" value={staffNameOf(staffNames, selSwap.requesterStaffId)} />
              <KV label="Shift" value={shiftLine(a)} />
              <SectionTitle>TARGET</SectionTitle>
              <KV label="Staff" value={staffNameOf(staffNames, selSwap.targetStaffId)} />
              <KV label="Shift" value={shiftLine(b)} />
              {selSwap.reviewedBy ? <KV label="Reviewed" value="Manager" /> : null}
              {selSwap.rejectionReason ? <KV label="Reason" value={selSwap.rejectionReason} /> : null}
              {canPeer ? (
                <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.md }}>
                  <ModalButton label="Decline" kind="danger" onPress={() => { setPeerChoice(false); setStep('confirm-peer'); }} />
                  <ModalButton label="Accept" onPress={() => { setPeerChoice(true); setStep('confirm-peer'); }} />
                </View>
              ) : null}
            </View>
          );
        })() : null}
        {selSwap && step === 'confirm-peer' ? (
          <ConfirmBlock
            title={peerChoice ? 'Accept this swap?' : 'Decline this swap?'}
            rows={[
              ['Swap', `${shiftLine(findShift(selSwap.requesterShiftId))} ⇄ ${shiftLine(findShift(selSwap.targetShiftId))}`],
              ['Effect', peerChoice ? 'Goes to manager for final approval' : 'Requester is notified'],
            ]}
            confirmLabel={peerChoice ? 'Confirm accept' : 'Confirm decline'}
            danger={!peerChoice} onConfirm={peer} onCancel={() => setStep('detail')} busy={busy}
          />
        ) : null}
      </DetailModal>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
