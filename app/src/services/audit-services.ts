// src/services/audit-services.ts — Append-only activity journal.
//
// Every state-changing operation in the food-rescue domain writes one entry
// here. Design notes:
//
//  * Best-effort by design. A journal write must never roll back or fail the
//    business action it describes, so this module never throws. Failures are
//    swallowed rather than surfaced — same posture as the notification helpers.
//  * Tamper-evident, not tamper-proof. Each entry carries the SHA-256 of the
//    preceding entry, so editing, reordering or deleting from the middle of the
//    log breaks the chain and verifyAuditChain() reports where. Entries are
//    written by the client SDK, so a determined user with devtools can still
//    write a well-formed forgery, and tail truncation is undetectable without an
//    externally anchored head. Genuine immutability needs a trusted server
//    (Cloud Functions, or an append-only bucket). Do not represent this as
//    tamper-proof.
//  * Actor identity is derived from the auth session, never from the caller, so
//    a compromised call site cannot attribute an action to somebody else.
//  * No secret is involved. The digest is plain SHA-256 over the entry body, so
//    this keeps working when VITE_QR_SIGNING_SECRET is unset — an audit trail
//    that fails closed when an unrelated env var is missing is worse than none.

import {
  addDoc, collection, limit, onSnapshot, orderBy, query,
  serverTimestamp, getDocs,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { computeEntryHash } from '@/utils/auditChain';
import type { AuditEntry } from '@/types/index';

export const AUDIT_COLLECTION = 'audit_log';

export interface AuditInput {
  action: string;
  entity: string;
  entityId?: string | null;
  beforeStatus?: string | null;
  afterStatus?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  /** Pass the role the caller already resolved; omitted entries fall back to null. */
  actorRole?: string | null;
}

const nowIso = () => new Date().toISOString();

/**
 * Appends one journal entry. Resolves once the write settles; never rejects.
 */
export async function writeAuditEntry(input: AuditInput): Promise<void> {
  try {
    const user = auth.currentUser;
    const clientAt = nowIso();

    // Chain head lookup is best-effort: if it fails the entry is still recorded,
    // just unlinked (prevHash null), which verifyAuditChain surfaces explicitly.
    let prevHash: string | null = null;
    try {
      const head = await getDocs(
        query(collection(db, AUDIT_COLLECTION), orderBy('clientAt', 'desc'), limit(1)),
      );
      prevHash = (head.docs[0]?.data() as { hash?: string } | undefined)?.hash ?? null;
    } catch {
      prevHash = null;
    }

    const body = {
      actorId: user?.uid ?? null,
      actorEmail: user?.email ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      beforeStatus: input.beforeStatus ?? null,
      afterStatus: input.afterStatus ?? null,
      summary: input.summary,
      metadata: input.metadata ?? null,
      clientAt,
      prevHash,
    };

    let hash: string | null = null;
    try {
      hash = await computeEntryHash(body, prevHash);
    } catch {
      hash = null;
    }

    await addDoc(collection(db, AUDIT_COLLECTION), {
      ...body,
      hash,
      occurredAt: serverTimestamp(),
    });
  } catch {
    /* journal is best-effort; never fail the caller's business operation */
  }
}

export function listenAuditEntries(
  cb: (items: AuditEntry[]) => void,
  opts: { entity?: string; limit?: number } = {},
): () => void {
  // Entity filtering happens client-side on purpose: a where() + orderBy()
  // combination would demand a composite index, and an index that is missing at
  // deploy time fails the whole listener rather than degrading.
  const cap = opts.limit ?? 200;
  const q = query(collection(db, AUDIT_COLLECTION), orderBy('clientAt', 'desc'), limit(cap));
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as AuditEntry);
    cb(opts.entity ? all.filter((e) => e.entity === opts.entity) : all);
  });
}

/**
 * Recomputes every digest and re-links the chain. Re-exported from the pure
 * module so callers have a single import for the journal API.
 */
export { verifyAuditChain } from '@/utils/auditChain';
