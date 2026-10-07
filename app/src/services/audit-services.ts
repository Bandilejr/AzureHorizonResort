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
 * Serializes the read-head-then-write sequence.
 *
 * Without this, two appends in flight at once both read the same chain head and
 * both link to it, so the chain forks and every later link is unverifiable. That
 * is not hypothetical: callers that loop (the attendance backfill appends one
 * entry per exception) reliably triggered it, and 44 of the 59 entries written
 * so far are forked this way. A single in-module queue makes each append observe
 * the one the previous append just wrote.
 *
 * Module scope, so it covers every caller in this file. A queue cannot help
 * across browser tabs, which remain a known limitation.
 */
let appendQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = appendQueue.then(task, task);
  // Keep the chain alive regardless of outcome, so one rejected task cannot
  // wedge every later append.
  appendQueue = result.then(() => undefined, () => undefined);
  return result;
}

/**
 * Shared append path: resolve the chain head, digest, write. Never throws.
 * `actor` is passed in rather than read here so the two callers cannot
 * disagree about where identity comes from.
 */
async function appendEntry(actor: { id: string | null; email: string | null }, input: AuditInput): Promise<void> {
  return enqueue(async () => {
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
    actorId: actor.id,
    actorEmail: actor.email,
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
  });
}

/**
 * Appends one journal entry. Resolves once the write settles; never rejects.
 */
export async function writeAuditEntry(input: AuditInput): Promise<void> {
  try {
    const user = auth.currentUser;
    await appendEntry({ id: user?.uid ?? null, email: user?.email ?? null }, input);
  } catch {
    /* journal is best-effort; never fail the caller's business operation */
  }
}

/**
 * Seed-only backfill so the trail reflects demo records that were written
 * directly rather than through instrumented services.
 *
 * There is no caller-supplied actor: every entry is stamped role 'seed' with a
 * null actor id/email, because attributing a synthetic entry to a real person
 * would be a lie the admin UI cannot distinguish from a genuine write. Entries
 * are tagged metadata.seeded so they can be told apart from real activity.
 * Resolves once all writes settle; never rejects.
 */
export async function writeSeedAuditEntries(inputs: AuditInput[]): Promise<void> {
  for (const input of inputs) {
    try {
      await appendEntry(
        { id: null, email: null },
        {
          ...input,
          actorRole: 'seed',
          metadata: { ...(input.metadata ?? {}), seeded: true },
        },
      );
    } catch {
      /* best-effort, same posture as writeAuditEntry */
    }
  }
}

export function listenAuditEntries(
  cb: (items: AuditEntry[]) => void,
  opts: {
    entity?: string;
    limit?: number;
    /**
     * Required in practice. Firestore never invokes the success callback when a
     * listener is rejected (permission-denied, missing index), so without this the
     * caller is left waiting on a snapshot that will never arrive.
     */
    onError?: (error: Error) => void;
  } = {},
): () => void {
  // Entity filtering happens client-side on purpose: a where() + orderBy()
  // combination would demand a composite index, and an index that is missing at
  // deploy time fails the whole listener rather than degrading.
  const cap = opts.limit ?? 200;
  const q = query(collection(db, AUDIT_COLLECTION), orderBy('clientAt', 'desc'), limit(cap));
  return onSnapshot(
    q,
    (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as AuditEntry);
      cb(opts.entity ? all.filter((e) => e.entity === opts.entity) : all);
    },
    (error) => {
      opts.onError?.(error);
    },
  );
}

/**
 * Recomputes every digest and re-links the chain. Re-exported from the pure
 * module so callers have a single import for the journal API.
 */
export { verifyAuditChain } from '@/utils/auditChain';
