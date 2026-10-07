// Activity trail (admin). Live view over the append-only journal written by
// services/audit-services.ts, with section filters and on-demand chain
// verification.
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, ScrollText, ShieldCheck, ShieldAlert, RefreshCw, Download, Layers,
} from 'lucide-react';
import { listenAuditEntries, verifyAuditChain } from '@/services/audit-services';
import { buildDerivedTimeline } from '@/services/derivedTimeline';
import type { DerivedEntry } from '@/services/derivedTimeline';
import { formatStatus } from '@/utils/statusLabels';
import {
  AUDIT_ACTIONS, AUDIT_SECTIONS, auditSectionFor,
} from '@/types/index';
import type {
  AuditAction, AuditChainResult, AuditEntry, AuditSection,
} from '@/types/index';

const ALL = '__all__';
const PAGE = 150;
const PAGE_STEP = 300;
const ROW_STEP = 100;

const SECTION_TONE: Record<AuditSection, string> = {
  npo: 'bg-emerald-100 text-emerald-800',
  foodRescue: 'bg-teal-100 text-teal-800',
  bookings: 'bg-sky-100 text-sky-800',
  hospitality: 'bg-indigo-100 text-indigo-800',
  money: 'bg-amber-100 text-amber-800',
  damage: 'bg-rose-100 text-rose-800',
  workforce: 'bg-violet-100 text-violet-800',
  tours: 'bg-cyan-100 text-cyan-800',
  feedback: 'bg-slate-100 text-slate-700',
};

function when(clientAt: string): string {
  const d = new Date(clientAt);
  return Number.isNaN(d.getTime()) ? clientAt : d.toLocaleString();
}

