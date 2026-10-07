import React, { useState, useEffect } from 'react';
import { AlertTriangle, Wrench, CheckCircle2, Hammer, ShieldAlert, Plus, Loader2, ClipboardList, FileText, UserCheck } from 'lucide-react';
import { collection, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { writeAuditEntry } from '@/services/audit-services';
import { AUDIT_ACTIONS } from '@/types/index';
import { useAuth } from '@/hooks/useAuth';
import { DamageInspectionPage } from './DamageInspectionPage';

const ACTIVE_STATUSES = ['reported', 'recorded', 'in_repair'];

const statusBadge = (status: string) => {
  switch (status) {
    case 'in_repair':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: 'IN REPAIR' };
    case 'resolved':
      return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'RESOLVED · AWAITING ADMIN' };
    case 'invoiced':
      return { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', label: 'INVOICED' };
    default:
      return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', label: 'OPEN' };
  }
};

export const DamageClaimsQueue: React.FC = () => {
  const { user } = useAuth();
  const [claims, setClaims] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subView, setSubView] = useState<'queue' | 'log'>('queue');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [resolveModal, setResolveModal] = useState<any | null>(null);
  const [repairNotes, setRepairNotes] = useState('');
  const [actualRepairCost, setActualRepairCost] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'damage_records'), (snap) => {
      setClaims(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching damage records:", error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const activeClaims = claims.filter(c => ACTIVE_STATUSES.includes(c.status));
  const resolvedClaims = claims.filter(c => c.status === 'resolved');
  const invoicedClaims = claims.filter(c => c.status === 'invoiced');

  const handleStartRepair = async (claim: any) => {
    setIsProcessing(claim.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await updateDoc(doc(db, 'damage_records', claim.id), {
        status: 'in_repair',
        assignedTechnicianId: user?.email || claim.assignedTechnicianId || 'maintenance@azure.com',
        assignedTechnicianName: user?.name || user?.email || 'Maintenance Staff',
        startedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
      await writeAuditEntry({
        action: AUDIT_ACTIONS.damageRepairStarted,
        entity: 'damage_records',
        entityId: claim.id,
        beforeStatus: claim.status || 'reported',
        afterStatus: 'in_repair',
        summary: `Repair started on claim ${claim.inspectionId || claim.id.slice(-6).toUpperCase()}`,
        metadata: { technicianId: user?.email || null, claimedCost: claim.totalCost ?? null },
      });
      setSuccessMessage(`Claim ${claim.inspectionId || claim.id.slice(-6).toUpperCase()} assigned to you and marked IN REPAIR.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start repair.');
    } finally {
      setIsProcessing(null);
    }
  };

  const openResolveModal = (claim: any) => {
    setResolveModal(claim);
    setRepairNotes(claim.repairNotes || '');
    setActualRepairCost(claim.totalCost || 0);
    setErrorMessage(null);
  };

  const handleMarkResolved = async () => {
    if (!resolveModal) return;
    setIsProcessing(resolveModal.id);
    setErrorMessage(null);
    try {
      await updateDoc(doc(db, 'damage_records', resolveModal.id), {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        repairNotes,
        actualRepairCost: Number(actualRepairCost) || 0,
        updatedAt: serverTimestamp(),
      });
      await writeAuditEntry({
        action: AUDIT_ACTIONS.damageResolved,
        entity: 'damage_records',
        entityId: resolveModal.id,
        beforeStatus: resolveModal.status || 'in_repair',
        afterStatus: 'resolved',
        summary: `Claim ${resolveModal.inspectionId || resolveModal.id.slice(-6).toUpperCase()} marked resolved and sent to Admin`,
        metadata: {
          actualRepairCost: Number(actualRepairCost) || 0,
          claimedCost: resolveModal.totalCost ?? null,
          repairNotes,
        },
      });
      setResolveModal(null);
      setSuccessMessage(`Claim ${resolveModal.inspectionId || resolveModal.id.slice(-6).toUpperCase()} marked RESOLVED and sent to Admin for review.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to mark claim resolved.');
    } finally {
      setIsProcessing(null);
    }
  };

  const renderClaimCard = (claim: any) => {
    const badge = statusBadge(claim.status);
    const displayRef = claim.inspectionId || `CLM-${claim.id.slice(-6).toUpperCase()}`;
    const guestDisplay = claim.guestName || claim.guestEmail || claim.guestId || 'Unknown Guest';
    const claimTotal = claim.totalCost || claim.totalClaimAmount || 0;
    const itemsCount = Array.isArray(claim.items) ? claim.items.length : 0;

    return (
      <div
        key={claim.id}
        className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-xl hover:border-blue-500/40 transition-all flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0"
      >
        <div className="space-y-1.5">
          <div className="flex items-center space-x-3 flex-wrap gap-y-1">
            <span className="text-xs font-mono font-bold text-blue-400">{displayRef}</span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase border ${badge.bg} ${badge.text} ${badge.border}`}>
              {badge.label}
            </span>
            <span className="text-[10px] text-slate-500">{claim.venueName || 'Venue'} · {claim.eventId || ''}</span>
          </div>
          <p className="text-sm font-bold text-white">Guest: {guestDisplay}</p>
          <p className="text-xs text-slate-400">
            {itemsCount} damaged asset(s) · Inspected by {claim.inspectorName || claim.inspectorEmail || 'Event Manager'}
          </p>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            {claim.assignedTechnicianName && (
              <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> {claim.assignedTechnicianName}</span>
            )}
            {claim.startedAt && <span>Started {new Date(claim.startedAt).toLocaleDateString()}</span>}
            {claim.resolvedAt && <span>Resolved {new Date(claim.resolvedAt).toLocaleDateString()}</span>}
          </div>
        </div>

        <div className="flex items-center space-x-5">
          <div className="text-right">
            <span className="text-[10px] text-slate-500 uppercase block font-bold">Claimed Repair Amount</span>
            <span className="text-lg font-black text-rose-400">R {claimTotal.toLocaleString()}</span>
            {claim.actualRepairCost ? (
              <span className="text-[10px] text-emerald-400 block font-bold">Actual: R {claim.actualRepairCost.toLocaleString()}</span>
            ) : null}
          </div>

          {claim.status === 'reported' || claim.status === 'recorded' ? (
            <button
              onClick={() => handleStartRepair(claim)}
              disabled={isProcessing === claim.id}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-lg text-xs font-bold transition-all shadow-md disabled:opacity-50 flex items-center space-x-1.5"
            >
              {isProcessing === claim.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
              <span>Start Repair</span>
            </button>
          ) : claim.status === 'in_repair' ? (
            <button
              onClick={() => openResolveModal(claim)}
              disabled={isProcessing === claim.id}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-bold transition-all shadow-md disabled:opacity-50 flex items-center space-x-1.5"
            >
              {isProcessing === claim.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>Mark Resolved</span>
            </button>
          ) : claim.status === 'resolved' ? (
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-lg">
              <FileText className="w-3.5 h-3.5" /> With Admin
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-purple-400 font-bold text-xs bg-purple-500/10 border border-purple-500/30 px-3 py-2 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" /> Invoice Sent
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center space-x-2 text-blue-400 text-xs font-bold uppercase tracking-widest mb-2">
          <Hammer className="w-4 h-4" />
          <span>Azure Horizon Maintenance Workspace</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white">Damage Claims Work Queue</h1>
        <p className="text-slate-400 text-sm mt-1">
          Logged claims flow here after the Event Manager's post-event inspection. Work the queue, then hand resolved claims to Admin for invoicing.
        </p>

        <div className="flex gap-2 mt-5 bg-slate-800/60 border border-slate-700/60 p-1.5 rounded-xl w-fit">
          <button
            onClick={() => setSubView('queue')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              subView === 'queue' ? 'bg-blue-500 text-white shadow' : 'text-slate-400 hover:bg-slate-700/50'
            }`}
          >
            <ClipboardList className="w-4 h-4" /> Work Queue
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeClaims.length > 0 ? 'bg-rose-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
              {activeClaims.length}
            </span>
          </button>
          <button
            onClick={() => setSubView('log')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              subView === 'log' ? 'bg-rose-500 text-white shadow' : 'text-slate-400 hover:bg-slate-700/50'
            }`}
          >
            <Plus className="w-4 h-4" /> Log New Damage Report
          </button>
        </div>
      </div>

      {subView === 'log' ? (
        <DamageInspectionPage />
      ) : (
        <div className="max-w-7xl mx-auto space-y-8">
          {successMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-emerald-400 text-sm font-bold flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-400 text-sm font-bold flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-32 bg-slate-800/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <section>
                <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <span>Active Work Queue</span>
                  <span className="text-xs text-slate-500 font-normal">({activeClaims.length} open claim{activeClaims.length === 1 ? '' : 's'})</span>
                </h2>

                {activeClaims.length === 0 ? (
                  <div className="bg-slate-800/40 border border-dashed border-slate-700/60 p-8 rounded-xl text-center text-slate-400">
                    No open damage claims. New inspections will appear here instantly.
                  </div>
                ) : (
                  <div className="space-y-4">{activeClaims.map(renderClaimCard)}</div>
                )}
              </section>

              <section>
                <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Resolved · Awaiting Admin Review</span>
                  <span className="text-xs text-slate-500 font-normal">({resolvedClaims.length})</span>
                </h2>
                {resolvedClaims.length === 0 ? (
                  <div className="bg-slate-800/20 border border-dashed border-slate-700/60 p-6 rounded-xl text-center text-slate-500 text-sm">
                    Nothing waiting on Admin right now.
                  </div>
                ) : (
                  <div className="space-y-4">{resolvedClaims.map(renderClaimCard)}</div>
                )}
              </section>

              {invoicedClaims.length > 0 && (
                <section>
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-purple-400" />
                    <span>Invoiced History</span>
                    <span className="text-xs text-slate-500 font-normal">({invoicedClaims.length})</span>
                  </h2>
                  <div className="space-y-4">{invoicedClaims.map(renderClaimCard)}</div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {resolveModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-emerald-500/40 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white">
              Resolve Claim {resolveModal.inspectionId || resolveModal.id.slice(-6).toUpperCase()}
            </h3>
            <p className="text-xs text-slate-400">
              Record the repair outcome. The claim will then be sent to Admin for final adjudication and guest invoicing.
            </p>

            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Guest Account:</span>
                <span className="text-white font-bold">{resolveModal.guestName || resolveModal.guestEmail || resolveModal.guestId}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Claimed Repair Cost:</span>
                <span className="text-rose-400 font-bold">R {(resolveModal.totalCost || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Assigned Technician:</span>
                <span className="text-white font-bold">{user?.name || user?.email || 'Maintenance Staff'}</span>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium text-xs">Repair Notes & Outcome</label>
              <textarea
                rows={3}
                value={repairNotes}
                onChange={(e) => setRepairNotes(e.target.value)}
                placeholder="Describe repairs completed, parts replaced, etc..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium text-xs">Actual Repair Cost (ZAR)</label>
              <input
                type="number"
                value={actualRepairCost}
                onChange={(e) => setActualRepairCost(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-emerald-400 font-mono font-bold"
              />
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setResolveModal(null)}
                className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkResolved}
                disabled={isProcessing === resolveModal.id || !repairNotes}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg font-bold disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {isProcessing === resolveModal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Mark Resolved</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
