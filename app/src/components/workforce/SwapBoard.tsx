// Shift Swap: request → peer accept → manager approve (atomic both-assignment update).
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertModal } from '@/components/ui/AlertModal';
import { Repeat } from 'lucide-react';
import {
  listenShiftRosters, listenShiftSwaps, requestShiftSwap, peerAcceptSwap, reviewShiftSwap,
} from '@/services/increment2-services';
import type { ShiftRoster, ShiftSwap } from '@/types/increment2';
import { formatStatus } from '@/utils/statusLabels';
import { useAuth } from '@/hooks/useAuth';

export function SwapBoard({ managerView }: { managerView?: boolean }) {
  const { user } = useAuth();
  const staffId = user?.uid || user?.id || '';
  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [form, setForm] = useState({ myShift: '', rosterDoc: '', targetStaff: '', targetShift: '' });
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });

  useEffect(() => {
    const u1 = listenShiftRosters(setRosters);
    const u2 = listenShiftSwaps(setSwaps);
    return () => { u1(); u2(); };
  }, []);

  const myShifts = rosters.flatMap((r) => r.shifts.filter((s) => s.staffId === staffId).map((s) => ({ ...s, rosterDocId: r.id })));
  const visible = managerView ? swaps.filter((s) => s.status === 'pending_manager' || s.status === 'peer_accepted')
    : swaps.filter((s) => s.requesterStaffId === staffId || s.targetStaffId === staffId);

  const request = async () => {
    setBusy(true);
    try {
      const rosterDocId = form.rosterDoc || myShifts.find((s) => s.shiftId === form.myShift)?.rosterDocId || '';
      await requestShiftSwap({
        requesterStaffId: staffId, requesterShiftId: form.myShift,
        targetStaffId: form.targetStaff, targetShiftId: form.targetShift, rosterId: rosterDocId,
      });
      setForm({ myShift: '', rosterDoc: '', targetStaff: '', targetShift: '' });
      setAlert({ open: true, title: 'Swap requested', message: 'Colleague must accept before manager review.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Request failed', message: e instanceof Error ? e.message : 'Could not request.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const peer = async (id: string, accept: boolean) => {
    setBusy(true);
    try {
      await peerAcceptSwap(id, staffId, accept);
      setAlert({ open: true, title: accept ? 'Swap accepted' : 'Swap declined', message: accept ? 'Sent for manager approval.' : 'Requester notified.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Action failed', message: e instanceof Error ? e.message : 'Could not update.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const decide = async (s: ShiftSwap, approve: boolean) => {
    setBusy(true);
    try {
      const rosterDocId = s.rosterId || rosters.find((r) => r.shifts.some((x) => x.shiftId === s.requesterShiftId))?.id || '';
      await reviewShiftSwap({ swapDocId: s.id, approve, reviewerUid: staffId, rosterDocId, reason: approve ? undefined : 'Operational coverage required.' });
      setAlert({ open: true, title: approve ? 'Swap approved' : 'Swap rejected', message: approve ? 'Both assignments updated atomically.' : 'Parties notified.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Review failed', message: e instanceof Error ? e.message : 'Could not review.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      {!managerView && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Repeat className="h-5 w-5" /> Request Shift Swap</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>My shift</Label>
                <select className="w-full border rounded-md p-2 text-sm" value={form.myShift} onChange={(e) => {
                  const found = myShifts.find((s) => s.shiftId === e.target.value);
                  setForm((p) => ({ ...p, myShift: e.target.value, rosterDoc: found?.rosterDocId || '' }));
                }}>
                  <option value="">Select…</option>
                  {myShifts.map((s) => <option key={s.shiftId} value={s.shiftId}>{s.date} {s.startTime}–{s.endTime} ({s.role})</option>)}
                </select>
              </div>
              <div><Label>Colleague staff ID</Label><Input value={form.targetStaff} onChange={(e) => setForm((p) => ({ ...p, targetStaff: e.target.value }))} placeholder="uid / email" /></div>
              <div className="md:col-span-2"><Label>Their shift ID</Label><Input value={form.targetShift} onChange={(e) => setForm((p) => ({ ...p, targetShift: e.target.value }))} placeholder="Ask colleague for shift ID from their roster" /></div>
            </div>
            <Button onClick={request} disabled={busy || !form.myShift || !form.targetStaff || !form.targetShift}>Send swap request</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">{managerView ? 'Swaps awaiting manager decision' : 'My swaps'} ({visible.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {visible.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Nothing here</p>}
          {visible.map((s) => (
            <div key={s.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm">{s.requesterStaffId} ⇄ {s.targetStaffId}</p>
                <Badge>{formatStatus(s.status)}</Badge>
              </div>
              <p className="text-xs text-slate-500">{s.requesterShiftId} ⇄ {s.targetShiftId}</p>
              <div className="flex gap-2 mt-2">
                {!managerView && s.targetStaffId === staffId && s.status === 'pending_peer' && (
                  <>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => peer(s.id, true)}>Accept</Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => peer(s.id, false)}>Decline</Button>
                  </>
                )}
                {managerView && (s.status === 'pending_manager' || s.status === 'peer_accepted') && (
                  <>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => decide(s, true)}>Approve</Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide(s, false)}>Reject</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
