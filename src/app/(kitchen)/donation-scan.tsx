// UC39 mobile — Donation collection scan. Reuses CameraView + donation QR chain.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, Camera } from 'expo-camera';
import { verifyCollectionFromMobile } from '@/services/increment2-services';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return Math.abs(h).toString(36);
}

export default function DonationScanScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  const [hasPermission, setHasPermission] = useState<null | boolean>(null);
  const [scanned, setScanned] = useState(false);
  const [qr, setQr] = useState('');
  const [courier, setCourier] = useState('');
  const [signature, setSignature] = useState('');
  const [seal, setSeal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

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
  };

  const verify = async () => {
    if (!qr.trim()) { showAlert({ title: 'QR required', message: 'Scan or paste the collection pass.', type: 'error' }); return; }
    if (!seal) { showAlert({ title: 'Seal check required', message: 'Confirm physical seal integrity before dispatch.', type: 'error' }); return; }
    setLoading(true);
    // Offline-first: no connectivity → queue server-ready payload (no file URIs)
    // with deterministic idempotency key; replay collapses on reconnect.
    try {
      const NetInfo = (await import('@react-native-community/netinfo')).default;
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        // Deterministic key: same QR re-queued offline collapses (no duplicates).
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
        showAlert({ title: 'Queued offline', message: 'No connection — verification will replay automatically on reconnect.', type: 'info' });
        return;
      }
    } catch { /* fall through to live verify */ }
    try {
      const res = await verifyCollectionFromMobile({
        qrPayload: qr.trim(), sealVerified: seal, courierName: courier, signature,
      });
      showAlert({
        title: res.ok ? 'Dispatch complete' : 'Verification failed',
        message: res.message,
        type: res.ok ? 'success' : 'error',
        onConfirm: () => { if (res.ok) { setQr(''); setScanned(false); } },
      });
    } catch (e: any) {
      showAlert({ title: 'Verification failed', message: e?.message || 'Could not verify.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(kitchen)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Donation Collection Scan</Text>
      </View>
      {hasPermission ? (
        <View style={styles.scannerBox}>
          <CameraView style={styles.scanner} facing="back" onBarcodeScanned={scanned ? undefined : handleScan} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} />
          {scanned && (
            <TouchableOpacity style={styles.rescan} onPress={() => setScanned(false)}>
              <Text style={styles.rescanText}>Tap to scan again</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.deniedBox}>
          <Ionicons name="camera-outline" size={28} color={theme.colors.textMuted} />
          <Text style={styles.hint}>Camera unavailable — use manual entry below.</Text>
          {hasPermission === false && (
            <TouchableOpacity style={styles.settingsBtn} onPress={async () => { const Linking = await import('expo-linking'); Linking.openSettings(); }}>
              <Text style={styles.settingsBtnText}>Open app settings</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <TextInput style={styles.input} value={qr} onChangeText={setQr} placeholder="Collection pass (manual entry)" placeholderTextColor={theme.colors.textMuted} multiline />
      <TextInput style={styles.input} value={courier} onChangeText={setCourier} placeholder="Courier name *" placeholderTextColor={theme.colors.textMuted} />
      <TextInput style={styles.input} value={signature} onChangeText={setSignature} placeholder="Courier signature (type full name) *" placeholderTextColor={theme.colors.textMuted} />
      <View style={styles.row}>
        <Text style={styles.label}>Seal integrity confirmed</Text>
        <Switch value={seal} onValueChange={setSeal} />
      </View>
      {loading ? <ActivityIndicator size="large" color={theme.colors.primary} /> : (
        <TouchableOpacity style={styles.button} onPress={verify}>
          <Text style={styles.buttonText}>Verify & complete dispatch</Text>
        </TouchableOpacity>
      )}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  deniedBox: { alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderRadius: 12, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.border },
  settingsBtn: { marginTop: 4, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: theme.colors.primary },
  settingsBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  scannerBox: { height: 260, borderRadius: 12, overflow: 'hidden', marginBottom: 12, backgroundColor: '#000' },
  scanner: { flex: 1 },
  rescan: { position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8 },
  rescanText: { color: '#fff' },
  hint: { color: theme.colors.textMuted, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, color: theme.colors.text, marginBottom: 10, backgroundColor: theme.colors.surface },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  label: { color: theme.colors.text },
  button: { backgroundColor: theme.colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
