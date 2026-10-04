// Shift Roster Builder: weekly roster + validation (overtime/rest/availability/leave/skill) + publish.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertModal } from '@/components/ui/AlertModal';
import { Loader2, CalendarPlus, Send, AlertTriangle } from 'lucide-react';
import {
  listenStaffAvailability, listenLeaveRequests, listenShiftRosters,
  saveRoster, publishRoster,
} from '@/services/increment2-services';
import type { RosterShift, ShiftRoster, StaffAvailability, LeaveRequest } from '@/types/increment2';
import { formatStatus } from '@/utils/statusLabels';
import { useAuth } from '@/hooks/useAuth';

export function RosterBuilder() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [department, setDepartment] = useState('Food & Beverage');
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [draft, setDraft] = useState({ staffId: '', date: '', start: '08:00', end: '17:00', role: '', skill: '' });
  const [availability, setAvailability] = useState<StaffAvailability[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmPublishId, setConfirmPublishId] = useState<string | null>(null);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });
  const staffId = user?.uid || user?.id || '';

  useEffect(() => {
    const u1 = listenStaffAvailability(setAvailability);
    const u2 = listenLeaveRequests(setLeave);
    const u3 = listenShiftRosters(setRosters, weekStart);
    return () => { u1(); u2(); u3(); };
  }, [weekStart]);

  const approvedLeave = leave.filter((l) => l.status === 'approved');

  const addShift = () => {
    if (!draft.staffId.trim() || !draft.date || !draft.role.trim()) {
      setAlert({ open: true, title: 'Incomplete shift', message: 'Staff, date and role are required.', type: 'error' });
      return;
    }
    const skill = draft.skill.trim();
    const entry: RosterShift = {
      shiftId: `SH-${Date.now().toString(36).toUpperCase()}`,
      staffId: draft.staffId.trim(), date: draft.date,
      startTime: draft.start, endTime: draft.end,
      role: draft.role.trim(),
    };
    if (skill) entry.requiredSkill = skill;
    setShifts((p) => [...p, entry]);
    setDraft({ staffId: '', date: '', start: '08:00', end: '17:00', role: '', skill: '' });
  };

  const save = async () => {
    setBusy(true);
    try {
      const { warnings: w } = await saveRoster({
        weekStart, department, shifts, availability, approvedLeave, authorUid: staffId,
      });
      setWarnings(w);
      setAlert({
        open: true, title: w.length ? 'Draft saved with warnings' : 'Roster validated',
        message: w.length ? `${w.length} conflict(s) must be resolved before publishing.` : 'No conflicts — ready to publish.',
        type: w.length ? 'info' : 'success',
      });
    } catch (e) {
      setAlert({ open: true, title: 'Save failed', message: e instanceof Error ? e.message : 'Could not save.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const publish = async (docId: string) => {
    setBusy(true);
    try {
      await publishRoster(docId, staffId);
      setConfirmPublishId(null);
      setAlert({ open: true, title: 'Roster published', message: 'Assigned staff have been notified. Roster is now locked.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Publish blocked', message: e instanceof Error ? e.message : 'Could not publish.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarPlus className="h-5 w-5" /> Shift Roster Builder</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-xl">
            <div><Label>Week start</Label><Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} /></div>
            <div><Label>Department</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end border rounded-lg p-3">
            <div><Label>Staff ID</Label><Input value={draft.staffId} onChange={(e) => setDraft((p) => ({ ...p, staffId: e.target.value }))} placeholder="uid / email" /></div>
            <div><Label>Date</Label><Input type="date" value={draft.date} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} /></div>
            <div><Label>Start</Label><Input type="time" value={draft.start} onChange={(e) => setDraft((p) => ({ ...p, start: e.target.value }))} /></div>
            <div><Label>End</Label><Input type="time" value={draft.end} onChange={(e) => setDraft((p) => ({ ...p, end: e.target.value }))} /></div>
            <div><Label>Role</Label><Input value={draft.role} onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))} placeholder="chef" /></div>
            <Button onClick={addShift}>Add</Button>
          </div>
          {shifts.length > 0 && (
            <div className="space-y-1">
              {shifts.map((s) => (
                <div key={s.shiftId} className="flex justify-between text-sm border-b py-1.5">
                  <span>{s.date} {s.startTime}–{s.endTime} · {s.staffId} · {s.role}{s.requiredSkill ? ` (${s.requiredSkill})` : ''}</span>
                  <Button size="sm" variant="ghost" onClick={() => setShifts((p) => p.filter((x) => x.shiftId !== s.shiftId))}>Remove</Button>
                </div>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-semibold flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Resolve before publishing</p>
              {warnings.map((w, i) => <p key={i} className="text-amber-800">• {w}</p>)}
            </div>
          )}
          <Button onClick={save} disabled={busy || shifts.length === 0} className="bg-[#1e3a5f]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Validate & save
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Week rosters ({rosters.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rosters.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No rosters for this week yet</p>}
          {rosters.map((r) => (
            <div key={r.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{r.rosterId} <Badge className="ml-2">{formatStatus(r.validationStatus)}</Badge></p>
                  <p className="text-xs text-slate-500">{r.shifts.length} shifts · {r.department}</p>
                  {(r.validationWarnings || []).map((w, i) => <p key={i} className="text-xs text-amber-700">• {w}</p>)}
                </div>
                {!r.published && confirmPublishId !== r.id && (
                  <Button size="sm" disabled={busy} onClick={() => setConfirmPublishId(r.id)}>
                    <Send className="h-3 w-3 mr-1" /> Publish
                  </Button>
                )}
              </div>
              {!r.published && confirmPublishId === r.id && (
                <div className="border border-[#1e3a5f] bg-slate-50 rounded-md p-3 text-sm space-y-2">
                  <p className="font-medium">Confirm publication: {r.rosterId} · week {r.weekStart} · {r.department} · {r.shifts.length} shifts · {new Set(r.shifts.map((s) => s.staffId)).size} staff</p>
                  <p className="text-xs text-slate-600">Effect: locks + notifies staff</p>
                  <p className="text-xs text-amber-700">Warning: re-validated live before locking.</p>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => publish(r.id)}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />} Confirm publication
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmPublishId(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