/** RFC 4180-ish quoting: every field is quoted and internal quotes doubled. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(entries: AuditEntry[]): string {
  const header = ['when', 'section', 'action', 'entity', 'entityId', 'beforeStatus', 'afterStatus', 'actorEmail', 'actorId', 'actorRole', 'summary', 'metadata', 'hash', 'source'];
  const rows = entries.map((e) => [
    e.clientAt,
    auditSectionFor(e.action) ?? '',
    e.action,
    e.entity,
    e.entityId ?? '',
    e.beforeStatus ?? '',
    e.afterStatus ?? '',
    e.actorEmail ?? '',
    e.actorId ?? '',
    e.actorRole ?? '',
    e.summary,
    e.metadata ? JSON.stringify(e.metadata) : '',
    e.hash ?? '',
    (e as DerivedEntry).derived ? `derived from ${(e as DerivedEntry).sourceCollection}` : 'journal',
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function AuditTrailView() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<AuditChainResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Rows reconstructed from current Firestore state (seeded batches, checkins,
  // bookings, leave) rather than journalled at the time. They are shown
  // alongside the journal so the trail covers the whole system, and are labelled
  // `derived` so nobody reads them as contemporaneously recorded.
  const [derived, setDerived] = useState<DerivedEntry[]>([]);
  const [includeDerived, setIncludeDerived] = useState(true);

  const [cap, setCap] = useState(PAGE);
  const [rows, setRows] = useState(ROW_STEP);
  const [section, setSection] = useState<AuditSection | typeof ALL>(ALL);
  const [action, setAction] = useState<AuditAction | typeof ALL>(ALL);
  const [role, setRole] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // cap is part of the query, so widening the window re-subscribes and returns
  // one contiguous newest-first slice rather than merging two sources client-side.
  useEffect(() => {
    setLoading(true);
    const unsub = listenAuditEntries((items) => {
      setEntries(items);
      setLoading(false);
    }, {
      limit: cap,
      onError: (err) => {
        console.warn('Firebase blocked activity trail listener:', err.message);
        // Must clear loading here: a rejected listener never fires the success
        // callback, which would otherwise leave this view spinning indefinitely.
        setError(err.message);
        setLoading(false);
      },
    });
    return () => unsub();
  }, [cap]);

  // Derived rows are read-only queries, so they load once and on demand.
  useEffect(() => {
    let cancelled = false;
    // Re-derived when the journal grows, so a fact the journal has since
    // recorded is no longer repeated by a derived row.
    buildDerivedTimeline(entries)
      .then((d) => { if (!cancelled) setDerived(d); })
      // A failure here must not take the journal down with it.
      .catch((err) => { if (!cancelled) console.warn('could not derive timeline:', err.message); });
    return () => { cancelled = true; };
  }, [entries]);

  // A new write invalidates a previous verdict; never show a stale "verified".
  useEffect(() => { setChain(null); }, [entries.length]);

  /**
   * The chain covers journalled entries ONLY. Derived rows sit outside it by
   * construction (null prevHash/hash), so including them would report a false
   * tampering verdict — which is worse than not showing the check at all.
   */
  const journalled = useMemo(
    () => entries.filter((e) => !(e as DerivedEntry).derived),
    [entries],
  );

  const allRows = useMemo(
    () => (includeDerived ? [...entries, ...derived] : entries),
    [entries, derived, includeDerived],
  );

  // A narrower window invalidates any row limit beyond it.
  useEffect(() => { setRows(ROW_STEP); }, [section, action, role, from, to]);

  const actions = useMemo(() => {
    const present = new Set(allRows.map((e) => e.action));
    return (Object.values(AUDIT_ACTIONS) as AuditAction[]).filter((a) => present.has(a));
  }, [allRows]);

  const roles = useMemo(
    () => [...new Set(allRows.map((e) => e.actorRole || 'unspecified'))].sort(),
    [allRows],
  );

  const sectionCounts = useMemo(() => {
    const counts = new Map<AuditSection, number>();
    for (const e of allRows) {
      const s = auditSectionFor(e.action);
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return counts;
  }, [allRows]);

  const filtered = useMemo(() => {
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    return allRows.filter((e) => {
      if (section !== ALL && auditSectionFor(e.action) !== section) return false;
      if (action !== ALL && e.action !== action) return false;
      if (role !== ALL && (e.actorRole || 'unspecified') !== role) return false;
      if (fromMs !== null || toMs !== null) {
        const t = new Date(e.clientAt).getTime();
        if (Number.isNaN(t)) return false;
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t > toMs) return false;
      }
      return true;
    });
  }, [allRows, section, action, role, from, to]);

  const visible = filtered.slice(0, rows);

  const runVerify = async () => {
    setVerifying(true);
    try {
      setChain(await verifyAuditChain(journalled));
    } finally {
      setVerifying(false);
    }
  };

  const exportCsv = () => {
    // Prefixed with a BOM so Excel opens UTF-8 (Rand, arrows) correctly.
    const blob = new Blob([`\uFEFF${toCsv(filtered)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSection(ALL); setAction(ALL); setRole(ALL); setFrom(''); setTo('');
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading activity trail…
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" /> Activity trail unavailable
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Firestore rejected the listener, so no entries can be shown:</p>
          <p className="rounded border border-amber-200 bg-amber-50 p-2 font-mono text-xs text-amber-900">
            {error}
          </p>
          <p className="text-xs text-slate-600">
            This is an authentication or security-rules problem, not a fault in the journal. Reading
            the trail requires permission on the <code>audit_log</code> collection — sign in as an
            admin, or add a read rule for it.
          </p>
          <p className="text-xs text-slate-500">
            Note that journal writes are best-effort by design, so any actions taken while writes
            were denied were recorded in the app but left no audit entry.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" /> Activity Trail ({filtered.length}
            {filtered.length !== allRows.length ? ` of ${allRows.length}` : ''})
          </CardTitle>
          <div className="flex items-center gap-2">
            <label
              className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 cursor-pointer dark:border-slate-700 dark:text-slate-300"
              title="Show activity reconstructed from current records (seeded batches, collections, bookings, leave) alongside the journal."
            >
              <input
                type="checkbox"
                checked={includeDerived}
                onChange={(e) => setIncludeDerived(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Include system records ({derived.length})
            </label>
            <Button variant="outline" size="sm" disabled={filtered.length === 0} onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" disabled={verifying || journalled.length === 0} onClick={runVerify}>
              {verifying
                ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                : chain?.ok ? <ShieldCheck className="h-4 w-4 mr-1" /> : <ShieldAlert className="h-4 w-4 mr-1" />}
              Verify integrity
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500">
            Append-only journal of state changes across bookings, hospitality, payments and loyalty,
            damage claims, workforce, tours and events, guest feedback, NPO partners and food rescue.
            Actor identity is taken from the authenticated session, never from the caller. Entries are
            chained by SHA-256, so edits, reordering and deletions are detectable — truncating the
            newest entries is not, and entries are written by the browser rather than a trusted server,
            so treat this as a strong deterrent and an investigation aid, not a tamper-proof record.
          </p>

          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-700 dark:text-slate-300">System records</span>{' '}
            are reconstructed from the current state of batches, collection confirmations, bookings and
            leave requests — every field they cite is already on the record, and no timestamp is
            invented. They are marked <span className="italic">reconstructed</span> because the
            journal has no entry for them: data loaded outside the app bypasses the rules and so was
            never journalled. They sit outside the hash chain, which is why chain verification covers
            the {journalled.length} journalled entries only.
          </p>

          {/* Section toggle. Counts are of the loaded window, so they describe what
              is on screen rather than the lifetime total. */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1 text-xs text-slate-500">
              <Layers className="h-3 w-3" /> Section
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={section === ALL ? 'default' : 'outline'}
                onClick={() => setSection(ALL)}
              >
                All ({entries.length})
              </Button>
              {(Object.keys(AUDIT_SECTIONS) as AuditSection[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={section === s ? 'default' : 'outline'}
                  disabled={!sectionCounts.get(s)}
                  onClick={() => setSection(s)}
                >
                  {AUDIT_SECTIONS[s]} ({sectionCounts.get(s) ?? 0})
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Action</Label>
              <Select value={action} onValueChange={(v) => setAction(v as AuditAction | typeof ALL)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All actions</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a}>{formatStatus(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All roles</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>{formatStatus(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {(section !== ALL || action !== ALL || role !== ALL || from || to) && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>
          )}

          {chain && (
            <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
              chain.ok
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-red-300 bg-red-50 text-red-800'
            }`}>
              {chain.ok ? <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" /> : <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />}
              <div>
                {chain.ok ? (
                  <p className="font-medium">Chain intact — {chain.checked} entries verified.</p>
                ) : (
                  <>
                    <p className="font-medium">
                      Chain broken at entry {String((chain.brokenAt ?? 0) + 1)} of {entries.length}.
                    </p>
                    <p className="text-xs">{chain.reason}</p>
                  </>
                )}
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <ScrollText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {entries.length === 0
                  ? 'No activity recorded yet. Entries appear as staff and guests move records through the system.'
                  : 'No entries match these filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Record</th>
                    <th className="py-2 pr-4">Transition</th>
                    <th className="py-2 pr-4">Actor</th>
                    <th className="py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => {
                    const s = auditSectionFor(e.action);
                    return (
                      <tr
                          key={e.id}
                          className={`border-b align-top hover:bg-slate-50 dark:hover:bg-slate-800 ${
                            (e as DerivedEntry).derived ? 'bg-slate-50/60 dark:bg-slate-800/40' : ''
                          }`}
                        >
                        <td className="py-2 pr-4 whitespace-nowrap text-xs text-slate-500">
                          {when(e.clientAt)}
                          {(e as DerivedEntry).derived && (
                            <div
                              className="text-[10px] text-amber-700 dark:text-amber-300 mt-1"
                              title="Reconstructed from the current record, not journalled when the event happened. Excluded from chain verification."
                            >
                              reconstructed
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge className={s ? SECTION_TONE[s] : 'bg-slate-100 text-slate-700'}>
                            {formatStatus(e.action)}
                          </Badge>
                          {s && (
                            <div className="text-[10px] text-slate-400 mt-1">{AUDIT_SECTIONS[s]}</div>
                          )}
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">{e.entity}</td>
                        <td className="py-2 pr-4 text-xs whitespace-nowrap">
                          {e.beforeStatus || e.afterStatus ? (
                            <span className="text-slate-500">
                              {e.beforeStatus ? formatStatus(e.beforeStatus) : 'new'}
                              {' → '}
                              <span className="text-slate-900 dark:text-slate-100">
                                {e.afterStatus ? formatStatus(e.afterStatus) : '—'}
                              </span>
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2 pr-4 text-xs whitespace-nowrap">
                          {e.actorEmail || e.actorId || 'system'}
                          {e.actorRole && <div className="text-slate-500">{formatStatus(e.actorRole)}</div>}
                        </td>
                        <td className="py-2 text-xs">
                          {e.summary}
                          <div className="text-slate-400 font-mono">
                            {e.hash ? `sha256:${e.hash.slice(0, 12)}…` : 'no digest'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-slate-400">
            {entries.length >= cap ? (
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Showing the {cap} most recent entries.
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => setCap((c) => c + PAGE_STEP)}
                >
                  Load older
                </Button>
              </span>
            ) : (
              <span>{entries.length} entr{entries.length === 1 ? 'y' : 'ies'} loaded (full history).</span>
            )}
            {visible.length < filtered.length && (
              <Button variant="ghost" size="sm" onClick={() => setRows((r) => r + ROW_STEP)}>
                Show {Math.min(ROW_STEP, filtered.length - visible.length)} more
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}