import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, Camera } from 'expo-camera';
import { validateLoyaltyQR, redeemVoucherByStaff, awardLoyaltyPoints, auth } from '@/services/firebase-services';
import { getTheme } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { useRouter } from 'expo-router';

export default function LoyaltyScannerScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const { profile } = useAuth();
  // Loyalty redemption is hotel-ops (event_manager / admin), not Increment-2 staff UCs.
  const canScan = profile?.role === 'admin' || profile?.subRole === 'event_manager';

  const [hasPermission, setHasPermission] = useState<null | boolean>(null);
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [voucherResult, setVoucherResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isExpoGo, setIsExpoGo] = useState(false);
  const [awarding, setAwarding] = useState(false);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const checkEnvironment = async () => {
    try {
      const Constants = await import('expo-constants');
      setIsExpoGo(Constants.default.appOwnership === 'expo');
    } catch {
      setIsExpoGo(false);
    }

    if (!isExpoGo) {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    } else {
      setHasPermission(false);
    }
  };

  useEffect(() => {
    if (!canScan) return;
    checkEnvironment();
  }, [canScan]);

  if (!canScan) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, padding: 20, paddingTop: 80 }]}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: theme.colors.text }}>Loyalty Scanner</Text>
        <Text style={{ fontSize: 14, color: theme.colors.textMuted, marginTop: 12 }}>
          Loyalty redemption is for Admin / Event Manager roles. Not part of your staff tools.
        </Text>
        <TouchableOpacity style={{ marginTop: 20, alignSelf: 'flex-start' }} onPress={() => router.back()}>
          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);
    setResult(null);
    setVoucherResult(null);

    try {
      let parsed: any = null;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = null;
      }

      // Check if this is a Reward Voucher QR (contains voucherCode or rewardTitle)
      if (parsed && (parsed.voucherCode || parsed.rewardTitle)) {
        const staffUid = auth.currentUser?.uid || 'staff';
        const res: any = await redeemVoucherByStaff(parsed.voucherCode, staffUid);
        setVoucherResult({
          voucherCode: parsed.voucherCode,
          rewardTitle: parsed.rewardTitle || res.rewardTitle,
          guestName: parsed.guestName || 'Guest',
          pts: parsed.pts || res.pointsSpent,
          claimed: true,
        });
        showAlert({
          title: '✅ Reward Voucher Claimed',
          message: `Voucher "${parsed.rewardTitle}" for ${parsed.guestName} has been successfully validated and marked as redeemed in Firestore.`,
          type: 'success',
        });
      } else {
        // Standard Loyalty Member QR
        const response = await validateLoyaltyQR({ qrPayload: data });
        if (response.data.valid) {
          setResult(response.data.guest);
        } else {
          showAlert({
            title: 'Invalid QR Code',
            message: response.data.message || 'QR code validation failed.',
            type: 'error',
            onConfirm: () => { setScanned(false); setResult(null); }
          });
        }
      }
    } catch (error: any) {
      showAlert({
        title: 'Validation Error',
        message: error.message || 'Failed to validate QR code. Please check code or try manual entry.',
        type: 'error',
        onConfirm: () => { setScanned(false); setResult(null); }
      });
    } finally {
      setLoading(false);
    }
  };

  // Award Points to Guest
  const handleAwardPoints = async (ptsToAward: number) => {
    if (!result) return;
    setAwarding(true);
    try {
      const targetDocId = result.id || result.uid || result.email || '';
      const guestId = result.uid || result.id || '';

      const { newPoints, newTier } = await awardLoyaltyPoints(
        targetDocId,
        guestId,
        ptsToAward,
        `Awarded +${ptsToAward} visit points by resort staff`
      );

      setResult((prev: any) => ({
        ...prev,
        loyaltyPoints: newPoints,
        loyaltyTier: newTier,
      }));

      showAlert({
        title: '🎉 Points Awarded Instantly!',
        message: `Awarded +${ptsToAward} points to ${result.name}.\nNew Total: ${newPoints} pts (${newTier.toUpperCase()} Tier).\n\nThe resident's screen has updated live in real-time!`,
        type: 'success',
      });
    } catch (error: any) {
      showAlert({
        title: 'Error Awarding Points',
        message: error.message || 'Could not award points.',
        type: 'error',
      });
    } finally {
      setAwarding(false);
    }
  };

  const handleManualRedeem = async () => {
    if (!manualCode.trim()) {
      showAlert({
        title: 'Input Required',
        message: 'Please enter a valid voucher code (e.g. AZURE-REWARD-XXXXXX).',
        type: 'warning',
      });
      return;
    }

    setLoading(true);
    try {
      const staffUid = auth.currentUser?.uid || 'staff';
      const res: any = await redeemVoucherByStaff(manualCode, staffUid);
      setVoucherResult({
        voucherCode: res.voucherCode || manualCode.toUpperCase(),
        rewardTitle: res.rewardTitle || 'Food/Reward Coupon',
        guestName: 'Verified Guest',
        pts: res.pointsSpent || 0,
        claimed: true,
      });
      setManualCode('');
      showAlert({
        title: '✅ Voucher Redeemed',
        message: `Voucher for "${res.rewardTitle || 'Food Coupon'}" is valid and marked as claimed!`,
        type: 'success',
      });
    } catch (error: any) {
      showAlert({
        title: 'Voucher Error',
        message: error.message || 'Voucher code is invalid or already redeemed.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Waiter & Staff Redemption</Text>
          <Text style={styles.subtitle}>Scan member QR or food coupon voucher</Text>
        </View>
      </View>

      {/* Camera / Notice */}
      <View style={styles.scannerContainer}>
        {hasPermission ? (
          <CameraView
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.noCameraView}>
            <Ionicons name="qr-code-outline" size={48} color="#c9a227" style={{ marginBottom: 12 }} />
            <Text style={styles.noCamText}>
              {isExpoGo ? 'QR Scanner requires development APK build' : 'Camera permission required'}
            </Text>
          </View>
        )}

        <View style={styles.overlay}>
          <View style={styles.scanFrame}>
            <View style={styles.cornerTopLeft} />
            <View style={styles.cornerTopRight} />
            <View style={styles.cornerBottomLeft} />
            <View style={styles.cornerBottomRight} />
          </View>
          <Text style={styles.scanText}>Point camera at member QR or food voucher</Text>
        </View>
      </View>

      {/* Manual Code Input Bar for Staff */}
      <View style={styles.manualBar}>
        <Text style={styles.manualTitle}>Manual Voucher Code Override</Text>
        <View style={styles.manualInputRow}>
          <TextInput
            style={styles.manualInput}
            placeholder="Enter code (e.g. AZURE-REWARD-12345)"
            placeholderTextColor="#64748b"
            value={manualCode}
            onChangeText={setManualCode}
            autoCapitalize="characters"
          />
          <TouchableOpacity style={styles.manualBtn} onPress={handleManualRedeem} disabled={loading}>
            {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.manualBtnText}>Validate</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* Results View */}
      {(result || voucherResult) && (
        <View style={styles.resultCard}>
          <Ionicons name="checkmark-circle-sharp" size={48} color="#16a34a" />
          <Text style={styles.resultName}>
            {voucherResult ? voucherResult.rewardTitle : result?.name}
          </Text>

          {voucherResult ? (
            <View style={styles.voucherBadge}>
              <Text style={styles.voucherBadgeText}>REWARD COUPON CLAIMED ✓</Text>
              <Text style={styles.voucherDetail}>Guest: {voucherResult.guestName}</Text>
              <Text style={styles.voucherDetail}>Code: {voucherResult.voucherCode}</Text>
            </View>
          ) : (
            <View style={styles.resultDetails}>
              <Text style={styles.resultDetail}>Tier: {result?.loyaltyTier?.toUpperCase()} Member</Text>
              <Text style={styles.resultDetail}>Points Balance: {result?.loyaltyPoints} pts</Text>

              {/* Staff Award Points Buttons */}
              <View style={styles.awardRow}>
                <TouchableOpacity
                  style={styles.awardBtn}
                  onPress={() => handleAwardPoints(50)}
                  disabled={awarding}
                >
                  {awarding ? (
                    <ActivityIndicator color="#0f172a" size="small" />
                  ) : (
                    <>
                      <Ionicons name="add-circle" size={16} color="#0f172a" />
                      <Text style={styles.awardBtnText}>Award +50 Pts</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.awardBtn, { backgroundColor: theme.colors.secondary }]}
                  onPress={() => handleAwardPoints(100)}
                  disabled={awarding}
                >
                  <Ionicons name="add-circle" size={16} color="#ffffff" />
                  <Text style={[styles.awardBtnText, { color: '#ffffff' }]}>Award +100 Pts</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.scanAgainBtn}
            onPress={() => { setScanned(false); setResult(null); setVoucherResult(null); }}
          >
            <Text style={styles.scanAgainBtnText}>Scan Next Code</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Custom Alert */}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.text },
    headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, gap: 12, backgroundColor: '#1e293b' },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 20, fontWeight: '800', color: '#fff' },
    subtitle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },

    scannerContainer: { flex: 1, position: 'relative' },
    noCameraView: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: theme.colors.text },
    noCamText: { color: theme.colors.textMuted, fontSize: 14, textAlign: 'center' },

    overlay: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.4)' },
    scanFrame: { width: 240, height: 240, position: 'relative', borderRadius: 20 },
    cornerTopLeft: { position: 'absolute', top: 0, left: 0, width: 30, height: 30, borderTopWidth: 4, borderLeftWidth: 4, borderColor: theme.colors.primary, borderTopLeftRadius: 16 },
    cornerTopRight: { position: 'absolute', top: 0, right: 0, width: 30, height: 30, borderTopWidth: 4, borderRightWidth: 4, borderColor: theme.colors.primary, borderTopRightRadius: 16 },
    cornerBottomLeft: { position: 'absolute', bottom: 0, left: 0, width: 30, height: 30, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: theme.colors.primary, borderBottomLeftRadius: 16 },
    cornerBottomRight: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderBottomWidth: 4, borderRightWidth: 4, borderColor: theme.colors.primary, borderBottomRightRadius: 16 },
    scanText: { color: '#ffffff', marginTop: 24, fontSize: 14, fontWeight: '600', backgroundColor: 'rgba(15,23,42,0.7)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },

    manualBar: { padding: 16, backgroundColor: '#1e293b', borderTopWidth: 1, borderColor: '#334155' },
    manualTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    manualInputRow: { flexDirection: 'row', gap: 10 },
    manualInput: { flex: 1, backgroundColor: theme.colors.text, borderWidth: 1, borderColor: '#334155', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14 },
    manualBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 20, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    manualBtnText: { color: theme.colors.text, fontWeight: '800', fontSize: 14 },

    resultCard: { position: 'absolute', bottom: 90, left: 20, right: 20, backgroundColor: '#1e293b', borderRadius: 24, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: theme.colors.success, elevation: 10 },
    resultName: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 6, textAlign: 'center' },
    voucherBadge: { marginTop: 12, backgroundColor: 'rgba(22,163,74,0.15)', padding: 12, borderRadius: 12, alignItems: 'center', width: '100%' },
    voucherBadgeText: { color: theme.colors.success, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
    voucherDetail: { color: '#cbd5e1', fontSize: 13, marginTop: 4 },
    resultDetails: { width: '100%', marginTop: 10, alignItems: 'center', gap: 4 },
    resultDetail: { fontSize: 14, color: '#cbd5e1', fontWeight: '600' },

    awardRow: { flexDirection: 'row', gap: 10, marginTop: 12, width: '100%' },
    awardBtn: { flex: 1, backgroundColor: theme.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
    awardBtnText: { color: theme.colors.text, fontWeight: '800', fontSize: 13 },

    scanAgainBtn: { backgroundColor: '#334155', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, marginTop: 14 },
    scanAgainBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  });