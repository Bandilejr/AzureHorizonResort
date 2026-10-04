// UC44 — Open Shifts Board: manager publishes surge shifts; eligible staff claim (tx).
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertModal } from '@/components/ui/AlertModal';
import { Zap } from 'lucide-react';
import {
  listenOpenShifts, listenStaffAvailability, createOpenShift, claimOpenShift,
  filterEligibleOpenShifts,
} from '@/services/increment2-services';
import type { OpenShift, StaffAvailability } from '@/types/increment2';
import { formatStatus } from '@/utils/statusLabels';
import { useAuth } from '@/hooks/useAuth';

export function OpenShiftsBoard({ managerView, staffRole }: { managerView?: boolean; staffRole?: string }) {
  const { user } = useAuth();
  const staffId = user?.uid || user?.id || '';
  const [shifts, setShifts] = useState<OpenShift[]>([]);
  const [availability, setAvailability] = useState<StaffAvailability[]>([]);
  const [form, setForm] = useState({ department: 'Food & Beverage', date: '', start: '08:00', end: '17:00', role: '', skill: '', urgency: 'normal' as 'normal' | 'urgent' | 'critical' });
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });

  useEffect(() => {
    const u1 = listenOpenShifts(setShifts, !managerView);
    const u2 = listenStaffAvailability(setAvailability);
    return () => { u1(); u2(); };
  }, [managerView]);

  const eligible = managerView ? shifts : filterEligibleOpenShifts({
    shifts, staffId, role: staffRole || '', availability, weekHoursSoFar: 0,
  });

  const create = async () => {
    setBusy(true);
    try {
      await createOpenShift({
        department: form.department, date: form.date, startTime: form.start, endTime: form.end,
        role: form.role, requiredSkill: form.skill || undefined, urgency: form.urgency, authorUid: staffId,
      });
      setAlert({ open: true, title: 'Open shift published', message: 'Eligible staff can now claim it.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Publish failed', message: e instanceof Error ? e.message : 'Could not publish.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const claim = async (id: string) => {
    setBusy(true);
    try {
      await claimOpenShift({ openShiftDocId: id, claimerUid: staffId });
      setAlert({ open: true, title: 'Shift claimed', message: 'Added to your roster.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Claim failed', message: e instanceof Error ? e.message : 'Shift may have just been filled.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      {managerView && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> Publish Open Shift</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} /></div>
              <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} /></div>
              <div><Label>Start</Label><Input type="time" value={form.start} onChange={(e) => setForm((p) => ({ ...p, start: e.target.value }))} /></div>
              <div><Label>End</Label><Input type="time" value={form.end} onChange={(e) => setForm((p) => ({ ...p, end: e.target.value }))} /></div>
              <div><Label>Role</Label><Input value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} /></div>
              <div><Label>Skill (opt)</Label><Input value={form.skill} onChange={(e) => setForm((p) => ({ ...p, skill: e.target.value }))} /></div>
              <div><Label>Urgency</Label>
                <select className="w-full border rounded-md p-2 text-sm" value={form.urgency} onChange={(e) => setForm((p) => ({ ...p, urgency: e.target.value as typeof form.urgency }))}>
                  <option value="normal">normal</option><option value="urgent">urgent</option><option value="critical">critical</option>
                </select>
              </div>
            </div>
            <Button onClick={create} disabled={busy || !form.date || !form.role.trim()}>Publish shift</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">{managerView ? 'All open shifts' : 'Available for you'} ({eligible.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {eligible.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No open shifts</p>}
          {eligible.map((s) => (
            <div key={s.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{s.date} {s.startTime}–{s.endTime} · {s.role} <Badge className="ml-1">{formatStatus(s.status)}</Badge></p>
                <p className="text-xs text-slate-500">{s.department} · {s.hours}h{s.requiredSkill ? ` · ${s.requiredSkill}` : ''} · {formatStatus(s.urgency)}</p>
              </div>
              {!managerView && s.status === 'open' && (
                <Button size="sm" disabled={busy} onClick={() => claim(s.id)}>Claim</Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
