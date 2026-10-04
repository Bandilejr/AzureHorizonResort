// src/services/increment2-services.ts — Increment 2 Firestore layer.
// D-DRIVE ONLY. Extends existing Firebase/onSnapshot/QR/transaction substrate.
// Reuses: memory-cache db, notifications inbox pattern, hmac QR chain,
// held-state transaction pattern, getProfessionalPDFHTML pipeline.
/* eslint-disable @typescript-eslint/no-explicit-any -- faithful port of
   my-mobile-app/src/services/increment2-services.ts, where this rule is
   warn-level; snapshot/callback typing cleanup is tracked follow-up work. */

import {
  collection, doc, addDoc, setDoc, updateDoc, query, where, limit,
  onSnapshot, getDocs, getDoc, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { signQrPayload, verifyQrSignature } from './qr-signing';
import type {
  NpoPartner, NpoVerificationStatus, DonationBatch, DonationStatus, SafetyChecklist,
  DonationCheckin, StaffAvailability, LeaveRequest, ShiftRoster, RosterShift,
  ShiftSwap, SwapStatus, OpenShift, AttendanceException, AttendanceExceptionType,
  FileMeta, ImpactReport,
} from '@/types/increment2';
import { IMPACT_MEALS_PER_KG, IMPACT_CARBON_KG_PER_KG } from '@/types/increment2';

// QR signing is centralized in ./qr-signing (env secret → service → payloads).
// This module never hard-codes a QR secret.

const nowIso = () => new Date().toISOString();

function requireAuth() {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('You must be signed in to perform this action.');
  return user;
}

function friendlyTxError(e: unknown, fallback: string): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (/already been|already claimed|already allocated|already collected|insufficient|leave|rest|overtime|permission/i.test(msg)) throw e;
  throw new Error(fallback);
}

// ---------- Actor identity (mirrors mobile remediation Phase A) ----------
// Never trust caller-supplied role/npoId/staffId where the Firestore
// profile can be derived.

export interface ActorProfile {
  uid: string;
  email: string;
  role: string | null;
  subRole: string | null;
  npoId: string | null;
}

export async function getMyProfile(): Promise<ActorProfile> {
  const user = requireAuth();
  const uidSnap = await getDoc(doc(db, 'users', user.uid));
  const data = (uidSnap.exists() ? uidSnap.data() : {}) as Record<string, unknown>;
  const email = String(data.email || user.email || '').toLowerCase();
  let role = (data.role as string) || null;
  let subRole = (data.subRole as string) || null;
  let npoId = (data.npoId as string) || null;
  if ((!role || !npoId) && email) {
    const emailSnap = await getDoc(doc(db, 'users', email));
    if (emailSnap.exists()) {
      const e = emailSnap.data() as Record<string, unknown>;
      role = role || (e.role as string) || null;
      subRole = subRole || (e.subRole as string) || null;
      npoId = npoId || (e.npoId as string) || null;
    }
  }
  return { uid: user.uid, email, role, subRole, npoId };
}

export function isFoodManagerProfile(p: ActorProfile): boolean {
  return p.role === 'admin' || p.role === 'kitchen_manager' || p.role === 'chef';
}

export function isFoodOperatorProfile(p: ActorProfile): boolean {
  return isFoodManagerProfile(p) || p.subRole === 'catering_staff';
}

export function isManagerProfile(p: ActorProfile): boolean {
  return p.role === 'admin' || p.role === 'kitchen_manager'
    || p.role === 'event_manager' || p.subRole === 'event_manager';
}

async function requireFoodManager(action: string): Promise<ActorProfile> {
  const p = await getMyProfile();
  if (!isFoodManagerProfile(p)) throw new Error(`Only kitchen management can ${action}.`);
  return p;
}

async function requireManager(action: string): Promise<ActorProfile> {
  const p = await getMyProfile();
  if (!isManagerProfile(p)) throw new Error(`Only managers can ${action}.`);
  return p;
}

// ---------- Reliable per-user notifications ----------
// Group literals ('kitchen-managers', 'managers') and emails-as-uids never
// match the per-uid inbox listener. All flow notifications resolve to
// user-doc ids.

async function resolveUserIdsByRole(roles: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const chunk of [roles.slice(0, 10)]) {
    if (chunk.length === 0) continue;
    const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', chunk)));
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const uid = (data.uid as string) || '';
      if (uid && !uid.includes('@')) out.add(uid);
      else if (!d.id.includes('@')) out.add(d.id);
    });
  }
  return [...out];
}

async function resolveNpoUserUid(npoId: string): Promise<string | null> {
  const snap = await getDocs(query(collection(db, 'users'), where('npoId', '==', npoId), limit(5)));
  const uidDoc = snap.docs.find((d) => d.id.length > 20);
  return (uidDoc || snap.docs[0])?.id || null;
}

export async function notifyUsers(
  userIds: (string | null | undefined)[],
  n: { type: string; title: string; message: string; referenceId?: string; targetRoute?: string },
): Promise<void> {
  const seen = new Set<string>();
  for (const raw of userIds) {
    const uid = String(raw || '').trim();
    if (!uid || seen.has(uid) || uid.includes('@')) continue; // uids only, never emails/literals
    seen.add(uid);
    try {
      await notifyUser({ userId: uid, ...n });
    } catch { /* best-effort per recipient */ }
  }
}

export async function notifyManagers(
  n: { type: string; title: string; message: string; referenceId?: string; targetRoute?: string },
  includeEventManagers = false,
): Promise<void> {
  try {
    const roles = includeEventManagers
      ? ['admin', 'kitchen_manager', 'event_manager']
      : ['admin', 'kitchen_manager'];
    const ids = await resolveUserIdsByRole(roles);
    await notifyUsers(ids, n);
  } catch { /* best-effort */ }
}

// ---------- Notifications (reuse persistent inbox pattern) ----------

export async function notifyUser(args: {
  userId: string; type: string; title: string; message: string; referenceId?: string; targetRoute?: string;
}) {
  await addDoc(collection(db, 'notifications'), {
    userId: args.userId,
    type: args.type,
    title: args.title,
    message: args.message,
    referenceId: args.referenceId || null,
    targetRoute: args.targetRoute || null,
    read: false,
    readAt: null,
    createdAt: serverTimestamp(),
  });
}

export function listenUserNotifications(userId: string, cb: (items: any) => void) {
  const q = query(collection(db, 'notifications'), where('userId', '==', userId));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as any));
}

// ---------- NPO verification ----------

export async function createNpoApplication(input: {
  organisationName: string; registrationNumber: string; pboNumber?: string;
  contactName: string; email: string; phone: string; serviceAreas: string[];
  beneficiaryCapacity: number; transportType: string; refrigerationAvailable: boolean;
  complianceDocuments?: FileMeta[];
}): Promise<string> {
  const user = requireAuth();
  if (!input.organisationName.trim()) throw new Error('Organisation name is required.');
  if (!input.registrationNumber.trim()) throw new Error('Registration number is required.');
  if (!input.contactName.trim()) throw new Error('Contact name is required.');
  if (!input.email.trim()) throw new Error('Contact email is required.');
  const ref = await addDoc(collection(db, 'npo_partners'), {
    npoId: `NPO-${Date.now().toString(36).toUpperCase()}`,
    ...input,
    complianceDocuments: input.complianceDocuments || [],
    verificationStatus: 'pending' as NpoVerificationStatus,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: user.uid,
  });
  return ref.id;
}

export function listenNpoPartners(cb: (items: NpoPartner[]) => void, status?: NpoVerificationStatus) {
  const q = status
    ? query(collection(db, 'npo_partners'), where('verificationStatus', '==', status))
    : query(collection(db, 'npo_partners'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as NpoPartner)));
}

export async function markNpoUnderReview(npoDocId: string): Promise<void> {
  const user = requireAuth();
  const me = await getMyProfile();
  if (me.role !== 'admin') throw new Error('Only administrators can review NPO applications.');
  const ref = doc(db, 'npo_partners', npoDocId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('NPO application not found.');
    const st = (snap.data() as Record<string, unknown>).verificationStatus;
    if (st !== 'pending') throw new Error('Only pending applications can move to under review.');
    tx.update(ref, {
      verificationStatus: 'under_review',
      verifiedBy: user.uid,
      verifiedAt: nowIso(),
      updatedAt: nowIso(),
      lastDecision: { performedBy: user.uid, performedAt: nowIso(), action: 'npo_under_review', reason: null },
    });
  });
}

