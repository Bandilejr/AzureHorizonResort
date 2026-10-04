// Food Rescue & Social Impact Report. Reuses getProfessionalPDFHTML pipeline.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, Leaf } from 'lucide-react';
import {
  listenDonationBatches, listenDonationCheckins, computeImpactReport,
} from '@/services/increment2-services';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '@/utils/pdfGenerator';
import { writeAuditEntry } from '@/services/audit-services';
import { AUDIT_ACTIONS } from '@/types/index';
import { IMPACT_MEALS_PER_KG, IMPACT_CARBON_KG_PER_KG } from '@/types/increment2';
import type { DonationBatch, DonationCheckin, ImpactReport } from '@/types/increment2';

export function ImpactReportView() {
  const [batches, setBatches] = useState<DonationBatch[]>([]);
  const [checkins, setCheckins] = useState<DonationCheckin[]>([]);
  const [start, setStart] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u1 = listenDonationBatches(setBatches);
    const u2 = listenDonationCheckins(setCheckins);
    return () => { u1(); u2(); };
  }, []);

  const run = () => setReport(computeImpactReport(batches, checkins, start, end));

  const exportPdf = async () => {
    if (!report) return;
    setBusy(true);
    try {
      const html = getProfessionalPDFHTML({
        title: 'FOOD RESCUE & SOCIAL IMPACT REPORT',
        guestName: 'Azure Horizon Resort',
        details: [
          { label: 'Period', value: `${report.periodStart} → ${report.periodEnd}` },
          { label: 'Donated (kg)', value: String(report.totalDonatedKg) },
          { label: 'Collected (kg)', value: String(report.totalCollectedKg) },
          { label: 'Meals diverted (est.)', value: String(report.mealsDiverted) },
          { label: 'Carbon offset (kg CO₂e, est.)', value: String(report.carbonOffsetKg) },
          { label: 'NPOs served', value: String(report.npoCount) },
          { label: 'Batches', value: String(report.batchCount) },
          { label: 'Completion rate', value: `${report.completionRate}%` },
          { label: 'Method', value: `Meals = kg × ${IMPACT_MEALS_PER_KG}; CO₂e = kg × ${IMPACT_CARBON_KG_PER_KG} (estimates)` },
        ],
        items: report.byNpo.map((n) => ({ name: n.npoId, quantity: n.batches, price: n.kg, subtotal: n.meals })),
        total: report.totalCollectedKg,
        footer: 'Section 18A: donations to approved PBOs may qualify for tax certificates — confirm NPO PBO numbers with finance before issuing certificates. Metrics are estimates.',
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
        },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Leaf className="h-5 w-5" /> Impact Report</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div><Label>Start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>End</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <Button onClick={run}>Calculate</Button>
          <Button variant="outline" disabled={!report || busy} onClick={exportPdf}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />} Export PDF
          </Button>
        </div>
        {!report && <p className="text-sm text-slate-400 text-center py-6">Select a period and calculate metrics</p>}
        {report && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Donated kg', report.totalDonatedKg], ['Collected kg', report.totalCollectedKg],
                ['Meals diverted', report.mealsDiverted], ['CO₂e offset kg', report.carbonOffsetKg],
                ['NPOs served', report.npoCount], ['Batches', report.batchCount],
                ['Completion', `${report.completionRate}%`],
              ].map(([label, value]) => (
                <div key={label as string} className="border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-semibold mb-2">NPO breakdown</p>
              {report.byNpo.length === 0 && <p className="text-xs text-slate-400">No collected batches in period.</p>}
              {report.byNpo.map((n) => (
                <div key={n.npoId} className="flex justify-between text-sm border-b py-2">
                  <span className="font-mono">{n.npoId}</span>
                  <span><Badge>{n.batches} batches</Badge> <span className="text-slate-500">{n.kg}kg · {n.meals} meals</span></span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">Section 18A information: only donations to SARS-approved PBOs with valid PBO numbers qualify. Verify each NPO's PBO number on the verification queue before issuing certificates.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
