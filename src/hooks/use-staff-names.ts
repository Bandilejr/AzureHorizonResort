// src/hooks/use-staff-names.ts — resolve staff UIDs to display names so the UI
// never shows raw UIDs.
//
// Layer 10 hardening:
//  - TTL cache (5 min) with an explicit `refreshStaffNames()`.
//  - Paginates ALL users (300/page via orderBy(documentId) + startAfter) so
//    names are never silently dropped past 300.
//  - KNOWN LIMITATION: this downloads full user documents to staff devices.
//    A future revision should store a slim `displayName` index or resolve
//    names server-side.
import { useEffect, useState } from 'react';
import { db } from '@/services/firebase-services';
import {
  collection, documentId, getDocs, limit, orderBy, query, startAfter,
  type DocumentData, type Query, type QueryDocumentSnapshot, type QuerySnapshot,
} from 'firebase/firestore';

const PAGE_SIZE = 300;
const TTL_MS = 5 * 60 * 1000;

let cache: Record<string, string> | null = null;
let cacheAt = 0;
let inflight: Promise<Record<string, string>> | null = null;

async function fetchAllNames(): Promise<Record<string, string>> {
  const m: Record<string, string> = {};
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  // Loop until a page returns fewer than PAGE_SIZE docs. Guards against the
  // old silent 300-row truncation.
  for (;;) {
    const base: Query<DocumentData> = query(collection(db, 'users'), orderBy(documentId()), limit(PAGE_SIZE));
    const q: Query<DocumentData> = cursor ? query(base, startAfter(cursor)) : base;
    const snap: QuerySnapshot<DocumentData> = await getDocs(q);
    snap.docs.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
      const data = d.data() as { displayName?: string; name?: string; email?: string };
      const name = data.displayName || data.name || data.email || '';
      if (name) m[d.id] = name;
    });
    if (snap.docs.length < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return m;
}

async function loadNames(force = false): Promise<Record<string, string>> {
  if (!force && cache && Date.now() - cacheAt < TTL_MS) return cache;
  if (!inflight) {
    inflight = fetchAllNames()
      .then((m) => { cache = m; cacheAt = Date.now(); return m; })
      .catch(() => cache || {}) // non-fatal: callers fall back to the raw id
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Force a refresh of the cached staff-name map (e.g. on pull-to-refresh). */
export async function refreshStaffNames(): Promise<Record<string, string>> {
  return loadNames(true);
}

/** Human-readable staff names keyed by uid. Falls back to the uid when unknown. */
export function useStaffNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>(cache || {});
  useEffect(() => {
    let alive = true;
    loadNames().then((m) => { if (alive) setNames(m); });
    return () => { alive = false; };
  }, []);
  return names;
}

/** Resolve a single uid → display name (falls back to the uid). */
export function staffNameOf(names: Record<string, string>, uid: string | null | undefined): string {
  if (!uid) return '—';
  return names[uid] || uid;
}
