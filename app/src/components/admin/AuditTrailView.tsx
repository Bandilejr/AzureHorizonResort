// Activity trail (admin). Live view over the append-only journal written by
// services/audit-services.ts, with on-demand chain-integrity verification.
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ScrollText, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { listenAuditEntries, verifyAuditChain } from '@/services/audit-services';
import { formatStatus } from '@/utils/statusLabels';
import type { AuditChainResult, AuditEntry } from '@/types/index';

const ALL = '__all__';

const ACTION_TONE: Record<string, string> = {
  npo_approved: 'bg-emerald-100 text-emerald-800',
  donation_certified: 'bg-blue-100 text-blue-800',
  collection_completed: 'bg-emerald-100 text-emerald-800',
  npo_rejected: 'bg-red-100 text-red-800',
  collection_scheduled: 'bg-amber-100 text-amber-800',
  donation_allocated: 'bg-violet-100 text-violet-800',
  donation_claimed: 'bg-violet-100 text-violet-800',
  npo_under_review: 'bg-slate-100 text-slate-700',
  impact_report_generated: 'bg-teal-100 text-teal-800',
};

function when(clientAt: string): string {
  const d = new Date(clientAt);
  return Number.isNaN(d.getTime()) ? clientAt : d.toLocaleString();
}

export function AuditTrailView() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(ALL);
  const [chain, setChain] = useState<AuditChainResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const unsub = listenAuditEntries((items) => {
      setEntries(items);
      setLoading(false);
    }, { limit: 200 });
    return () => unsub();
  }, []);

  // A new write invalidates a previous verdict; never show a stale "verified".
  useEffect(() => { setChain(null); }, [entries.length]);

  const entities = useMemo(
    () => [...new Set(entries.map((e) => e.entity))].sort(),
    [entries],
  );
  const shown = useMemo(
    () => (filter === ALL ? entries : entries.filter((e) => e.entity === filter)),
    [entries, filter],
  );

  const runVerify = async () => {
    setVerifying(true);
    try {
      setChain(await verifyAuditChain(entries));
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading activity trail…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" /> Activity Trail ({shown.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All records</SelectItem>
                {entities.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={verifying || entries.length === 0} onClick={runVerify}>
              {verifying
                ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                : chain?.ok ? <ShieldCheck className="h-4 w-4 mr-1" /> : <ShieldAlert className="h-4 w-4 mr-1" />}
              Verify integrity
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500">
            Append-only journal of every state change in the food-rescue workflow. Actor identity is
            taken from the authenticated session, never from the caller. Entries are chained by
            SHA-256, so edits, reordering and deletions are detectable — truncating the newest
            entries is not, and entries are written by the browser rather than a trusted server,
            so treat this as a strong deterrent and an investigation aid, not a tamper-proof record.
          </p>

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

          {shown.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <ScrollText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {entries.length === 0
                  ? 'No activity recorded yet. Entries appear as partners are verified and batches move through the rescue workflow.'
                  : 'No entries for this record type.'}
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
                  {shown.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap text-xs text-slate-500">{when(e.clientAt)}</td>
                      <td className="py-2 pr-4">
                        <Badge className={ACTION_TONE[e.action] || 'bg-slate-100 text-slate-700'}>
                          {formatStatus(e.action)}
                        </Badge>
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
                        {e.actorRole && <div className="text-slate-500">{e.actorRole}</div>}
                      </td>
                      <td className="py-2 text-xs">
                        {e.summary}
                        <div className="text-slate-400 font-mono">
                          {e.hash ? `sha256:${e.hash.slice(0, 12)}…` : 'no digest'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {entries.length >= 200 && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Showing the 200 most recent entries.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
