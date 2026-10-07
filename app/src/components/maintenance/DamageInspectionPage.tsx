import React, { useState, useEffect } from 'react';
import { AlertOctagon, Plus, Trash2, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { writeAuditEntry } from '@/services/audit-services';
import { AUDIT_ACTIONS } from '@/types/index';
import { useAuth } from '@/hooks/useAuth';

// --- CONSTANT OBJECTS REPLACING ENUMS TO SATISFY ERASABLE SYNTAX ---
const DamageCategory = {
  FURNITURE: 'FURNITURE',
  AV_EQUIPMENT: 'AV_EQUIPMENT',
  STRUCTURE_WALL: 'STRUCTURE_WALL',
  DECOR_FIXTURES: 'DECOR_FIXTURES',
  FLOORING_CARPET: 'FLOORING_CARPET',
  OTHER: 'OTHER',
} as const;

type DamageCategoryType = typeof DamageCategory[keyof typeof DamageCategory];

const DamageSeverity = {
  MINOR: 'MINOR',
  MODERATE: 'MODERATE',
  SEVERE: 'SEVERE',
} as const;

type DamageSeverityType = typeof DamageSeverity[keyof typeof DamageSeverity];

interface DamagedItem {
  id: string;
  category: DamageCategoryType;
  description: string;
  severity: DamageSeverityType;
  estimatedCost: number;
  photoUrl: string;
}

export const DamageInspectionPage: React.FC = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [existingDamageReports, setExistingDamageReports] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [items, setItems] = useState<DamagedItem[]>([
    {
      id: '1',
      category: DamageCategory.FURNITURE,
      description: 'Stained velvet banquette cushion and broken chair leg',
      severity: DamageSeverity.MODERATE,
      estimatedCost: 1800,
      photoUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef',
    },
  ]);
  const [generalNotes, setGeneralNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{ reportRef: string; total: number; claimId?: string } | null>(null);

  const totalEstimatedCost = items.reduce((sum, item) => sum + (Number(item.estimatedCost) || 0), 0);

  // Native Firebase Fetching
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const snap = await getDocs(collection(db, 'event_bookings'));
        setBookings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching bookings:", error);
      }
    };
    fetchBookings();
  }, []);

  useEffect(() => {
    if (!selectedBookingId) {
      setExistingDamageReports([]);
      return;
    }
    const fetchReports = async () => {
      try {
        // 🚨 UPDATED: Fetch from damage_records using eventId
        const q = query(collection(db, 'damage_records'), where('eventId', '==', selectedBookingId));
        const snap = await getDocs(q);
        setExistingDamageReports(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching reports:", error);
      }
    };
    fetchReports();
  }, [selectedBookingId]);

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: String(Date.now()),
        category: DamageCategory.AV_EQUIPMENT,
        description: '',
        severity: DamageSeverity.MINOR,
        estimatedCost: 500,
        photoUrl: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof DamagedItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBookingId) return;
    setErrorMessage(null);
    setIsSubmitting(true);

    const selectedBooking = bookings.find((b: any) => b.id === selectedBookingId);
    const claimRef = `INSP-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      // 🚨 UPDATED: Formatted payload to exactly match your Database structure!
      const formattedItems = items.map(item => ({
        ...item,
        name: item.description // Maps description to 'name' for the admin view
      }));

      const recordRef = await addDoc(collection(db, 'damage_records'), {
        eventId: selectedBookingId,
        bookingRef: selectedBooking?.bookingRef || 'UNKNOWN',
        guestId: selectedBooking?.guestId || 'Unknown',
        guestEmail: selectedBooking?.guestEmail || 'guest@example.com',
        venueName: selectedBooking?.venueName || 'Event Venue',
        inspectorId: user?.uid || 'Unknown',
        assignedTechnicianId: user?.email || 'maintenance@azure.com',
        updatedByEmail: user?.email || 'staff@azure.com',
        items: formattedItems,
        generalNotes,
        totalCost: totalEstimatedCost, // Maps to totalCost
        status: 'reported', // Lowercase to match your DB
        inspectionId: claimRef, // Maps to inspectionId
        createdAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      await writeAuditEntry({
        action: AUDIT_ACTIONS.damageReported,
        entity: 'damage_records',
        entityId: recordRef.id,
        afterStatus: 'reported',
        summary: `Damage claim ${claimRef} logged for ${selectedBooking?.venueName || 'event venue'}`,
        metadata: {
          eventId: selectedBookingId,
          itemCount: formattedItems.length,
          claimedCost: totalEstimatedCost,
          inspectionId: claimRef,
        },
      });

      setSuccessModal({
        reportRef: claimRef,
        total: totalEstimatedCost,
        claimId: claimRef,
      });
      
      setExistingDamageReports(prev => [...prev, { 
        inspectionId: claimRef, 
        venueName: selectedBooking?.venueName, 
        status: 'reported', 
        totalCost: totalEstimatedCost 
      }]);
      setItems([]);
      setGeneralNotes('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record venue damage inspection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center space-x-2 text-rose-400 text-xs font-bold uppercase tracking-widest mb-2">
          <AlertOctagon className="w-4 h-4" />
          <span>Azure Horizon Asset Protection & Maintenance</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white">Post-Event Damage Inspection</h1>
        <p className="text-slate-400 text-sm mt-1">
          Record venue physical damage, broken equipment, or property loss post-checkout for claims processing.
        </p>
      </div>

      <div className="max-w-7xl mx-auto mb-8 bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-lg">
        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
          Select Booking to Inspect
        </label>
        <select
          value={selectedBookingId}
          onChange={(e) => setSelectedBookingId(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm font-semibold"
        >
          <option value="">-- Choose Completed Event Booking --</option>
          {bookings?.map((b: any) => (
            <option key={b.id} value={b.id}>
              {b.venueName || 'Event Booking'} - {b.eventDate || 'Recent'} [REF: {b.bookingRef || b.id.slice(-6).toUpperCase()}]
            </option>
          ))}
        </select>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Logged Damage Items</h2>
              <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-3 py-1 rounded-full">
                Est. Total: R {totalEstimatedCost.toLocaleString()}
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {items.map((item, idx) => (
                <div key={idx} className="bg-slate-900/60 border border-slate-700/60 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">Damaged Asset #{idx + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-rose-400 hover:text-rose-300 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Asset Category</label>
                      <select
                        value={item.category}
                        onChange={(e) => handleItemChange(idx, 'category', e.target.value as DamageCategoryType)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white"
                      >
                        <option value={DamageCategory.FURNITURE}>Furniture & Seating</option>
                        <option value={DamageCategory.AV_EQUIPMENT}>AV & Electrical</option>
                        <option value={DamageCategory.STRUCTURE_WALL}>Walls & Windows</option>
                        <option value={DamageCategory.DECOR_FIXTURES}>Decor & Fixtures</option>
                        <option value={DamageCategory.FLOORING_CARPET}>Flooring & Carpet</option>
                        <option value={DamageCategory.OTHER}>Other Property</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Severity</label>
                      <select
                        value={item.severity}
                        onChange={(e) => handleItemChange(idx, 'severity', e.target.value as DamageSeverityType)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-rose-400 font-bold"
                      >
                        <option value={DamageSeverity.MINOR}>MINOR</option>
                        <option value={DamageSeverity.MODERATE}>MODERATE</option>
                        <option value={DamageSeverity.SEVERE}>SEVERE</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Est. Repair Cost (ZAR)</label>
                      <input
                        type="number"
                        value={item.estimatedCost}
                        onChange={(e) => handleItemChange(idx, 'estimatedCost', Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono font-bold"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Damage Description</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      placeholder="Describe location and structural fault..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                      required
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddItem}
                className="w-full py-2.5 border border-dashed border-slate-700 hover:border-rose-500/50 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/5 transition-all flex items-center justify-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Damaged Asset</span>
              </button>

              <div className="text-xs space-y-1 pt-2">
                <label className="block text-slate-400 font-medium">Inspector Observations</label>
                <textarea
                  rows={3}
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="Record summary observations for claims adjudicator..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !selectedBookingId}
                className={`w-full py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-2 ${
                  selectedBookingId
                    ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/20'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <span>Filing Report & Claim...</span>
                ) : (
                  <span>Submit Damage Report & Open Claim</span>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span>Recorded Damage Audits</span>
          </h2>

          <div className="space-y-3">
            {existingDamageReports && existingDamageReports.length > 0 ? (
              existingDamageReports.map((rep: any, i: number) => (
                <div key={i} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      {/* 🚨 UPDATED: Now maps to the correct field names */}
                      <span className="text-[10px] text-rose-400 font-mono font-bold">{rep.inspectionId || rep.reportRef || 'INSP-XXX'}</span>
                      <h4 className="text-xs font-bold text-white">{rep.venueName || 'Event Venue'}</h4>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase">
                      {rep.status}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-emerald-400 font-bold flex justify-between pt-1">
                    <span>Est. Damage Cost:</span>
                    <span>R {(rep.totalCost || rep.totalClaimAmount || 0).toLocaleString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-slate-800/20 border border-dashed border-slate-700/60 rounded-xl p-6 text-center text-slate-500 text-xs">
                No damage reports logged for this booking.
              </div>
            )}
          </div>
        </div>
      </div>

      {successModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-rose-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 bg-rose-500/20 border border-rose-500/40 rounded-full flex items-center justify-center mx-auto text-rose-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Damage Report Filed!</h3>
            <p className="text-xs text-slate-400">
              Report <strong>{successModal.reportRef}</strong> recorded. Draft claim ID: <strong>{successModal.claimId}</strong>.
            </p>
            <div className="bg-slate-900 p-3 rounded-xl font-mono text-xs text-rose-400">
              Total Estimated Repairs: R {successModal.total.toLocaleString()}
            </div>
            <button
              onClick={() => setSuccessModal(null)}
              className="w-full py-2.5 bg-rose-500 hover:bg-rose-400 text-white rounded-lg font-bold text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};