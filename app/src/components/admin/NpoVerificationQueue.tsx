// NPO Verification Queue (admin). Reuses refund-review table/modal pattern.
//
// One umbrella list for every organisation, whatever its origin, split into
// three states that need three different responses:
//   Needs approval -> rejected, or accepted
//   Approved       -> history, no action
//   Rejected       -> history with a reason, re-applyable
// "Needs approval" merges npo_applications (public web intake) and npo_partners
// (walk-ins plus promoted submissions) so an admin never has to check two
// inboxes for the same decision. Promotion moves a web submission into
// npo_partners but grants nothing by itself: the approve step is separate, and
// 'approved' is reserved for the decision that actually grants portal access.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertModal } from '@/components/ui/AlertModal';
import { Loader2, Building2, CheckCircle2, XCircle, FileText, Plus, Inbox } from 'lucide-react';
import {
  listenNpoPartners, reviewNpoApplication,
  listenNpoApplications, promoteNpoApplication, rejectNpoApplication,
} from '@/services/increment2-services';
import { formatStatus } from '@/utils/statusLabels';
import type { NpoApplication, NpoPartner } from '@/types/increment2';
import { useAuth } from '@/hooks/useAuth';
import { NpoApplicationForm } from '@/components/npo/NpoApplicationForm';

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
  const [showNewForm, setShowNewForm] = useState(false);

  // Public applications submitted from /npo-apply. Held separately from
  // npo_partners because they are unreviewed web input: an admin promotes one
  // into the partner queue, which is what actually grants portal access.
  const [applications, setApplications] = useState<NpoApplication[]>([]);
  const [inboxError, setInboxError] = useState('');
  const [picked, setPicked] = useState<NpoApplication | null>(null);
  const [inboxAction, setInboxAction] = useState<null | 'promote' | 'reject'>(null);

  useEffect(() => {
    const unsub = listenNpoPartners((list) => {
      setItems(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Listen unconditionally: a permission-denied inbox must surface as an
    // explicit message, not as an eternally empty panel that reads as
    // "no applications yet".
    const unsub = listenNpoApplications(
      (list) => {
        setApplications(list.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));
        setInboxError('');
      },
      (err) => {
        setInboxError(
          /permission/i.test(err.message)
            ? 'The public application inbox is not readable with your current permissions.'
            : err.message,
        );
      },
    );
    return () => unsub();
  }, []);

  const decideInbox = async (action: 'promote' | 'reject') => {
    if (!picked) return;
    if (action === 'reject' && !reason.trim()) {
      setAlert({ open: true, title: 'Reason required', message: 'Provide a rejection reason for the applicant.', type: 'error' });
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (action === 'promote') {
        await promoteNpoApplication(picked.id);
        setAlert({ open: true, title: 'Promoted to NPO partner', message: `${picked.organisationName} has moved to the Verification tab, pending approval. Access is not granted until that decision is made.`, type: 'success' });
      } else {
        await rejectNpoApplication(picked.id, reason);
        setAlert({ open: true, title: 'Application rejected', message: 'The decision and reason are recorded in the activity trail.', type: 'success' });
      }
      setPicked(null);
      setInboxAction(null);
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

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

  // One status word for "received, not yet decided". Public intake stores
  // 'pending' (rules pin it at create) and promotion parks it at 'under_review';
  // both mean the same thing to an admin, so the queue renders them as one word
  // instead of showing two labels for one state.
  const AWAITING_LABEL = 'Under review';
  const displayStatus = (s: string) =>
    s === 'pending' || s === 'under_review' ? AWAITING_LABEL : formatStatus(s);

  // Rejected partners and rejected public applications are both "settled, no
  // action". They come from two collections, so they are flattened here or a
  // rejected web application would disappear from the queue entirely.
  const rejected = [
    ...applications
      .filter((a) => a.verificationStatus === 'rejected')
      .map((a) => ({
        key: `app-${a.id}`,
        id: a.id,
        organisationName: a.organisationName,
        reason: a.rejectionReason,
        reviewedBy: a.reviewedBy,
        reviewedAt: a.reviewedAt,
        sourceApplicationId: null as string | null,
      })),
    ...items
      .filter((n) => n.verificationStatus === 'rejected')
      .map((n) => ({
        key: `npo-${n.id}`,
        id: n.id,
        organisationName: n.organisationName,
        reason: n.rejectionReason,
        reviewedBy: n.verifiedBy,
        reviewedAt: n.verifiedAt,
        sourceApplicationId: n.sourceApplicationId ?? null,
      })),
  ].sort((a, b) => String(b.reviewedAt ?? '').localeCompare(String(a.reviewedAt ?? '')));

  // Public applications awaiting a decision. A promoted one is skipped: its
  // partner record now represents the same organisation, and listing both would
  // show the org twice in one table.
  const awaiting = [
    ...applications
      .filter(
        (a) =>
          !a.promotedToNpoId &&
          (a.verificationStatus === 'pending' || a.verificationStatus === 'under_review'),
      )
      .map((a) => ({
        key: `app-${a.id}`,
        kind: 'application' as const,
        app: a,
        partner: null,
        organisationName: a.organisationName,
        contactName: a.contactName,
        email: a.email,
        registrationNumber: a.registrationNumber,
        beneficiaryCapacity: a.beneficiaryCapacity,
        status: a.verificationStatus,
        sourceApplicationId: null,
        receivedAt: a.submittedAt,
      })),
    ...items
      .filter((n) => n.verificationStatus === 'pending' || n.verificationStatus === 'under_review')
      .map((n) => ({
        key: `npo-${n.id}`,
        kind: 'partner' as const,
        app: null,
        partner: n,
        organisationName: n.organisationName,
        contactName: n.contactName,
        email: n.email,
        registrationNumber: n.registrationNumber,
        beneficiaryCapacity: n.beneficiaryCapacity,
        status: n.verificationStatus,
        sourceApplicationId: n.sourceApplicationId ?? null,
        receivedAt: n.createdAt,
      })),
  ].sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));

  // Approved partners only. A promoted public application is excluded because
  // its partner record is the same organisation under its approved identity;
  // keeping both would double-count every web-sourced approval.
  const approvedRows = items
    .filter((n) => n.verificationStatus === 'approved')
    .map((n) => ({
      key: `npo-${n.id}`,
      organisationName: n.organisationName,
      registrationNumber: n.registrationNumber,
      pboNumber: n.pboNumber,
      sourceApplicationId: n.sourceApplicationId ?? null,
      decidedAt: n.verifiedAt,
    }))
    .sort((a, b) => String(b.decidedAt ?? '').localeCompare(String(a.decidedAt ?? '')));

  if (loading) return <div className="flex items-center gap-2 p-6 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading NPO applications…</div>;

  return (
    <div className="space-y-6">
      {alert.open && <AlertModal open={alert.open} onClose={() => setAlert((p) => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />}
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">{error}</div>}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> NPO Partner Pipeline
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                One list for every organisation, whatever its origin.{' '}
                <strong>Needs approval</strong> is the only actionable queue;
                everything below it is settled history. Promoting a web submission
                moves it into the partner records but grants nothing until an admin
                approves it.
              </p>
            </div>
            <Button size="sm" className="bg-[#1e3a5f] hover:bg-[#2c5282]" onClick={() => setShowNewForm((v) => !v)}>
              <Plus className="h-4 w-4 mr-1" /> {showNewForm ? 'Hide application form' : 'Record walk-in'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showNewForm && (
            <div className="mb-6">
              <NpoApplicationForm />
            </div>
          )}

          {/* One list for every organisation awaiting a decision, whatever its
              origin. Promoted applications are excluded because their partner
              record now represents the same organisation; otherwise a promote
              would show the org twice in the same table. */}
          {inboxError && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-sm">
              {inboxError}
            </div>
          )}
{awaiting.length === 0 && !inboxError ? (
            <div className="text-center py-8 text-slate-400">
              <Inbox className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nothing awaiting approval</p>
            </div>
          ) : (
            <>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Needs approval ({awaiting.length})
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-4">Organisation</th><th className="py-2 pr-4">Reg No</th>
                    <th className="py-2 pr-4">Capacity</th><th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Received</th><th className="py-2">Action</th>
                  </tr></thead>
                  <tbody>
                    {awaiting.map((row) => (
                      <tr key={row.key} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="py-2 pr-4 font-medium">
                          {row.organisationName}
                          <div className="text-xs text-slate-500">{row.contactName} · {row.email}</div>
                        </td>
                        <td className="py-2 pr-4">{row.registrationNumber}</td>
                        <td className="py-2 pr-4">{row.beneficiaryCapacity}</td>
                        <td className="py-2 pr-4">
                          <Badge className={STATUS_COLOR[row.status]}>{displayStatus(row.status)}</Badge>
                        </td>
                        <td className="py-2 pr-4 text-xs text-slate-500">{row.receivedAt?.slice(0, 10)}</td>
                        <td className="py-2">
                          {row.kind === 'application' ? (
                            <Button size="sm" variant="outline" onClick={() => { setPicked(row.app!); setReason(''); setInboxAction(null); }}>
                              Review
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => { setSelected(row.partner!); setReason(''); setConfirm(null); }}>
                              Review
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
</table>
              </div>
            </>
          )}

          {approvedRows.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Approved ({approvedRows.length})
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Organisation</th>
                      <th className="px-3 py-2 font-medium">Reg No</th>
                      <th className="px-3 py-2 font-medium">PBO No</th>
                      <th className="px-3 py-2 font-medium">Origin</th>
                      <th className="px-3 py-2 font-medium">Approved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedRows.map((row) => (
                      <tr key={row.key} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">{row.organisationName}</td>
                        <td className="px-3 py-2">{row.registrationNumber}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.pboNumber || '—'}</td>
                        <td className="px-3 py-2">
                          <Badge className={row.sourceApplicationId ? 'bg-sky-100 text-sky-800' : 'bg-indigo-100 text-indigo-800'}>
                            {row.sourceApplicationId ? 'Web intake' : 'Walk-in'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{row.decidedAt?.slice(0, 10) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {rejected.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Rejected ({rejected.length})
              </p>
              <div className="space-y-2">
                {rejected.map((n) => (
                  <div key={n.key} className="flex items-center justify-between text-sm border-b py-2">
                    <span className="font-medium">
                      {n.organisationName}
                      <span className="text-xs text-slate-500 ml-2">{n.reason || 'No reason recorded'}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {n.sourceApplicationId
                        ? <Badge className="bg-sky-100 text-sky-800">Web intake</Badge>
                        : <Badge className="bg-indigo-100 text-indigo-800">Walk-in</Badge>}
                      {n.reviewedBy && <span className="text-xs text-slate-500">by {n.reviewedBy} · {n.reviewedAt}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* The detail and confirmation steps are sibling dialogs, never nested:
          a DialogContent inside another one renders in a second portal and the
          confirm button ends up unclickable behind the parent overlay. */}
      {picked && !inboxAction && (
        <Dialog open onOpenChange={() => { setPicked(null); setInboxAction(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Public application — {picked.organisationName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-500">Registration:</span> {picked.registrationNumber}</div>
                <div><span className="text-slate-500">PBO:</span> {picked.pboNumber || '—'}</div>
                <div><span className="text-slate-500">Contact:</span> {picked.contactName}</div>
                <div><span className="text-slate-500">Email:</span> {picked.email}</div>
                <div><span className="text-slate-500">Phone:</span> {picked.phone || '—'}</div>
                <div><span className="text-slate-500">Capacity:</span> {picked.beneficiaryCapacity}</div>
                <div><span className="text-slate-500">Transport:</span> {picked.transportType}</div>
                <div><span className="text-slate-500">Cold chain:</span> {picked.refrigerationAvailable ? 'Yes' : 'No'}</div>
              </div>
              <div><span className="text-slate-500">Service areas:</span> {picked.serviceAreas.join(', ')}</div>
              <p className="text-xs text-slate-500">
                Promoting creates a pending partner record for a second approval step, which is what
                provisions portal access. Compliance documents are attached after promotion.
              </p>
              <div className="space-y-2">
                <Input placeholder="Rejection reason (required to reject)" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPicked(null)}>Cancel</Button>
              <Button variant="destructive" disabled={busy} onClick={() => setInboxAction('reject')}>
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button disabled={busy} className="bg-[#1e3a5f] hover:bg-[#2c5282]" onClick={() => setInboxAction('promote')}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Promote to partner
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {picked && inboxAction && (
        <Dialog open onOpenChange={() => setInboxAction(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {inboxAction === 'promote' ? 'Promote this application?' : 'Reject this application?'}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              {inboxAction === 'promote'
                ? 'A pending NPO partner record will be created from these details and will appear in the Verification tab. You still have to approve it there before access is granted.'
                : 'The applicant will not be notified automatically. The decision and reason are recorded in the activity trail.'}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInboxAction(null)}>Back</Button>
              <Button
                variant={inboxAction === 'promote' ? 'default' : 'destructive'}
                disabled={busy}
                onClick={() => decideInbox(inboxAction)}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                <div className="col-span-2">
                  <span className="text-slate-500">Intake:</span>{' '}
                  {selected.sourceApplicationId
                    ? <Badge className="bg-sky-100 text-sky-800">Promoted from a website application</Badge>
                    : <Badge className="bg-slate-100 text-slate-700">Recorded as a walk-in — no web application on file</Badge>}
                </div>
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

