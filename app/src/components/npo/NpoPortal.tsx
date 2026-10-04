// UC37 — NPO Portal: my allocations → review → accept terms → claim.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertModal } from '@/components/ui/AlertModal';
import { Loader2, PackageCheck } from 'lucide-react';
import { listenDonationBatches, claimDonationBatch } from '@/services/increment2-services';
import { formatStatus } from '@/utils/statusLabels';
import type { DonationBatch } from '@/types/increment2';
import { useAuth } from '@/hooks/useAuth';

export function NpoPortal({ npoId }: { npoId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<DonationBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DonationBatch | null>(null);
  const [facility, setFacility] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });

  useEffect(() => {
    const unsub = listenDonationBatches((list) => {
      setItems(list.filter((b) => b.allocatedNpoId === npoId));
      setLoading(false);
    });
    return () => unsub();
  }, [npoId]);

  const claim = async () => {
    if (!selected || !user) return;
    setBusy(true);
    try {
      await claimDonationBatch({
        batchDocId: selected.id, npoId,
        claimerUid: user.uid || user.id, receivingFacility: facility, acceptTerms: terms,
      });
      setSelected(null); setFacility(''); setTerms(false);
      setAlert({ open: true, title: 'Allocation claimed', message: 'Kitchen management notified — collection will be scheduled.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Claim failed', message: e instanceof Error ? e.message : 'Allocation unavailable.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex items-center gap-2 p-6 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading allocations…</div>;

  const awaiting = items.filter((b) => b.status === 'allocated_awaiting_claim');
  const mine = items.filter((b) => b.status !== 'allocated_awaiting_claim');

  return (
    <div className="space-y-6">
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5" /> My Allocations — awaiting claim ({awaiting.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {awaiting.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No allocations awaiting your claim</p>}
          {awaiting.map((b) => (
            <div key={b.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono font-bold text-sm">{b.batchId} <Badge className="ml-2">{formatStatus(b.status)}</Badge></p>
                <p className="text-sm">{b.itemName} · {b.portionCount} portions · {b.estimatedWeightKg}kg</p>
                <p className="text-xs text-slate-500">Pickup handling: keep chilled · Allergens: {b.allergens.join(', ') || 'none'}</p>
              </div>
              <Button size="sm" onClick={() => { setSelected(b); setFacility(b.receivingFacility || ''); setTerms(false); }}>Review & claim</Button>
            </div>
          ))}
        </CardContent>
      </Card>
      {mine.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {mine.map((b) => (
              <div key={b.id} className="flex justify-between text-sm border-b py-2">
                <span className="font-mono">{b.batchId} — {b.itemName}</span>
                <Badge>{formatStatus(b.status)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Claim {selected.batchId}</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <p>{selected.itemName} · {selected.mealCategory} · {selected.portionCount} portions · {selected.estimatedWeightKg}kg</p>
              <p className="text-slate-500">Allergens: {selected.allergens.join(', ') || 'none'} · Expiry: {new Date(selected.expiryAt).toLocaleString()}</p>
              <div><Label>Receiving community facility *</Label><Input value={facility} onChange={(e) => setFacility(e.target.value)} placeholder="e.g. Umlazi Community Hall" /></div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="h-4 w-4 mt-0.5" />
                <span className="text-xs">I accept the food distribution terms: maintain cold chain, distribute before expiry, and confirm receipt on collection.</span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              <Button disabled={busy || !terms || !facility.trim()} onClick={claim}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Confirm claim
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
