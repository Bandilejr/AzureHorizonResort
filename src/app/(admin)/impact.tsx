// (admin) UC40 — Impact report.
// REMEDIATED Phase C (§27): validated date range → metrics → tappable NPO
// breakdown → per-NPO collected batches in period (full traceability to the
// individual batch). Share HTML escapes all stored values.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { listenDonationBatches, listenNpoPartners, computeImpactReport, type ImpactReport } from '@/services/increment2-services';
import { todayISO, addDaysISO } from '@/utils/dates';
import type { DonationBatch, NpoPartner } from '@/types/increment2';
import { IMPACT_MEALS_PER_KG, IMPACT_CARBON_KG_PER_KG } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, KV, SectionTitle, LiveErrorBanner } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());

export default function AdminImpactScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const [batches, setBatches] = useState<DonationBatch[]>([]);
  const [npos, setNpos] = useState<NpoPartner[]>([]);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [start, setStart] = useState(() => addDaysISO(todayISO(), -30));
  const [end, setEnd] = useState(() => todayISO());
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [drillNpo, setDrillNpo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => {
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenDonationBatches(setBatches, undefined, onErr);
    const u2 = listenNpoPartners(setNpos, onErr);
    return () => { u1(); u2(); };
  }, [retryKey]);

  const orgName = (npoId: string) =>
    npos.find((n) => n.npoId === npoId)?.organisationName || npoId;

  const calculate = () => {
    if (!validDay(start) || !validDay(end)) {
      showAlert({ title: 'Invalid dates', message: 'Use YYYY-MM-DD for both start and end.', type: 'error' });
      return;
    }
    if (end < start) {
      showAlert({ title: 'Invalid range', message: 'End date must be on or after start date.', type: 'error' });
      return;
    }
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
      const rows = report.byNpo.map((n) =>
        `<tr><td>${esc(orgName(n.npoId))}</td><td>${n.batches}</td><td>${n.kg}</td><td>${n.meals}</td></tr>`).join('');
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
    } finally {
      setBusy(false);
    }
  };

  const metrics: [string, number | string][] = report ? [
    ['Donated kg', report.totalDonatedKg], ['Collected kg', report.totalCollectedKg],
    ['Meals diverted', report.mealsDiverted], ['CO₂e offset kg', report.carbonOffsetKg],
    ['NPOs served', report.npoCount], ['Batches', report.batchCount], ['Completion', `${report.completionRate}%`],
  ] : [];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(admin)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Impact Report</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.half]} value={start} onChangeText={setStart} placeholder="Start YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted} />
        <TextInput style={[styles.input, styles.half]} value={end} onChangeText={setEnd} placeholder="End YYYY-MM-DD" placeholderTextColor={theme.colors.textMuted} />
      </View>
      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.small, styles.primary]} onPress={calculate}>
          <Text style={styles.buttonText}>Calculate</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.small, styles.secondary]} disabled={!report || busy} onPress={share}>
          <Text style={styles.secondaryText}>{busy ? 'Working…' : 'Share report'}</Text>
        </TouchableOpacity>
      </View>
      {!report && <Text style={styles.muted}>Select a period and calculate metrics from live data.</Text>}
      {report && (
        <>
          <View style={styles.grid}>
            {metrics.map(([label, value]) => (
              <View key={label} style={styles.stat}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.muted}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.section}>NPO breakdown — tap for batches</Text>
          {report.byNpo.length === 0 && <Text style={styles.muted}>No collected batches in period.</Text>}
          {report.byNpo.map((n) => (
            <TouchableOpacity key={n.npoId} style={styles.card} onPress={() => setDrillNpo(n.npoId)} activeOpacity={0.7}>
              <Text style={styles.cardTitle}>{orgName(n.npoId)}</Text>
              <Text style={styles.muted}>{n.batches} batches · {n.kg}kg · {n.meals} meals</Text>
              <Text style={styles.review}>Tap for batch detail ›</Text>
            </TouchableOpacity>
          ))}
          <Text style={styles.muted}>Section 18A: verify each NPO&apos;s PBO number before issuing certificates.</Text>
        </>
      )}

      <DetailModal visible={drillNpo !== null} title={drillNpo ? orgName(drillNpo) : ''} onClose={() => setDrillNpo(null)}>
        <SectionTitle>COLLECTED BATCHES IN PERIOD ({drillNpo ? drillBatches(drillNpo).length : 0})</SectionTitle>
        {drillNpo && drillBatches(drillNpo).length === 0 && <Text style={styles.muted}>No batches found.</Text>}
        {drillNpo && drillBatches(drillNpo).map((b) => (
          <View key={b.id} style={styles.batch}>
            <Text style={styles.cardTitle}>{b.batchId} — {b.itemName}</Text>
            <Text style={styles.muted}>{b.portionCount} portions · {b.estimatedWeightKg}kg · collected {b.collectedAt ? new Date(b.collectedAt).toLocaleDateString() : '—'}</Text>
            <KV label="Facility" value={b.receivingFacility || '—'} />
          </View>
        ))}
      </DetailModal>
      <View style={{ height: 40 }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  section: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, color: theme.colors.text, marginBottom: 10, backgroundColor: theme.colors.surface },
  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  small: { padding: 12, borderRadius: 10, flex: 1, alignItems: 'center' },
  primary: { backgroundColor: theme.colors.primary },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: theme.colors.primary },
  secondaryText: { color: theme.colors.primary, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { minWidth: '30%', flex: 1, backgroundColor: theme.colors.surface, borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  statValue: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  card: { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTitle: { color: theme.colors.text, fontWeight: '700' },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
  batch: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 8 },
});