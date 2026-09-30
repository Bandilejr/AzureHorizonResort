// src/services/increment2-services.ts — Increment 2 mobile mirror (UC34–UC45).
// D-DRIVE ONLY. Reuses auth/db, expo-crypto QR chain, uploadImage, punchClock,
// createNotification + onSnapshot listener patterns from firebase-services.

import {
  collection, doc, addDoc, setDoc, updateDoc, query, where, limit,
  onSnapshot, getDoc, getDocs, runTransaction,
} from 'firebase/firestore';
import { auth, db, uploadImage, createNotification } from '@/services/firebase-services';
import { verifyQrSignature } from './qr-signing';
import { parseISOLocal, todayISO } from '@/utils/dates';
import { IMPACT_MEALS_PER_KG, IMPACT_CARBON_KG_PER_KG } from '@/types/increment2';
import type {
  NpoPartner, NpoFacility, DonationBatch, DonationStatus, SafetyChecklist, DonationCheckin,
  StaffAvailability, LeaveRequest, ShiftRoster, ShiftSwap, SwapStatus, OpenShift, FileMeta,
} from '@/types/increment2';

// QR signing is centralized in ./qr-signing (env secret → service → payloads).
// This module never hard-codes a QR secret.

const nowIso = () => new Date().toISOString();

function requireAuth() {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('You must be signed in to perform this action.');
  return user;
}

// ---------- REMEDIATION Phase A: authenticated actor identity ----------
// Never trust caller-supplied role/npoId/staffId where the Firestore
// profile can be derived. Mirrors firestore.rules role helpers.

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
  let email = String(data.email || user.email || '').toLowerCase();
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

// ---------- REMEDIATION Phase A/D: reliable per-user notifications ----------
// Group literals ('kitchen-managers') and emails-as-uids never match the
// per-uid inbox listener. All flow notifications resolve to user-doc ids.

async function resolveUserIdsByRole(roles: string[]): Promise<string[]> {
  const out = new Set<string>();
  for (const chunk of [roles.slice(0, 10)]) {
    if (chunk.length === 0) continue;
    const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', chunk)));
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const uid = (data.uid as string) || '';
      // Prefer explicit uid field; only fall back to doc id when it is a real uid (not an email key).
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
      await createNotification({ userId: uid, ...n });
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

// ---------- Listeners (mobile dashboards) ----------

export function listenDonationBatches(cb: (items: DonationBatch[]) => void, status?: DonationStatus, onError?: (e: Error) => void) {
  const q = status
    ? query(collection(db, 'donation_batches'), where('status', '==', status))
    : query(collection(db, 'donation_batches'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as DonationBatch)),
    (err) => onError?.(err as Error));
}

// Batch A: scoped, no-index listener (single equality + limit — no composite
// index required, so nothing is deployed). Add-only; existing listeners and all
// write functions are untouched.
export function listenDonationBatchesByStatus(
  status: DonationStatus,
  max: number,
  cb: (items: DonationBatch[]) => void,
  onError?: (e: Error) => void,
) {
  const q = query(collection(db, 'donation_batches'), where('status', '==', status), limit(max));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as DonationBatch)),
    (err) => onError?.(err as Error));
}

// Batch A: single-document listener for the Collection Detail screen (1 read).
export function listenDonationBatch(docId: string, cb: (item: DonationBatch | null) => void, onError?: (e: Error) => void) {
  return onSnapshot(doc(db, 'donation_batches', docId), (snap) =>
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as object) } as DonationBatch) : null),
    (err) => onError?.(err as Error));
}

export function listenMyAllocations(npoId: string, cb: (items: DonationBatch[]) => void, onError?: (e: Error) => void) {
  const q = query(collection(db, 'donation_batches'), where('allocatedNpoId', '==', npoId));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as DonationBatch)),
    (err) => onError?.(err as Error));
}

export function listenNpoPartners(cb: (items: NpoPartner[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(collection(db, 'npo_partners'), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as NpoPartner)),
    (err) => onError?.(err as Error));
}

export function listenMyAvailability(staffId: string, cb: (items: StaffAvailability[]) => void, onError?: (e: Error) => void) {
  const q = query(collection(db, 'staff_availability'), where('staffId', '==', staffId));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as StaffAvailability)),
    (err) => onError?.(err as Error));
}

export function listenMyLeave(staffId: string, cb: (items: LeaveRequest[]) => void, onError?: (e: Error) => void) {
  const q = query(collection(db, 'leave_requests'), where('staffId', '==', staffId));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as LeaveRequest)),
    (err) => onError?.(err as Error));
}

export function listenLeaveQueue(cb: (items: LeaveRequest[]) => void, onError?: (e: Error) => void) {
  const q = query(collection(db, 'leave_requests'), where('status', '==', 'pending'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as LeaveRequest)),
    (err) => onError?.(err as Error));
}

export function listenLeaveRequests(cb: (items: LeaveRequest[]) => void, status?: string, onError?: (e: Error) => void) {
  const q = status
    ? query(collection(db, 'leave_requests'), where('status', '==', status))
    : query(collection(db, 'leave_requests'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as LeaveRequest)),
    (err) => onError?.(err as Error));
}

export function listenPublishedRosters(cb: (items: ShiftRoster[]) => void, onError?: (e: Error) => void) {
  const q = query(collection(db, 'shift_rosters'), where('published', '==', true));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as ShiftRoster)),
    (err) => onError?.(err as Error));
}

export function listenMySwaps(staffId: string, cb: (items: ShiftSwap[]) => void, onError?: (e: Error) => void) {
  // Two queries merged client-side (requester OR target) — avoids composite index.
  const q1 = query(collection(db, 'shift_swaps'), where('requesterStaffId', '==', staffId));
  const q2 = query(collection(db, 'shift_swaps'), where('targetStaffId', '==', staffId));
  const merged = new Map<string, ShiftSwap>();
  const emit = () => cb([...merged.values()]);
  const fail = (err: unknown) => onError?.(err as Error);
  const u1 = onSnapshot(q1, (snap) => {
    snap.docs.forEach((d) => merged.set(d.id, { id: d.id, ...(d.data() as object) } as ShiftSwap));
    emit();
  }, fail);
  const u2 = onSnapshot(q2, (snap) => {
    snap.docs.forEach((d) => merged.set(d.id, { id: d.id, ...(d.data() as object) } as ShiftSwap));
    emit();
  }, fail);
  return () => { u1(); u2(); };
}

