// UC41 — Staff availability + leave (submit) and manager approval queue.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertModal } from '@/components/ui/AlertModal';
import { Loader2, CalendarOff, CheckCircle2, XCircle } from 'lucide-react';
import {
  submitAvailability, submitLeaveRequest,
  listenLeaveRequests, reviewLeaveRequest,
} from '@/services/increment2-services';
import { formatStatus } from '@/utils/statusLabels';
import type { LeaveRequest } from '@/types/increment2';
import { useAuth } from '@/hooks/useAuth';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function LeaveManagement({ managerView }: { managerView?: boolean }) {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Record<string, { start: string; end: string; on: boolean }>>(
    Object.fromEntries(DAYS.map((d) => [d, { start: '08:00', end: '17:00', on: true }]))
  );
  const [leave, setLeave] = useState({ type: 'Annual', start: '', end: '' });
  const [queue, setQueue] = useState<LeaveRequest[]>([]);
  const [myLeave, setMyLeave] = useState<LeaveRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });
  const staffId = user?.uid || user?.id || '';

  useEffect(() => {
    const u1 = managerView
      ? listenLeaveRequests(setQueue, 'pending')
      : listenLeaveRequests((list) => setMyLeave(list.filter((l) => l.staffId === staffId)));
    return () => u1();
  }, [managerView, staffId]);

  const saveAvailability = async () => {
    setBusy(true);
    try {
      await submitAvailability({
        staffId, staffName: user?.name, weekStart,
        availability: DAYS.filter((d) => slots[d].on).map((d) => ({ day: d, startTime: slots[d].start, endTime: slots[d].end })),
        unavailableDates: [],
      });
      setAlert({ open: true, title: 'Availability saved', message: `Week of ${weekStart} submitted.`, type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Save failed', message: e instanceof Error ? e.message : 'Could not save.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const submitLeave = async () => {
    setBusy(true);
    try {
      await submitLeaveRequest({
        staffId, staffName: user?.name, leaveType: leave.type,
        startDate: leave.start, endDate: leave.end, supportingDocuments: [],
      });
      setAlert({ open: true, title: 'Leave submitted', message: 'Manager will review your request.', type: 'success' });
      setLeave({ type: 'Annual', start: '', end: '' });
    } catch (e) {
      setAlert({ open: true, title: 'Submission failed', message: e instanceof Error ? e.message : 'Could not submit.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, approve: boolean) => {
    if (!approve && !rejectReason.trim()) {
      setAlert({ open: true, title: 'Reason required', message: 'Provide a rejection reason.', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await reviewLeaveRequest({ leaveDocId: id, approve, reviewerUid: staffId, reason: rejectReason });
      setRejectId(null); setRejectReason('');
      setAlert({ open: true, title: approve ? 'Leave approved' : 'Leave rejected', message: 'Staff member notified.', type: 'success' });
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
        <>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5" /> Weekly Availability</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="max-w-xs"><Label>Week start</Label><Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} /></div>
              {DAYS.map((d) => (
                <div key={d} className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-2 w-32 cursor-pointer">
                    <input type="checkbox" checked={slots[d].on} onChange={(e) => setSlots((p) => ({ ...p, [d]: { ...p[d], on: e.target.checked } }))} className="h-4 w-4" />{d}
                  </label>
                  {slots[d].on && (
                    <>
                      <Input type="time" className="w-32" value={slots[d].start} onChange={(e) => setSlots((p) => ({ ...p, [d]: { ...p[d], start: e.target.value } }))} />
                      <span>→</span>
                      <Input type="time" className="w-32" value={slots[d].end} onChange={(e) => setSlots((p) => ({ ...p, [d]: { ...p[d], end: e.target.value } }))} />
                    </>
                  )}
                </div>
              ))}
              <Button onClick={saveAvailability} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Submit availability</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Request Leave</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><Label>Type</Label><Input value={leave.type} onChange={(e) => setLeave((p) => ({ ...p, type: e.target.value }))} placeholder="Annual / Sick / Family" /></div>
                <div><Label>Start</Label><Input type="date" value={leave.start} onChange={(e) => setLeave((p) => ({ ...p, start: e.target.value }))} /></div>
                <div><Label>End</Label><Input type="date" value={leave.end} onChange={(e) => setLeave((p) => ({ ...p, end: e.target.value }))} /></div>
              </div>
              <Button onClick={submitLeave} disabled={busy || !leave.start || !leave.end}>Submit leave request</Button>
              {myLeave.length > 0 && (
                <div className="pt-2 space-y-1">
                  {myLeave.map((l) => (
                    <div key={l.id} className="flex justify-between text-sm border-b py-1.5">
                      <span>{l.leaveType}: {l.startDate} → {l.endDate}</span><Badge>{formatStatus(l.status)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {managerView && (
        <Card>
          <CardHeader><CardTitle>Leave Approval Queue ({queue.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {queue.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No pending requests</p>}
            {queue.map((l) => (
              <div key={l.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{l.staffName || l.staffId} — {l.leaveType}</p>
                  <Badge>pending</Badge>
                </div>
                <p className="text-xs text-slate-500">{l.startDate} → {l.endDate} · submitted {new Date(l.submittedAt).toLocaleString()}</p>
                {rejectId === l.id ? (
                  <div className="flex gap-2 mt-2">
                    <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason *" />
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => review(l.id, false)}>Confirm</Button>
                    <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectReason(''); }}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => review(l.id, true)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setRejectId(l.id)}>
                      <XCircle className="h-3 w-3 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
