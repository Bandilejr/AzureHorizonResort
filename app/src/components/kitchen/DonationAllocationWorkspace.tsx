// UC36 — Donation Allocation Workspace (kitchen manager). Ranked NPO matching + tx allocate.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertModal } from '@/components/ui/AlertModal';
import { Loader2, ArrowRight } from 'lucide-react';
import {
  listenDonationBatches, listenNpoPartners, allocateDonationBatch, rankNpoPartners,
} from '@/services/increment2-services';
import type { DonationBatch, NpoPartner } from '@/types/increment2';
import { useAuth } from '@/hooks/useAuth';

export function DonationAllocationWorkspace() {
  const { user } = useAuth();
  const [batches, setBatches] = useState<DonationBatch[]>([]);
  const [npos, setNpos] = useState<NpoPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<{ npo: NpoPartner; score: number; reasons: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });

  useEffect(() => {
    const u1 = listenDonationBatches((list) => {
      setBatches(list.filter((b) => b.status === 'safety_verified_unassigned'));
      setLoading(false);
    }, 'safety_verified_unassigned');
    const u2 = listenNpoPartners(setNpos);
    return () => { u1(); u2(); };
  }, []);

  const selected = batches.find((b) => b.id === selectedId) || null;
  const ranked = selected ? rankNpoPartners(selected, npos) : [];

  const allocate = async (npoId: string) => {
    if (!selected || !user) return;
    setBusy(true);
    try {
      await allocateDonationBatch({ batchDocId: selected.id, npoId, allocatorUid: user.uid || user.id });
      setSelectedId(null);
      setReview(null);
      setAlert({ open: true, title: 'Batch allocated', message: 'NPO has been notified to claim.', type: 'success' });
    } catch (e) {
      setAlert({ open: true, title: 'Allocation failed', message: e instanceof Error ? e.message : 'Batch may have just been allocated.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex items-center gap-2 p-6 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading unassigned batches…</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      <Card>
        <CardHeader><CardTitle>Safety Verified — Unassigned ({batches.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {batches.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No unassigned batches</p>}
          {batches.map((b) => (
            <button key={b.id} onClick={() => { setSelectedId(b.id); setReview(null); }}
              className={`w-full text-left border rounded-lg p-3 hover:bg-slate-50 ${selectedId === b.id ? 'border-[#1e3a5f] ring-1 ring-[#1e3a5f]' : ''}`}>
              <div className="flex justify-between items-center">
                <span className="font-mono font-bold">{b.batchId}</span>
                <Badge>{b.portionCount} portions · {b.estimatedWeightKg}kg</Badge>
              </div>
              <p className="text-sm">{b.itemName} · {b.mealCategory}</p>
              <p className="text-xs text-slate-500">Allergens: {b.allergens.join(', ') || 'none'} · expires {new Date(b.expiryAt).toLocaleString()}</p>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recommended partners</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!selected && <p className="text-sm text-slate-400 text-center py-6">Select a batch to see ranked NPO matches</p>}
          {selected && review && (
            <div className="border border-[#1e3a5f] bg-slate-50 rounded-lg p-3 space-y-2">
              <p className="text-sm font-semibold">Review allocation</p>
              <p className="text-sm">Batch: <span className="font-mono font-bold">{selected.batchId}</span> · {selected.itemName} · {selected.portionCount} portions · {selected.estimatedWeightKg}kg</p>
              <p className="text-sm">NPO: <span className="font-medium">{review.npo.organisationName}</span> <span className="text-xs text-slate-500">score {review.score}</span></p>
              <p className="text-xs text-slate-500">{review.reasons.join(' · ')}</p>
              <p className="text-xs text-slate-600">Effect: NPO notified to claim; batch leaves this board</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => allocate(review.npo.npoId)}>Confirm allocation</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setReview(null)}>Back</Button>
              </div>
            </div>
          )}
          {selected && ranked.length === 0 && <p className="text-sm text-amber-600 text-center py-6">No approved NPOs available</p>}
          {ranked.map(({ npo, score, reasons }) => (
            <div key={npo.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm">{npo.organisationName} <span className="text-xs text-slate-500">score {score}</span></p>
                <p className="text-xs text-slate-500">{reasons.join(' · ')}</p>
                <p className="text-xs text-slate-500">{npo.serviceAreas.join(', ')} · cap {npo.beneficiaryCapacity} · {npo.refrigerationAvailable ? 'cold-chain' : 'no cold-chain'}</p>
              </div>
              <Button size="sm" disabled={busy} onClick={() => setReview({ npo, score, reasons })}>Review allocation <ArrowRight className="h-3 w-3 ml-1" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
