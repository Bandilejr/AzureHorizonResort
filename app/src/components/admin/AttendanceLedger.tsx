// Attendance Ledger / Exceptions Board (managers).
// Punches stay on device + punch_records (geofence flags, never auto-rejects);
// this board derives exceptions vs shift_rosters and records verified hours with audit.
import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertModal } from '@/components/ui/AlertModal';
import { Loader2, ClipboardCheck } from 'lucide-react';
import {
  listenPunchRecords, listenShiftRosters, listenAttendanceExceptions,
  deriveAttendanceExceptions, reviewAttendanceException, notifyUser,
} from '@/services/increment2-services';
import { formatStatus } from '@/utils/statusLabels';
import type { ShiftRoster, AttendanceException } from '@/types/increment2';
import { useAuth } from '@/hooks/useAuth';

interface Punch { id: string; staffUid: string; staffName?: string; punchType: string; isoTime: string; withinRadius?: boolean }

export function AttendanceLedger() {
  const { user } = useAuth();
  const staffId = user?.uid || user?.id || '';
  const [punches, setPunches] = useState<Punch[]>([]);
  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [verified, setVerified] = useState<AttendanceException[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ staffId: string; staffName?: string; shiftId?: string; rosterId?: string; clockInAt?: string; clockOutAt?: string; hoursWorked?: number; exceptionType: string; existingDocId?: string } | null>(null);
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });

  useEffect(() => {
    const u1 = listenPunchRecords((list) => { setPunches(list as Punch[]); setLoading(false); });
    const u2 = listenShiftRosters(setRosters);
    const u3 = listenAttendanceExceptions(setVerified);
    return () => { u1(); u2(); u3(); };
  }, []);

  const verifiedKeys = new Set(verified.map((v) => `${v.staffId}|${v.clockInAt || ''}`));
  const derived = deriveAttendanceExceptions({ punches, rosters })
    .filter((d) => !verifiedKeys.has(`${d.staffId}|${d.clockInAt || ''}`));

  // Notify each staff member once per newly derived flag (session-scoped dedupe).
  const flaggedNotified = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const d of derived) {
      const key = `${d.staffId}|${d.clockInAt || ''}|${d.exceptionType}`;
      if (flaggedNotified.current.has(key)) continue;
      flaggedNotified.current.add(key);
      notifyUser({
        userId: d.staffId, type: 'attendance_flagged', title: 'Attendance flagged for review',
        message: `${d.exceptionType} recorded — a manager will review your attendance.`,
      }).catch(() => { /* best-effort */ });
    }
  }, [derived]);

  const save = async () => {
    if (!selected) return;
    if (!reason.trim()) {
      setAlert({ open: true, title: 'Reason required', message: 'Record an adjustment reason.', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      if (selected.existingDocId) {
        await reviewAttendanceException({
          exceptionDocId: selected.existingDocId, reviewerUid: staffId,
          approve: true, adjustedHours: hours ? Number(hours) : undefined, reason,
        });
      } else {
        const originalValue = JSON.stringify({ hoursWorked: selected.hoursWorked, reviewStatus: 'exception_review' });
        await addDoc(collection(db, 'attendance_exceptions'), {
          staffId: selected.staffId, staffName: selected.staffName || null,
          shiftId: selected.shiftId || null, rosterId: selected.rosterId || null,
          clockInAt: selected.clockInAt || null, clockOutAt: selected.clockOutAt || null,
          hoursWorked: hours ? Number(hours) : selected.hoursWorked ?? null,
          exceptionType: selected.exceptionType, reviewStatus: 'verified',
          adjustedBy: staffId, adjustedAt: now, adjustmentReason: reason,
          originalValue, newValue: JSON.stringify({ hoursWorked: hours ? Number(hours) : selected.hoursWorked, reviewStatus: 'verified' }),
          createdAt: now, timestamp: serverTimestamp(),
        });
      }
      setSelected(null); setHours(''); setReason('');
      setAlert({ open: true, title: 'Attendance verified', message: 'Verified hours recorded with audit trail.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Save failed', message: e instanceof Error ? e.message : 'Could not save.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex items-center gap-2 p-6 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading attendance…</div>;

  return (
    <div className="space-y-6">
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Exceptions — review ({derived.length})</CardTitle></CardHeader>
        <CardContent>
          {derived.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">No flagged attendance</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3">Staff</th><th className="py-2 pr-3">Shift</th>
                  <th className="py-2 pr-3">Clock In</th><th className="py-2 pr-3">Clock Out</th>
                  <th className="py-2 pr-3">Hours</th><th className="py-2 pr-3">Exception</th>
                  <th className="py-2 pr-3">Status</th><th className="py-2">Action</th>
                </tr></thead>
                <tbody>
                  {derived.map((d, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2 pr-3">{d.staffName || d.staffId}</td>
                      <td className="py-2 pr-3 text-xs">{d.shiftId || '—'}</td>
                      <td className="py-2 pr-3 text-xs">{d.clockInAt ? new Date(d.clockInAt).toLocaleString() : '—'}</td>
                      <td className="py-2 pr-3 text-xs">{d.clockOutAt ? new Date(d.clockOutAt).toLocaleString() : '—'}</td>
                      <td className="py-2 pr-3">{d.hoursWorked ?? '—'}</td>
                      <td className="py-2 pr-3"><Badge className="bg-amber-100 text-amber-800">{formatStatus(d.exceptionType)}</Badge></td>
                      <td className="py-2 pr-3"><Badge>{formatStatus(d.reviewStatus)}</Badge></td>
                      <td className="py-2"><Button size="sm" variant="outline" onClick={() => { setSelected({ ...d }); setHours(d.hoursWorked ? String(d.hoursWorked) : ''); setReason(''); }}>Review</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Verified records ({verified.length})</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {verified.length === 0 && <p className="text-sm text-slate-400 text-center py-4">None verified yet</p>}
          {verified.map((v) => (
            <div key={v.id} className="flex justify-between text-sm border-b py-1.5">
              <span>{v.staffName || v.staffId} · {formatStatus(v.exceptionType)} · {v.hoursWorked ?? '—'}h</span>
              <span className="text-xs text-slate-500">by {v.adjustedBy} · {v.adjustmentReason}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Review attendance — {selected.staffName || selected.staffId}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm">Exception: <Badge className="bg-amber-100 text-amber-800">{selected ? formatStatus(selected.exceptionType) : ''}</Badge></p>
              <div><Label>Verified hours</Label><Input type="number" step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} /></div>
              <div><Label>Adjustment reason *</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Approved 15 min grace, fingerprint log checked" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              <Button disabled={busy} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Verify hours</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
