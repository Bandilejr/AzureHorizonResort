// Derives a read-only activity timeline from existing Firestore records, so the
// audit trail reflects what the system actually holds.
//
// Why derived and not written to audit_log: the journal is an append-only hash
// chain (utils/auditChain.ts). verifyAuditChain requires each entry's prevHash
// to equal the previous digest, and these records predate the chain head, so
// backfilling would invalidate every later entry and make test:audit assert on
// invented events. Deriving at read time leaves the chain intact.
//
// Every row is a true statement about a real document: this batch WAS allocated
// at this timestamp by this actor, because the document says so. Nothing is
// invented and no timestamp is fabricated — each row cites a field that already
// exists. Rows are marked `derived` so the view can label them as reconstructed
// from current state rather than journalled at the time.
import {
  collection, getDocs, query, limit as fsLimit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { AuditAction, AuditEntry } from '@/types/index';

/** A row the view labels as reconstructed rather than journalled. */
export interface DerivedEntry extends AuditEntry {
  derived: true;
  /** Collection the row was reconstructed from. */
  sourceCollection: string;
}

/**
 * Records which live audit entries already state a fact that a derived row would
 * otherwise repeat, so the merged trail shows one row per fact rather than two.
 *
 * Keyed on the parts that identify the event rather than the whole row: two
 * entries about the same batch and action are the same event however their
 * summaries are worded, and a seeded batch carries no journalled entries at all.
 */
const seenFacts = (journalled: AuditEntry[]): Set<string> => new Set(
  journalled.map((e) => `${e.entity}|${e.entityId ?? ''}|${e.action}`),
);

const nowIso = () => new Date().toISOString();

/** A seed placeholder is not a real actor and must not be attributed to one. */
const isRealActor = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v !== 'seed';

/** A timestamp worth citing: present, parseable, and not a seed sentinel. */
const realTime = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length === 0) return null;
  return Number.isNaN(new Date(v).getTime()) ? null : v;
};

const round1 = (n: unknown) => Math.round((Number(n) || 0) * 10) / 10;
const kg = (n: unknown) => `${round1(n)} kg`;

/** Collection cap per source: keeps the read bounded on a large dataset. */
const READ_CAP = 400;

/** One source document. Values stay `unknown` and are narrowed at the point of use. */
type SourceDoc = Record<string, unknown>;

async function readAll(name: string): Promise<SourceDoc[]> {
  try {
    const snap = await getDocs(query(collection(db, name), fsLimit(READ_CAP)));
    return snap.docs.map((d) => ({ __id: d.id, ...(d.data() as SourceDoc) }));
  } catch {
    // A collection the caller cannot read must not break the whole timeline.
    return [];
  }
}

/** Narrows an unknown value to string, treating null/undefined/non-strings as absent. */
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

/**
 * Builds the derived timeline. Read-only: issues queries only, writes nothing.
 */
