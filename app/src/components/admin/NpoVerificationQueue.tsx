// UC34 — NPO Verification Queue (admin). Reuses refund-review table/modal pattern.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertModal } from '@/components/ui/AlertModal';
import { Loader2, Building2, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { listenNpoPartners, reviewNpoApplication } from '@/services/increment2-services';
import { formatStatus } from '@/utils/statusLabels';
import type { NpoPartner } from '@/types/increment2';
import { useAuth } from '@/hooks/useAuth';

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  under_review: 'bg-blue-100 text-blue-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

export function NpoVerificationQueue() {
  const { user } = useAuth();
  const [items, setItems] = useState<NpoPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<NpoPartner | null>(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<null | 'approve' | 'reject'>(null);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });

  useEffect(() => {
    const unsub = listenNpoPartners((list) => {
      setItems(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const decide = async (approve: boolean) => {
    if (!selected || !user) return;
    if (!approve && !reason.trim()) {
      setAlert({ open: true, title: 'Reason required', message: 'Provide a rejection/feedback reason.', type: 'error' });
      return;
    }
    setBusy(true);
    setError('');
    try {
      await reviewNpoApplication({
        npoDocId: selected.id, approve, reason,
        reviewerUid: user.uid || user.id,
      });
      setSelected(null);
      setReason('');
      setConfirm(null);
      setAlert({ open: true, title: approve ? 'NPO approved' : 'NPO rejected', message: approve ? 'Organisation is now active in the food rescue network.' : 'Decision recorded with reason.', type: 'success' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex items-center gap-2 p-6 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading NPO applications…</div>;

  const pending = items.filter((i) => i.verificationStatus === 'pending' || i.verificationStatus === 'under_review');
  const decided = items.filter((i) => i.verificationStatus === 'approved' || i.verificationStatus === 'rejected');

  return (
    <div className="space-y-6">
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> NPO Verification Queue ({pending.length} pending)</CardTitle></CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <div className="text-center py-8 text-slate-400"><Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No pending applications</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">Organisation</th><th className="py-2 pr-4">Reg No</th>
                  <th className="py-2 pr-4">Capacity</th><th className="py-2 pr-4">Cold chain</th>
                  <th className="py-2 pr-4">Status</th><th className="py-2">Action</th>
                </tr></thead>
                <tbody>
                  {pending.map((n) => (
                    <tr key={n.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="py-2 pr-4 font-medium">{n.organisationName}<div className="text-xs text-slate-500">{n.contactName} · {n.email}</div></td>
                      <td className="py-2 pr-4">{n.registrationNumber}</td>
                      <td className="py-2 pr-4">{n.beneficiaryCapacity}</td>
                      <td className="py-2 pr-4">{n.refrigerationAvailable ? 'Yes' : 'No'} · {n.transportType}</td>
                      <td className="py-2 pr-4"><Badge className={STATUS_COLOR[n.verificationStatus]}>{formatStatus(n.verificationStatus)}</Badge></td>
                      <td className="py-2"><Button size="sm" variant="outline" onClick={() => { setSelected(n); setReason(''); setConfirm(null); }}>Review</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {decided.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Decided ({decided.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {decided.map((n) => (
              <div key={n.id} className="flex items-center justify-between text-sm border-b py-2">
                <span className="font-medium">{n.organisationName}</span>
                <span className="flex items-center gap-2">
                  <Badge className={STATUS_COLOR[n.verificationStatus]}>{formatStatus(n.verificationStatus)}</Badge>
                  {n.verifiedBy && <span className="text-xs text-slate-500">by {n.verifiedBy} · {n.verifiedAt}</span>}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {selected && (
        <Dialog open onOpenChange={() => { setSelected(null); setConfirm(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Review — {selected.organisationName}</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-500">Registration:</span> {selected.registrationNumber}</div>
                <div><span className="text-slate-500">PBO:</span> {selected.pboNumber || '—'}</div>
                <div><span className="text-slate-500">Contact:</span> {selected.contactName} · {selected.phone}</div>
                <div><span className="text-slate-500">Capacity:</span> {selected.beneficiaryCapacity} beneficiaries</div>
                <div className="col-span-2"><span className="text-slate-500">Service areas:</span> {selected.serviceAreas.join(', ') || '—'}</div>
                <div><span className="text-slate-500">Transport:</span> {selected.transportType}</div>
                <div><span className="text-slate-500">Refrigeration:</span> {selected.refrigerationAvailable ? 'Available' : 'Not available'}</div>
              </div>
              <div>
                <span className="text-slate-500">Compliance documents ({selected.complianceDocuments.length}):</span>
                {selected.complianceDocuments.length === 0 ? <p className="text-amber-600">No documents uploaded.</p> : (
                  <ul className="mt-1 space-y-1">
                    {selected.complianceDocuments.map((d, i) => (
                      <li key={i}><a className="text-blue-600 underline flex items-center gap-1" href={d.url} target="_blank" rel="noreferrer"><FileText className="h-3 w-3" />{d.fileName}</a></li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className="text-slate-500 text-xs">Decision reason (required for rejection)</label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Registration document expired…" />
              </div>
              {confirm === 'approve' && (
                <div className="border border-emerald-300 bg-emerald-50 rounded-md p-3 text-sm space-y-2">
                  <p className="font-medium">Approve {selected.organisationName}? Effect: active + rep provisioned</p>
                </div>
              )}
              {confirm === 'reject' && (
                <div className="border border-red-300 bg-red-50 rounded-md p-3 text-sm space-y-2">
                  <p className="font-medium text-red-800">Reject {selected.organisationName}? Effect: decision recorded with reason</p>
                  <p className="text-xs text-red-700">Reason: {reason}</p>
                </div>
              )}
            </div>
            <DialogFooter className="flex gap-2">
              {confirm === null ? (
                <>
                  <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
                  <Button variant="destructive" disabled={busy} onClick={() => {
                    if (!reason.trim()) {
                      setAlert({ open: true, title: 'Reason required', message: 'Provide a rejection/feedback reason.', type: 'error' });
                      return;
                    }
                    setConfirm('reject');
                  }}><XCircle className="h-4 w-4 mr-1" /> Reject</Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => setConfirm('approve')}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Approve
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Back</Button>
                  {confirm === 'approve' ? (
                    <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => decide(true)}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Confirm approval
                    </Button>
                  ) : (
                    <Button variant="destructive" disabled={busy} onClick={() => decide(false)}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />} Confirm rejection
                    </Button>
                  )}
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
