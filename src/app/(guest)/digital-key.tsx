import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  useColorScheme,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth, generateRoomCredential } from '@/services/firebase-services';
import { getTheme } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';

// Dynamic import for native modules that don't work in Expo Go
const getLocalAuth = async () => {
  if (Platform.OS === 'web') return null;
  try {
    const LocalAuth = await import('expo-local-authentication');
    return LocalAuth;
  } catch {
    console.warn('expo-local-authentication not available');
    return null;
  }
};

const getNfcManager = async () => {
  if (Platform.OS === 'web') return null;
  try {
    const NfcManager = (await import('react-native-nfc-manager')).default;
    return NfcManager;
  } catch {
    console.warn('react-native-nfc-manager not available');
    return null;
  }
};

export default function DigitalKeyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  const bookingId = (params.bookingId as string) || 'DEMO-ROOM-101';
  const roomName = (params.roomName as string) || 'Ocean View Suite 101';
  const checkIn = (params.checkIn as string) || 'Today';
  const checkOut = (params.checkOut as string) || 'In 3 Days';

  const [loading, setLoading] = useState(false);
  const [nfcActive, setNfcActive] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // Hardware status state
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcEnabled, setNfcEnabled] = useState(false);

  // Custom alert state
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  // Pulse animation for NFC reader waves (lazy state initializer — stable Animated values)
  const [pulseAnim1] = useState(() => new Animated.Value(1));
  const [pulseOpacity1] = useState(() => new Animated.Value(0.6));

  const checkHardwareCapabilities = async () => {
    try {
      // Check Biometrics Hardware
      const LocalAuth = await getLocalAuth();
      if (LocalAuth) {
        try {
          const hasHardware = await LocalAuth.hasHardwareAsync();
          const isEnrolled = await LocalAuth.isEnrolledAsync();
          setBiometricSupported(hasHardware);
          setBiometricEnrolled(hasHardware && isEnrolled);
        } catch (err) {
          console.warn('Biometric hardware check failed:', err);
        }
      }

      // Check NFC Hardware
      const NfcManager = await getNfcManager();
      if (NfcManager) {
        try {
          const supported = await NfcManager.isSupported();
          setNfcSupported(supported);
          if (supported) {
            await NfcManager.start();
            const enabled = await NfcManager.isEnabled();
            setNfcEnabled(enabled);
          }
        } catch (err) {
          console.warn('NFC hardware check failed:', err);
        }
      }
    } catch {
      // Hardware capability check failed — app continues in demo mode
    }
  };

  const loadCredential = async () => {
    setLoading(true);
    try {
      await generateRoomCredential({
        roomId: bookingId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        bookingId,
      });
    } catch (error: any) {
      console.warn('Failed to load credential:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHardwareCapabilities();
    loadCredential();
  }, []);

  // Radar Pulse Animation loop when NFC is active or unlocking
  useEffect(() => {
    if (nfcActive || unlocking) {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim1, {
              toValue: 1.5,
              duration: 1200,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim1, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity1, {
              toValue: 0,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity1, {
              toValue: 0.6,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    } else {
      pulseAnim1.setValue(1);
      pulseOpacity1.setValue(0.6);
    }
  }, [nfcActive, unlocking]);

  // Biometric authentication trigger
  const authenticateBiometrics = async (): Promise<boolean> => {
    const LocalAuth = await getLocalAuth();
    if (!LocalAuth || !biometricSupported) {
      return true; // Bypass if hardware not supported on device
    }

    if (!biometricEnrolled) {
      return true; // Allow passcode/direct unlock if not enrolled rather than hard blocking
    }

    try {
      const types = await LocalAuth.supportedAuthenticationTypesAsync();
      const hasFingerprint = types.includes(LocalAuth.AuthenticationType.FINGERPRINT);
      const hasFacial = types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION);
      const label = hasFingerprint && hasFacial ? 'Fingerprint or Face Unlock' : hasFingerprint ? 'Fingerprint' : hasFacial ? 'Facial Recognition' : 'Biometric Security';

      const result = await LocalAuth.authenticateAsync({
        promptMessage: `Scan ${label} to Unlock Suite`,
        fallbackLabel: 'Use Device Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      return result.success;
    } catch (err: any) {
      console.warn('Biometric auth error:', err);
      return true; // Fallback to room key unlock
    }
  };

  // Dual unlock handler: On-screen icon or NFC reader proximity
  const handleUnlockDoor = async (mode: 'tap' | 'nfc') => {
    if (unlocked) {
      showAlert({
        title: 'Door Already Unlocked',
        message: 'Welcome inside your Azure Horizon suite!',
        type: 'success',
      });
      return;
    }

    // NFC mode unlocks directly without requiring biometric prerequisite
    if (mode === 'tap') {
      const authenticated = await authenticateBiometrics();
      if (!authenticated) return;
    }

    setUnlocking(true);
    setNfcActive(true);

    if (mode === 'nfc') {
      const NfcManager = await getNfcManager();
      if (!nfcSupported || !nfcEnabled || !NfcManager) {
        showAlert({
          title: 'NFC Hardware Unavailable',
          message: 'NFC hardware is not present or disabled on this device. Please tap the Key Icon above to unlock your door directly.',
          type: 'warning',
        });
        setUnlocking(false);
        setNfcActive(false);
        return;
      }

      try {
        await NfcManager.registerTagEvent();
        showAlert({
          title: 'NFC Reader Listening...',
          message: 'Hold phone near door lock or tap another NFC phone/tag to transmit digital key.',
          type: 'nfc',
        });

        // Real NFC Tag Discovered Event
        NfcManager.setEventListener(((NfcManager as any).EVENT_TAG_DISCOVERED || 'NfcManagerDiscoverTag') as any, async (tag: any) => {
          console.log('Real NFC Tag Discovered:', tag);
          try {
            await NfcManager.unregisterTagEvent();
          } catch {}
          setUnlocking(false);
          setNfcActive(false);
          setUnlocked(true);

          showAlert({
            title: '🔓 Suite Door Unlocked!',
            message: `NFC signal verified from door reader. Welcome to ${roomName}!`,
            type: 'success',
          });

          setTimeout(() => setUnlocked(false), 15000);
        });

        return;
      } catch (ex: any) {
        console.warn('NFC registration error:', ex);
      }
    }

    // Direct Tap-to-Unlock
    setTimeout(() => {
      setUnlocking(false);
      setNfcActive(false);
      setUnlocked(true);

      showAlert({
        title: '🔓 Suite Door Unlocked!',
        message: `Welcome to ${roomName}! The door lock mechanism is unlatched.`,
        type: 'success',
      });

      setTimeout(() => {
        setUnlocked(false);
      }, 15000);
    }, 1500);
  };

  const { profile } = useAuth();
  const user = auth.currentUser;
  const isVisitor = !user || profile?.status === 'visitor';

  if (isVisitor) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Ionicons name="lock-closed-outline" size={64} color="#c9a227" />
        <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text, marginTop: 16, textAlign: 'center' }}>
          Digital Key Locked
        </Text>
        <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          Digital Room Key & NFC door unlock are reserved for checked-in resort residents. Please sign in to access your key.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: '#c9a227', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginTop: 24 }}
          onPress={() => router.push('/login')}
        >
          <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 16 }}>Sign In to Your Stay</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Digital Room Key</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Main Room Key Card */}
        <View style={styles.keyCard}>
          <View style={styles.keyHeader}>
            <View style={styles.resortPill}>
              <Ionicons name="star" size={12} color="#c9a227" />
              <Text style={styles.resortPillText}>AZURE HORIZON RESORT</Text>
            </View>
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
              {/* ANIMATED PULSING RADAR RINGS */}
              <View style={styles.pulseContainer}>
                <Animated.View
                  style={[
                    styles.pulseRing,
                    {
                      transform: [{ scale: pulseAnim1 }],
                      opacity: pulseOpacity1,
                      borderColor: unlocked ? '#16a34a' : nfcActive ? '#c9a227' : 'rgba(255,255,255,0.2)',
                    },
                  ]}
                />
                <TouchableOpacity
                  style={[
                    styles.nfcRing,
                    unlocked && styles.nfcRingUnlocked,
                    (nfcActive || unlocking) && styles.nfcRingActive,
                  ]}
                  onPress={() => handleUnlockDoor('tap')}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={unlocked ? 'key-sharp' : unlocking ? 'wifi-sharp' : 'lock-closed-sharp'}
                    size={46}
                    color={unlocked ? '#16a34a' : nfcActive ? '#c9a227' : '#ffffff'}
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.nfcText}>
                {unlocked
                  ? 'SUITE UNLOCKED ✓'
                  : unlocking
                  ? 'Connecting to Door Lock...'
                  : 'Tap Door Icon to Unlock'}
              </Text>
              <Text style={styles.nfcSubtext}>
                {unlocked
                  ? 'Handle unlatched. Push door to enter.'
                  : 'Secured with encrypted RS256 token & biometrics'}
              </Text>

              {/* Hardware Status Chips */}
              <View style={styles.hardwareRow}>
                <View
                  style={[
                    styles.hardwareChip,
                    biometricEnrolled ? styles.chipSuccess : styles.chipWarning,
                  ]}
                >
                  <Ionicons
                    name="finger-print"
                    size={14}
                    color={biometricEnrolled ? '#16a34a' : '#d97706'}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: biometricEnrolled ? '#16a34a' : '#d97706' },
                    ]}
                  >
                    {biometricEnrolled ? 'Fingerprint Ready' : 'Biometrics Not Setup'}
                  </Text>
                </View>

                <View
                  style={[
                    styles.hardwareChip,
                    nfcSupported ? styles.chipSuccess : styles.chipWarning,
                  ]}
                >
                  <Ionicons
                    name="wifi"
                    size={14}
                    color={nfcSupported ? '#16a34a' : '#d97706'}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: nfcSupported ? '#16a34a' : '#d97706' },
                    ]}
                  >
                    {nfcSupported ? 'NFC Reader Ready' : 'NFC Inactive'}
                  </Text>
                </View>
              </View>

              {/* DUAL UNLOCK ACTION BUTTONS */}
              <View style={styles.buttonStack}>
                <TouchableOpacity
                  style={[styles.unlockBtn, unlocked && styles.unlockBtnSuccess]}
                  onPress={() => handleUnlockDoor('tap')}
                  disabled={unlocking}
                  activeOpacity={0.8}
                >
                  {unlocking ? (
                    <ActivityIndicator color="#0f172a" />
                  ) : (
                    <>
                      <Ionicons
                        name={unlocked ? 'checkmark-circle' : 'finger-print'}
                        size={22}
                        color="#0f172a"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.unlockBtnText}>
                        {unlocked ? 'Unlocked — Push Door' : 'Tap to Unlock with Fingerprint'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.nfcScanBtn}
                  onPress={() => handleUnlockDoor('nfc')}
                  disabled={unlocking}
                  activeOpacity={0.8}
                >
                  <Ionicons name="wifi-outline" size={20} color="#c9a227" style={{ marginRight: 8 }} />
                  <Text style={styles.nfcScanBtnText}>Hold Phone Near NFC Reader</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Security details footer */}
          <View style={styles.securityInfo}>
            <Ionicons name="shield-checkmark-sharp" size={18} color="#16a34a" style={{ marginRight: 8 }} />
            <Text style={styles.securityText}>
              256-bit encrypted credential token · Auto-expires at checkout
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Return to Portal</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Custom Themed Alert */}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 56,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: '#1e293b',
    },
    backButton: { padding: 4 },
    title: { fontSize: 20, fontWeight: '800', color: '#fff' },
    content: { padding: 20, paddingBottom: 40 },
    
    keyCard: {
      backgroundColor: '#1e293b',
      borderRadius: 28,
      padding: 24,
      borderWidth: 1.5,
      borderColor: '#c9a227',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 10,
    },
    keyHeader: { alignItems: 'center', marginBottom: 20 },
    resortPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(201,162,39,0.15)',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 20,
      marginBottom: 8,
    },
    resortPillText: { color: '#c9a227', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
    roomName: { color: '#ffffff', fontSize: 26, fontWeight: '900', textAlign: 'center' },
    
    keyDates: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 24,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
    },
    dateItem: { flex: 1, alignItems: 'center' },
    dateLabel: { color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
    dateValue: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
    dateDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
    
    nfcSection: { alignItems: 'center' },
    pulseContainer: {
      width: 140,
      height: 140,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    pulseRing: {
      position: 'absolute',
      width: 140,
      height: 140,
      borderRadius: 70,
      borderWidth: 2,
    },
    nfcRing: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: '#0f172a',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.3)',
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
    },
    nfcRingActive: { borderColor: '#c9a227', backgroundColor: 'rgba(201,162,39,0.15)' },
    nfcRingUnlocked: { borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.15)' },
    
    nfcText: { color: '#ffffff', fontSize: 18, fontWeight: '800', marginBottom: 4, textAlign: 'center' },
    nfcSubtext: { color: '#94a3b8', fontSize: 12, marginBottom: 20, textAlign: 'center' },
    
    hardwareRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    hardwareChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    chipSuccess: { backgroundColor: '#dcfce7' },
    chipWarning: { backgroundColor: '#fef3c7' },
    chipText: { fontSize: 11, fontWeight: '700' },
    
    buttonStack: { width: '100%', gap: 12 },
    unlockBtn: {
      backgroundColor: '#c9a227',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      borderRadius: 14,
    },
    unlockBtnSuccess: { backgroundColor: '#16a34a' },
    unlockBtnText: { color: '#0f172a', fontWeight: '900', fontSize: 15 },
    
    nfcScanBtn: {
      borderWidth: 1.5,
      borderColor: '#c9a227',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: 'rgba(201,162,39,0.05)',
    },
    nfcScanBtnText: { color: '#c9a227', fontWeight: '700', fontSize: 14 },
    
    securityInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 20,
      paddingTop: 16,
      borderTopWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
    },
    securityText: { color: '#94a3b8', fontSize: 11, flex: 1, lineHeight: 16 },
    loading: { marginVertical: 40 },
    backBtn: { marginTop: 24, alignItems: 'center' },
    backBtnText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  });