// UC39 mobile — Donation collection scan. Layer 10: token-based UI with a
// dedicated scan surface and explicit [Complete Collection]. The verification
// call and offline queue payload are UNCHANGED; result states map only to what
// verifyCollectionFromMobile actually returns.
import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, Camera } from 'expo-camera';
import { verifyCollectionFromMobile } from '@/services/increment2-services';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/text';

type ResultState = 'verified' | 'invalid' | 'expired' | 'stale' | 'already_used' | 'offline';

// Maps ONLY the messages verifyCollectionFromMobile returns to one of the
// existing result states. No new states are invented.
function classifyResult(message: string): ResultState {
  const m = (message || '').toLowerCase();
  if (/already collected|already used|already recorded/.test(m)) return 'already_used';
  if (/expired/.test(m)) return 'expired';
  if (/no longer current|another loading bay|not opened yet/.test(m)) return 'stale';
  if (/invalid|seal integrity|signature|required|courier name/.test(m)) return 'invalid';
  return 'invalid';
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return Math.abs(h).toString(36);
}

export default function DonationScanScreen() {
  const theme = useAppTheme();

  const [hasPermission, setHasPermission] = useState<null | boolean>(null);
  const [scanned, setScanned] = useState(false);
  const [qr, setQr] = useState('');
  const [courier, setCourier] = useState('');
  const [signature, setSignature] = useState('');
  const [seal, setSeal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ state: ResultState; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const Constants = await import('expo-constants');
        if (Constants.default.appOwnership === 'expo') { setHasPermission(false); return; }
      } catch { /* ignore */ }
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleScan = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setQr(data);
    setResult(null);
  };

  const verify = async () => {
    if (!qr.trim()) { setResult({ state: 'invalid', message: 'Scan or paste the collection pass first.' }); return; }
    if (!seal) { setResult({ state: 'invalid', message: 'Confirm physical seal integrity before dispatch.' }); return; }
    setLoading(true);
    setResult(null);
    // Offline-first: no connectivity → queue server-ready payload (no file URIs)
    // with a deterministic idempotency key; replay collapses on reconnect.
    try {
      const NetInfo = (await import('@react-native-community/netinfo')).default;
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        let key = `scan_${hashStr(qr.trim())}`;
        try {
          const p = JSON.parse(qr.trim());
          if (p.batchDocId && p.nonce) key = `${p.batchDocId}:${p.nonce}`;
        } catch { /* keep content-hash key */ }
        const { offlineQueue } = await import('@/services/offline-queue');
        await offlineQueue.initialize();
        await offlineQueue.enqueue('donation_collection', {
          qrPayload: qr.trim(), sealVerified: seal, courierName: courier, signature, idempotencyKey: key,
        });
        setResult({ state: 'offline', message: 'Queued 14:31 — will sync when connection returns.' });
        return;
      }
    } catch { /* fall through to live verify */ }
    try {
      const res = await verifyCollectionFromMobile({
        qrPayload: qr.trim(), sealVerified: seal, courierName: courier, signature,
      });
      setResult({ state: res.ok ? 'verified' : classifyResult(res.message), message: res.message });
      if (res.ok) { setQr(''); setScanned(false); setSignature(''); setSeal(false); }
    } catch (e: any) {
      setResult({ state: 'invalid', message: e?.message || 'Could not verify the pass.' });
    } finally {
      setLoading(false);
    }
  };

  const resultTone = result?.state === 'verified' ? 'success' : result?.state === 'offline' ? 'info' : 'error';

  return (
    <Screen scroll>
      <PageHeader title="Scan collection pass" subtitle="Verify a collection" showBack fallback="/(kitchen)/dashboard" />

      {hasPermission ? (
        <View style={{ height: 260, borderRadius: theme.radius.lg, overflow: 'hidden', marginBottom: theme.space.md, backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={scanned ? undefined : handleScan} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} />
          {scanned ? (
            <TouchableOpacity style={{ position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.sm }} onPress={() => { setScanned(false); setQr(''); setResult(null); }}>
              <AppText variant="caption" color={theme.colors.textInverse}>Tap to scan again</AppText>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <Card style={{ alignItems: 'center', gap: theme.space.sm, marginBottom: theme.space.md }}>
          <Ionicons name="camera-outline" size={28} color={theme.colors.textMuted} />
          <AppText variant="body" tone="secondary" align="center">Camera access is unavailable. You can still enter the pass manually.</AppText>
          {hasPermission === false ? (
            <Button label="Open settings" variant="secondary" fullWidth={false} onPress={async () => { const Linking = await import('expo-linking'); Linking.openSettings(); }} />
          ) : null}
        </Card>
      )}

      <SectionHeader title="Pass & courier" />
      <View style={{ gap: theme.space.sm }}>
        <Card padding="md">
          <TextInput
            value={qr}
            onChangeText={(v) => { setQr(v); setResult(null); }}
            placeholder="Collection pass (scan or paste)"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            style={{ color: theme.colors.text, fontSize: theme.fontSize.body, minHeight: 48 }}
          />
        </Card>
        <Card padding="md">
          <TextInput value={courier} onChangeText={setCourier} placeholder="Courier name *" placeholderTextColor={theme.colors.textMuted} style={{ color: theme.colors.text, fontSize: theme.fontSize.body }} />
        </Card>
        <Card padding="md">
          <TextInput value={signature} onChangeText={setSignature} placeholder="Courier signature (type full name) *" placeholderTextColor={theme.colors.textMuted} style={{ color: theme.colors.text, fontSize: theme.fontSize.body }} />
        </Card>
        <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.md }}>
          <AppText variant="body" style={{ flex: 1 }}>Seal integrity confirmed</AppText>
          <Switch value={seal} onValueChange={setSeal} />
        </Card>
      </View>

      {result ? (
        <Card style={{ marginTop: theme.space.md, gap: theme.space.sm, borderColor: result.state === 'verified' ? theme.colors.success : result.state === 'offline' ? theme.colors.info : theme.colors.error }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <StatusPill status={result.state} />
            <AppText variant="bodyStrong" tone={resultTone as any}>{result.state === 'verified' ? 'Pass verified' : result.state === 'offline' ? 'Working offline' : 'Not verified'}</AppText>
          </View>
          <AppText variant="body" tone="secondary">{result.message}</AppText>
          {result.state === 'verified' ? <AppText variant="caption" tone="muted">Dispatch complete. The donation batch is marked collected.</AppText> : null}
        </Card>
      ) : null}

      <Button label="Complete Collection" icon="checkmark-done-outline" size="lg" onPress={verify} loading={loading} disabled={!qr.trim() || !seal} style={{ marginTop: theme.space.lg }} />
      <AppText variant="micro" tone="muted" align="center" style={{ marginTop: theme.space.sm }}>
        Completing a collection is final — it marks the batch collected and consumes the pass.
      </AppText>
      <View style={{ height: theme.space['4xl'] }} />
    </Screen>
  );
}
