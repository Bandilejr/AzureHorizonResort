// (staff) UC43 — Shift Swaps.
// REMEDIATED Phase C (§24): My shift (picker from my published shifts) →
// eligible colleague shifts (same roster week, tappable) → review → send.
// Peer decisions and manager queue view include full shift detail + confirm.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '@/services/firebase-services';
import { listenPublishedRosters, listenMySwaps, requestSwapMobile, peerAcceptSwapMobile } from '@/services/increment2-services';
import type { ShiftRoster, ShiftSwap, RosterShift } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { useStaffNames, staffNameOf } from '@/hooks/use-staff-names';
import { goBack } from '@/utils/navigation';
import { useRouter, useLocalSearchParams } from 'expo-router';

type Step = 'detail' | 'confirm-request' | 'confirm-peer';

export default function ShiftSwapsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ myShiftId?: string }>();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const staffId = auth.currentUser?.uid || '';

  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [myShiftId, setMyShiftId] = useState('');
  const [targetShiftId, setTargetShiftId] = useState('');
  const [selSwap, setSelSwap] = useState<ShiftSwap | null>(null);
  const [step, setStep] = useState<Step>('detail');
  const [peerChoice, setPeerChoice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });
  // Phase 2 (§3.A): human-readable colleague names — never raw UIDs in the UI.
  const staffNames = useStaffNames();

  useEffect(() => {
    if (!staffId) return;
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenPublishedRosters(setRosters, onErr);
    const u2 = listenMySwaps(staffId, setSwaps, onErr);
    return () => { u1(); u2(); };
  }, [staffId, retryKey]);

  // Deep handoff from My Roster shift detail (prefills step 1).
  useEffect(() => {
    if (typeof params.myShiftId === 'string' && params.myShiftId) setMyShiftId(params.myShiftId);
  }, [params.myShiftId]);

  const allShifts = rosters.flatMap((r) =>
    (r.shifts || []).map((s) => ({ ...s, rosterDocId: r.id, week: r.weekStart, department: r.department })));
  const myShifts = allShifts.filter((s) => s.staffId === staffId);
  const myShift = myShifts.find((s) => s.shiftId === myShiftId) || null;
  // Eligible targets: same weekStart (Deputy/WhenIWork pattern — not same doc) + not self.
  // Scoring: same department first, then same role (recommended).
  const targetsRaw = myShift
    ? allShifts.filter((s) => s.week === myShift.week && s.staffId !== staffId)
    : [];
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
    } finally {
      setBusy(false);
    }
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
    } finally {
      setBusy(false);
    }
  };

  const findShift = (id: string) => allShifts.find((s) => s.shiftId === id) || null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(staff)/staff-dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Shift Swaps</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      <Text style={styles.section}>1 · My shift</Text>
      {myShifts.length === 0 && <Text style={styles.muted}>No published shifts assigned to you yet.</Text>}
      {myShifts.map((s) => (
        <TouchableOpacity key={s.shiftId} style={[styles.pick, myShiftId === s.shiftId && styles.picked]} onPress={() => { setMyShiftId(s.shiftId); setTargetShiftId(''); }}>
          <Text style={styles.cardTitle}>{s.date} {s.startTime}–{s.endTime} · {s.role}</Text>
        </TouchableOpacity>
      ))}

      {myShift && (
        <>
          <Text style={styles.section}>2 · Colleague shift (week {myShift.week})</Text>
          {targets.length === 0 && <Text style={styles.muted}>No other shifts on this roster week.</Text>}
          {targets.map((s) => (
            <TouchableOpacity key={s.shiftId} style={[styles.pick, targetShiftId === s.shiftId && styles.picked]} onPress={() => setTargetShiftId(s.shiftId)}>
              <Text style={styles.cardTitle}>{s.date} {s.startTime}–{s.endTime} · {s.role}</Text>
              <Text style={styles.muted}>{staffNameOf(staffNames, s.staffId)}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {myShift && target && (
        <View style={{ marginTop: 12 }}>
          <ModalButton label="Review swap request" onPress={() => setStep('confirm-request')} />
        </View>
      )}

      <Text style={styles.section}>My swaps ({swaps.length})</Text>
      {swaps.length === 0 && <Text style={styles.muted}>No swap requests yet.</Text>}
      {swaps.map((s) => (
        <TouchableOpacity key={s.id} style={styles.card} onPress={() => { setSelSwap(s); setStep('detail'); }} activeOpacity={0.7}>
          <Text style={styles.cardTitle}>{s.requesterShiftId} ⇄ {s.targetShiftId}</Text>
          <Text style={styles.muted}>{s.status}</Text>
          <Text style={styles.review}>Tap to inspect ›</Text>
        </TouchableOpacity>
      ))}

      <DetailModal
        visible={step === 'confirm-request' || selSwap !== null}
        title={step === 'confirm-request' ? 'Review swap request' : 'Swap detail'}
        onClose={() => { setSelSwap(null); setStep('detail'); }}
      >
        {step === 'confirm-request' && myShift && target && (
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
        )}
        {selSwap && step === 'detail' && (() => {
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
              {!!selSwap.reviewedBy && <KV label="Reviewed by" value={selSwap.reviewedBy} />}
              {!!selSwap.rejectionReason && <KV label="Reason" value={selSwap.rejectionReason} />}
              {canPeer && (
                <View style={styles.btnRow}>
                  <ModalButton label="Decline" kind="danger" onPress={() => { setPeerChoice(false); setStep('confirm-peer'); }} />
                  <ModalButton label="Accept" onPress={() => { setPeerChoice(true); setStep('confirm-peer'); }} />
                </View>
              )}
            </View>
          );
        })()}
        {selSwap && step === 'confirm-peer' && (
          <ConfirmBlock
            title={peerChoice ? 'Accept this swap?' : 'Decline this swap?'}
            rows={[
              ['Swap', `${selSwap.requesterShiftId} ⇄ ${selSwap.targetShiftId}`],
              ['Effect', peerChoice ? 'Goes to manager for final approval' : 'Requester is notified'],
            ]}
            confirmLabel={peerChoice ? 'Confirm accept' : 'Confirm decline'}
            danger={!peerChoice} onConfirm={peer} onCancel={() => setStep('detail')} busy={busy}
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
  pick: { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  picked: { borderColor: theme.colors.primary, borderWidth: 2 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTitle: { color: theme.colors.text, fontWeight: '600' },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
});