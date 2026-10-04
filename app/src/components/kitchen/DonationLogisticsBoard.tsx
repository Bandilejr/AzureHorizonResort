// UC38 — Donation Logistics Board: pickup window + bay + courier → signed QR pass.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertModal } from '@/components/ui/AlertModal';
import { Loader2, QrCode, Truck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { listenDonationBatches, scheduleDonationCollection } from '@/services/increment2-services';
import { formatStatus } from '@/utils/statusLabels';
import type { DonationBatch } from '@/types/increment2';
import { useAuth } from '@/hooks/useAuth';

export function DonationLogisticsBoard() {
  const { user } = useAuth();
  const [items, setItems] = useState<DonationBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DonationBatch | null>(null);
  const [form, setForm] = useState({ date: '', start: '', end: '', bay: 'Bay A', courier: '' });
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [confirmSchedule, setConfirmSchedule] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });

  useEffect(() => {
    const unsub = listenDonationBatches((list) => {
      setItems(list.filter((b) => b.status === 'claimed_ready_for_scheduling' || b.status === 'collection_scheduled'));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const toLocalInput = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 16);
  };

  const schedule = async () => {
    if (!selected || !user) return;
    setBusy(true);
    try {
      const code = await scheduleDonationCollection({
        batchDocId: selected.id,
        pickupDate: form.date,
        windowStart: new Date(form.start).toISOString(),
        windowEnd: new Date(form.end).toISOString(),
        loadingBay: form.bay,
        courierName: form.courier,
        schedulerUid: user.uid || user.id,
      });
      setQr(code);
      setConfirmSchedule(false);
      setAlert({ open: true, title: 'Collection scheduled', message: 'Signed QR collection pass generated.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Scheduling failed', message: e instanceof Error ? e.message : 'Could not schedule.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex items-center gap-2 p-6 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading logistics…</div>;

  return (
    <div className="space-y-4">
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" /> Donation Logistics ({items.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Nothing awaiting scheduling</p>}
          {items.map((b) => (
            <div key={b.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono font-bold text-sm">{b.batchId} <Badge className="ml-2">{formatStatus(b.status)}</Badge></p>
                <p className="text-sm">{b.itemName} → {b.receivingFacility || '—'}</p>
                {b.status === 'collection_scheduled' && (
                  <p className="text-xs text-slate-500">{b.pickupWindowStart ? new Date(b.pickupWindowStart).toLocaleString() : ''} → {b.pickupWindowEnd ? new Date(b.pickupWindowEnd).toLocaleString() : ''} · {b.loadingBay}</p>
                )}
              </div>
              <Button size="sm" variant={b.status === 'collection_scheduled' ? 'outline' : 'default'}
                onClick={() => { setSelected(b); setQr(b.collectionQr || null); setConfirmSchedule(false); setForm({ date: b.pickupDate || '', start: toLocalInput(b.pickupWindowStart), end: toLocalInput(b.pickupWindowEnd), bay: b.loadingBay || 'Bay A', courier: b.courierName || '' }); }}>
                {b.status === 'collection_scheduled' ? 'View pass' : 'Schedule'}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      {selected && (
        <Dialog open onOpenChange={() => { setSelected(null); setQr(null); setConfirmSchedule(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> {selected.batchId} — collection</DialogTitle></DialogHeader>
            {qr && (
              <div className="text-center space-y-3">
                <QRCodeSVG value={qr} size={220} className="mx-auto" />
                <p className="text-xs text-slate-500 break-all font-mono">{qr.slice(0, 120)}…</p>
                <p className="text-xs text-amber-600">Single-use pass. Courier presents this QR at the loading bay.</p>
              </div>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Pickup date</Label><Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} /></div>
                <div><Label>Loading bay</Label><Input value={form.bay} onChange={(e) => setForm((p) => ({ ...p, bay: e.target.value }))} /></div>
                <div><Label>Window start</Label><Input type="datetime-local" value={form.start} onChange={(e) => setForm((p) => ({ ...p, start: e.target.value }))} /></div>
                <div><Label>Window end</Label><Input type="datetime-local" value={form.end} onChange={(e) => setForm((p) => ({ ...p, end: e.target.value }))} /></div>
              </div>
              <div><Label>Courier (optional)</Label><Input value={form.courier} onChange={(e) => setForm((p) => ({ ...p, courier: e.target.value }))} placeholder="Courier name" /></div>
            </div>
            {confirmSchedule && (
              <div className="border border-amber-300 bg-amber-50 rounded-md p-3 text-sm space-y-2">
                <p className="font-medium">Confirm schedule: {form.start || '—'} → {form.end || '—'} · {form.bay || '—'} · {form.courier || 'no courier'}</p>
                {(selected.status === 'collection_scheduled' || qr) && (
                  <p className="text-xs text-amber-800">Warning: re-issue invalidates the old pass when rescheduling.</p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy || !form.start || !form.end || !form.bay.trim()} onClick={schedule}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Confirm
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmSchedule(false)}>Cancel</Button>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setSelected(null); setQr(null); setConfirmSchedule(false); }}>Close</Button>
              {!confirmSchedule && (
                <Button disabled={busy || !form.start || !form.end || !form.bay.trim()} onClick={() => setConfirmSchedule(true)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} {(selected.status === 'collection_scheduled' || qr) ? 'Re-issue QR pass (rotates)' : 'Generate QR pass'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
