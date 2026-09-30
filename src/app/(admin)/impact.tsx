// (admin) UC40 — Impact report. Layer 8 presentation rebuild; computeImpactReport
// unchanged. Date range via pickers; raw npoId never shown (falls back to a
// neutral label). Share HTML escapes all stored values.
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { listenDonationBatches, listenNpoPartners, computeImpactReport, type ImpactReport } from '@/services/increment2-services';
import { todayISO, addDaysISO } from '@/utils/dates';
import { dateToStored, storedDateToDate } from '@/utils/datetime-input';
import type { DonationBatch, NpoPartner } from '@/types/increment2';
import { IMPACT_MEALS_PER_KG, IMPACT_CARBON_KG_PER_KG } from '@/types/increment2';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { MetricCard } from '@/components/ui/metric-card';
import { ProgressRing } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, KV, SectionTitle, LiveErrorBanner } from '@/components/detail-kit';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

type PickerTarget = 'start' | 'end' | null;

export default function AdminImpactScreen() {
  const theme = useAppTheme();
  const [batches, setBatches] = useState<DonationBatch[]>([]);
  const [npos, setNpos] = useState<NpoPartner[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [start, setStart] = useState(() => addDaysISO(todayISO(), -30));
  const [end, setEnd] = useState(() => todayISO());
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [drillNpo, setDrillNpo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => {
    setLoadError('');
    setLoaded(false);
    const onErr = (e: Error) => { setLoadError(e.message); setLoaded(true); };
    const u1 = listenDonationBatches((l) => { setBatches(l); setLoaded(true); }, undefined, onErr);
    const u2 = listenNpoPartners(setNpos, onErr);
    return () => { u1(); u2(); };
  }, [retryKey]);

  const orgName = (npoId: string) => npos.find((n) => n.npoId === npoId)?.organisationName || 'Unknown organisation';

  const calculate = () => {
    if (end < start) { showAlert({ title: 'Invalid range', message: 'End date must be on or after start date.', type: 'error' }); return; }
    setReport(computeImpactReport(batches, start, end));
  };

  const drillBatches = (npoId: string) => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime() + 86400000;
    return batches.filter((b) =>
      b.status === 'collected_completed'
      && (b.allocatedNpoId || 'unknown') === npoId
      && new Date(b.createdAt).getTime() >= s && new Date(b.createdAt).getTime() < e);
  };

  const share = async () => {
    if (!report) return;
    setBusy(true);
    try {
      const rows = report.byNpo.map((n) => `<tr><td>${esc(orgName(n.npoId))}</td><td>${n.batches}</td><td>${n.kg}</td><td>${n.meals}</td></tr>`).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Food Rescue Impact Report</title></head><body style="font-family:sans-serif;padding:24px">` +
        `<h1>Food Rescue &amp; Social Impact Report</h1><p>Azure Horizon Resort · ${esc(report.periodStart)} → ${esc(report.periodEnd)}</p>` +
        `<ul><li>Donated: ${report.totalDonatedKg} kg</li><li>Collected: ${report.totalCollectedKg} kg</li>` +
        `<li>Meals diverted (est.): ${report.mealsDiverted}</li><li>Carbon offset (kg CO₂e, est.): ${report.carbonOffsetKg}</li>` +
        `<li>NPOs served: ${report.npoCount}</li><li>Batches: ${report.batchCount}</li><li>Completion: ${report.completionRate}%</li></ul>` +
        `<h2>NPO breakdown</h2><table border="1" cellpadding="6"><tr><th>NPO</th><th>Batches</th><th>Kg</th><th>Meals</th></tr>${rows}</table>` +
        `<p><small>Method: meals = kg × ${IMPACT_MEALS_PER_KG}; CO₂e = kg × ${IMPACT_CARBON_KG_PER_KG} (estimates). Section 18A: only SARS-approved PBOs qualify — verify PBO numbers with finance.</small></p>` +
        `</body></html>`;
      const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
      const fileUri = `${cacheDir}impact_${report.periodStart}_${report.periodEnd}.html`;
      await FileSystem.writeAsStringAsync(fileUri, html);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/html', dialogTitle: 'Food Rescue Impact Report' });
      } else {
        showAlert({ title: 'Report ready', message: 'Sharing is unavailable on this device.', type: 'warning' });
      }
    } catch (e: any) {
      showAlert({ title: 'Share failed', message: e?.message || 'Could not generate report.', type: 'error' });
    } finally { setBusy(false); }
  };

  const pretty = (iso: string) => storedDateToDate(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Screen scroll>
      <PageHeader title="Impact reports" subtitle="Food rescue & social impact" showBack fallback="/(admin)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      {!loaded ? (
        <ListSkeleton rows={2} />
      ) : loadError && batches.length === 0 ? (
        <ErrorState title="Couldn't load impact data" message="Impact data is unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setPicker('start')}>
              <Card padding="md" style={{ alignItems: 'center' }}>
                <AppText variant="micro" tone="muted">FROM</AppText>
                <AppText variant="bodyStrong">{pretty(start)}</AppText>
              </Card>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setPicker('end')}>
              <Card padding="md" style={{ alignItems: 'center' }}>
                <AppText variant="micro" tone="muted">TO</AppText>
                <AppText variant="bodyStrong">{pretty(end)}</AppText>
              </Card>
            </TouchableOpacity>
          </View>
          {picker === 'start' ? <DateTimePicker value={storedDateToDate(start)} mode="date" display="default" onChange={(_, d) => { setPicker(null); if (d) setStart(dateToStored(d)); }} /> : null}
          {picker === 'end' ? <DateTimePicker value={storedDateToDate(end)} mode="date" display="default" onChange={(_, d) => { setPicker(null); if (d) setEnd(dateToStored(d)); }} /> : null}

          <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.md }}>
            <Button label="Calculate" onPress={calculate} fullWidth={false} style={{ flex: 1 }} />
            <Button label={busy ? 'Working…' : 'Share report'} variant="secondary" onPress={share} disabled={!report} loading={busy} fullWidth={false} style={{ flex: 1 }} />
          </View>

          {!report ? (
            <EmptyState icon="bar-chart-outline" title="No report yet" message="Select a period and calculate metrics from live data." />
          ) : (
            <>
              <SectionHeader title="Summary" />
              <Card style={{ alignItems: 'center', gap: theme.space.md }}>
                <ProgressRing value={report.completionRate / 100} centerLabel={`${report.completionRate}%`} centerCaption="completion" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md, width: '100%' }}>
                  <MetricCard value={report.totalCollectedKg} label="Collected kg" tone="success" />
                  <MetricCard value={report.mealsDiverted} label="Meals diverted" tone="primary" />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md, width: '100%' }}>
                  <MetricCard value={report.totalDonatedKg} label="Donated kg" tone="info" />
                  <MetricCard value={report.carbonOffsetKg} label="CO₂e offset kg" tone="accent" />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md, width: '100%' }}>
                  <MetricCard value={report.npoCount} label="NPOs served" />
                  <MetricCard value={report.batchCount} label="Batches" />
                </View>
              </Card>

              <SectionHeader title="NPO breakdown" />
              {report.byNpo.length === 0 ? (
                <AppText variant="body" tone="muted">No collected batches in period.</AppText>
              ) : (
                <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
                  {report.byNpo.map((n, i) => (
                    <View key={n.npoId} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
                      <ListRow
                        title={orgName(n.npoId)}
                        subtitle={`${n.batches} batches · ${n.kg}kg · ${n.meals} meals`}
                        onPress={() => setDrillNpo(n.npoId)}
                      />
                    </View>
                  ))}
                </Card>
              )}
              <AppText variant="caption" tone="muted" style={{ marginTop: theme.space.sm }}>
                Section 18A: verify each NPO&apos;s PBO number before issuing certificates.
              </AppText>
            </>
          )}
        </>
      )}

      <DetailModal visible={drillNpo !== null} title={drillNpo ? orgName(drillNpo) : ''} onClose={() => setDrillNpo(null)}>
        <SectionTitle>{`COLLECTED BATCHES IN PERIOD (${drillNpo ? drillBatches(drillNpo).length : 0})`}</SectionTitle>
        {drillNpo && drillBatches(drillNpo).length === 0 ? <AppText variant="body" tone="muted">No batches found.</AppText> : null}
        {drillNpo && drillBatches(drillNpo).map((b) => (
          <View key={b.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 8 }}>
            <AppText variant="bodyStrong">{b.batchId} — {b.itemName}</AppText>
            <AppText variant="caption" tone="muted">{b.portionCount} portions · {b.estimatedWeightKg}kg · collected {b.collectedAt ? new Date(b.collectedAt).toLocaleDateString() : '—'}</AppText>
            <KV label="Facility" value={b.receivingFacility || '—'} />
          </View>
        ))}
      </DetailModal>
      <View style={{ height: theme.space['4xl'] }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
