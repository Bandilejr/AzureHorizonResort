import React, { useState, useEffect } from 'react';
import { 
  FileText, Image as ImageIcon, AlertCircle, CheckCircle, 
  XCircle, Loader2, DollarSign, Mail 
} from 'lucide-react';
import { db } from '@/services/firebase-services';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import emailjs from '@emailjs/browser';
import { writeAuditEntry } from '@/services/audit-services';
import { AUDIT_ACTIONS } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// 🚨 UPDATED INTERFACE TO PERFECTLY MATCH YOUR FIREBASE DATABASE
interface RefundRequest {
  id: string;
  guestId: string;
  guestEmail: string;
  eventId: string;          // Was bookingRef
  reason: string;           // Was description
  requestedAmount: number;
  proofImages: string[];    // Was evidenceImages
  incidentLogId: string;    // Was incidentLogs
  status: string;           // 'pending' | 'approved' | 'declined'
  createdAt: any;           // Firebase Timestamp
}

export function AdminRefundReview() {
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [activeRequest, setActiveRequest] = useState<RefundRequest | null>(null);
  const [actionType, setActionType] = useState<'Approve' | 'Decline' | null>(null);
  const [finalAmount, setFinalAmount] = useState<number>(0);
  const [declineReason, setDeclineReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // SRS Flow Step 2: System retrieves and displays pending requests
  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    setIsLoading(true);
    try {
      const reqRef = collection(db, 'refund_requests');
      // 🚨 UPDATED to look for lowercase 'pending' to match your DB schema
      const q = query(reqRef, where('status', '==', 'pending'));
      const snapshot = await getDocs(q);
      
      const fetched: RefundRequest[] = [];
      snapshot.docs.forEach(docSnap => {
        fetched.push({ id: docSnap.id, ...docSnap.data() } as RefundRequest);
      });

      // 🚨 UPDATED safely handle Firebase Timestamps for sorting
      fetched.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });

      setRequests(fetched);
    } catch (error) {
      console.error("Error fetching refund requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // SRS Flow Step 7: System updates status and generates/dispatches invoice
  const dispatchRefundEmail = async (
    email: string, 
    status: string, 
    amount: number, 
    reason: string
  ) => {
    const SERVICE_ID = 'service_os15k5k'; 
    const TEMPLATE_ID = 'template_47n245j'; 
    const PUBLIC_KEY = 'clygGEr0bqOlSNu82'; 

    const templateParams = {
      to_email: email,
      refund_status: status,
      final_amount: amount > 0 ? `R ${amount.toLocaleString()}` : 'N/A',
      admin_notes: reason,
      date_processed: new Date().toLocaleDateString()
    };

    try {
      await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
      console.log(`Successfully dispatched refund invoice to: ${email}`);
    } catch (error) {
      console.error(`Failed to send refund email:`, error);
    }
  };

  const handleProcessRequest = async () => {
    if (!activeRequest || !actionType) return;

    if (actionType === 'Decline' && !declineReason.trim()) {
      window.alert("Please provide a reason for declining this request.");
      return;
    }

    if (actionType === 'Approve' && finalAmount <= 0) {
      window.alert("Please enter a valid approved refund amount.");
      return;
    }

    setIsSubmitting(true);

    try {
      const requestRef = doc(db, 'refund_requests', activeRequest.id);
      
      // 🚨 UPDATED to save lowercase status back to DB
      const newStatus = actionType === 'Approve' ? 'approved' : 'declined';
      
      await updateDoc(requestRef, {
        status: newStatus,
        approvedAmount: actionType === 'Approve' ? finalAmount : 0,
        adminNotes: actionType === 'Decline' ? declineReason : 'Approved standard refund.',
        processedAt: new Date().toISOString() // Or use serverTimestamp()
      });

      // Dispatch the email
      await dispatchRefundEmail(
        activeRequest.guestEmail,
        newStatus,
        actionType === 'Approve' ? finalAmount : 0,
        actionType === 'Decline' ? declineReason : 'Your refund has been approved and is being processed.'
      );

      await writeAuditEntry({
        action: actionType === 'Approve' ? AUDIT_ACTIONS.refundApproved : AUDIT_ACTIONS.refundDeclined,
        entity: 'refund_requests',
        entityId: activeRequest.id,
        beforeStatus: 'pending',
        afterStatus: newStatus,
        summary: actionType === 'Approve'
          ? `Refund of R ${finalAmount.toLocaleString()} approved for ${activeRequest.guestEmail}`
          : `Refund request declined for ${activeRequest.guestEmail}`,
        metadata: {
          requestedAmount: activeRequest.requestedAmount || 0,
          approvedAmount: actionType === 'Approve' ? finalAmount : 0,
          reason: actionType === 'Decline' ? declineReason : 'Approved standard refund.',
          eventId: activeRequest.eventId || null,
        },
      });

      window.alert(`Refund request successfully ${newStatus}!`);
      
      // Remove the processed request from the UI queue
      setRequests(prev => prev.filter(r => r.id !== activeRequest.id));
      closeModal();
    } catch (error) {
      console.error("Error processing refund:", error);
      window.alert("An error occurred while processing this request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openReviewModal = (request: RefundRequest) => {
    setActiveRequest(request);
    setFinalAmount(request.requestedAmount || 0);
    setActionType(null);
    setDeclineReason('');
  };

  const closeModal = () => {
    setActiveRequest(null);
    setActionType(null);
  };

  return (
    <div className="w-full max-w-6xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
          <DollarSign className="h-8 w-8 text-[#c9a227]" /> Refund Request Queue
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Review guest claims, validate evidence, and process invoices.
        </p>
      </div>

      {isLoading ? (
        <Card className="border-none shadow-sm flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f]" />
        </Card>
      ) : requests.length === 0 ? (
        <Card className="border-dashed border-2 border-gray-200 text-center py-20">
          <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700">All Caught Up!</h3>
          <p className="text-gray-500 mt-2">There are no pending refund requests to review.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {requests.map(req => (
            <Card key={req.id} className="hover:shadow-md transition-shadow">
              <div className="flex justify-between items-center p-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-lg text-[#1e3a5f]">{req.guestEmail}</h3>
                    <Badge className="bg-amber-100 text-amber-800 border-none">Pending Review</Badge>
                  </div>
                  <p className="text-sm text-gray-500">Event ID: {req.eventId || 'N/A'}</p>
                  <p className="text-sm text-gray-500">Requested: <span className="font-semibold text-gray-900">R {(req.requestedAmount || 0).toLocaleString()}</span></p>
                </div>
                
                <Button 
                  className="bg-[#1e3a5f] hover:bg-[#163058] text-white"
                  onClick={() => openReviewModal(req)}
                >
                  Review Claim
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* REVIEW MODAL */}
      {activeRequest && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full my-8">
            <div className="bg-[#1e3a5f] p-5 flex justify-between items-center sticky top-0 z-10">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#c9a227]" /> Claim Evaluation
              </h2>
              <button onClick={closeModal} className="text-white/70 hover:text-white">
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Guest Explanation</h4>
                    <p className="text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-slate-800 p-3 rounded-lg border border-gray-100 mt-1 text-sm">
                      {activeRequest.reason || 'No reason provided.'}
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Incident Logs</h4>
                    <p className="text-gray-800 dark:text-gray-200 bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-100 mt-1 text-sm font-mono">
                      {activeRequest.incidentLogId || "No logs linked to this booking."}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <ImageIcon className="h-4 w-4" /> Photo Evidence
                  </h4>
                  {activeRequest.proofImages && activeRequest.proofImages.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {activeRequest.proofImages.map((img, idx) => (
                        <img key={idx} src={img} alt="Evidence" className="rounded-lg object-cover h-32 w-full border border-gray-200" />
                      ))}
                    </div>
                  ) : (
                    <div className="h-32 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center border border-dashed border-gray-300">
                      <p className="text-sm text-gray-500">No photos uploaded.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-slate-700 pt-6">
                {!actionType ? (
                  <div className="flex gap-4 justify-end">
                    <Button variant="outline" className="border-red-500 text-red-600 hover:bg-red-50" onClick={() => setActionType('Decline')}>
                      <XCircle className="h-4 w-4 mr-2" /> Decline Request
                    </Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setActionType('Approve')}>
                      <CheckCircle className="h-4 w-4 mr-2" /> Approve Refund
                    </Button>
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-slate-800 p-5 rounded-lg border border-gray-200 dark:border-slate-700">
                    <h3 className="font-bold text-[#1e3a5f] dark:text-white mb-4 flex items-center gap-2">
                      {actionType === 'Approve' ? <CheckCircle className="text-emerald-500 h-5 w-5" /> : <XCircle className="text-red-500 h-5 w-5" />}
                      {actionType === 'Approve' ? 'Finalize Approved Amount' : 'Provide Decline Reason'}
                    </h3>

                    {actionType === 'Approve' && (
                      <div className="mb-4">
                        <label className="block text-sm font-semibold mb-1">Approved Amount (ZAR)</label>
                        <input 
                          type="number" 
                          value={finalAmount} 
                          onChange={(e) => setFinalAmount(Number(e.target.value))}
                          className="w-full border p-2 rounded-md font-mono text-lg"
                        />
                      </div>
                    )}

                    {actionType === 'Decline' && (
                      <div className="mb-4">
                        <label className="block text-sm font-semibold mb-1">Reason for Decline (Sent to Guest)</label>
                        <textarea 
                          value={declineReason} 
                          onChange={(e) => setDeclineReason(e.target.value)}
                          className="w-full border p-2 rounded-md min-h-[100px]"
                          placeholder="e.g., The incident logs do not match the claim..."
                        />
                      </div>
                    )}

                    <div className="flex justify-end gap-3 mt-6">
                      <Button variant="ghost" onClick={() => setActionType(null)} disabled={isSubmitting}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleProcessRequest}
                        disabled={isSubmitting}
                        className={actionType === 'Approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
                      >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                        {isSubmitting ? 'Processing...' : `Confirm & Email Invoice`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}