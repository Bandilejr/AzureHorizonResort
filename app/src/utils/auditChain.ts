// src/utils/auditChain.ts — pure hashing and verification for the activity journal.
//
// Deliberately free of Firebase imports so the integrity logic can be exercised
// in isolation. Nothing here touches the network or the database.

import type { AuditChainResult, AuditEntry } from '@/types/index';

export interface HashableEntry {
  action: string;
  entity: string;
  entityId: string | null;
  actorId: string | null;
  actorRole: string | null;
  beforeStatus: string | null;
  afterStatus: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  clientAt: string;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deterministic serialisation. Object keys are sorted recursively so the same
 * logical entry hashes identically regardless of property insertion order.
 */
export function canonical(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v === undefined ? null : v;
    if (Array.isArray(v)) return v.map(walk);
    return Object.keys(v as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = walk((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  };
  return JSON.stringify(walk(value));
}

/**
 * The exact fields covered by the digest, in a fixed order.
 *
 * This list is the contract between writer and verifier. Both sides must hash
 * precisely these fields: the stored document carries extra properties (id,
 * occurredAt, actorEmail) that must NOT influence the digest, or every
 * verification would fail against a legitimately written entry.
 */
const HASH_FIELDS = [
  'action', 'entity', 'entityId', 'actorId', 'actorRole',
  'beforeStatus', 'afterStatus', 'summary', 'metadata', 'clientAt',
] as const;

/** SHA-256 over prevHash + the canonical projection of the hashed fields. */
export function computeEntryHash(entry: HashableEntry, prevHash: string | null): Promise<string> {
  const projected: Record<string, unknown> = {};
  for (const field of HASH_FIELDS) {
    projected[field] = (entry as Record<string, unknown>)[field] ?? null;
  }
  return sha256Hex(`${prevHash ?? ''}${canonical(projected)}`);
}

/**
 * Recomputes every digest and re-links the chain. Entries may be supplied in any
 * order; they are sorted by clientAt first.
 *
 * Detects: edited fields, forged digests, reordering, and deletion from the
 * middle of the log (each of which breaks a link).
 *
 * Does NOT detect: truncation of the tail. Dropping the newest entries leaves a
 * shorter but internally consistent prefix, which no unanchored hash chain can
 * distinguish from a log that simply ended early. Closing this needs an
 * externally anchored head — a signed checkpoint published somewhere the client
 * cannot rewrite, or an append-only store such as a GCS bucket with retention
 * policy. Not implemented; see the Activity Trail copy for the honest wording.
 */
export async function verifyAuditChain(entries: AuditEntry[]): Promise<AuditChainResult> {
  // Entries sharing a clientAt millisecond have no defined order, so sorting by
  // that field alone can order them differently from the order they were
  // written in. Two writers that resolve the same chain head — concurrent tabs,
  // a retried write, a loop appending several entries at once — each link to the
  // correct predecessor, and the fork is invisible unless those entries keep
  // their document ids, which are assigned in write order. Sort by id as the
  // tiebreak so a same-millisecond group is walked in the order it was written.
  const ordered = [...entries].sort((a, b) => {
    const byTime = String(a.clientAt).localeCompare(String(b.clientAt));
    return byTime !== 0 ? byTime : String(a.id).localeCompare(String(b.id));
  });
  let prev: string | null = null;
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i];
    if (e.prevHash !== prev) {
      return { ok: false, checked: i, brokenAt: i, reason: 'chain link mismatch' };
    }
    if (e.hash === null) {
      return { ok: false, checked: i, brokenAt: i, reason: 'entry has no digest (writer failed)' };
    }
    let expected: string;
    try {
      expected = await computeEntryHash(e, e.prevHash);
    } catch (err) {
      return { ok: false, checked: i, brokenAt: i, reason: `digest failed: ${String(err)}` };
    }
    if (expected !== e.hash) {
      return { ok: false, checked: i, brokenAt: i, reason: 'entry body does not match its digest' };
    }
    prev = e.hash;
  }
  return { ok: true, checked: ordered.length, brokenAt: null, reason: null };
}
