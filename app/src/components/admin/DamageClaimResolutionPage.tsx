import React, { useState, useEffect } from 'react';
import { Gavel, CheckCircle2, AlertCircle, ShieldCheck, Camera, Wrench, Mail, Clock } from 'lucide-react';
import { collection, doc, updateDoc, onSnapshot, query, where, getDocs, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { writeAuditEntry } from '@/services/audit-services';
import { AUDIT_ACTIONS } from '@/types/index';
import { getProfessionalPDFHTML } from '@/utils/pdfGenerator';

// --- CONSTANT OBJECT REPLACING ENUMS TO SATISFY ERASABLE SYNTAX ---
const ClaimDecision = {
  APPROVED_FULL_CHARGE: 'APPROVED_FULL_CHARGE',
  PARTIAL_WAIVER: 'PARTIAL_WAIVER',
  FULL_WAIVER: 'FULL_WAIVER',
  APPEAL_REJECTED: 'APPEAL_REJECTED'
} as const;

type ClaimDecisionType = typeof ClaimDecision[keyof typeof ClaimDecision];

const IN_MAINTENANCE_STATUSES = ['recorded', 'reported', 'in_repair'];

export const DamageClaimResolutionPage: React.FC = () => {
  const [claims, setClaims] = useState<any[]>([]);
  const [isClaimsLoading, setIsClaimsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedClaim, setSelectedClaim] = useState<any | null>(null);
  const [decision, setDecision] = useState<ClaimDecisionType>(ClaimDecision.APPROVED_FULL_CHARGE);
  const [finalAmount, setFinalAmount] = useState<number>(0);
  const [resolutionReason, setResolutionReason] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{ claimRef: string; amount: number; invoiceNumber: string; guestEmail: string } | null>(null);
  const [maintenanceStaff, setMaintenanceStaff] = useState<any[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');

  useEffect(() => {
    const fetchMaintenanceStaff = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'maintenance'));
        const snap = await getDocs(q);
        setMaintenanceStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching maintenance staff:", error);
      }
    };
    fetchMaintenanceStaff();
  }, []);

 useEffect(() => {
    // We fetch everything and filter in memory to prevent ANY Firebase Index errors during your demo
    const q = query(collection(db, 'damage_records'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const allRecords = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setClaims(allRecords);
      setIsClaimsLoading(false);
    }, (error) => {
      console.error("Error fetching damage records:", error);
      setIsClaimsLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // Admin adjudicates ONLY claims that maintenance has marked 'resolved'
  const readyClaims = claims.filter(record => record.status === 'resolved');
  const inMaintenanceClaims = claims.filter(record => IN_MAINTENANCE_STATUSES.includes(record.status));
  const invoicedClaims = claims.filter(record => record.status === 'invoiced');

  const handleSelectClaim = (claim: any) => {
    setSelectedClaim(claim);
    setFinalAmount(claim.totalCost || claim.estimatedCost || 0);
    setDecision(ClaimDecision.APPROVED_FULL_CHARGE);
    setResolutionReason('After reviewing maintenance evidence, full repair costs are confirmed.');
    setSelectedTechnician(claim.assignedTechnicianId || '');
    setErrorMessage(null);
  };

  const handleDecisionChange = (d: ClaimDecisionType) => {
    setDecision(d);
    if (!selectedClaim) return;

    const baseAmount = selectedClaim.totalCost || selectedClaim.estimatedCost || 0;

    if (d === ClaimDecision.FULL_WAIVER) {
      setFinalAmount(0);
    } else if (d === ClaimDecision.PARTIAL_WAIVER) {
      setFinalAmount(Math.round(baseAmount * 0.5));
    } else {
      setFinalAmount(baseAmount);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) return;
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const claim = selectedClaim;
      const invoiceNumber = `INV-DMG-${(claim.inspectionId || claim.id.slice(-4).toUpperCase())}-${Date.now().toString().slice(-4)}`;

      // 1. Finalize the claim with terminal 'invoiced' status
      const claimRef = doc(db, 'damage_records', claim.id);
      await updateDoc(claimRef, {
        status: 'invoiced',
        decision: decision,
        finalAssessedAmount: Number(finalAmount),
        resolutionReason: resolutionReason,
        assignedTechnicianId: selectedTechnician,
        invoicedAt: new Date().toISOString(),
        invoiceNumber: invoiceNumber,
        updatedAt: serverTimestamp()
      });

      // 2. Resolve guest name from users collection (fallbacks to email / guestId)
      let guestName = 'Guest';
      try {
        const byId = await getDoc(doc(db, 'users', claim.guestId || ''));
        if (byId.exists()) {
          guestName = byId.data().name || byId.data().displayName || guestName;
        } else if (claim.guestEmail) {
          const byEmail = await getDoc(doc(db, 'users', claim.guestEmail));
          if (byEmail.exists()) {
            guestName = byEmail.data().name || byEmail.data().displayName || guestName;
          }
        }
      } catch { /* fall back to default */ }

      // 3. Build invoice line items (scaled proportionally to the final assessed amount)
      const totalCost = claim.totalCost || 0;
      const ratio = totalCost > 0 ? (Number(finalAmount) || 0) / totalCost : 0;
      const lineItems = (Array.isArray(claim.items) ? claim.items : []).map((item: any) => {
        const price = Math.round((item.estimatedCost || item.cost || 0) * ratio);
        return {
          name: item.assetName || item.item || item.name || 'Damaged Asset',
          quantity: 1,
          price,
          subtotal: price,
        };
      });
      if (lineItems.length === 0) {
        lineItems.push({ name: 'Venue damage liability', quantity: 1, price: Number(finalAmount) || 0, subtotal: Number(finalAmount) || 0 });
      }

      const subtotal = lineItems.reduce((sum: number, item: any) => sum + (item.subtotal || 0), 0);
      const tax = 0;
      const pdfHtml = getProfessionalPDFHTML({
        title: 'DAMAGE LIABILITY INVOICE',
        guestName,
        details: [
          { label: 'Invoice Number', value: invoiceNumber },
          { label: 'Guest', value: guestName },
          { label: 'Event Ref', value: claim.eventId || claim.bookingRef || 'N/A' },
          { label: 'Venue', value: claim.venueName || 'Azure Horizon Resort' },
          { label: 'Inspection', value: claim.inspectionId || 'N/A' },
          { label: 'Invoice Date', value: new Date().toLocaleDateString() },
          { label: 'Status', value: 'OUTSTANDING — AWAITING PAYMENT' },
        ],
        items: lineItems,
        subtotal,
        tax,
        total: subtotal + tax,
        footer: 'This invoice covers venue repair costs assessed after your event. Payment can be settled at the front desk or via your guest billing portal.',
      });

      // 4. Create the invoice record (guest billing portal + digital receipt)
      const invoiceDocRef = await addDoc(collection(db, 'invoices'), {
        invoiceNumber,
        type: 'damage',
        recordId: claim.id,
        guestId: claim.guestId || 'unknown',
        guestEmail: claim.guestEmail || claim.guestId || 'guest@azurehorizon.com',
        guestName,
        amount: subtotal + tax,
        subtotal,
        tax,
        lineItems,
        sentAt: new Date().toISOString(),
        emailStatus: 'sent',
        pdfHtml,
        createdAt: serverTimestamp(),
      });

      // 5. Notify the responsible guest
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: claim.guestId || 'unknown',
          type: 'invoice',
          title: '💰 Damage Invoice Issued',
          message: `Invoice ${invoiceNumber} of R ${(subtotal + tax).toLocaleString()} has been issued for venue damage after your event${claim.venueName ? ` at ${claim.venueName}` : ''}.`,
          referenceId: invoiceDocRef.id,
          targetRoute: '/guest/my-bill',
          read: false,
          readAt: null,
          createdAt: serverTimestamp(),
        });
      } catch { /* notification is best-effort */ }

      // 6. Reflect the ruling on the event booking
      try {
        if (claim.eventId) {
          await updateDoc(doc(db, 'event_bookings', claim.eventId), {
            damageStatus: 'invoiced',
            damagePenaltyFinal: subtotal + tax,
            damageInvoiceNumber: invoiceNumber,
            damageInvoiceId: invoiceDocRef.id,
          });
        }
      } catch { /* booking update is best-effort */ }

      const displayRef = claim.inspectionId || `CLM-${claim.id.slice(-6).toUpperCase()}`;

      // Money leaves the guest here: record the ruling and the invoiced total.
      await writeAuditEntry({
        action: AUDIT_ACTIONS.damageInvoiced,
        entity: 'damage_records',
        entityId: claim.id,
        beforeStatus: 'resolved',
        afterStatus: 'invoiced',
        summary: `Damage claim ${displayRef} adjudicated (${decision}) and invoiced ${invoiceNumber}`,
        metadata: {
          decision,
          claimedCost: totalCost,
          finalAssessedAmount: Number(finalAmount) || 0,
          invoicedAmount: subtotal + tax,
          invoiceNumber,
          invoiceId: invoiceDocRef.id,
          eventId: claim.eventId || null,
          technicianId: selectedTechnician || null,
        },
      });

      setSuccessModal({ claimRef: displayRef, amount: Number(finalAmount), invoiceNumber, guestEmail: claim.guestEmail || claim.guestId || '' });
      setSelectedClaim(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to finalize damage claim and issue invoice.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderRosterCard = (claim: any, accent: string, action: React.ReactNode) => {
    const displayRef = claim.inspectionId || `CLM-${claim.id.slice(-6).toUpperCase()}`;
    const eventRef = claim.eventId || claim.bookingRef || 'Unknown Event';
    const guestDisplay = claim.guestName || claim.guestEmail || claim.guestId || 'Unknown Guest';
    const claimTotal = claim.totalCost || claim.totalClaimAmount || 0;

    return (
      <div
        key={claim.id}
        className={`bg-slate-800/60 border rounded-xl p-5 shadow-xl transition-all flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 ${accent}`}
      >
        <div className="space-y-1">
          <div className="flex items-center space-x-3 flex-wrap gap-y-1">
            <span className="text-xs font-mono font-bold text-indigo-400">{displayRef}</span>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
              {claim.status}
            </span>
            {claim.invoiceNumber && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 uppercase">
                {claim.invoiceNumber}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-white">Event Booking REF: {eventRef}</p>
          <p className="text-xs text-slate-400">Guest: {guestDisplay}</p>
          <p className="text-xs text-slate-500">
            Inspected by: {claim.inspectorName || claim.inspectorEmail || 'Event Manager'} · {claim.venueName || ''}
            {claim.resolvedAt && ` · Resolved ${new Date(claim.resolvedAt).toLocaleDateString()}`}
            {claim.actualRepairCost ? ` · Actual repairs R ${claim.actualRepairCost.toLocaleString()}` : ''}
          </p>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right">
            <span className="text-[10px] text-slate-500 uppercase block font-bold">Claimed Repair Amount</span>
            <span className="text-lg font-black text-rose-400">R {claimTotal.toLocaleString()}</span>
            {claim.finalAssessedAmount != null && (
              <span className="text-[10px] text-emerald-400 block font-bold">Final: R {claim.finalAssessedAmount.toLocaleString()}</span>
            )}
          </div>
          {action}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center space-x-2 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-2">
          <Gavel className="w-4 h-4" />
          <span>Azure Horizon Claims Adjudication</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white">Damage Claims Review</h1>
        <p className="text-slate-400 text-sm mt-1">
          Claims are reviewed ONLY after maintenance marks them resolved. Your final ruling issues the official guest invoice.
        </p>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
              <Mail className="w-5 h-5 text-emerald-400" />
              <span>Ready for Review · Resolved by Maintenance</span>
              <span className="text-xs text-slate-500 font-normal">({readyClaims.length})</span>
            </h2>

            {isClaimsLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-32 bg-slate-800/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : readyClaims.length === 0 ? (
              <div className="bg-slate-800/40 border border-dashed border-slate-700/60 p-8 rounded-xl text-center text-slate-400">
                No resolved claims awaiting review. Claims appear here after maintenance completes repairs.
              </div>
            ) : (
              <div className="space-y-4">
                {readyClaims.map((claim) => renderRosterCard(
                  claim,
                  'border-slate-700/60 hover:border-emerald-500/50',
                  <button
                    onClick={() => handleSelectClaim(claim)}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-xs font-bold transition-all shadow-md"
                  >
                    Adjudicate & Invoice Guest
                  </button>
                ))}
              </div>
            )}
          </section>

          {inMaintenanceClaims.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <span>In Maintenance · Not Ready</span>
                <span className="text-xs text-slate-500 font-normal">({inMaintenanceClaims.length})</span>
              </h2>
              <div className="space-y-4">
                {inMaintenanceClaims.map((claim) => renderRosterCard(
                  claim,
                  'border-slate-700/60 opacity-75',
                  <span className="px-3 py-2 text-[10px] font-bold uppercase text-amber-400/80 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    Awaiting Maintenance
                  </span>
                ))}
              </div>
            </section>
          )}

          {invoicedClaims.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-purple-400" />
                <span>Invoiced History</span>
                <span className="text-xs text-slate-500 font-normal">({invoicedClaims.length})</span>
              </h2>
              <div className="space-y-4">
                {invoicedClaims.map((claim) => renderRosterCard(
                  claim,
                  'border-slate-700/60 opacity-80',
                  <span className="px-3 py-2 text-[10px] font-bold uppercase text-purple-400/80 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                    Invoice Sent
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <span>Adjudication Policy</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              All damage claims are backed by Event Manager post-event inspections using the standardized venue asset checklist, with photo evidence. Partial or full waivers may be granted for pre-existing wear or resort guest loyalty status.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Confirm a ruling and the invoice is generated, emailed to the guest, and posted to their billing portal automatically.
            </p>
          </div>
        </div>
      </div>

      {selectedClaim && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-white">Adjudicate Claim {selectedClaim.inspectionId || selectedClaim.id.slice(-6).toUpperCase()}</h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>Guest Account:</span>
                  <span className="text-white font-bold">{selectedClaim.guestName || selectedClaim.guestEmail || selectedClaim.guestId}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Inspected By:</span>
                  <span className="text-white font-bold">{selectedClaim.inspectorName || selectedClaim.inspectorEmail || 'Event Manager'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Initial Damage Cost:</span>
                  <span className="text-rose-400 font-bold">R {(selectedClaim.totalCost || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Maintenance Repairs:</span>
                  <span className="text-white font-bold">{selectedClaim.actualRepairCost ? `R ${selectedClaim.actualRepairCost.toLocaleString()}` : 'N/A'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Repair Notes:</span>
                  <span className="text-white font-bold max-w-[180px] text-right">{selectedClaim.repairNotes || '—'}</span>
                </div>
              </div>

              {(selectedClaim.items?.length > 0) && (
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50">
                  <p className="text-slate-300 font-bold mb-2 flex items-center space-x-1.5">
                    <Camera className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Inspected Assets & Photo Evidence ({selectedClaim.items.length})</span>
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedClaim.items.map((item: any, i: number) => (
                      <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-2.5 flex items-start gap-3">
                        {item.photo || item.photoUrl ? (
                          <img src={item.photo || item.photoUrl} alt={item.assetName || 'Damage proof'} className="h-14 w-20 object-cover rounded-lg border border-slate-600 shrink-0" />
                        ) : (
                          <div className="h-14 w-20 bg-slate-900 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-600 shrink-0">
                            No photo
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-white font-bold">{item.assetName || item.item || item.name || 'Asset'}</p>
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase mr-1">
                            {item.condition || 'DAMAGED'}
                          </span>
                          <span className="text-slate-400">{item.category}</span>
                          <p className="text-slate-400 mt-0.5 truncate">{item.description}</p>
                          <p className="text-rose-400 font-mono font-bold">R {(item.estimatedCost || 0).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-400 mb-1 font-medium flex items-center space-x-1.5">
                  <Wrench className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Assign Maintenance Technician</span>
                </label>
                <select
                  value={selectedTechnician}
                  onChange={(e) => setSelectedTechnician(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-bold"
                >
                  <option value="">-- Select Technician --</option>
                  {maintenanceStaff.map((tech: any) => (
                    <option key={tech.id || tech.email} value={tech.email || tech.name}>
                      {tech.name} ({tech.email})
                    </option>
                  ))}
                  <option value="Thabo Mbeki">Thabo Mbeki (t.mbeki@azurehorizon.com)</option>
                  <option value="Kevin Du Preez">Kevin Du Preez (k.dupreez@azurehorizon.com)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Adjudication Decision</label>
                <select
                  value={decision}
                  onChange={(e) => handleDecisionChange(e.target.value as ClaimDecisionType)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-bold"
                >
                  <option value={ClaimDecision.APPROVED_FULL_CHARGE}>APPROVED - Full Guest Charge</option>
                  <option value={ClaimDecision.PARTIAL_WAIVER}>PARTIAL WAIVER - 50% Resort Subsidy</option>
                  <option value={ClaimDecision.FULL_WAIVER}>FULL WAIVER - 100% Resort Courtesy</option>
                  <option value={ClaimDecision.APPEAL_REJECTED}>REJECTED APPEAL - Enforce Deposit</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Final Assessed Amount (ZAR)</label>
                <input
                  type="number"
                  value={finalAmount}
                  onChange={(e) => setFinalAmount(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-emerald-400 font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Resolution Rationale & Official Reason</label>
                <textarea
                  rows={3}
                  value={resolutionReason}
                  onChange={(e) => setResolutionReason(e.target.value)}
                  placeholder="Record formal justification for invoice statement..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                  required
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedClaim(null)}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg font-bold flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? <span>Issuing Invoice...</span> : <span>Confirm Ruling & Send Invoice</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {successModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-emerald-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Claim Adjudicated & Invoice Issued!</h3>
            <p className="text-xs text-slate-400">
              Claim <strong>{successModal.claimRef}</strong> finalised at <strong>R {successModal.amount.toLocaleString()}</strong>.
            </p>
            <div className="bg-slate-900 p-3 rounded-xl font-mono text-xs text-emerald-400">
              Invoice {successModal.invoiceNumber} sent to {successModal.guestEmail || 'the guest'}
            </div>
            <p className="text-[10px] text-slate-500">
              The invoice is now visible in the guest's billing portal and a notification has been posted.
            </p>
            <button
              onClick={() => setSuccessModal(null)}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg font-bold text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