export async function reviewNpoApplication(args: {
  npoDocId: string; approve: boolean; reason?: string; reviewerUid?: string; reviewerName?: string;
}) {
  const user = requireAuth();
  const me = await getMyProfile();
  if (me.role !== 'admin') throw new Error('Only administrators can review NPO applications.');
  if (!args.approve && !args.reason?.trim()) throw new Error('A rejection reason is required.');
  const reviewerUid = args.reviewerUid || user.uid;
  const ref = doc(db, 'npo_partners', args.npoDocId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('NPO application not found.');
    const data = snap.data() as Record<string, any>;
    const st = data.verificationStatus as NpoVerificationStatus;
    if (st === 'approved' || st === 'rejected') throw new Error('This application has already been reviewed.');
    tx.update(ref, {
      verificationStatus: args.approve ? 'approved' : 'rejected',
      rejectionReason: args.approve ? null : args.reason,
      verifiedBy: reviewerUid,
      verifiedAt: nowIso(),
      updatedAt: nowIso(),
      lastDecision: {
        performedBy: reviewerUid,
        performedAt: nowIso(),
        action: args.approve ? 'npo_approved' : 'npo_rejected',
        reason: args.reason || null,
      },
    });
  });
  // Notify NPO contact outside the transaction (best-effort, never fails the decision)
  try {
    const snap = await getDoc(ref);
    const data = snap.data() as Record<string, any> | undefined;
    const contactEmail = String(data?.email || '').toLowerCase().trim();
    if (args.approve && contactEmail) {
      // provision/associate the npo_rep account so the portal login works.
      const profile = {
        name: String(data?.contactName || data?.organisationName || 'NPO Partner'),
        email: contactEmail,
        role: 'npo_rep',
        status: 'staff',
        npoId: String(data?.npoId || ''),
        organisationName: String(data?.organisationName || ''),
        updatedAt: nowIso(),
      };
      await setDoc(doc(db, 'users', contactEmail), {
        uid: contactEmail,
        id: contactEmail,
        ...profile,
      }, { merge: true });
      // Mirror onto the uid-keyed doc when the rep already signed up: rules
      // and routing read users/{uid} first.
      try {
        const prior = await getDocs(query(collection(db, 'users'),
          where('email', '==', contactEmail), limit(5)));
        for (const d of prior.docs) {
          if (d.id.length > 20 && d.id !== contactEmail) {
            await setDoc(doc(db, 'users', d.id), { ...profile, uid: d.id }, { merge: true });
          }
        }
      } catch { /* best-effort */ }
    }
    if (contactEmail) {
      // Inbox notify only works for uid docs; resolve to the rep's uid.
      const npoUid = await resolveNpoUserUid(String(data?.npoId || ''));
      await notifyUsers([npoUid], {
        type: args.approve ? 'npo_approved' : 'npo_rejected',
        title: args.approve ? 'NPO application approved' : 'NPO application reviewed',
        message: args.approve
          ? `${String(data?.organisationName || 'Your organisation')} is now active in the food rescue network.`
          : `Application reviewed: ${args.reason}`,
        referenceId: args.npoDocId,
        targetRoute: '/(npo)/dashboard',
      });
    }
  } catch { /* best-effort */ }
  void args.reviewerName;
}

// ---------- Donation logging ----------

