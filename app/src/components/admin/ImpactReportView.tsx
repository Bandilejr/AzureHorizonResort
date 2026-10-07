// Food Rescue & Social Impact Report. Reuses getProfessionalPDFHTML pipeline.
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Loader2, Download, Leaf, Scale, Utensils, Cloud, Building2, PackageCheck,
  TrendingUp, Trophy, ShieldCheck,
} from 'lucide-react';
import {
  listenDonationBatches, listenDonationCheckins, computeImpactReport,
} from '@/services/increment2-services';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '@/utils/pdfGenerator';
import { writeAuditEntry } from '@/services/audit-services';
import { AUDIT_ACTIONS } from '@/types/index';
import { EMISSION_FACTOR_PROVENANCE } from '@/types/increment2';
import type { DonationBatch, DonationCheckin, ImpactReport } from '@/types/increment2';

const round1 = (n: number) => Math.round(n * 10) / 10;
const trimId = (id: string) => (id.length > 18 ? `${id.slice(0, 16)}…` : id);
// Keeps axis ticks short enough that the labels are never clipped.
const compact = (n: number) =>
  Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : `${Math.round(n * 10) / 10}`;

// Lifted for the dark navy panel: the previous #1e3a5f navy and #0d9488 teal
// were tuned for a white card and read as near-invisible here.
const KG_FILL = '#93c5fd';
const MEALS_FILL = '#5eead4';

// First day the resort can have data: the app's own first release. Anything
  // earlier is a typo rather than a real reporting period.
  const EARLIEST = '2024-01-01';