export function listenOpenShiftsBoard(cb: (items: OpenShift[]) => void, onError?: (e: Error) => void) {
  const q = query(collection(db, 'open_shifts'), where('status', '==', 'open'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as OpenShift)),
    (err) => onError?.(err as Error));
}

// Manager queue: every swap awaiting manager decision (UC43 approve).
// Single unfiltered listener + client-side filter (collection is small;
// avoids composite-index requirements).
export function listenPendingSwaps(cb: (items: ShiftSwap[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'shift_swaps'),
    (snap) => cb(snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) }) as ShiftSwap)
      .filter((s) => s.status === 'pending_manager' || s.status === 'peer_accepted')),
    (err) => onError?.(err as Error));
}

export function listenOpenShifts(cb: (items: OpenShift[]) => void, onlyOpen = false, onError?: (e: Error) => void) {
  const q = onlyOpen
    ? query(collection(db, 'open_shifts'), where('status', '==', 'open'))
    : query(collection(db, 'open_shifts'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as OpenShift)),
    (err) => onError?.(err as Error));
}

export function listenDonationCheckins(cb: (items: DonationCheckin[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(collection(db, 'donation_checkins'), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as DonationCheckin)),
    (err) => onError?.(err as Error));
}

// ---------- UC35 mobile: log donation with photo upload ----------

