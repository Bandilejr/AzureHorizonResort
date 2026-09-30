// src/hooks/use-staff-names.ts — Phase 2 (§3.A): resolve staff UIDs to display
// names so the UI never shows raw UIDs. One shared module-level fetch (cached),
// safe fallback to the raw id when a name is unavailable.
import { useEffect, useState } from 'react';
import { db } from '@/services/firebase-services';
import { collection, getDocs, limit, query } from 'firebase/firestore';

let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

async function loadNames(): Promise<Record<string, string>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = getDocs(query(collection(db, 'users'), limit(300)))
      .then((snap) => {
        const m: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as { displayName?: string; name?: string; email?: string };
          const name = data.displayName || data.name || data.email || '';
          if (name) m[d.id] = name;
        });
        cache = m;
        return m;
      })
      .catch(() => {
        // Non-fatal: callers fall back to showing the raw id.
        return {};
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
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