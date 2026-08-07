import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, Camera } from 'expo-camera';
import { validateLoyaltyQR } from '@/services/firebase-services';

export default function LoyaltyScannerScreen() {
  const [hasPermission, setHasPermission] = useState<null | boolean>(null);
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isExpoGo, setIsExpoGo] = useState(false);

  useEffect(() => {
    checkEnvironment();
  }, []);

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

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    setLoading(true);

    try {
      const response = await validateLoyaltyQR({ qrPayload: data });
      setResult(response.data);
      
      if (response.data.valid) {
        Alert.alert(
          'Validation Successful',
          `Guest: ${response.data.guest.name}\nPoints: ${response.data.guest.loyaltyPoints}\nTier: ${response.data.guest.loyaltyTier}`,
          [{ text: 'Scan Another', onPress: () => { setScanned(false); setResult(null); } }]
        );
      } else {
        Alert.alert(
          'Invalid QR Code',
          response.data.message || 'QR code validation failed',
          [{ text: 'Try Again', onPress: () => { setScanned(false); setResult(null); } }]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to validate QR code');
      setScanned(false);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  if (hasPermission === null) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#c9a227" /></View>;
  }
  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        {isExpoGo ? (
          <View style={styles.expoGoNotice}>
            <Ionicons name="information-circle" size={24} color="#c9a227" style={{ marginBottom: 12 }} />
            <Text style={styles.expoGoNoticeText}>
              QR Scanner requires a development build.\nNot available in Expo Go.
            </Text>
            <Text style={styles.expoGoNoticeSub}>Run: eas build --platform android --profile development</Text>
          </View>
        ) : (
          <View style={styles.noPermissionContainer}>
            <Ionicons name="camera-off" size={48} color="#dc2626" style={{ marginBottom: 12 }} />
            <Text style={styles.noPermission}>Camera permission required for QR scanning</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Loyalty QR Scanner</Text>
        <Text style={styles.subtitle}>Scan guest's rotating loyalty QR code</Text>
      </View>

      <View style={styles.scannerContainer}>
        <CameraView
          onBarcodeScanned={handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'pdf417', 'ean13', 'ean8', 'code128', 'code39', 'code93', 'aztec', 'datamatrix'],
          }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame}>
            <View style={styles.corner} />
            <View style={styles.corner} />
            <View style={styles.corner} />
            <View style={styles.corner} />
          </View>
          <Text style={styles.scanText}>Position QR code within frame</Text>
        </View>
      </View>

      {result?.valid && result?.guest && (
        <View style={styles.resultCard}>
          <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
          <Text style={styles.resultName}>{result.guest.name}</Text>
          <View style={styles.resultDetails}>
            <Text style={styles.resultDetail}><Ionicons name="diamond" size={16} color="#c9a227" style={{marginRight: 8}} /> {result.guest.loyaltyTier} Tier</Text>
            <Text style={styles.resultDetail}><Ionicons name="cash" size={16} color="#c9a227" style={{marginRight: 8}} /> {result.guest.loyaltyPoints} Points</Text>
            {result.guest.roomNumber && result.guest.roomNumber !== 'N/A' && (
              <Text style={styles.resultDetail}><Ionicons name="bed" size={16} color="#c9a227" style={{marginRight: 8}} /> Room {result.guest.roomNumber}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.scanAgainBtn} onPress={() => { setScanned(false); setResult(null); }}>
            <Text style={styles.scanAgainBtnText}>Scan Another</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noPermissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  noPermission: { textAlign: 'center', color: '#fff', fontSize: 16, marginTop: 12 },
  expoGoNotice: { padding: 24, alignItems: 'center', marginHorizontal: 24, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)' },
  expoGoNoticeText: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 8 },
  expoGoNoticeSub: { color: '#c9a227', fontSize: 13, textAlign: 'center', marginTop: 8, fontFamily: 'monospace' },
  header: { position: 'absolute', top: 60, left: 20, right: 20, zIndex: 10 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 4 },
  scannerContainer: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 240, height: 240, borderWidth: 2, borderColor: '#c9a227', borderRadius: 16 },
  corner: { position: 'absolute', width: 20, height: 20, borderWidth: 4, borderColor: '#c9a227' },
  scanText: { color: '#fff', marginTop: 24, fontSize: 16, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  resultCard: { position: 'absolute', bottom: 40, left: 20, right: 20, backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  resultName: { fontSize: 22, fontWeight: 'bold', color: '#1e3a5f', marginTop: 12, marginBottom: 16 },
  resultDetails: { width: '100%', gap: 8 },
  resultDetail: { fontSize: 16, color: '#475569' },
  scanAgainBtn: { backgroundColor: '#1e3a5f', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8, marginTop: 20 },
  scanAgainBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});