export function makeBatchId(): string {
  return `DON-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

export function validateSafetyChecklist(c: SafetyChecklist): string | null {
  if (!c.coreTemperatureVerified) return 'Core temperature must be verified.';
  if (!c.packagingIntegrityVerified) return 'Packaging/seal integrity must be verified.';
  if (!c.allergenLabelsVerified) return 'Allergen labelling must be verified.';
  if (!c.safePreparationWindowVerified) return 'Safe preparation window must be verified.';
  return null;
}

export async function logDonationBatch(input: {
  itemName: string; mealCategory: string; portionCount: number; estimatedWeightKg: number;
  allergens?: string[]; preparedAt: string; expiryAt: string;
  safetyChecklist: SafetyChecklist; safetyPhotoUrl: string; photoMeta?: FileMeta;
}): Promise<{ docId: string; batchId: string }> {
  const user = requireAuth();
  if (!input.itemName.trim()) throw new Error('Food item name is required.');
  if (!input.mealCategory.trim()) throw new Error('Meal category is required.');
  if (!(input.portionCount > 0)) throw new Error('Portion count must be greater than zero.');
  if (!(input.estimatedWeightKg > 0)) throw new Error('Estimated weight must be greater than zero.');
  if (!input.preparedAt || !input.expiryAt
    || Number.isNaN(new Date(input.preparedAt).getTime())
    || Number.isNaN(new Date(input.expiryAt).getTime()))
    throw new Error('Valid preparation and expiry dates are required.');
  if (new Date(input.expiryAt).getTime() <= new Date(input.preparedAt).getTime())
    throw new Error('Expiry must be after preparation time.');
  const checklistErr = validateSafetyChecklist(input.safetyChecklist);
  if (checklistErr) throw new Error(`All four food-safety checks must be verified. ${checklistErr}`);
  if (!input.safetyPhotoUrl) throw new Error('Food-safety photo evidence is required.');
  const batchId = makeBatchId();
  const ref = await addDoc(collection(db, 'donation_batches'), {
    batchId,
    itemName: input.itemName.trim(),
    mealCategory: input.mealCategory.trim(),
    portionCount: input.portionCount,
    estimatedWeightKg: input.estimatedWeightKg,
    allergens: input.allergens || [],
    preparedAt: input.preparedAt,
    expiryAt: input.expiryAt,
    safetyChecklist: input.safetyChecklist,
    safetyPhotoUrl: input.safetyPhotoUrl,
    photoMeta: input.photoMeta || null,
    status: 'safety_verified_unassigned' as DonationStatus,
    qrConsumed: false,
    createdBy: user.uid,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return { docId: ref.id, batchId };
}

export function listenDonationBatches(cb: (items: DonationBatch[]) => void, status?: DonationStatus) {
  const q = status
    ? query(collection(db, 'donation_batches'), where('status', '==', status))
    : query(collection(db, 'donation_batches'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as DonationBatch)));
}

// ---------- Allocation (transactional, held-state pattern) ----------

export interface NpoMatchScore { npo: NpoPartner; score: number; reasons: string[] }

export function rankNpoPartners(batch: DonationBatch, npos: NpoPartner[]): NpoMatchScore[] {
  const needsCold = /dairy|meat|fish|chicken|frozen|chilled|yoghurt/i.test(`${batch.itemName} ${batch.mealCategory}`);
  return npos
    .filter((n) => n.verificationStatus === 'approved')
    .map((npo) => {
      let score = 0;
      const reasons: string[] = [];
      score += Math.min(40, Math.round((npo.beneficiaryCapacity || 0) / 10));
      reasons.push(`Capacity ${npo.beneficiaryCapacity}`);
      if (npo.refrigerationAvailable && needsCold) { score += 30; reasons.push('Cold-chain capable'); }
      else if (!needsCold) { score += 10; reasons.push('Shelf-stable match'); }
      else { score -= 20; reasons.push('No refrigeration for perishable'); }
      const perishHrs = (new Date(batch.expiryAt).getTime() - Date.now()) / 3600000;
      if (perishHrs < 6) { score += npo.transportType ? 15 : -10; reasons.push(perishHrs < 6 ? 'Urgent: transport ready' : 'Urgent window'); }
      const clash = (batch.allergens || []).length > 0 ? 0 : 5;
      score += clash;
      return { npo, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export async function allocateDonationBatch(args: {
  batchDocId: string; npoId: string; allocatorUid?: string;
}) {
  const user = requireAuth();
  await requireFoodManager('allocate donations');
  // NPO must exist and be approved (previously client-display only).
  const npoSnap = await getDocs(query(collection(db, 'npo_partners'),
    where('npoId', '==', args.npoId), limit(1)));
  const npo = npoSnap.docs[0]?.data() as Record<string, unknown> | undefined;
  if (!npo) throw new Error('Selected NPO no longer exists.');
  if (npo.verificationStatus !== 'approved')
    throw new Error('Only approved NPO partners can receive allocations.');
  const ref = doc(db, 'donation_batches', args.batchDocId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Donation batch not found.');
      const data = snap.data() as Record<string, any>;
      if (data.status !== 'safety_verified_unassigned')
        throw new Error('This donation batch has already been allocated.');
      tx.update(ref, {
        status: 'allocated_awaiting_claim',
        allocatedNpoId: args.npoId,
        allocatedAt: nowIso(),
        allocatedBy: user.uid,
        updatedAt: nowIso(),
        lastDecision: { performedBy: user.uid, performedAt: nowIso(), action: 'donation_allocated', reason: args.npoId },
      });
    });
  } catch (e) { friendlyTxError(e, 'Allocation failed. The batch may have just been allocated.'); }
  try {
    const snap = await getDoc(ref);
    const data = snap.data() as Record<string, any> | undefined;
    // Notify the NPO rep's uid doc (emails never match the inbox listener).
    const npoUid = await resolveNpoUserUid(args.npoId);
    await notifyUsers([npoUid], {
      type: 'donation_allocated', title: 'Donation allocated to your organisation',
      message: `${(data?.batchId as string) || 'A batch'} (${(data?.itemName as string) || 'food'}) is awaiting your claim.`,
      referenceId: args.batchDocId,
      targetRoute: '/(npo)/allocations',
    });
  } catch { /* best-effort */ }
  void args.allocatorUid;
}

// ---------- Claim (transactional) ----------

export async function claimDonationBatch(args: {
  batchDocId: string; npoId?: string; claimerUid?: string; receivingFacility: string; acceptTerms: boolean;
}) {
  const user = requireAuth();
  // Identity comes from the authenticated profile, never the caller.
  const me = await getMyProfile();
  if (me.role !== 'npo_rep' || !me.npoId)
    throw new Error('Only a verified NPO representative can claim donations.');
  if (!args.acceptTerms) throw new Error('You must accept the distribution terms.');
  if (!args.receivingFacility.trim()) throw new Error('Receiving facility is required.');
  const npoId = me.npoId;
  const ref = doc(db, 'donation_batches', args.batchDocId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Donation batch not found.');
      const data = snap.data() as Record<string, any>;
      if (data.status !== 'allocated_awaiting_claim')
        throw new Error('This allocation is no longer available for claim.');
      if (!data.allocatedNpoId || data.allocatedNpoId !== npoId)
        throw new Error('This allocation belongs to another organisation.');
      tx.update(ref, {
        status: 'claimed_ready_for_scheduling',
        claimedBy: user.uid,
        claimedAt: nowIso(),
        receivingFacility: args.receivingFacility.trim(),
        distributionTermsAccepted: true,
        updatedAt: nowIso(),
        lastDecision: { performedBy: user.uid, performedAt: nowIso(), action: 'donation_claimed', reason: args.receivingFacility.trim() },
      });
    });
  } catch (e) { friendlyTxError(e, 'Claim failed. The allocation may have just been claimed.'); }
  try {
    await notifyManagers({
      type: 'donation_claimed', title: 'Donation claimed by NPO',
      message: `Batch claimed for ${args.receivingFacility}. Ready to schedule collection.`,
      referenceId: args.batchDocId,
      targetRoute: '/(kitchen)/logistics',
    });
  } catch { /* best-effort */ }
  void args.npoId;
  void args.claimerUid;
}

// ---------- Scheduling + signed collection QR ----------

export interface CollectionPayload {
  type: 'DONATION_COLLECTION';
  batchId: string;
  batchDocId: string;
  npoId: string;
  collectionWindowStart: string;
  collectionWindowEnd: string;
  loadingBay: string;
  issuedAt: number;
  nonce: string;
}

export async function scheduleDonationCollection(args: {
  batchDocId: string; pickupDate: string; windowStart: string; windowEnd: string;
  loadingBay: string; courierName?: string; schedulerUid?: string;
}): Promise<string> {
  const user = requireAuth();
  await requireFoodManager('schedule collections');
  if (!args.windowStart || !args.windowEnd) throw new Error('Pickup window is required.');
  if (new Date(args.windowEnd).getTime() <= new Date(args.windowStart).getTime())
    throw new Error('Window end must be after window start.');
  if (!args.loadingBay.trim()) throw new Error('Loading bay is required.');
  const ref = doc(db, 'donation_batches', args.batchDocId);
  // Pre-read for QR payload fields; the transaction below re-validates status
  // (concurrent schedulers both produce valid scheduled states; last QR wins).
  const pre = await getDoc(ref);
  if (!pre.exists()) throw new Error('Donation batch not found.');
  const preData = pre.data() as Record<string, any>;
  if (preData.status !== 'claimed_ready_for_scheduling' && preData.status !== 'collection_scheduled')
    throw new Error('Batch must be claimed before scheduling collection.');
  // Re-scheduling is allowed: re-issue rotates collectionNonce, invalidating the old pass.
  const payload: CollectionPayload = {
    type: 'DONATION_COLLECTION',
    batchId: String(preData.batchId),
    batchDocId: args.batchDocId,
    npoId: String(preData.allocatedNpoId || ''),
    collectionWindowStart: args.windowStart,
    collectionWindowEnd: args.windowEnd,
    loadingBay: args.loadingBay.trim(),
    issuedAt: Date.now(),
    nonce: Math.random().toString(36).slice(2) + Date.now().toString(36),
  };
  const sig = await signQrPayload(payload);
  const qr = JSON.stringify({ ...payload, sig });
  // Transactional read+schedule (kills concurrent-scheduler overwrite race).
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Donation batch not found.');
    const data = snap.data() as Record<string, any>;
    if (data.status !== 'claimed_ready_for_scheduling' && data.status !== 'collection_scheduled')
      throw new Error('Batch must be claimed before scheduling collection.');
    tx.update(ref, {
      status: 'collection_scheduled',
      pickupDate: args.pickupDate,
      pickupWindowStart: args.windowStart,
      pickupWindowEnd: args.windowEnd,
      loadingBay: args.loadingBay.trim(),
      courierName: args.courierName || null,
      collectionQr: qr,
      collectionNonce: payload.nonce,
      qrConsumed: false,
      updatedAt: nowIso(),
      lastDecision: { performedBy: user.uid, performedAt: nowIso(), action: 'collection_scheduled', reason: args.loadingBay },
    });
  });
  try {
    const done = await getDoc(ref);
    const claimerUid = String((done.data() as Record<string, any> | undefined)?.claimedBy || '');
    if (claimerUid) {
      await notifyUsers([claimerUid], {
        type: 'collection_scheduled', title: 'Collection scheduled',
        message: `Pickup ${args.windowStart} → ${args.windowEnd} at ${args.loadingBay}. Present the QR pass.`,
        referenceId: args.batchDocId,
        targetRoute: '/(npo)/collections',
      });
    }
  } catch { /* best-effort */ }
  void args.schedulerUid;
  return qr;
}

// ---------- Verify + complete collection (transactional, single-use QR) ----------

export interface CollectionVerifyResult {
  valid: boolean; message: string; reason?: string;
  batch?: DonationBatch; manifest?: string[];
}

export async function verifyCollectionQR(args: {
  qrPayload: string; sealVerified: boolean; courierName: string; courierId?: string;
  signature: string; verifierUid?: string; offline?: boolean;
}): Promise<CollectionVerifyResult> {
  const user = requireAuth();
  let payload: Record<string, any>;
  try {
    payload = typeof args.qrPayload === 'string' ? JSON.parse(args.qrPayload) : (args.qrPayload as any);
  } catch { return { valid: false, reason: 'invalid_format', message: 'Invalid QR format' }; }
  const { type, batchDocId, batchId, npoId, collectionWindowStart, collectionWindowEnd, loadingBay, nonce, sig } = payload;
  if (type !== 'DONATION_COLLECTION' || !batchDocId || !sig)
    return { valid: false, reason: 'invalid_structure', message: 'Invalid collection pass structure' };
  const check = { type, batchId, batchDocId, npoId, collectionWindowStart, collectionWindowEnd, loadingBay, issuedAt: payload.issuedAt, nonce };
  if (!(await verifyQrSignature(check, sig))) return { valid: false, reason: 'invalid_signature', message: 'Invalid collection pass signature' };
  if (!args.sealVerified) return { valid: false, reason: 'seal_unverified', message: 'Seal integrity must be confirmed before dispatch.' };
  if (!args.courierName.trim()) return { valid: false, reason: 'courier_required', message: 'Courier name is required.' };
  if (!args.signature) return { valid: false, reason: 'signature_required', message: 'Courier digital acceptance signature is required.' };
  // Canonical window semantics: 30-min early bound, 60-min late grace.
  const now = Date.now();
  const winStart = new Date(String(collectionWindowStart)).getTime();
  const winEnd = new Date(String(collectionWindowEnd)).getTime();
  if (Number.isNaN(winStart) || Number.isNaN(winEnd))
    return { valid: false, reason: 'invalid_window', message: 'Collection pass has an invalid window.' };
  if (now < winStart - 30 * 60000)
    return { valid: false, reason: 'window_early', message: 'Collection window has not opened yet.' };
  if (now > winEnd + 60 * 60000)
    return { valid: false, reason: 'expired', message: 'This QR collection pass has expired.' };
  const ref = doc(db, 'donation_batches', String(batchDocId));
  // Idempotency: deterministic checkin id per batch+nonce — reconnect replays collapse.
  const checkinId = `${String(batchDocId)}_${String(nonce)}`;
  try {
    let manifest: string[] = [];
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Donation batch not found.');
      const data = snap.data() as Record<string, any>;
      if (data.status !== 'collection_scheduled') throw new Error('This donation batch has already been collected.');
      if (data.qrConsumed) throw new Error('This collection pass has already been used.');
      // Stale-pass rejection: a re-issued pass rotates the nonce.
      if (data.collectionNonce && nonce && data.collectionNonce !== nonce)
        throw new Error('This collection pass is no longer current. Request the latest pass.');
      if (data.loadingBay && loadingBay && data.loadingBay !== loadingBay)
        throw new Error('This pass is for another loading bay.');
      const existing = await tx.get(doc(db, 'donation_checkins', checkinId));
      if (existing.exists()) throw new Error('This collection was already recorded.');
      manifest = [
        `${String(data.itemName)} × ${String(data.portionCount)} portions`,
        `${String(data.estimatedWeightKg)} kg · expires ${String(data.expiryAt)}`,
      ];
      tx.update(ref, {
        status: 'collected_completed', qrConsumed: true, collectedAt: nowIso(),
        verifiedBy: args.verifierUid || user.uid, updatedAt: nowIso(),
        lastDecision: { performedBy: args.verifierUid || user.uid, performedAt: nowIso(), action: 'collection_completed', reason: args.courierName },
      });
      tx.set(doc(db, 'donation_checkins', checkinId), {
        batchId: String(data.batchId), npoId: String(data.allocatedNpoId || npoId),
        courierName: args.courierName.trim(), courierId: args.courierId || null,
        method: 'donation_scan',
        collectionWindow: `${String(collectionWindowStart)} → ${String(collectionWindowEnd)}`,
        loadingBay: String(loadingBay), sealVerified: true, signature: args.signature,
        collectedAt: nowIso(), verifiedBy: args.verifierUid || user.uid,
        wasOffline: !!args.offline,
        idempotencyKey: `${String(batchDocId)}:${String(nonce)}`,
      });
    });
    const snap = await getDoc(ref);
    const batch = { id: snap.id, ...(snap.data() as object) } as DonationBatch;
    // Notify the claiming NPO user (best-effort; never fails the collection).
    try {
      const allocatedNpoId = String((snap.data() as Record<string, unknown> | undefined)?.allocatedNpoId || '');
      if (allocatedNpoId) {
        const npoUid = await resolveNpoUserUid(allocatedNpoId);
        await notifyUsers([npoUid], {
          type: 'collection_completed', title: 'Donation collected',
          message: `${batch.batchId} dispatched via ${String(loadingBay)}.`,
          referenceId: String(batchDocId),
          targetRoute: '/(npo)/collections',
        });
      }
    } catch { /* best-effort */ }
    return { valid: true, message: 'Collection verified — dispatch complete.', batch, manifest };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Collection verification failed.';
    return { valid: false, message: msg };
  }
}

export function listenDonationCheckins(cb: (items: DonationCheckin[]) => void) {
  return onSnapshot(collection(db, 'donation_checkins'), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as DonationCheckin)));
}

// ---------- Impact report ----------

export function computeImpactReport(batches: DonationBatch[], checkins: DonationCheckin[], start: string, end: string): ImpactReport {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime() + 86400000;
  const inRange = batches.filter((b) => {
    const t = new Date(b.createdAt).getTime();
    return t >= s && t <= e;
  });
  const collected = inRange.filter((b) => b.status === 'collected_completed');
  const totalDonatedKg = inRange.reduce((a, b) => a + (Number(b.estimatedWeightKg) || 0), 0);
  const totalCollectedKg = collected.reduce((a, b) => a + (Number(b.estimatedWeightKg) || 0), 0);
  const mealsDiverted = Math.round(totalCollectedKg * IMPACT_MEALS_PER_KG);
  const carbonOffsetKg = Math.round(totalCollectedKg * IMPACT_CARBON_KG_PER_KG * 10) / 10;
  const npoMap = new Map<string, { batches: number; kg: number }>();
  for (const b of collected) {
    const key = b.allocatedNpoId || 'unknown';
    const cur = npoMap.get(key) || { batches: 0, kg: 0 };
    cur.batches += 1;
    cur.kg += Number(b.estimatedWeightKg) || 0;
    npoMap.set(key, cur);
  }
  void checkins;
  return {
    periodStart: start, periodEnd: end, totalDonatedKg, totalCollectedKg,
    mealsDiverted, carbonOffsetKg,
    npoCount: npoMap.size, batchCount: inRange.length,
    completionRate: inRange.length ? Math.round((collected.length / inRange.length) * 100) : 0,
    byNpo: [...npoMap.entries()].map(([npoId, v]) => ({
      npoId, batches: v.batches, kg: Math.round(v.kg * 10) / 10,
      meals: Math.round(v.kg * IMPACT_MEALS_PER_KG),
    })),
  };
}

// ---------- Availability & leave ----------

export async function submitAvailability(input: {
  staffId: string; staffName?: string; weekStart: string;
  availability: { day: string; startTime: string; endTime: string }[];
  unavailableDates?: string[];
}): Promise<string> {
  const user = requireAuth();
  if (!input.weekStart) throw new Error('Week start is required.');
  for (const a of input.availability || []) {
    if (a.startTime && a.endTime && a.startTime >= a.endTime)
      throw new Error(`Invalid hours for ${a.day}: start must be before end.`);
  }
  const staffId = input.staffId || user.uid;
  // Upsert per staff+week (prevents duplicate week docs).
  const dup = await getDocs(query(collection(db, 'staff_availability'),
    where('staffId', '==', staffId), where('weekStart', '==', input.weekStart), limit(1)));
  const docBody = {
    staffId,
    staffName: input.staffName || user.displayName || user.email,
    weekStart: input.weekStart,
    availability: input.availability,
    unavailableDates: input.unavailableDates || [],
    updatedAt: nowIso(),
  };
  if (!dup.empty) {
    await updateDoc(doc(db, 'staff_availability', dup.docs[0].id), docBody);
    return dup.docs[0].id;
  }
  const ref = await addDoc(collection(db, 'staff_availability'), docBody);
  return ref.id;
}

export function listenStaffAvailability(cb: (items: StaffAvailability[]) => void, staffId?: string) {
  const q = staffId
    ? query(collection(db, 'staff_availability'), where('staffId', '==', staffId))
    : query(collection(db, 'staff_availability'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as StaffAvailability)));
}

export async function submitLeaveRequest(input: {
  staffId: string; staffName?: string; leaveType: string; startDate: string; endDate: string;
  supportingDocuments?: FileMeta[];
}): Promise<string> {
  const user = requireAuth();
  if (!input.leaveType.trim()) throw new Error('Leave type is required.');
  if (!input.startDate || !input.endDate
    || Number.isNaN(new Date(input.startDate).getTime())
    || Number.isNaN(new Date(input.endDate).getTime()))
    throw new Error('Valid leave start and end dates are required.');
  if (new Date(input.endDate).getTime() < new Date(input.startDate).getTime())
    throw new Error('Leave end date must be on or after start date.');
  // Balance guard: max 21 days per request window (estimate, flagged not blocked beyond)
  const days = Math.round((new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / 86400000) + 1;
  if (days > 30) throw new Error('Leave request exceeds the 30-day single-request limit.');
  const staffId = input.staffId || user.uid;
  // Overlap guard: no second live request covering the same dates.
  const mine = await getDocs(query(collection(db, 'leave_requests'),
    where('staffId', '==', staffId), where('status', 'in', ['pending', 'approved'])));
  for (const d of mine.docs) {
    const l = d.data() as Record<string, string>;
    if (l.startDate <= input.endDate && input.startDate <= l.endDate)
      throw new Error(`Overlaps your ${l.status} ${l.leaveType} leave (${l.startDate} → ${l.endDate}).`);
  }
  const ref = await addDoc(collection(db, 'leave_requests'), {
    staffId,
    staffName: input.staffName || user.displayName || user.email,
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.endDate,
    supportingDocuments: input.supportingDocuments || [],
    status: 'pending',
    submittedAt: nowIso(),
  });
  try {
    await notifyManagers({
      type: 'leave_submitted', title: 'Leave request submitted',
      message: `${input.staffName || staffId}: ${input.leaveType} ${input.startDate} → ${input.endDate} (${days}d).`,
      referenceId: ref.id,
      targetRoute: '/(kitchen)/leave-manage',
    }, true);
  } catch { /* best-effort */ }
  return ref.id;
}

export function listenLeaveRequests(cb: (items: LeaveRequest[]) => void, status?: string) {
  const q = status
    ? query(collection(db, 'leave_requests'), where('status', '==', status))
    : query(collection(db, 'leave_requests'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as LeaveRequest)));
}

export async function reviewLeaveRequest(args: {
  leaveDocId: string; approve: boolean; reviewerUid?: string; reason?: string;
}) {
  const user = requireAuth();
  await requireManager('review leave requests');
  if (!args.approve && !args.reason?.trim()) throw new Error('A rejection reason is required.');
  const ref = doc(db, 'leave_requests', args.leaveDocId);
  // Transactional read+decision (kills double-approval race).
  const subjectUid = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Leave request not found.');
    const data = snap.data() as Record<string, any>;
    if (data.status !== 'pending') throw new Error('This leave request has already been reviewed.');
    if (String(data.staffId || '') === user.uid)
      throw new Error('You cannot approve your own leave request.');
    tx.update(ref, {
      status: args.approve ? 'approved' : 'rejected',
      reviewedBy: user.uid,
      reviewedAt: nowIso(),
      rejectionReason: args.approve ? null : args.reason,
      updatedAt: nowIso(),
      lastDecision: {
        performedBy: user.uid, performedAt: nowIso(),
        action: args.approve ? 'leave_approved' : 'leave_rejected',
        reason: args.approve ? null : (args.reason || null),
      },
    });
    return String(data.staffId || '');
  });
  try {
    await notifyUsers([subjectUid], {
      type: args.approve ? 'leave_approved' : 'leave_rejected',
      title: args.approve ? 'Leave approved' : 'Leave request reviewed',
      message: args.approve
        ? 'Your leave request was approved.'
        : `Leave reviewed: ${args.reason}`,
      referenceId: args.leaveDocId,
      targetRoute: '/(staff)/availability-leave',
    });
  } catch { /* best-effort */ }
  void args.reviewerUid;
}

// ---------- Roster builder + validation ----------

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

export function validateRosterShifts(args: {
  shifts: RosterShift[];
  availability: StaffAvailability[];
  approvedLeave: LeaveRequest[];
}): string[] {
  const warnings: string[] = [];
  const hoursByStaff = new Map<string, number>();
  for (const s of args.shifts) {
    const dur = (toMin(s.endTime) - toMin(s.startTime)) / 60;
    hoursByStaff.set(s.staffId, (hoursByStaff.get(s.staffId) || 0) + (dur > 0 ? dur : 0));
  }
  for (const [staffId, hrs] of hoursByStaff) {
    if (hrs > 40) warnings.push(`Overtime: ${staffId} scheduled ${hrs.toFixed(1)}h exceeds 40h/week.`);
  }
  // Rest < 11h between shifts same staff
  const byStaff = new Map<string, RosterShift[]>();
  for (const s of args.shifts) byStaff.set(s.staffId, [...(byStaff.get(s.staffId) || []), s]);
  for (const [staffId, list] of byStaff) {
    const sorted = [...list].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = new Date(`${sorted[i - 1].date}T${sorted[i - 1].endTime}`).getTime();
      const curStart = new Date(`${sorted[i].date}T${sorted[i].startTime}`).getTime();
      const gapH = (curStart - prevEnd) / 3600000;
      if (gapH >= 0 && gapH < 11)
        warnings.push(`Rest: ${staffId} has only ${gapH.toFixed(1)}h between shifts on ${sorted[i].date} (min 11h).`);
    }
  }
  // Availability + leave
  for (const s of args.shifts) {
    const avail = args.availability.find((a) => a.staffId === s.staffId);
    if (avail && avail.availability.length > 0) {
      const day = new Date(s.date).toLocaleDateString('en-US', { weekday: 'long' });
      const slot = avail.availability.find((a) => a.day.toLowerCase() === day.toLowerCase());
      if (!slot) warnings.push(`Availability: ${s.staffId} declared unavailable on ${day} (${s.date}).`);
      else if (toMin(s.startTime) < toMin(slot.startTime) || toMin(s.endTime) > toMin(slot.endTime))
        warnings.push(`Availability: ${s.staffId} shift ${s.startTime}-${s.endTime} outside declared ${slot.startTime}-${slot.endTime} on ${day}.`);
    }
    const onLeave = args.approvedLeave.some(
      (l) => l.staffId === s.staffId && l.status === 'approved' && s.date >= l.startDate && s.date <= l.endDate
    );
    if (onLeave) warnings.push(`Leave: ${s.staffId} is on approved leave on ${s.date}.`);
    if (!s.requiredSkill && !s.role) warnings.push(`Skill: shift ${s.shiftId} has no role/skill coverage.`);
  }
  return warnings;
}

export async function saveRoster(input: {
  weekStart: string; department: string; shifts: RosterShift[];
  availability: StaffAvailability[]; approvedLeave: LeaveRequest[]; authorUid?: string;
}): Promise<{ docId: string; warnings: string[] }> {
  const user = requireAuth();
  await requireManager('save rosters');
  if (!input.weekStart) throw new Error('Week start is required.');
  if (!input.department.trim()) throw new Error('Department is required.');
  const seen = new Set<string>();
  for (const s of input.shifts) {
    if (!s.shiftId || seen.has(s.shiftId)) throw new Error('Every shift needs a unique shift ID.');
    seen.add(s.shiftId);
    if (!s.staffId || !s.date || !s.role) throw new Error('Each shift needs staff, date and role.');
  }
  const warnings = validateRosterShifts({ shifts: input.shifts, availability: input.availability, approvedLeave: input.approvedLeave });
  const rosterId = `RS-${input.weekStart}-${input.department}`.replace(/\s+/g, '').toUpperCase();
  // Upsert per week+department (prevents duplicate week rosters).
  const existing = await getDocs(query(collection(db, 'shift_rosters'),
    where('weekStart', '==', input.weekStart), where('department', '==', input.department), limit(1)));
  const body = {
    rosterId,
    weekStart: input.weekStart,
    department: input.department,
    shifts: input.shifts,
    validationStatus: warnings.length ? 'draft' : 'validated',
    validationWarnings: warnings,
    published: false,
    updatedAt: nowIso(),
    createdBy: input.authorUid || user.uid,
  };
  if (!existing.empty) {
    const prior = existing.docs[0].data() as Record<string, unknown>;
    if (prior.published === true) throw new Error('This week is already published — create an amendment instead.');
    await updateDoc(doc(db, 'shift_rosters', existing.docs[0].id), body);
    return { docId: existing.docs[0].id, warnings };
  }
  const ref = await addDoc(collection(db, 'shift_rosters'), {
    ...body,
    createdAt: nowIso(),
  });
  return { docId: ref.id, warnings };
}

export async function publishRoster(rosterDocId: string, publisherUid?: string) {
  const user = requireAuth();
  await requireManager('publish rosters');
  const ref = doc(db, 'shift_rosters', rosterDocId);
  // Re-validate live state (never trust stored warnings), then guard the
  // publish write transactionally against concurrent publish/swap edits.
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Roster not found.');
  const data = snap.data() as Record<string, any>;
  if (data.published === true) throw new Error('This roster is already published.');
  const shifts = ((data.shifts as RosterShift[]) || []);
  const [availSnap, leaveSnap] = await Promise.all([
    getDocs(query(collection(db, 'staff_availability'))),
    getDocs(query(collection(db, 'leave_requests'), where('status', '==', 'approved'))),
  ]);
  const warnings = validateRosterShifts({
    shifts,
    availability: availSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as StaffAvailability),
    approvedLeave: leaveSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as LeaveRequest),
  });
  if (warnings.length) throw new Error(`Resolve validation warnings before publishing: ${warnings[0]}`);
  const fingerprint = JSON.stringify(shifts);
  await runTransaction(db, async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists()) throw new Error('Roster not found.');
    const cur = fresh.data() as Record<string, any>;
    if (cur.published === true) throw new Error('This roster was just published by someone else.');
    if (JSON.stringify(cur.shifts || []) !== fingerprint)
      throw new Error('Roster changed during validation — review and publish again.');
    tx.update(ref, {
      validationStatus: 'published', published: true, publishedAt: nowIso(),
      publishedBy: user.uid, updatedAt: nowIso(), validationWarnings: [],
    });
  });
  const staffIds = [...new Set(shifts.map((s) => String(s.staffId || '')))].filter(Boolean);
  await notifyUsers(staffIds, {
    type: 'roster_published', title: 'Roster published',
    message: `Week ${String(data.weekStart)} roster for ${String(data.department)} is published.`,
    referenceId: rosterDocId,
    targetRoute: '/(staff)/my-roster',
  });
  void publisherUid;
}

export function listenShiftRosters(cb: (items: ShiftRoster[]) => void, weekStart?: string) {
  const q = weekStart
    ? query(collection(db, 'shift_rosters'), where('weekStart', '==', weekStart))
    : query(collection(db, 'shift_rosters'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as ShiftRoster)));
}

// ---------- Shift swap (transactional) ----------

export async function requestShiftSwap(input: {
  requesterStaffId: string; requesterShiftId: string; targetStaffId: string;
  targetShiftId: string; rosterId: string;
}): Promise<string> {
  requireAuth();
  if (input.requesterStaffId === input.targetStaffId) throw new Error('Cannot swap with yourself.');
  const ref = await addDoc(collection(db, 'shift_swaps'), {
    requesterStaffId: input.requesterStaffId,
    requesterShiftId: input.requesterShiftId,
    targetStaffId: input.targetStaffId,
    targetShiftId: input.targetShiftId,
    rosterId: input.rosterId,
    status: 'pending_peer' as SwapStatus,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  try {
    await notifyUsers([input.targetStaffId], {
      type: 'shift_swap_requested', title: 'Shift swap requested',
      message: `${input.requesterStaffId} wants to swap shifts. Accept or decline.`,
      referenceId: ref.id,
      targetRoute: '/(staff)/shift-swaps',
    });
  } catch { /* best-effort */ }
  return ref.id;
}

export async function peerAcceptSwap(swapDocId: string, accepterUid: string, accept: boolean) {
  const user = requireAuth();
  const ref = doc(db, 'shift_swaps', swapDocId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Swap request not found.');
  const data = snap.data() as Record<string, any>;
  if (data.status !== 'pending_peer') throw new Error('This swap is no longer awaiting peer review.');
  // Only the requested colleague can respond — never a passed-in identity.
  if (String(data.targetStaffId || '') !== user.uid)
    throw new Error('Only the requested colleague can respond to this swap.');
  await updateDoc(ref, {
    status: accept ? 'pending_manager' : 'rejected',
    updatedAt: nowIso(),
  });
  try {
    await notifyUsers([String(data.requesterStaffId)], {
      type: accept ? 'shift_swap_accepted' : 'shift_swap_rejected',
      title: accept ? 'Swap accepted by peer' : 'Swap declined by peer',
      message: accept ? 'Awaiting manager approval.' : 'Your swap request was declined.',
      referenceId: swapDocId,
      targetRoute: '/(staff)/shift-swaps',
    });
  } catch { /* best-effort */ }
  void accepterUid;
}

export async function reviewShiftSwap(args: {
  swapDocId: string; approve: boolean; reviewerUid?: string; reason?: string;
  rosterDocId?: string;
}) {
  const user = requireAuth();
  await requireManager('review shift swaps');
  if (!args.approve && !args.reason?.trim()) throw new Error('A rejection reason is required.');
  const swapRef = doc(db, 'shift_swaps', args.swapDocId);
  if (!args.approve) {
    const parties = await runTransaction(db, async (tx) => {
      const snap = await tx.get(swapRef);
      if (!snap.exists()) throw new Error('Swap request not found.');
      const swap = snap.data() as Record<string, any>;
      if (swap.status !== 'pending_manager' && swap.status !== 'peer_accepted')
        throw new Error('This swap is not awaiting manager approval.');
      for (const party of [String(swap.requesterStaffId || ''), String(swap.targetStaffId || '')]) {
        if (party && party === user.uid)
          throw new Error('You cannot review a swap you are part of.');
      }
      tx.update(swapRef, {
        status: 'rejected', reviewedBy: user.uid, reviewedAt: nowIso(),
        rejectionReason: args.reason, updatedAt: nowIso(),
        lastDecision: { performedBy: user.uid, performedAt: nowIso(), action: 'shift_swap_rejected', reason: args.reason || null },
      });
      return [String(swap.requesterStaffId || ''), String(swap.targetStaffId || '')];
    });
    try {
      await notifyUsers(parties, {
        type: 'shift_swap_rejected',
        title: 'Shift swap rejected',
        message: `Swap reviewed: ${args.reason}`,
        referenceId: args.swapDocId,
        targetRoute: '/(staff)/shift-swaps',
      });
    } catch { /* best-effort */ }
    return;
  }
  try {
    const parties = await runTransaction(db, async (tx) => {
      const swapSnap = await tx.get(swapRef);
      if (!swapSnap.exists()) throw new Error('Swap request not found.');
      const swap = swapSnap.data() as Record<string, any>;
      if (swap.status !== 'pending_manager' && swap.status !== 'peer_accepted')
        throw new Error('This swap is not awaiting manager approval.');
      for (const party of [String(swap.requesterStaffId || ''), String(swap.targetStaffId || '')]) {
        if (party && party === user.uid)
          throw new Error('You cannot review a swap you are part of.');
      }
      // Roster comes from the swap doc; the param is an optional override only.
      const rosterDocId = args.rosterDocId || String(swap.rosterId || '');
      if (!rosterDocId) throw new Error('Roster reference missing — cannot apply swap.');
      const rosterRef = doc(db, 'shift_rosters', rosterDocId);
      const rosterSnap = await tx.get(rosterRef);
      if (!rosterSnap.exists()) throw new Error('Roster not found.');
      const roster = rosterSnap.data() as Record<string, any>;
      const shifts = [...((roster.shifts as RosterShift[]) || [])];
      const aIdx = shifts.findIndex((s) => s.shiftId === String(swap.requesterShiftId));
      const bIdx = shifts.findIndex((s) => s.shiftId === String(swap.targetShiftId));
      if (aIdx < 0 || bIdx < 0) throw new Error('One of the swap shifts no longer exists.');
      // Verify current ownership matches the request (kills stale approvals).
      if (shifts[aIdx].staffId !== String(swap.requesterStaffId)
        || shifts[bIdx].staffId !== String(swap.targetStaffId))
        throw new Error('Roster assignments changed since the request — re-raise the swap.');
      // Atomic staff reassignment
      shifts[aIdx] = { ...shifts[aIdx], staffId: String(swap.targetStaffId) };
      shifts[bIdx] = { ...shifts[bIdx], staffId: String(swap.requesterStaffId) };
      // Overtime guard post-swap (estimate)
      const hrs = new Map<string, number>();
      for (const s of shifts) {
        const dur = (toMin(s.endTime) - toMin(s.startTime)) / 60;
        hrs.set(s.staffId, (hrs.get(s.staffId) || 0) + (dur > 0 ? dur : 0));
      }
      for (const [sid, h] of hrs) {
        if (h > 48) throw new Error(`Approval would push ${sid} to ${h.toFixed(1)}h — exceeds cover limit.`);
      }
      tx.update(rosterRef, { shifts, updatedAt: nowIso() });
      tx.update(swapRef, {
        status: 'approved', reviewedBy: user.uid, reviewedAt: nowIso(), updatedAt: nowIso(),
        lastDecision: { performedBy: user.uid, performedAt: nowIso(), action: 'shift_swap_approved', reason: null },
      });
      return [String(swap.requesterStaffId || ''), String(swap.targetStaffId || '')];
    });
    try {
      await notifyUsers(parties, {
        type: 'shift_swap_approved',
        title: 'Shift swap approved',
        message: 'Both roster assignments have been updated.',
        referenceId: args.swapDocId,
        targetRoute: '/(staff)/my-roster',
      });
    } catch { /* best-effort */ }
  } catch (e) { friendlyTxError(e, 'Swap approval failed — assignments may have changed.'); }
  void args.reviewerUid;
}

export function listenShiftSwaps(cb: (items: ShiftSwap[]) => void, status?: SwapStatus) {
  const q = status
    ? query(collection(db, 'shift_swaps'), where('status', '==', status))
    : query(collection(db, 'shift_swaps'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as ShiftSwap)));
}

// ---------- Open shifts (transactional claim) ----------

export async function createOpenShift(input: {
  department: string; date: string; startTime: string; endTime: string; role: string;
  requiredSkill?: string; premiumRate?: number; urgency?: 'normal' | 'urgent' | 'critical';
  rosterId?: string; authorUid?: string;
}): Promise<string> {
  const user = requireAuth();
  await requireManager('publish open shifts');
  if (!input.department.trim() || !input.date || !input.role.trim())
    throw new Error('Department, date and role are required.');
  const hrs = (toMin(input.endTime) - toMin(input.startTime)) / 60;
  if (!(hrs > 0)) throw new Error('Shift end must be after start.');
  const ref = await addDoc(collection(db, 'open_shifts'), {
    shiftId: `OS-${Date.now().toString(36).toUpperCase()}`,
    rosterId: input.rosterId || null,
    department: input.department,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    role: input.role,
    requiredSkill: input.requiredSkill || null,
    hours: Math.round(hrs * 10) / 10,
    premiumRate: input.premiumRate || null,
    urgency: input.urgency || 'normal',
    status: 'open',
    createdAt: nowIso(),
    createdBy: input.authorUid || user.uid,
  });
  return ref.id;
}

export function listenOpenShifts(cb: (items: OpenShift[]) => void, onlyOpen = false) {
  const q = onlyOpen
    ? query(collection(db, 'open_shifts'), where('status', '==', 'open'))
    : query(collection(db, 'open_shifts'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as OpenShift)));
}

export function filterEligibleOpenShifts(args: {
  shifts: OpenShift[]; staffId: string; role: string; skill?: string;
  availability: StaffAvailability[]; weekHoursSoFar: number;
}): OpenShift[] {
  return args.shifts.filter((s) => {
    if (s.status !== 'open') return false;
    if (s.role && args.role && s.role !== args.role) return false;
    if (s.requiredSkill && args.skill && s.requiredSkill !== args.skill) return false;
    if (args.weekHoursSoFar + s.hours > 48) return false;
    const avail = args.availability.find((a) => a.staffId === args.staffId);
    if (avail && avail.unavailableDates.includes(s.date)) return false;
    return true;
  });
}

export interface ShiftEligibility { eligible: boolean; reasons: string[] }

export async function checkOpenShiftEligibility(
  shift: OpenShift, staffUid: string,
): Promise<ShiftEligibility> {
  const reasons: string[] = [];
  const pub = await getDocs(query(collection(db, 'shift_rosters'), where('published', '==', true)));
  for (const d of pub.docs) {
    const shifts = ((d.data() as Record<string, unknown>).shifts || []) as Record<string, string>[];
    for (const s of shifts) {
      if (s.staffId === staffUid && s.date === shift.date) {
        const overlap = !(s.endTime <= shift.startTime || shift.endTime <= s.startTime);
        if (overlap) reasons.push(`Overlaps your ${s.startTime}–${s.endTime} shift on ${s.date}.`);
      }
    }
  }
  const leaves = await getDocs(query(collection(db, 'leave_requests'),
    where('staffId', '==', staffUid), where('status', '==', 'approved')));
  for (const d of leaves.docs) {
    const l = d.data() as Record<string, string>;
    if (l.startDate <= shift.date && shift.date <= l.endDate)
      reasons.push(`On approved ${l.leaveType} leave that day.`);
  }
  return { eligible: reasons.length === 0, reasons };
}

function weekContains(weekStart: string, date: string): boolean {
  const t0 = new Date(`${weekStart}T00:00:00`).getTime();
  const t = new Date(`${date}T00:00:00`).getTime();
  return !Number.isNaN(t0) && !Number.isNaN(t) && t >= t0 && t < t0 + 7 * 86400000;
}

export async function claimOpenShift(args: { openShiftDocId: string; claimerUid?: string; rosterDocId?: string }) {
  const user = requireAuth();
  const me = await getMyProfile();
  if (me.role === 'guest' || me.role === 'npo_rep' || !me.role)
    throw new Error('Only staff members can claim open shifts.');
  const claimerUid = args.claimerUid || user.uid;
  const shiftRef = doc(db, 'open_shifts', args.openShiftDocId);
  const pre = await getDoc(shiftRef);
  if (!pre.exists()) throw new Error('Open shift not found.');
  const preData = pre.data() as Record<string, any>;
  if (preData.status !== 'open') throw new Error('This shift has already been claimed by another staff member.');
  // Eligibility enforced (not advisory): overlap + approved leave.
  const elig = await checkOpenShiftEligibility(preData as unknown as OpenShift, claimerUid);
  if (!elig.eligible) throw new Error(`Cannot claim: ${elig.reasons.join(' ')}`);
  // Auto-link the published roster covering this date (prevents orphan fills).
  let rosterId = args.rosterDocId || '';
  if (!rosterId) {
    const pub = await getDocs(query(collection(db, 'shift_rosters'), where('published', '==', true)));
    const match = pub.docs.find((d) => {
      const r = d.data() as Record<string, any>;
      return weekContains(String(r.weekStart || ''), String(preData.date || ''))
        && (!preData.department || !r.department || r.department === preData.department);
    }) || pub.docs.find((d) => weekContains(
      String((d.data() as Record<string, any>).weekStart || ''), String(preData.date || '')));
    rosterId = match?.id || '';
  }
  try {
    await runTransaction(db, async (tx) => {
      // All reads before all writes (Firestore transaction requirement).
      const snap = await tx.get(shiftRef);
      if (!snap.exists()) throw new Error('Open shift not found.');
      const data = snap.data() as Record<string, any>;
      if (data.status !== 'open') throw new Error('This shift has already been claimed by another staff member.');
      let rosterShifts: RosterShift[] | null = null;
      const rosterRef = rosterId ? doc(db, 'shift_rosters', rosterId) : null;
      if (rosterRef) {
        const rosterSnap = await tx.get(rosterRef);
        if (rosterSnap.exists()) {
          rosterShifts = [...(((rosterSnap.data() as Record<string, any>).shifts as RosterShift[]) || [])];
        }
      }
      tx.update(shiftRef, {
        status: 'filled', claimedBy: claimerUid, claimedAt: nowIso(), updatedAt: nowIso(),
        lastDecision: { performedBy: claimerUid, performedAt: nowIso(), action: 'open_shift_claimed', reason: String(data.shiftId || '') },
      });
      if (rosterRef && rosterShifts) {
        // Never persist undefined (Firestore rejects it) — omit absent skill.
        const entry: RosterShift = {
          shiftId: String(data.shiftId), staffId: claimerUid,
          date: String(data.date), startTime: String(data.startTime), endTime: String(data.endTime),
          role: String(data.role),
        };
        const skill = (data.requiredSkill as string) || '';
        if (skill) entry.requiredSkill = skill;
        rosterShifts.push(entry);
        tx.update(rosterRef, { shifts: rosterShifts, updatedAt: nowIso() });
      }
    });
  } catch (e) { friendlyTxError(e, 'Claim failed — the shift may have just been filled.'); }
  try {
    await notifyUsers([claimerUid], {
      type: 'open_shift_claimed', title: 'Shift claimed',
      message: 'You have claimed the open shift. It is now on your roster.',
      referenceId: args.openShiftDocId,
      targetRoute: '/(staff)/my-roster',
    });
  } catch { /* best-effort */ }
  await notifyManagers({
    type: 'open_shift_claimed', title: 'Open shift filled',
    message: `${user.email} claimed an open shift.`,
    referenceId: args.openShiftDocId,
    targetRoute: '/(kitchen)/open-shifts',
  });
}

// --------- Ledger — roster-tied attendance exceptions ----------

export function deriveAttendanceExceptions(args: {
  punches: Array<{ staffUid: string; staffName?: string; punchType: string; isoTime: string; withinRadius?: boolean; id: string }>;
  rosters: ShiftRoster[];
}): Omit<AttendanceException, 'id' | 'createdAt'>[] {
  const out: Omit<AttendanceException, 'id' | 'createdAt'>[] = [];
  const byStaff = new Map<string, typeof args.punches>();
  for (const p of args.punches) byStaff.set(p.staffUid, [...(byStaff.get(p.staffUid) || []), p]);
  for (const [staffId, list] of byStaff) {
    const sorted = [...list].sort((a, b) => a.isoTime.localeCompare(b.isoTime));
    const ins = sorted.filter((p) => p.punchType === 'in');
    const outs = sorted.filter((p) => p.punchType === 'out');
    const roster = args.rosters.flatMap((r) => r.shifts.map((s) => ({ ...s, rosterId: r.id }))).find((s) => s.staffId === staffId);
    const clockIn = ins[0]?.isoTime;
    const clockOut = outs[outs.length - 1]?.isoTime;
    let exceptionType: AttendanceExceptionType | null = null;
    if (ins.some((p) => p.withinRadius === false) || outs.some((p) => p.withinRadius === false))
      exceptionType = 'outside_geofence';
    else if (ins.length && !outs.length) exceptionType = 'missing_clock_out';
    else if (roster && clockIn) {
      const schedStart = new Date(`${roster.date}T${roster.startTime}`).getTime();
      const actual = new Date(clockIn).getTime();
      if (actual - schedStart > 15 * 60000) exceptionType = 'late_arrival';
      else if (clockOut) {
        const schedEnd = new Date(`${roster.date}T${roster.endTime}`).getTime();
        if (schedEnd - new Date(clockOut).getTime() > 15 * 60000) exceptionType = 'early_departure';
      }
    }
    if (exceptionType) {
      const hoursWorked = clockIn && clockOut
        ? Math.round(((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000) * 100) / 100
        : undefined;
      out.push({
        staffId, staffName: sorted[0].staffName, shiftId: roster?.shiftId, rosterId: roster?.rosterId,
        clockInAt: clockIn, clockOutAt: clockOut, hoursWorked,
        exceptionType, reviewStatus: 'exception_review',
      });
    }
  }
  return out;
}

export function listenAttendanceExceptions(cb: (items: AttendanceException[]) => void) {
  return onSnapshot(collection(db, 'attendance_exceptions'), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as AttendanceException)));
}

// Service-owned creation of a verified exception record for derived flags
// that have no doc yet (replaces UI direct-add bypass).
export async function createVerifiedAttendanceException(args: {
  seed: Omit<AttendanceException, 'id' | 'createdAt' | 'reviewStatus'>;
  hoursWorked?: number; reason: string;
}): Promise<string> {
  const user = requireAuth();
  await requireManager('verify attendance');
  if (!args.reason.trim()) throw new Error('An adjustment reason is required.');
  if (String(args.seed.staffId || '') === user.uid)
    throw new Error('You cannot verify your own attendance.');
  if (args.hoursWorked !== undefined
    && !(typeof args.hoursWorked === 'number' && args.hoursWorked >= 0 && args.hoursWorked <= 24))
    throw new Error('Adjusted hours must be between 0 and 24.');
  const ref = await addDoc(collection(db, 'attendance_exceptions'), {
    ...args.seed,
    reviewStatus: 'verified',
    hoursWorked: args.hoursWorked ?? args.seed.hoursWorked ?? null,
    adjustedBy: user.uid,
    adjustedAt: nowIso(),
    adjustmentReason: args.reason,
    originalValue: JSON.stringify({ hoursWorked: args.seed.hoursWorked, reviewStatus: 'exception_review' }),
    newValue: JSON.stringify({ hoursWorked: args.hoursWorked ?? args.seed.hoursWorked, reviewStatus: 'verified' }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  await notifyUsers([String(args.seed.staffId || '')], {
    type: 'attendance_verified', title: 'Attendance verified',
    message: 'Your attendance has been verified.',
    referenceId: ref.id,
    targetRoute: '/(staff)/clock-in-out',
  });
  return ref.id;
}

export async function reviewAttendanceException(args: {
  exceptionDocId: string; reviewerUid?: string; approve: boolean;
  adjustedHours?: number; reason: string;
}) {
  const user = requireAuth();
  await requireManager('verify attendance');
  if (!args.reason.trim()) throw new Error('An adjustment reason is required.');
  if (args.adjustedHours !== undefined
    && !(typeof args.adjustedHours === 'number' && args.adjustedHours >= 0 && args.adjustedHours <= 24))
    throw new Error('Adjusted hours must be between 0 and 24.');
  const ref = doc(db, 'attendance_exceptions', args.exceptionDocId);
  const staffUid = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Attendance record not found.');
    const data = snap.data() as Record<string, any>;
    if (data.reviewStatus === 'verified') throw new Error('This record has already been verified.');
    if (String(data.staffId || '') === user.uid)
      throw new Error('You cannot verify your own attendance.');
    const originalValue = JSON.stringify({ hoursWorked: data.hoursWorked, reviewStatus: data.reviewStatus });
    tx.update(ref, {
      reviewStatus: 'verified',
      hoursWorked: args.adjustedHours ?? data.hoursWorked ?? null,
      adjustedBy: user.uid,
      adjustedAt: nowIso(),
      adjustmentReason: args.reason,
      originalValue,
      newValue: JSON.stringify({ hoursWorked: args.adjustedHours ?? data.hoursWorked, reviewStatus: 'verified' }),
      updatedAt: nowIso(),
    });
    return String(data.staffId || '');
  });
  try {
    await notifyUsers([staffUid], {
      type: 'attendance_verified', title: 'Attendance verified',
      message: 'Your attendance has been verified.',
      referenceId: args.exceptionDocId,
      targetRoute: '/(staff)/clock-in-out',
    });
  } catch { /* best-effort */ }
  void args.approve;
  void args.reviewerUid;
}

export function listenPunchRecords(cb: (items: any[]) => void) {
  return onSnapshot(query(collection(db, 'punch_records'), limit(200)), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }))));
}