export function ImpactReportView() {
  const [batches, setBatches] = useState<DonationBatch[]>([]);
  const [checkins, setCheckins] = useState<DonationCheckin[]>([]);
  // Local-date helpers. toISOString() is UTC, so on a UTC+2 machine it names
  // the PREVIOUS day for any local time before 02:00 — which silently shifted
  // the default range by a day. Date strings here are calendar days in the
  // viewer's own timezone, matching what a date input shows.
  const toLocalDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toLocalDate(d);
  });
  const [end, setEnd] = useState(() => toLocalDate(new Date()));
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [busy, setBusy] = useState(false);
  const today = toLocalDate(new Date());

  useEffect(() => {
    const u1 = listenDonationBatches(setBatches);
    const u2 = listenDonationCheckins(setCheckins);
    return () => { u1(); u2(); };
  }, []);

  // Guards the period before anything is computed or exported. Comparison is on
  // the raw YYYY-MM-DD strings, which sort lexicographically, so no Date
  // parsing or timezone can skew it.
  const dateError = (() => {
    if (!start || !end) return 'Both dates are required.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 'Enter valid dates.';
    if (start > end) return 'Start date must be on or before the end date.';
    if (end > today) return 'End date cannot be in the future.';
    if (start < EARLIEST) return `No data before ${EARLIEST}.`;
    return null;
  })();

  const run = () => {
    if (dateError) return;
    setReport(computeImpactReport(batches, checkins, start, end));
  };

  // Presentation-only shaping of the computed report. Nothing here recomputes a
  // metric: computeImpactReport() stays the single source of truth and the PDF
  // pipeline below is untouched.
  const chart = useMemo(() => {
    if (!report) return null;
    const byNpo = [...report.byNpo]
      .sort((a, b) => b.kg - a.kg)
      .map((n) => ({
        ...n,
        sharePct: report.totalCollectedKg ? (n.kg / report.totalCollectedKg) * 100 : 0,
      }));
    const outstanding = Math.max(0, report.totalDonatedKg - report.totalCollectedKg);
    // Both segments are always kept for the legend so a label can never vanish;
    // only non-zero segments are handed to the pie renderer.
    const weightSplit = [
      { name: 'Collected', value: round1(report.totalCollectedKg), fill: '#34d399' },
      { name: 'Awaiting collection', value: round1(outstanding), fill: '#64748b' },
    ];
    const weightSlices = weightSplit.filter((d) => d.value > 0);
    return {
      byNpo,
      top: byNpo[0] ?? null,
      weightSplit,
      weightSlices,
      hasWeight: weightSlices.length > 0,
      collectedSharePct: report.totalDonatedKg
        ? Math.round((report.totalCollectedKg / report.totalDonatedKg) * 100)
        : 0,
    };
  }, [report]);

  const exportPdf = async () => {
    if (!report) return;
    setBusy(true);
    try {
      const html = getProfessionalPDFHTML({
        title: 'FOOD RESCUE & SOCIAL IMPACT REPORT',
        guestName: 'Azure Horizon Resort',
        details: [
          { label: 'Period', value: `${report.periodStart} → ${report.periodEnd}` },
          { label: 'Donated (kg) [measured]', value: String(report.totalDonatedKg) },
          { label: 'Collected (kg) [measured]', value: String(report.totalCollectedKg) },
          { label: 'Meals provided [measured]', value: String(report.mealsDiverted) },
          {
            label: 'Carbon avoided (kg CO₂e) [modelled]',
            value: String(report.carbonOffsetKg),
          },
          { label: 'NPOs served', value: String(report.npoCount) },
          { label: 'Batches logged', value: String(report.batchCount) },
          { label: 'Completion rate', value: `${report.completionRate}%` },
          { label: 'Collection confirmations', value: String(report.confirmedCollections) },
          { label: 'Confirmed weight (kg)', value: String(report.confirmedCollectedKg) },
          { label: 'Seal-verified collections', value: String(report.sealVerifiedCollections) },
          { label: 'Offline-scanned collections', value: String(report.offlineScannedCollections) },
          {
            label: 'Avg time to collection',
            value: report.avgHoursToCollection === null ? 'n/a' : `${round1(report.avgHoursToCollection)} h`,
          },
          {
            label: 'Unverified collected weight (kg)',
            value: String(report.unverifiedCollectedKg),
          },
        ],
        items: report.byNpo.map((n) => ({ name: n.npoId, quantity: n.batches, price: n.kg, subtotal: n.meals })),
        total: report.totalCollectedKg,
        // The PDF is the artefact that leaves the resort, so the assumptions
        // travel with it. A reader must be able to tell which figures are
        // counted and which are multiplied by an assumed factor, without having
        // to ask whoever produced it.
        footer: [
          'BASIS OF FIGURES. Weight, batches, meal portions, collection confirmations and seal checks are counted from operational records.',
          `Carbon avoided is MODELLED: collected kg × ${report.assumptions.emissionKgCo2ePerKg} (${EMISSION_FACTOR_PROVENANCE.unit}). ${report.assumptions.emissionFactorBasis}`,
          report.assumptions.mealsFallbackUsed
            ? 'Some batches recorded no portion count; meals for those batches were estimated from weight.'
            : 'Meal counts are the portions recorded by the kitchen on each batch.',
          report.unverifiedCollectedKg > 0
            ? `WARNING: ${report.unverifiedCollectedKg} kg is marked collected without a handover confirmation and is excluded from confirmed weight.`
            : 'All collected weight is covered by a handover confirmation.',
          'Section 18A: donations to approved PBOs may qualify for tax certificates — confirm NPO PBO numbers with finance before issuing certificates.',
        ].join(' '),
      });
      await generatePDFFromHTML(html, `Impact_Report_${report.periodStart}_${report.periodEnd}.pdf`);
      await writeAuditEntry({
        action: AUDIT_ACTIONS.impactReportGenerated,
        entity: 'impact_reports',
        entityId: `${report.periodStart}_${report.periodEnd}`,
        beforeStatus: null,
        afterStatus: 'exported',
        summary: `Impact report exported for ${report.periodStart} → ${report.periodEnd}`,
        metadata: {
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          totalDonatedKg: report.totalDonatedKg,
          totalCollectedKg: report.totalCollectedKg,
          mealsDiverted: report.mealsDiverted,
          carbonOffsetKg: report.carbonOffsetKg,
          npoCount: report.npoCount,
          batchCount: report.batchCount,
          // Record which factors produced these figures, so a later reader can
          // tell whether a carbon number was generated under a different
          // emission factor than the one currently configured.
          emissionKgCo2ePerKg: report.assumptions.emissionKgCo2ePerKg,
          carbonIsUnsourcedEstimate: report.assumptions.carbonIsUnsourcedEstimate,
          confirmedCollections: report.confirmedCollections,
          unverifiedCollectedKg: report.unverifiedCollectedKg,
        },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    // Both the class and the inline style set the same navy. The class is what
    // the rest of the admin uses; the inline style is belt-and-braces in case
    // class resolution is the thing that failed on the user's machine.
    <Card
      className="border-none bg-[#1e3a5f] text-white shadow-xl"
      style={{ backgroundColor: '#1e3a5f' }}
    >
      <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Leaf className="h-5 w-5" /> Impact Report</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-blue-200">Start</Label>
            {/* max=end stops the browser picker offering a start after the end
                date outright; the dateError check below still guards typing. */}
            <Input
              type="date"
              value={start}
              max={end}
              min={EARLIEST}
              onChange={(e) => setStart(e.target.value)}
              aria-invalid={!!dateError}
              className="bg-white/10 text-white border-white/20 [color-scheme:dark]"
            />
          </div>
          <div>
            <Label className="text-blue-200">End</Label>
            <Input
              type="date"
              value={end}
              min={start}
              max={today}
              onChange={(e) => setEnd(e.target.value)}
              aria-invalid={!!dateError}
              className="bg-white/10 text-white border-white/20 [color-scheme:dark]"
            />
          </div>
          <Button onClick={run} disabled={!!dateError} className="bg-[#c9a227] hover:bg-[#b8941f] text-white">
            Calculate
          </Button>
          <Button
            variant="outline"
            disabled={!report || busy}
            onClick={exportPdf}
            className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />} Export PDF
          </Button>
        </div>
        {dateError && (
          <p role="alert" className="text-sm text-red-300 bg-red-500/15 border border-red-400/40 rounded px-3 py-2">
            {dateError}
          </p>
        )}
        {!dateError && !report && <p className="text-sm text-blue-100/70 text-center py-6">Select a period and calculate metrics</p>}
        {report && chart && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-blue-100/80">
                {report.periodStart} → {report.periodEnd}
              </p>
              <p className="text-xs text-blue-100/60">
                Batches logged in period · collections confirmed by handover record
              </p>
            </div>

            {/* Headline impact. Labelled measured vs modelled so a modelled
                figure is never read as a recorded one. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Donated', value: `${round1(report.totalDonatedKg)}`, unit: 'kg', basis: 'measured' as const, icon: Scale, tint: 'text-slate-100 bg-white/15' },
                { label: 'Rescued', value: `${round1(report.totalCollectedKg)}`, unit: 'kg', basis: 'measured' as const, icon: PackageCheck, tint: 'text-emerald-200 bg-emerald-400/20' },
                { label: 'Meals provided', value: report.mealsDiverted.toLocaleString(), unit: 'meals', basis: 'measured' as const, icon: Utensils, tint: 'text-teal-200 bg-teal-400/20' },
                {
                  label: 'CO₂e avoided',
                  value: `${round1(report.carbonOffsetKg)}`,
                  unit: 'kg',
                  basis: report.assumptions.carbonIsUnsourcedEstimate ? ('modelled' as const) : ('measured' as const),
                  icon: Cloud,
                  tint: 'text-sky-200 bg-sky-400/20',
                },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-white/10 bg-white/5 p-4 text-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${k.tint}`}>
                      <k.icon className="h-4 w-4" strokeWidth={2.25} />
                    </div>
                    <span
                      title={
                        k.basis === 'measured'
                          ? 'Counted from operational records'
                          : 'Measured weight multiplied by an assumed emission factor'
                      }
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        k.basis === 'measured'
                          ? 'bg-emerald-400/20 text-emerald-200'
                          : 'bg-amber-400/20 text-amber-200'
                      }`}
                    >
                      {k.basis}
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums leading-none text-white">{k.value}</p>
                  <p className="mt-1 text-xs font-medium text-blue-100/70">{k.unit} {k.label.toLowerCase()}</p>
                </div>
              ))}
            </div>

            {/* Collection evidence: the reconciliation between what the batch
                record claims and what a handover record confirms. */}
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-white space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2 text-white">
                <ShieldCheck className="h-4 w-4 text-blue-200" /> Collection evidence
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'Confirmations', value: report.confirmedCollections.toLocaleString() },
                  { label: 'Confirmed weight', value: `${round1(report.confirmedCollectedKg)} kg` },
                  { label: 'Seal verified', value: report.sealVerifiedCollections.toLocaleString() },
                  { label: 'Offline scans', value: report.offlineScannedCollections.toLocaleString() },
                  {
                    label: 'Avg time to collection',
                    value: report.avgHoursToCollection === null ? '—' : `${round1(report.avgHoursToCollection)} h`,
                  },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-lg font-bold tabular-nums text-white">{s.value}</p>
                    <p className="text-xs text-blue-100/70">{s.label}</p>
                  </div>
                ))}
              </div>
              {report.unverifiedCollectedKg > 0 && (
                <p className="text-xs text-amber-200 bg-amber-400/10 border border-amber-400/30 rounded px-3 py-2">
                  {round1(report.unverifiedCollectedKg)} kg is marked collected but has no handover
                  confirmation. The batch record and the collection record disagree — worth
                  reconciling before these figures are published.
                </p>
              )}
              {report.assumptions.mealsFallbackUsed && (
                <p className="text-xs text-amber-200">
                  Some batches recorded no portion count, so meals for those batches were estimated
                  from weight.
                </p>
              )}
            </div>

            {/* Collection completion + top partner */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-white">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2 text-white">
                    <TrendingUp className="h-4 w-4 text-blue-200" /> Collection completion
                  </p>
                  <span className="text-lg font-bold tabular-nums text-white">{report.completionRate}%</span>
                </div>
                <Progress
                  value={report.completionRate}
                  className="mt-3 h-2 bg-white/20"
                  indicatorClassName="bg-teal-400"
                />
                <p className="mt-2 text-xs text-blue-100/70">
                  Share of logged batches that completed collection in this period.
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-white">
                <p className="text-sm font-semibold flex items-center gap-2 text-white">
                  <Trophy className="h-4 w-4 text-amber-300" /> Largest recipient
                </p>
                {chart.top ? (
                  <div className="mt-3">
                    <p className="font-mono text-sm text-white">{chart.top.npoId}</p>
                    <p className="mt-1 text-sm text-blue-100/80">
                      <span className="font-semibold text-white">{round1(chart.top.kg)} kg</span> across{' '}
                      {chart.top.batches} batch{chart.top.batches === 1 ? '' : 'es'} ·{' '}
                      {chart.top.meals.toLocaleString()} meals
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-blue-100/70">No collected batches in period.</p>
                )}
              </div>
            </div>

            {/* Charts: weight outcome + per-partner contribution */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-white lg:col-span-1">
                <p className="text-sm font-semibold text-white">Weight outcome</p>
                {chart.hasWeight ? (
                  <>
                    {/* The chart keeps symmetric margins so its centre stays at
                        50%/50%, which lets the readout overlay sit exactly in the
                        donut hole. Previously negative margins pulled two separate
                        lines over the ring and they collided. */}
                    <div className="relative mt-2 h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                          <Pie
                            data={chart.weightSlices}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            startAngle={90}
                            endAngle={-270}
                            innerRadius="52%"
                            outerRadius="82%"
                            paddingAngle={2}
                            stroke="#1e3a5f"
                            strokeWidth={2}
                            isAnimationActive={false}
                          >
                            {chart.weightSlices.map((d) => (
                              <Cell key={d.name} fill={d.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v: unknown, n) => [`${v} kg`, String(n)]}
                            contentStyle={{
                              fontSize: 12, borderRadius: 8,
                              backgroundColor: '#0f2440', border: '1px solid rgba(255,255,255,0.15)',
                              color: '#ffffff',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <p className="text-base font-bold leading-tight tabular-nums text-white">
                          {round1(report.totalCollectedKg)} kg
                        </p>
                        <p className="mt-0.5 text-[11px] leading-tight text-blue-100/70">
                          {chart.collectedSharePct}% collected
                        </p>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {chart.weightSplit.map((d) => (
                        <li key={d.name} className="flex items-center justify-between text-xs text-blue-100/80">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-sm"
                              style={{ backgroundColor: d.fill }}
                            />
                            {d.name}
                          </span>
                          <span className="font-mono tabular-nums text-white">{d.value} kg</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="mt-3 flex h-48 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-white/25 bg-white/5">
                    <p className="text-sm font-medium text-white">No data available</p>
                    <p className="px-6 text-center text-xs text-blue-100/70">
                      No donated or collected weight was logged in this period.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-white lg:col-span-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold flex items-center gap-2 text-white">
                    <Building2 className="h-4 w-4 text-blue-200" /> Contribution by partner
                  </p>
                  <div className="flex items-center gap-3 text-xs text-blue-100/80">
                    <span className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: KG_FILL }} /> kg (bottom axis)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MEALS_FILL }} /> meals (top axis)
                    </span>
                  </div>
                </div>
                {chart.byNpo.length === 0 ? (
                  <p className="mt-4 text-sm text-blue-100/70">No collected batches in period.</p>
                ) : (
                  <div className="mt-3 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      {/* kg and meals differ by ~2.5x, so on one shared axis the kg
                          bars collapse to a sliver. Each Bar declares BOTH xAxisId
                          and yAxisId: recharts looks the ids up on the Bar itself
                          and throws if a declared axis has no matching component. */}
                      <BarChart
                        data={chart.byNpo}
                        layout="vertical"
                        margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" horizontal={false} />
                        <XAxis
                          xAxisId="kg"
                          type="number"
                          stroke="#93c5fd"
                          tick={{ fill: '#bfdbfe', fontSize: 11 }}
                          tickFormatter={compact}
                        />
                        <XAxis
                          xAxisId="meals"
                          type="number"
                          orientation="top"
                          stroke="#5eead4"
                          tick={{ fill: '#99f6e4', fontSize: 11 }}
                          tickFormatter={compact}
                        />
                        <YAxis
                          yAxisId="partner"
                          type="category"
                          dataKey="npoId"
                          width={150}
                          stroke="#93c5fd"
                          tick={{ fill: '#bfdbfe', fontSize: 11 }}
                          tickFormatter={trimId}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(255,255,255,0.08)' }}
                          contentStyle={{
                            fontSize: 12, borderRadius: 8,
                            backgroundColor: '#0f2440', border: '1px solid rgba(255,255,255,0.15)',
                            color: '#ffffff',
                          }}
                          formatter={(v: unknown, n, p) => [
                            n === 'meals' ? `${Number(v).toLocaleString()} meals` : `${v} kg`,
                            n === 'meals' ? 'Meals provided' : 'Weight (kg)',
                            `${(p?.payload as { batches?: number })?.batches ?? 0} batches`,
                          ]}
                        />
                        <Bar xAxisId="kg" yAxisId="partner" dataKey="kg" fill={KG_FILL} radius={[0, 4, 4, 0]} barSize={9} />
                        <Bar xAxisId="meals" yAxisId="partner" dataKey="meals" fill={MEALS_FILL} radius={[0, 4, 4, 0]} barSize={9} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Detailed per-partner table */}
            <div>
              <p className="text-sm font-semibold mb-2 text-white">NPO breakdown</p>
              {report.byNpo.length === 0 && (
                <p className="text-xs text-blue-100/70">No collected batches in period.</p>
              )}
              {report.byNpo.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full text-sm text-white">
                    <thead className="bg-white/10">
                      <tr className="text-left text-blue-100/80">
                        <th className="px-3 py-2 font-medium">Partner</th>
                        <th className="px-3 py-2 font-medium">Batches</th>
                        <th className="px-3 py-2 font-medium">Confirmed</th>
                        <th className="px-3 py-2 font-medium text-right">Weight</th>
                        <th className="px-3 py-2 font-medium text-right">Meals</th>
                        <th className="px-3 py-2 font-medium">Share of kg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chart.byNpo.map((n) => (
                        <tr key={n.npoId} className="border-t border-white/10 bg-white/5">
                          <td className="px-3 py-2 font-mono">{n.npoId}</td>
                          <td className="px-3 py-2">
                            <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/15">{n.batches}</Badge>
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {n.confirmations > 0 ? (
                              <span className="text-emerald-200">{n.confirmations}</span>
                            ) : (
                              <span className="text-amber-200/80" title="No handover confirmation">0</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{round1(n.kg)} kg</td>
                          <td className="px-3 py-2 text-right tabular-nums">{n.meals.toLocaleString()}</td>
                          <td className="px-3 py-2 w-44">
                            <div className="flex items-center gap-2">
                              <Progress
                                value={n.kg}
                                className="h-2 bg-white/20"
                                indicatorClassName="bg-teal-400"
                              />
                              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-blue-100/80">
                                {Math.round(n.sharePct)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-xs text-blue-100/60">
              Weight, batches, meal portions and collection confirmations are counted from
              operational records. Carbon avoided is modelled: collected kg ×{' '}
              {report.assumptions.emissionKgCo2ePerKg}
              {report.assumptions.carbonIsUnsourcedEstimate
                ? ' — currently an operator-set planning estimate with no external dataset cited.'
                : ` — ${report.assumptions.emissionFactorBasis}`}{' '}
              Section 18A: only donations to SARS-approved PBOs with valid PBO
              numbers qualify — verify each partner&apos;s PBO number on the verification queue before
              issuing certificates.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