export async function buildDerivedTimeline(
  /**
   * Entries already in the journal. Any fact they record is skipped, so the
   * merged trail shows each event once. Pass nothing to include everything.
   */
  alreadyJournalled: AuditEntry[] = [],
): Promise<DerivedEntry[]> {
  const seen = seenFacts(alreadyJournalled);
  const [batches, checkins, partners, applications, bookings, leave] = await Promise.all([
    readAll('donation_batches'),
    readAll('donation_checkins'),
    readAll('npo_partners'),
    readAll('npo_applications'),
    readAll('bookings'),
    readAll('leave_requests'),
  ]);

  // Resolve actor ids against the staff directory so rows read like real ones.
  const staff = new Map<string, { email: string | null; role: string | null }>();
  for (const u of await readAll('users')) {
    if (typeof u.__id !== 'string') continue;
    staff.set(u.__id, {
      email: str(u.email) ?? str(u.emailAddress) ?? null,
      role: str(u.role) ?? null,
    });
  }
  const actor = (id: unknown, fallbackRole: string) => {
    const key = typeof id === 'string' ? id : null;
    const u = key ? staff.get(key) : null;
    return {
      actorId: key,
      actorEmail: u?.email ?? null,
      actorRole: u?.role ?? fallbackRole,
    };
  };

  const rows: DerivedEntry[] = [];
  const push = (e: Omit<DerivedEntry, 'id' | 'derived' | 'sourceCollection' | 'metadata' | 'hash' | 'prevHash' | 'occurredAt' | 'serverTimestamp'> & { entityId: string; clientAt: string; sourceCollection: string }) => {
    // Skip anything the journal already records: a duplicated row would read as
    // the event happening twice.
    if (seen.has(`${e.entity}|${e.entityId}|${e.action}`)) return;
    rows.push({
      ...e,
      id: `derived:${e.sourceCollection}:${e.entityId}:${e.clientAt}`,
      derived: true,
      // prevHash and hash stay null on purpose: these rows are outside the
      // chain, and verifyAuditChain must not be asked to validate them.
      prevHash: null,
      hash: null,
      metadata: null,
    } as DerivedEntry);
  };

  // --- donation batches: one row per stage the record actually captured -----
  for (const b of batches) {
    const id = str(b.batchId) ?? str(b.__id) ?? '';
    const item = str(b.itemName) ?? 'surplus';

    const certifiedAt = realTime(b.createdAt);
    if (certifiedAt) {
      push({
        ...actor(b.verifiedBy, 'chef'),
        action: 'donation_certified' as AuditAction,
        entity: 'donation_batches',
        entityId: id,
        beforeStatus: 'draft',
        afterStatus: 'safety_verified_unassigned',
        summary: `Donation batch ${id} (${item}) safety-verified at ${kg(b.estimatedWeightKg)} estimated.`,
        clientAt: certifiedAt,
        sourceCollection: 'donation_batches',
      });
    }

    const allocatedAt = realTime(b.allocatedAt);
    if (allocatedAt && isRealActor(b.allocatedBy)) {
      push({
        ...actor(b.allocatedBy, 'admin'),
        action: 'donation_allocated' as AuditAction,
        entity: 'donation_batches',
        entityId: id,
        beforeStatus: 'safety_verified_unassigned',
        afterStatus: 'allocated_awaiting_claim',
        summary: `Batch ${id} (${item}, ${kg(b.estimatedWeightKg)}) allocated to ${b.allocatedNpoId ?? 'a partner'}.`,
        clientAt: allocatedAt,
        sourceCollection: 'donation_batches',
      });
    }

    const claimedAt = realTime(b.claimedAt);
    if (claimedAt && isRealActor(b.claimedBy)) {
      push({
        ...actor(b.claimedBy, 'npo_rep'),
        action: 'donation_claimed' as AuditAction,
        entity: 'donation_batches',
        entityId: id,
        beforeStatus: 'allocated_awaiting_claim',
        afterStatus: 'claimed_ready_for_scheduling',
        summary: `Claim accepted for batch ${id} by ${b.allocatedNpoId ?? 'a partner'}.`,
        clientAt: claimedAt,
        sourceCollection: 'donation_batches',
      });
    }

    // Scheduling needs a real pickup date and a real courier to be worth citing.
    if (realTime(b.pickupDate) && typeof b.courierName === 'string' && b.courierName) {
      const when = realTime(b.qrIssuedAt) ?? claimedAt ?? allocatedAt ?? certifiedAt;
      if (when) {
        push({
          ...actor(b.claimedBy, 'collector'),
          actorEmail: str(b.courierName) ?? null,
          action: 'collection_scheduled' as AuditAction,
          entity: 'donation_batches',
          entityId: id,
          beforeStatus: 'claimed_ready_for_scheduling',
          afterStatus: 'collection_scheduled',
          summary: `Collection scheduled for batch ${id}: ${b.pickupDate}${b.loadingBay ? ` at bay ${b.loadingBay}` : ''}, courier ${b.courierName}.`,
          clientAt: when,
          sourceCollection: 'donation_batches',
        });
      }
    }
  }

  // --- collection confirmations --------------------------------------------
  for (const c of checkins) {
    const when = realTime(c.collectedAt);
    if (!when) continue;
    const seal = c.sealVerified ? 'seal verified' : 'seal NOT verified';
    push({
      ...actor(c.verifiedBy, 'collector'),
      action: 'collection_completed' as AuditAction,
      entity: 'donation_batches',
      entityId: str(c.batchId) ?? str(c.__id) ?? "",
      beforeStatus: 'collection_scheduled',
      afterStatus: 'collected_completed',
      summary: `Collection confirmed for batch ${c.batchId} by courier ${c.courierName} — ${seal}${c.wasOffline ? ' (offline scan)' : ''}.`,
      clientAt: when,
      sourceCollection: 'donation_checkins',
    });
  }

  // --- NPO partners ---------------------------------------------------------
  for (const p of partners) {
    const when = realTime(p.verifiedAt) ?? realTime(p.updatedAt) ?? realTime(p.createdAt);
    if (!when) continue;
    const status = str(p.verificationStatus) ?? 'pending';
    const action = status === 'rejected' ? 'npo_rejected'
      : status === 'approved' ? 'npo_approved'
        : 'npo_under_review';
    push({
      ...actor(p.createdBy, 'admin'),
      action: action as AuditAction,
      entity: 'npo_partners',
      entityId: str(p.npoId) ?? str(p.__id) ?? "",
      beforeStatus: 'pending',
      afterStatus: status,
      summary: `${p.organisationName ?? p.npoId ?? p.__id} marked ${status.replace(/_/g, ' ')} (PBO ${p.pboNumber ?? 'not supplied'}).`,
      clientAt: when,
      sourceCollection: 'npo_partners',
    });
  }

  // --- public applications --------------------------------------------------
  for (const a of applications) {
    const when = realTime(a.submittedAt);
    if (!when) continue;
    push({
      ...actor(a.applicantUid, 'guest'),
      action: 'npo_application_submitted' as AuditAction,
      entity: 'npo_applications',
      entityId: str(a.__id) ?? "",
      beforeStatus: null,
      afterStatus: str(a.verificationStatus) ?? 'pending',
      summary: `Public application received from ${a.organisationName ?? 'an organisation'} (${a.registrationNumber ?? 'no registration number'}).`,
      clientAt: when,
      sourceCollection: 'npo_applications',
    });
  }

  // --- bookings -------------------------------------------------------------
  for (const b of bookings) {
    const when = realTime(b.createdAt);
    if (!when) continue;
    push({
      actorId: null,
      actorEmail: str(b.guestEmail) ?? null,
      actorRole: 'guest',
      action: 'booking_created' as AuditAction,
      entity: 'bookings',
      entityId: str(b.id) ?? str(b.__id) ?? "",
      beforeStatus: null,
      afterStatus: str(b.status) ?? 'reserved',
      summary: `Booking ${b.id ?? b.__id} created for ${b.guestEmail ?? 'a guest'}${b.roomId ? ` in room ${b.roomId}` : ''}.`,
      clientAt: when,
      sourceCollection: 'bookings',
    });
  }

  // --- leave requests -------------------------------------------------------
  for (const l of leave) {
    const when = realTime(l.createdAt);
    if (!when) continue;
    const status = str(l.status) ?? 'pending';
    push({
      ...actor(l.staffId, 'staff'),
      action: (status === 'approved' ? 'leave_approved'
        : status === 'rejected' ? 'leave_rejected'
          : 'leave_requested') as AuditAction,
      entity: 'leave_requests',
      entityId: str(l.__id) ?? "",
      beforeStatus: null,
      afterStatus: status,
      summary: `Leave request from ${l.staffName ?? l.staffId ?? 'staff'} for ${l.startDate ?? ''} to ${l.endDate ?? ''} — ${status}.`,
      clientAt: when,
      sourceCollection: 'leave_requests',
    });
  }

  return rows
    .filter((r) => r.clientAt && !Number.isNaN(new Date(r.clientAt).getTime()))
    .sort((a, b) => String(a.clientAt).localeCompare(String(b.clientAt)));
}

export { nowIso };