export async function logDonationFromMobile(input: {
  itemName: string; mealCategory: string; portionCount: number; estimatedWeightKg: number;
  allergens?: string[]; preparedAt: string; expiryAt: string;
  safetyChecklist: SafetyChecklist; photoUri: string;
}): Promise<{ docId: string; batchId: string }> {
  const user = requireAuth();
  const me = await getMyProfile();
  if (!isFoodOperatorProfile(me)) throw new Error('Only kitchen staff can log donations.');
  const err =
    (!input.safetyChecklist.coreTemperatureVerified && 'Core temperature must be verified.') ||
    (!input.safetyChecklist.packagingIntegrityVerified && 'Packaging/seal integrity must be verified.') ||
    (!input.safetyChecklist.allergenLabelsVerified && 'Allergen labelling must be verified.') ||
    (!input.safetyChecklist.safePreparationWindowVerified && 'Safe preparation window must be verified.') ||
    null;
  if (err) throw new Error(`All four food-safety checks must be verified. ${err}`);
  if (!input.photoUri) throw new Error('Food-safety photo evidence is required.');
  if (!input.itemName.trim()) throw new Error('Food item name is required.');
  if (!(input.portionCount > 0)) throw new Error('Portion count must be greater than zero.');
  if (!(input.estimatedWeightKg > 0)) throw new Error('Estimated weight must be greater than zero.');
  if (!input.preparedAt || !input.expiryAt
    || Number.isNaN(new Date(input.preparedAt).getTime())
    || Number.isNaN(new Date(input.expiryAt).getTime()))
    throw new Error('Valid preparation and expiry dates are required.');
  if (new Date(input.expiryAt).getTime() <= new Date(input.preparedAt).getTime())
    throw new Error('Expiry must be after preparation time.');
  // Reuse existing pipeline: Storage upload, never a raw file:// in Firestore.
  const photoUrl = await uploadImage(input.photoUri, 'donation-safety');
  const batchId = `DON-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
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
    safetyPhotoUrl: photoUrl,
    photoMeta: {
      url: photoUrl, fileName: photoUrl.split('/').pop() || 'safety.jpg',
      mimeType: 'image/jpeg', size: 0, uploadedAt: nowIso(), uploadedBy: user.uid,
    } as FileMeta,
    status: 'safety_verified_unassigned',
    qrConsumed: false,
    createdBy: user.uid,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return { docId: ref.id, batchId };
}

// ---------- UC37 mobile: claim allocation ----------

export async function claimDonationFromMobile(args: {
  batchDocId: string; receivingFacility: string; acceptTerms: boolean;
}) {
  const user = requireAuth();
  // Identity comes from the authenticated profile, never the caller (F-P1-9).
  const me = await getMyProfile();
  if (me.role !== 'npo_rep' || !me.npoId)
    throw new Error('Only a verified NPO representative can claim donations.');
  if (!args.acceptTerms) throw new Error('You must accept the distribution terms.');
  if (!args.receivingFacility.trim()) throw new Error('Receiving facility is required.');
  const ref = doc(db, 'donation_batches', args.batchDocId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Donation batch not found.');
    const data = snap.data() as Record<string, unknown>;
    if (data.status !== 'allocated_awaiting_claim')
      throw new Error('This allocation is no longer available for claim.');
    if (!data.allocatedNpoId || data.allocatedNpoId !== me.npoId)
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
  await notifyManagers({
    type: 'donation_claimed', title: 'Donation claimed by NPO',
    message: `Batch claimed for ${args.receivingFacility}. Ready to schedule collection.`,
    referenceId: args.batchDocId, targetRoute: '/(kitchen)/logistics',
  });
}

// ---------- UC39 mobile: scan collection QR (same chain as web) ----------

export async function verifyCollectionFromMobile(args: {
  qrPayload: string; sealVerified: boolean; courierName: string; signature: string; offline?: boolean;
}): Promise<{ ok: boolean; message: string }> {
  const user = requireAuth();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(args.qrPayload);
  } catch { return { ok: false, message: 'Invalid QR format' }; }
  const p = payload as Record<string, string>;
  if (p.type !== 'DONATION_COLLECTION' || !p.batchDocId || !p.sig)
    return { ok: false, message: 'Invalid collection pass structure' };
  const check = {
    type: p.type, batchId: p.batchId, batchDocId: p.batchDocId, npoId: p.npoId,
    collectionWindowStart: p.collectionWindowStart, collectionWindowEnd: p.collectionWindowEnd,
    loadingBay: p.loadingBay, issuedAt: (payload as Record<string, number>).issuedAt, nonce: p.nonce,
  };
  if (!(await verifyQrSignature(check, p.sig))) return { ok: false, message: 'Invalid collection pass signature' };
  if (!args.sealVerified) return { ok: false, message: 'Seal integrity must be confirmed before dispatch.' };
  if (!args.courierName.trim()) return { ok: false, message: 'Courier name is required.' };
  if (!args.signature) return { ok: false, message: 'Courier digital acceptance signature is required.' };
  // Canonical window semantics (shared with web): 30-min early bound, 60-min late grace.
  const now = Date.now();
  const winStart = new Date(p.collectionWindowStart).getTime();
  const winEnd = new Date(p.collectionWindowEnd).getTime();
  if (Number.isNaN(winStart) || Number.isNaN(winEnd))
    return { ok: false, message: 'Collection pass has an invalid window.' };
  if (now < winStart - 30 * 60000)
    return { ok: false, message: 'Collection window has not opened yet.' };
  if (now > winEnd + 60 * 60000)
    return { ok: false, message: 'This QR collection pass has expired.' };
  const ref = doc(db, 'donation_batches', p.batchDocId);
  // Idempotency: deterministic checkin id per batch+nonce — reconnect replays collapse.
  const checkinId = `${p.batchDocId}_${p.nonce}`;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Donation batch not found.');
      const data = snap.data() as Record<string, unknown>;
      if (data.status !== 'collection_scheduled') throw new Error('This donation batch has already been collected.');
      if (data.qrConsumed) throw new Error('This collection pass has already been used.');
      // Stale-pass rejection: a re-issued pass rotates the nonce (F-P0-6).
      if (data.collectionNonce && p.nonce && data.collectionNonce !== p.nonce)
        throw new Error('This collection pass is no longer current. Request the latest pass.');
      if (data.loadingBay && p.loadingBay && data.loadingBay !== p.loadingBay)
        throw new Error('This pass is for another loading bay.');
      const existing = await tx.get(doc(db, 'donation_checkins', checkinId));
      if (existing.exists()) throw new Error('This collection was already recorded.');
      tx.update(ref, {
        status: 'collected_completed', qrConsumed: true, collectedAt: nowIso(),
        verifiedBy: user.uid, updatedAt: nowIso(),
        lastDecision: { performedBy: user.uid, performedAt: nowIso(), action: 'collection_completed', reason: args.courierName.trim() },
      });
      tx.set(doc(db, 'donation_checkins', checkinId), {
        batchId: String(data.batchId), npoId: String(data.allocatedNpoId || p.npoId),
        courierName: args.courierName.trim(), method: 'donation_scan',
        collectionWindow: `${p.collectionWindowStart} → ${p.collectionWindowEnd}`,
        loadingBay: p.loadingBay, sealVerified: true, signature: args.signature,
        collectedAt: nowIso(), verifiedBy: user.uid, wasOffline: !!args.offline,
        idempotencyKey: `${p.batchDocId}:${p.nonce}`,
      });
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Collection verification failed.' };
  }
  // Notify the claiming NPO user (best-effort; never fails the collection).
  try {
    const snap = await getDoc(ref);
    const allocatedNpoId = String((snap.data() as Record<string, unknown> | undefined)?.allocatedNpoId || '');
    if (allocatedNpoId) {
      const npoUid = await resolveNpoUserUid(allocatedNpoId);
      await notifyUsers([npoUid], {
        type: 'collection_completed', title: 'Donation collected',
        message: 'Your scheduled donation has been collected and dispatched.',
        referenceId: p.batchDocId, targetRoute: '/(npo)/collections',
      });
    }
  } catch { /* best-effort */ }
  return { ok: true, message: 'Collection verified — dispatch complete.' };
}

// ---------- UC41 mobile: availability + leave ----------

export async function submitAvailabilityMobile(input: {
  weekStart: string;
  availability: { day: string; startTime: string; endTime: string }[];
  unavailableDates?: string[];
}): Promise<string> {
  const user = requireAuth();
  if (!input.weekStart) throw new Error('Week start is required.');
  for (const a of input.availability || []) {
    if (a.startTime && a.endTime && a.startTime >= a.endTime)
      throw new Error(`Invalid hours for ${a.day}: start must be before end.`);
  }
  // Upsert per staff+week (prevents duplicate week docs).
  const dup = await getDocs(query(collection(db, 'staff_availability'),
    where('staffId', '==', user.uid), where('weekStart', '==', input.weekStart), limit(1)));
  const docBody = {
    staffId: user.uid,
    staffName: user.displayName || user.email,
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

export async function addNpoFacility(input: {
  npoDocId: string; name: string; address?: string; capacity?: number; contact?: string;
}): Promise<void> {
  const user = requireAuth();
  if (!input.name.trim()) throw new Error('Facility name is required.');
  const ref = doc(db, 'npo_partners', input.npoDocId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('NPO record not found.');
  const data = snap.data() as { email?: string; facilities?: NpoFacility[] };
  if ((data.email || '').toLowerCase() !== (user.email || '').toLowerCase())
    throw new Error('Only your own organisation can add facilities.');
  const facilities = Array.isArray(data.facilities) ? data.facilities : [];
  const facility: NpoFacility = {
    id: `fac_${Date.now().toString(36)}`,
    name: input.name.trim(),
    address: input.address?.trim() || undefined,
    capacity: Number.isFinite(input.capacity as number) ? Number(input.capacity) : undefined,
    contact: input.contact?.trim() || undefined,
    active: true,
  };
  await updateDoc(ref, { facilities: [...facilities, facility], updatedAt: nowIso() });
}

export async function submitLeaveMobile(input: {
  leaveType: string; startDate: string; endDate: string; proofUri?: string;
}): Promise<string> {
  const user = requireAuth();
  if (!input.leaveType.trim()) throw new Error('Leave type is required.');
  if (!input.startDate || !input.endDate
    || Number.isNaN(new Date(input.startDate).getTime())
    || Number.isNaN(new Date(input.endDate).getTime()))
    throw new Error('Valid leave start and end dates are required.');
  if (new Date(input.endDate).getTime() < new Date(input.startDate).getTime())
    throw new Error('Leave end date must be on or after start date.');
  const days = Math.round((new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / 86400000) + 1;
  if (days > 30) throw new Error('Leave request exceeds the 30-day single-request limit.');
  // Overlap guard: no second live request covering the same dates.
  const mine = await getDocs(query(collection(db, 'leave_requests'),
    where('staffId', '==', user.uid), where('status', 'in', ['pending', 'approved'])));
  for (const d of mine.docs) {
    const l = d.data() as Record<string, string>;
    if (l.startDate <= input.endDate && input.startDate <= l.endDate)
      throw new Error(`Overlaps your ${l.status} ${l.leaveType} leave (${l.startDate} → ${l.endDate}).`);
  }
  let supportingDocuments: FileMeta[] = [];
  if (input.proofUri) {
    const url = await uploadImage(input.proofUri, 'leave-proofs');
    supportingDocuments = [{
      url, fileName: url.split('/').pop() || 'proof.jpg', mimeType: 'image/jpeg',
      size: 0, uploadedAt: nowIso(), uploadedBy: user.uid,
    }];
  }
  const ref = await addDoc(collection(db, 'leave_requests'), {
    staffId: user.uid,
    staffName: user.displayName || user.email,
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.endDate,
    supportingDocuments,
    status: 'pending',
    submittedAt: nowIso(),
  });
  await notifyManagers({
    type: 'leave_submitted', title: 'Leave request submitted',
    message: `${user.email}: ${input.leaveType} ${input.startDate} → ${input.endDate}.`,
    referenceId: ref.id, targetRoute: '/(kitchen)/leave-manage',
  }, true);
  return ref.id;
}

// ---------- UC43/UC44 mobile: swap request + open-shift claim ----------

export async function requestSwapMobile(input: {
  requesterShiftId: string; targetShiftId: string;
}): Promise<string> {
  const user = requireAuth();
  if (!input.requesterShiftId.trim() || !input.targetShiftId.trim())
    throw new Error('Select your shift and the shift you want.');
  // Resolve both shifts from published rosters — no manual staff IDs,
  // no empty roster references (F-P1-6, late roster failure).
  const pub = await getDocs(query(collection(db, 'shift_rosters'), where('published', '==', true)));
  let mine: { rosterDocId: string; week: string; shiftId: string } | null = null;
  let theirs: { rosterDocId: string; week: string; shiftId: string; staffId: string } | null = null;
  for (const d of pub.docs) {
    const data = d.data() as Record<string, unknown>;
    const week = String(data.weekStart || '');
    const shifts = ((data as Record<string, unknown>).shifts || []) as Record<string, string>[];
    for (const s of shifts) {
      if (s.shiftId === input.requesterShiftId && s.staffId === user.uid)
        mine = { rosterDocId: d.id, week, shiftId: String(s.shiftId) };
      if (s.shiftId === input.targetShiftId && s.staffId !== user.uid)
        theirs = { rosterDocId: d.id, week, shiftId: String(s.shiftId), staffId: String(s.staffId) };
    }
  }
  if (!mine) throw new Error('Your shift was not found on a published roster.');
  if (!theirs) throw new Error('That shift is not available for swap (must belong to a colleague).');
  if (mine.week !== theirs.week)
    throw new Error('Both shifts must be on the same week (cross-department swaps within the same week are now allowed).');
  // Duplicate guard: no second live request for the same pair
  // (single-where + client filter: no composite index required).
  const live = await getDocs(query(collection(db, 'shift_swaps'),
    where('requesterStaffId', '==', user.uid)));
  if (live.docs.some((d) => {
    const s = d.data() as Record<string, unknown>;
    return String(s.requesterShiftId || '') === mine.shiftId
      && String(s.targetShiftId || '') === (theirs as { shiftId: string }).shiftId
      && ['pending_peer', 'pending_manager', 'peer_accepted'].includes(String(s.status || ''));
  }))
    throw new Error('A live swap request already exists for these shifts.');
  const ref = await addDoc(collection(db, 'shift_swaps'), {
    requesterStaffId: user.uid,
    requesterShiftId: mine.shiftId,
    targetStaffId: theirs.staffId,
    targetShiftId: theirs.shiftId,
    rosterId: mine.rosterDocId,
    status: 'pending_peer' as SwapStatus,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  await notifyUsers([theirs.staffId], {
    type: 'shift_swap_requested', title: 'Shift swap requested',
    message: 'A colleague wants to swap shifts. Accept or decline.',
    referenceId: ref.id, targetRoute: '/(staff)/shift-swaps',
  });
  return ref.id;
}

// Mobile port of the web eligibility helper (was dead code on web, enforced here).
export interface ShiftEligibility { eligible: boolean; reasons: string[] }

export async function checkOpenShiftEligibility(
  shift: import('@/types/increment2').OpenShift, staffUid: string,
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

export async function claimOpenShiftMobile(openShiftDocId: string, rosterDocId?: string) {  const user = requireAuth();
  const me = await getMyProfile();
  if (me.role === 'guest' || me.role === 'npo_rep' || !me.role)
    throw new Error('Only staff members can claim open shifts.');
  const shiftRef = doc(db, 'open_shifts', openShiftDocId);
  const pre = await getDoc(shiftRef);
  if (!pre.exists()) throw new Error('Open shift not found.');
  const preData = pre.data() as Record<string, unknown>;
  if (preData.status !== 'open') throw new Error('This shift has already been claimed by another staff member.');
  // Phase 1 (§26): past dates can never be claimed (service enforces what the
  // calendar disables in the UI) — Africa/Johannesburg local date comparison.
  if (String(preData.date || '') < todayISO())
    throw new Error('This shift date has passed and can no longer be claimed.');
  // Eligibility preview enforced (not advisory): overlap + approved leave.
  const elig = await checkOpenShiftEligibility(
    preData as unknown as import('@/types/increment2').OpenShift, user.uid);
  if (!elig.eligible) throw new Error(`Cannot claim: ${elig.reasons.join(' ')}`);
  // Auto-link the published roster covering this date (prevents orphan fills).
  let rosterId = rosterDocId || '';
  if (!rosterId) {
    const pub = await getDocs(query(collection(db, 'shift_rosters'), where('published', '==', true)));
    const match = pub.docs.find((d) => {
      const r = d.data() as Record<string, unknown>;
      return weekContains(String(r.weekStart || ''), String(preData.date || ''))
        && (!preData.department || !r.department || r.department === preData.department);
    }) || pub.docs.find((d) => weekContains(
      String((d.data() as Record<string, unknown>).weekStart || ''), String(preData.date || '')));
    rosterId = match?.id || '';
  }
  await runTransaction(db, async (tx) => {
    // All reads before all writes (Firestore transaction requirement).
    const snap = await tx.get(shiftRef);
    if (!snap.exists()) throw new Error('Open shift not found.');
    const data = snap.data() as Record<string, unknown>;
    if (data.status !== 'open') throw new Error('This shift has already been claimed by another staff member.');
    const rosterRef = rosterId ? doc(db, 'shift_rosters', rosterId) : null;
    let rosterShifts: Record<string, unknown>[] | null = null;
    if (rosterRef) {
      const rosterSnap = await tx.get(rosterRef);
      if (rosterSnap.exists()) {
        rosterShifts = [...(((rosterSnap.data() as Record<string, unknown>).shifts as Record<string, unknown>[]) || [])];
      }
    }
    tx.update(shiftRef, {
      status: 'filled', claimedBy: user.uid, claimedAt: nowIso(), updatedAt: nowIso(),
      lastDecision: { performedBy: user.uid, performedAt: nowIso(), action: 'open_shift_claimed', reason: String(data.shiftId || '') },
    });
    if (rosterRef && rosterShifts) {
      // Never persist undefined (Firestore rejects it) — omit absent skill.
      const entry: Record<string, unknown> = {
        shiftId: String(data.shiftId), staffId: user.uid,
        date: String(data.date), startTime: String(data.startTime), endTime: String(data.endTime),
        role: String(data.role),
      };
      const skill = String(data.requiredSkill || '');
      if (skill) entry.requiredSkill = skill;
      rosterShifts.push(entry);
      tx.update(rosterRef, { shifts: rosterShifts, updatedAt: nowIso() });
    }
  });
  await notifyUsers([user.uid], {
    type: 'open_shift_claimed', title: 'Shift claimed',
    message: 'You have claimed the open shift. It is now on your roster.',
    referenceId: openShiftDocId, targetRoute: '/(staff)/my-roster',
  });
  await notifyManagers({
    type: 'open_shift_claimed', title: 'Open shift filled',
    message: `${user.email} claimed an open shift.`,
    referenceId: openShiftDocId, targetRoute: '/(kitchen)/open-shifts',
  });
}

// ---------- UC41/UC43 manager actions (mobile) ----------

export async function reviewLeaveMobile(args: { leaveDocId: string; approve: boolean; reason?: string }) {
  const user = requireAuth();
  await requireManager('review leave requests');
  if (!args.approve && !args.reason?.trim()) throw new Error('A rejection reason is required.');
  const ref = doc(db, 'leave_requests', args.leaveDocId);
  // Transactional read+decision (kills double-approval race).
  const subjectUid = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Leave request not found.');
    const data = snap.data() as Record<string, unknown>;
    if (data.status !== 'pending') throw new Error('This leave request has already been reviewed.');
    if (String(data.staffId || '') === user.uid)
      throw new Error('You cannot approve your own leave request.');
    tx.update(ref, {
      status: args.approve ? 'approved' : 'rejected',
      reviewedBy: user.uid,
      reviewedAt: nowIso(),
      rejectionReason: args.approve ? null : args.reason,
      updatedAt: nowIso(),
      lastDecision: { performedBy: user.uid, performedAt: nowIso(), action: args.approve ? 'leave_approved' : 'leave_rejected', reason: args.approve ? null : (args.reason || null) },
    });
    return String(data.staffId || '');
  });
  await notifyUsers([subjectUid], {
    type: args.approve ? 'leave_approved' : 'leave_rejected',
    title: args.approve ? 'Leave approved' : 'Leave request reviewed',
    message: args.approve ? 'Your leave request was approved.' : `Leave reviewed: ${args.reason}`,
    referenceId: args.leaveDocId, targetRoute: '/(staff)/availability-leave',
  });
}

export async function peerAcceptSwapMobile(swapDocId: string, accept: boolean) {
  const user = requireAuth();
  const ref = doc(db, 'shift_swaps', swapDocId);
  // Transactional: guard + transition atomically; caller must be the target.
  const requester = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Swap request not found.');
    const data = snap.data() as Record<string, unknown>;
    if (data.status !== 'pending_peer') throw new Error('This swap is no longer awaiting peer review.');
    if (String(data.targetStaffId || '') !== user.uid)
      throw new Error('Only the requested colleague can respond to this swap.');
    tx.update(ref, {
      status: accept ? 'pending_manager' : 'rejected',
      updatedAt: nowIso(),
    });
    return String(data.requesterStaffId || '');
  });
  await notifyUsers([requester], {
    type: accept ? 'shift_swap_accepted' : 'shift_swap_rejected',
    title: accept ? 'Swap accepted by peer' : 'Swap declined by peer',
    message: accept ? 'Awaiting manager approval.' : 'Your swap request was declined.',
    referenceId: swapDocId, targetRoute: '/(staff)/shift-swaps',
  });
}

export async function reviewSwapMobile(args: { swapDocId: string; approve: boolean; reason?: string }) {
  const user = requireAuth();
  await requireManager('review shift swaps');
  if (!args.approve && !args.reason?.trim()) throw new Error('A rejection reason is required.');
  const swapRef = doc(db, 'shift_swaps', args.swapDocId);
  if (!args.approve) {
    const parties = await runTransaction(db, async (tx) => {
      const snap = await tx.get(swapRef);
      if (!snap.exists()) throw new Error('Swap request not found.');
      const swap = snap.data() as Record<string, unknown>;
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
    await notifyUsers(parties, {
      type: 'shift_swap_rejected', title: 'Shift swap rejected',
      message: `Swap reviewed: ${args.reason}`,
      referenceId: args.swapDocId, targetRoute: '/(staff)/shift-swaps',
    });
    return;
  }
  const parties = await runTransaction(db, async (tx) => {
    const swapSnap = await tx.get(swapRef);
    if (!swapSnap.exists()) throw new Error('Swap request not found.');
    const swap = swapSnap.data() as Record<string, unknown>;
    if (swap.status !== 'pending_manager' && swap.status !== 'peer_accepted')
      throw new Error('This swap is not awaiting manager approval.');
    for (const party of [String(swap.requesterStaffId || ''), String(swap.targetStaffId || '')]) {
      if (party && party === user.uid)
        throw new Error('You cannot review a swap you are part of.');
    }
    const rosterDocId = String(swap.rosterId || '');
    if (!rosterDocId) throw new Error('Roster reference missing — cannot apply swap.');
    const rosterRef = doc(db, 'shift_rosters', rosterDocId);
    const rosterSnap = await tx.get(rosterRef);
    if (!rosterSnap.exists()) throw new Error('Roster not found.');
    const roster = rosterSnap.data() as Record<string, unknown>;
    const shifts = [...((roster.shifts as Record<string, unknown>[]) || [])] as {
      shiftId: string; staffId: string;
    }[];
    const aIdx = shifts.findIndex((s) => s.shiftId === String(swap.requesterShiftId));
    const bIdx = shifts.findIndex((s) => s.shiftId === String(swap.targetShiftId));
    if (aIdx < 0 || bIdx < 0) throw new Error('One of the swap shifts no longer exists.');
    // Verify current ownership matches the request (kills stale approvals).
    if (shifts[aIdx].staffId !== String(swap.requesterStaffId)
      || shifts[bIdx].staffId !== String(swap.targetStaffId))
      throw new Error('Roster assignments changed since the request — re-raise the swap.');
    shifts[aIdx] = { ...shifts[aIdx], staffId: String(swap.targetStaffId) };
    shifts[bIdx] = { ...shifts[bIdx], staffId: String(swap.requesterStaffId) };
    tx.update(rosterRef, { shifts, updatedAt: nowIso() });
    tx.update(swapRef, {
      status: 'approved', reviewedBy: user.uid, reviewedAt: nowIso(), updatedAt: nowIso(),
      lastDecision: { performedBy: user.uid, performedAt: nowIso(), action: 'shift_swap_approved', reason: null },
    });
    return [String(swap.requesterStaffId || ''), String(swap.targetStaffId || '')];
  });
  await notifyUsers(parties, {
    type: 'shift_swap_approved', title: 'Shift swap approved',
    message: 'Both roster assignments have been updated.',
    referenceId: args.swapDocId, targetRoute: '/(staff)/my-roster',
  });
}

// ---------- UC34 review (same transitions + npo_rep provisioning as web) ----------

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
  npoDocId: string; approve: boolean; reason?: string; reviewerUid?: string;
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
    const st = (snap.data() as Record<string, unknown>).verificationStatus;
    if (st === 'approved' || st === 'rejected') throw new Error('This application has already been reviewed.');
    tx.update(ref, {
      verificationStatus: args.approve ? 'approved' : 'rejected',
      rejectionReason: args.approve ? null : args.reason,
      verifiedBy: reviewerUid,
      verifiedAt: nowIso(),
      updatedAt: nowIso(),
      lastDecision: { performedBy: reviewerUid, performedAt: nowIso(), action: args.approve ? 'npo_approved' : 'npo_rejected', reason: args.reason || null },
    });
  });
  const fin = (await getDoc(ref)).data() as Record<string, unknown> | undefined;
  const contactEmail = String(fin?.email || '').toLowerCase().trim();
  if (args.approve && contactEmail) {
    const profile = {
      name: String(fin?.contactName || fin?.organisationName || 'NPO Partner'),
      email: contactEmail, role: 'npo_rep', status: 'staff',
      npoId: String(fin?.npoId || ''), organisationName: String(fin?.organisationName || ''),
      updatedAt: nowIso(),
    };
    await setDoc(doc(db, 'users', contactEmail), {
      uid: contactEmail, id: contactEmail, ...profile,
    }, { merge: true });
    // Mirror onto the uid-keyed doc when the rep already signed up: rules
    // and routing read users/{uid} first (F-P1-9 follow-up).
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
    const npoUid = await resolveNpoUserUid(String(fin?.npoId || ''));
    await notifyUsers([npoUid], {
      type: args.approve ? 'npo_approved' : 'npo_rejected',
      title: args.approve ? 'NPO application approved' : 'NPO application reviewed',
      message: args.approve
        ? `${String(fin?.organisationName || 'Your organisation')} is now active in the food rescue network.`
        : `Application reviewed: ${args.reason}`,
      referenceId: args.npoDocId, targetRoute: '/(npo)/dashboard',
    });
  }
}

// ---------- Manager adapters (UC36/UC38/UC40/UC42/UC44/UC45) ----------
// Same authoritative rules/transitions as the web service (platform adapter:
// expo-crypto signing, RN-safe Firestore calls). No second data model.

export interface NpoMatchScore {
  npo: import('@/types/increment2').NpoPartner;
  score: number;
  reasons: string[];
}

export function rankNpoPartners(
  batch: import('@/types/increment2').DonationBatch,
  npos: import('@/types/increment2').NpoPartner[]
): NpoMatchScore[] {
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
      if (perishHrs < 6) { score += npo.transportType ? 15 : -10; reasons.push('Urgent: transport ready'); }
      if ((batch.allergens || []).length === 0) score += 5;
      return { npo, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export async function allocateDonationBatchMobile(args: {
  batchDocId: string; npoId: string;
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
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Donation batch not found.');
    const data = snap.data() as Record<string, unknown>;
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
  // Notify the NPO rep's uid doc (emails never match the inbox listener).
  const npoUid = await resolveNpoUserUid(args.npoId);
  await notifyUsers([npoUid], {
    type: 'donation_allocated', title: 'Donation allocated to your organisation',
    message: 'A batch is awaiting your claim.',
    referenceId: args.batchDocId, targetRoute: '/(npo)/allocations',
  });
}

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

export async function scheduleDonationCollectionMobile(args: {
  batchDocId: string; pickupDate: string; windowStart: string; windowEnd: string;
  loadingBay: string; courierName?: string;
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
  const preData = pre.data() as Record<string, unknown>;
  if (preData.status !== 'claimed_ready_for_scheduling' && preData.status !== 'collection_scheduled')
    throw new Error('Batch must be claimed before scheduling collection.');
  // Transactional read+schedule (kills concurrent-scheduler overwrite race).
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
  const { signQrPayload } = await import('./qr-signing');
  const qr = JSON.stringify({ ...payload, sig: await signQrPayload(payload) });
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Donation batch not found.');
    const data = snap.data() as Record<string, unknown>;
    // Re-scheduling allowed: re-issue rotates collectionNonce, invalidating the old pass.
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
  // Notify the claiming NPO rep (previously silent on mobile).
  try {
    const done = await getDoc(ref);
    const npoId = String((done.data() as Record<string, unknown> | undefined)?.allocatedNpoId || '');
    if (npoId) {
      await notifyUsers([await resolveNpoUserUid(npoId)], {
        type: 'collection_scheduled', title: 'Collection scheduled',
        message: `Pickup window set at ${args.loadingBay}.`,
        referenceId: args.batchDocId, targetRoute: '/(npo)/collections',
      });
    }
  } catch { /* best-effort */ }
  return qr;
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

// Canonical fingerprint: Firestore map key order is NOT stable across reads
// (cache vs server can differ), so raw JSON.stringify comparison of docs
// breaks. Sort keys recursively before comparing.
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function validateRosterShifts(args: {
  shifts: import('@/types/increment2').RosterShift[];
  availability: import('@/types/increment2').StaffAvailability[];
  approvedLeave: import('@/types/increment2').LeaveRequest[];
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
  const byStaff = new Map<string, import('@/types/increment2').RosterShift[]>();
  for (const s of args.shifts) byStaff.set(s.staffId, [...(byStaff.get(s.staffId) || []), s]);
  for (const [staffId, list] of byStaff) {
    const sorted = [...list].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
    for (let i = 1; i < sorted.length; i++) {
      const gapH = (new Date(`${sorted[i].date}T${sorted[i].startTime}`).getTime() - new Date(`${sorted[i - 1].date}T${sorted[i - 1].endTime}`).getTime()) / 3600000;
      if (gapH >= 0 && gapH < 11)
        warnings.push(`Rest: ${staffId} has only ${gapH.toFixed(1)}h between shifts on ${sorted[i].date} (min 11h).`);
    }
  }
  for (const s of args.shifts) {
    const avail = args.availability.find((a) => a.staffId === s.staffId);
    if (avail && avail.availability.length > 0) {
      const day = parseISOLocal(s.date).toLocaleDateString('en-US', { weekday: 'long' });
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

export async function saveRosterMobile(input: {
  weekStart: string; department: string;
  shifts: import('@/types/increment2').RosterShift[];
  availability: import('@/types/increment2').StaffAvailability[];
  approvedLeave: import('@/types/increment2').LeaveRequest[];
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
    createdBy: user.uid,
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

export async function publishRosterMobile(rosterDocId: string) {
  const user = requireAuth();
  await requireManager('publish rosters');
  const ref = doc(db, 'shift_rosters', rosterDocId);
  // Re-validate live state (never trust stored warnings), then guard the
  // publish write transactionally against concurrent publish/swap edits.
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Roster not found.');
  const data = snap.data() as Record<string, unknown>;
  if (data.published === true) throw new Error('This roster is already published.');
  const shifts = ((data.shifts as Record<string, unknown>[]) || []) as unknown as import('@/types/increment2').RosterShift[];
  const [availSnap, leaveSnap] = await Promise.all([
    getDocs(query(collection(db, 'staff_availability'))),
    getDocs(query(collection(db, 'leave_requests'), where('status', '==', 'approved'))),
  ]);
  const warnings = validateRosterShifts({
    shifts,
    availability: availSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as import('@/types/increment2').StaffAvailability),
    approvedLeave: leaveSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as import('@/types/increment2').LeaveRequest),
  });
  if (warnings.length) throw new Error(`Resolve validation warnings before publishing: ${warnings[0]}`);
  const fingerprint = stableStringify(shifts);
  await runTransaction(db, async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists()) throw new Error('Roster not found.');
    const cur = fresh.data() as Record<string, unknown>;
    if (cur.published === true) throw new Error('This roster was just published by someone else.');
    if (stableStringify(cur.shifts || []) !== fingerprint)
      throw new Error('Roster changed during validation — review and publish again.');
    tx.update(ref, {
      validationStatus: 'published', published: true, publishedAt: nowIso(),
      publishedBy: user.uid, updatedAt: nowIso(), validationWarnings: [],
    });
  });
  await notifyUsers([...new Set(shifts.map((s) => String(s.staffId || '')))].filter(Boolean), {
    type: 'roster_published', title: 'Roster published',
    message: 'Your week roster is published. Check My Roster.',
    referenceId: rosterDocId, targetRoute: '/(staff)/my-roster',
  });
}

export async function createOpenShiftMobile(input: {
  department: string; date: string; startTime: string; endTime: string; role: string;
  requiredSkill?: string; urgency?: 'normal' | 'urgent' | 'critical'; rosterId?: string;
}): Promise<string> {
  const user = requireAuth();
  await requireManager('publish open shifts');
  if (!input.department.trim() || !input.date || !input.role.trim())
    throw new Error('Department, date and role are required.');
  const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const hrs = (toM(input.endTime) - toM(input.startTime)) / 60;
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
    urgency: input.urgency || 'normal',
    status: 'open',
    createdAt: nowIso(),
    createdBy: user.uid,
  });
  return ref.id;
}

export function listenShiftRosters(cb: (items: import('@/types/increment2').ShiftRoster[]) => void, weekStart?: string, onError?: (e: Error) => void) {
  const q = weekStart
    ? query(collection(db, 'shift_rosters'), where('weekStart', '==', weekStart))
    : query(collection(db, 'shift_rosters'));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as import('@/types/increment2').ShiftRoster)),
    (err) => onError?.(err as Error));
}

export function listenAllAvailability(cb: (items: import('@/types/increment2').StaffAvailability[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(collection(db, 'staff_availability'), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as import('@/types/increment2').StaffAvailability)),
    (err) => onError?.(err as Error));
}

export function listenAttendanceExceptions(cb: (items: import('@/types/increment2').AttendanceException[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(collection(db, 'attendance_exceptions'), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as import('@/types/increment2').AttendanceException)),
    (err) => onError?.(err as Error));
}

export function deriveAttendanceExceptions(args: {
  punches: { staffUid: string; staffName?: string; punchType: string; isoTime: string; withinRadius?: boolean; id: string }[];
  rosters: import('@/types/increment2').ShiftRoster[];
}): Omit<import('@/types/increment2').AttendanceException, 'id' | 'createdAt'>[] {
  const out: Omit<import('@/types/increment2').AttendanceException, 'id' | 'createdAt'>[] = [];
  const byStaff = new Map<string, typeof args.punches>();
  for (const p of args.punches) byStaff.set(p.staffUid, [...(byStaff.get(p.staffUid) || []), p]);
  for (const [staffId, list] of byStaff) {
    const sorted = [...list].sort((a, b) => a.isoTime.localeCompare(b.isoTime));
    const ins = sorted.filter((p) => p.punchType === 'in');
    const outs = sorted.filter((p) => p.punchType === 'out');
    const roster = args.rosters.flatMap((r) => r.shifts.map((s) => ({ ...s, rosterId: r.id }))).find((s) => s.staffId === staffId);
    const clockIn = ins[0]?.isoTime;
    const clockOut = outs[outs.length - 1]?.isoTime;
    let exceptionType: import('@/types/increment2').AttendanceExceptionType | null = null;
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

// Service-owned creation of a verified exception record for derived flags
// that have no doc yet (replaces UI direct-add bypass, F-P1-17).
export async function createVerifiedAttendanceException(args: {
  seed: Omit<import('@/types/increment2').AttendanceException, 'id' | 'createdAt' | 'reviewStatus'>;
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
    referenceId: ref.id, targetRoute: '/(staff)/clock-in-out',
  });
  return ref.id;
}

export async function reviewAttendanceExceptionMobile(args: {
  exceptionDocId: string; adjustedHours?: number; reason: string;
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
    const data = snap.data() as Record<string, unknown>;
    if (data.reviewStatus === 'verified') throw new Error('This record has already been verified.');
    if (String(data.staffId || '') === user.uid)
      throw new Error('You cannot verify your own attendance.');
    const originalValue = JSON.stringify({ hoursWorked: data.hoursWorked, reviewStatus: data.reviewStatus });
    tx.update(ref, {
      reviewStatus: 'verified',
      hoursWorked: args.adjustedHours ?? (data.hoursWorked as number) ?? null,
      adjustedBy: user.uid,
      adjustedAt: nowIso(),
      adjustmentReason: args.reason,
      originalValue,
      newValue: JSON.stringify({ hoursWorked: args.adjustedHours ?? data.hoursWorked, reviewStatus: 'verified' }),
      updatedAt: nowIso(),
    });
    return String(data.staffId || '');
  });
  await notifyUsers([staffUid], {
    type: 'attendance_verified', title: 'Attendance verified',
    message: 'Your attendance has been verified.',
    referenceId: args.exceptionDocId, targetRoute: '/(staff)/clock-in-out',
  });
}

export interface ImpactReport {
  periodStart: string; periodEnd: string;
  totalDonatedKg: number; totalCollectedKg: number;
  mealsDiverted: number; carbonOffsetKg: number;
  npoCount: number; batchCount: number; completionRate: number;
  byNpo: { npoId: string; batches: number; kg: number; meals: number }[];
}

export function computeImpactReport(
  batches: import('@/types/increment2').DonationBatch[],
  start: string,
  end: string
): ImpactReport {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime() + 86400000;
  const inRange = batches.filter((b) => {
    const t = new Date(b.createdAt).getTime();
    return t >= s && t <= e;
  });
  const collected = inRange.filter((b) => b.status === 'collected_completed');
  const totalDonatedKg = inRange.reduce((a, b) => a + (Number(b.estimatedWeightKg) || 0), 0);
  const totalCollectedKg = collected.reduce((a, b) => a + (Number(b.estimatedWeightKg) || 0), 0);
  const npoMap = new Map<string, { batches: number; kg: number }>();
  for (const b of collected) {
    const key = b.allocatedNpoId || 'unknown';
    const cur = npoMap.get(key) || { batches: 0, kg: 0 };
    cur.batches += 1;
    cur.kg += Number(b.estimatedWeightKg) || 0;
    npoMap.set(key, cur);
  }
  return {
    periodStart: start, periodEnd: end, totalDonatedKg, totalCollectedKg,
    mealsDiverted: Math.round(totalCollectedKg * IMPACT_MEALS_PER_KG),
    carbonOffsetKg: Math.round(totalCollectedKg * IMPACT_CARBON_KG_PER_KG * 10) / 10,
    npoCount: npoMap.size, batchCount: inRange.length,
    completionRate: inRange.length ? Math.round((collected.length / inRange.length) * 100) : 0,
    byNpo: [...npoMap.entries()].map(([npoId, v]) => ({
      npoId, batches: v.batches, kg: Math.round(v.kg * 10) / 10,
      meals: Math.round(v.kg * IMPACT_MEALS_PER_KG),
    })),
  };
}
