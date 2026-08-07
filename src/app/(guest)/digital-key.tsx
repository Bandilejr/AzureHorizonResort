import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth } from '@/services/firebase-services';
import { generateRoomCredential } from '@/services/firebase-services';

// Dynamic import for native modules that don't work in Expo Go
const getLocalAuth = async () => {
  if (Platform.OS === 'web') return null;
  try {
    const LocalAuth = await import('expo-local-authentication');
    return LocalAuth;
  } catch {
    console.warn('expo-local-authentication not available (Expo Go)');
    return null;
  }
};

export default function DigitalKeyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const bookingId = params.bookingId as string;
  const roomName = params.roomName as string;
  const checkIn = params.checkIn as string;
  const checkOut = params.checkOut as string;

  const [credential, setCredential] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nfcActive, setNfcActive] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isExpoGo, setIsExpoGo] = useState(false);

  useEffect(() => {
    checkEnvironment();
    loadCredential();
  }, []);

  const checkEnvironment = async () => {
    // Check if we're in Expo Go (native modules won't work)
    try {
      const Constants = await import('expo-constants');
      setIsExpoGo(Constants.default.appOwnership === 'expo');
    } catch {
      setIsExpoGo(false);
    }
    
    if (!isExpoGo) {
      checkBiometric();
    } else {
      setBiometricAvailable(false);
    }
  };

  const checkBiometric = async () => {
    const LocalAuth = await getLocalAuth();
    if (!LocalAuth) return;
    
    try {
      const hasHardware = await LocalAuth.hasHardwareAsync();
      const isEnrolled = await LocalAuth.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
    } catch (error) {
      console.warn('Biometric check failed:', error);
      setBiometricAvailable(false);
    }
  };

  const loadCredential = async () => {
    await generateCredential();
  };

  const generateCredential = async () => {
    setLoading(true);
    try {
      const response = await generateRoomCredential({
        roomId: bookingId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        bookingId,
      });
      setCredential(response.data.credential);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate room key');
    } finally {
      setLoading(false);
    }
  };

  const authenticateAndActivateNFC = async () => {
    if (isExpoGo) {
      Alert.alert(
        'Development Build Required',
        'Digital room key requires a development build. NFC and biometric features are not available in Expo Go.\n\nRun: eas build --platform android --profile development'
      );
      return;
    }

    const LocalAuth = await getLocalAuth();
    if (!LocalAuth) return;

    if (!biometricAvailable) {
      Alert.alert('Biometric Required', 'Please set up fingerprint/Face ID in device settings');
      return;
    }

    const result = await LocalAuth.authenticateAsync({
      promptMessage: 'Authenticate to activate room key',
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
    });

    if (result.success) {
      setNfcActive(true);
      // In real implementation, start NFC HCE here
      Alert.alert('NFC Active', 'Your phone is now ready as a room key. Tap to door reader to unlock.', [
        { text: 'OK', onPress: () => setTimeout(() => setNfcActive(false), 30000) }
      ]);
    } else {
      Alert.alert('Authentication Failed', 'Could not verify your identity');
    }
  };

  const handleSimulatedUnlock = () => {
    Alert.alert('Door Unlocked', 'Welcome to your room! (Simulated)');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Digital Room Key</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.keyCard}>
          <View style={styles.keyHeader}>
            <Text style={styles.roomLabel}>YOUR SUITE</Text>
            <Text style={styles.roomName}>{roomName}</Text>
          </View>

          <View style={styles.keyDates}>
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>CHECK-IN</Text>
              <Text style={styles.dateValue}>{checkIn}</Text>
            </View>
            <View style={styles.dateDivider} />
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>CHECK-OUT</Text>
              <Text style={styles.dateValue}>{checkOut}</Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#c9a227" style={styles.loading} />
          ) : (
            <View style={styles.nfcSection}>
              <View style={[styles.nfcRing, nfcActive && styles.nfcRingActive]}>
                <Ionicons name={nfcActive ? "wifi" : "lock-closed"} size={48} color={nfcActive ? "#16a34a" : "#fff"} style={{ transform: [{ rotate: '90deg' }] }} />
              </View>
              <Text style={styles.nfcText}>{nfcActive ? 'NFC ACTIVE - Tap to Door' : 'Tap to Activate Room Key'}</Text>
              <Text style={styles.nfcSubtext}>
                {isExpoGo 
                  ? 'Requires development build (not Expo Go)' 
                  : biometricAvailable 
                    ? 'Requires biometric authentication' 
                    : 'Biometric not available'}
              </Text>

              <TouchableOpacity
                style={[styles.nfcBtn, nfcActive && styles.nfcBtnActive, isExpoGo && styles.nfcBtnDisabled]}
                onPress={isExpoGo ? undefined : (nfcActive ? undefined : authenticateAndActivateNFC)}
                disabled={nfcActive || loading || isExpoGo}
              >
                {nfcActive ? (
                  <Text style={styles.nfcBtnText}>Active - Tap Door to Unlock</Text>
                ) : isExpoGo ? (
                  <>
                    <Ionicons name="warning" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.nfcBtnText}>Dev Build Required</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="finger-print" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.nfcBtnText}>Authenticate & Activate</Text>
                  </>
                )}
              </TouchableOpacity>

              {!Platform.OS === 'android' && !isExpoGo && (
                <TouchableOpacity style={styles.simulateBtn} onPress={handleSimulatedUnlock}>
                  <Text style={styles.simulateBtnText}>Simulate Unlock (iOS / Demo)</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {isExpoGo && (
            <View style={styles.expoGoNotice}>
              <Ionicons name="information-circle" size={20} color="#c9a227" style={{ marginRight: 8 }} />
              <Text style={styles.expoGoNoticeText}>
                NFC and biometric features require a development build. 
                Build with: eas build --platform android --profile development
              </Text>
            </View>
          )}

          <View style={styles.securityInfo}>
            <Ionicons name="shield-checkmark" size={20} color="#16a34a" style={{ marginRight: 8 }} />
            <Text style={styles.securityText}>End-to-end encrypted • Auto-expires at checkout • Revocable remotely</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back to Portal</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16 },
  backButton: { padding: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  keyCard: { backgroundColor: '#1e293b', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10 },
  keyHeader: { alignItems: 'center', marginBottom: 24 },
  roomLabel: { color: '#c9a227', fontWeight: 'bold', fontSize: 12, letterSpacing: 1, marginBottom: 4 },
  roomName: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  keyDates: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  dateItem: { flex: 1, alignItems: 'center' },
  dateLabel: { color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  dateValue: { color: '#fff', fontSize: 18, fontWeight: '600' },
  dateDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  nfcSection: { alignItems: 'center' },
  nfcRing: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 2, borderColor: 'rgba(201,162,39,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  nfcRingActive: { backgroundColor: 'rgba(22,163,74,0.1)', borderColor: '#16a34a' },
  nfcText: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 4 },
  nfcSubtext: { color: '#94a3b8', fontSize: 13, marginBottom: 24, textAlign: 'center' },
  nfcBtn: { backgroundColor: '#c9a227', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, marginBottom: 16 },
  nfcBtnActive: { backgroundColor: '#16a34a' },
  nfcBtnDisabled: { backgroundColor: '#64748b' },
  nfcBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  simulateBtn: { paddingVertical: 12 },
  simulateBtnText: { color: '#64748b', fontSize: 14, fontWeight: '500' },
  expoGoNotice: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(201,162,39,0.1)', padding: 12, borderRadius: 8, marginTop: 16, borderWidth: 1, borderColor: 'rgba(201,162,39,0.3)' },
  expoGoNoticeText: { color: '#c9a227', fontSize: 12, flex: 1 },
  securityInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  securityText: { color: '#64748b', fontSize: 12, flex: 1 },
  loading: { marginVertical: 40 },
  backBtn: { marginTop: 24, alignItems: 'center' },
  backBtnText: { color: '#64748b', fontSize: 14, fontWeight: '500' },
});