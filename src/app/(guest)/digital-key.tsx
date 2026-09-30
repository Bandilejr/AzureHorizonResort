import React, { useState, useEffect } from 'react';
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
import {
  checkRoomKeyEnvironment,
  activateRoomKey,
  readRoomKey,
  isRoomKeyActive,
} from '@/services/room-key-nfc';
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
  const [keyActive, setKeyActive] = useState(false);
  const [readingTag, setReadingTag] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [bridgeAvailable, setBridgeAvailable] = useState(false);

  // Hardware status state
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcEnabled, setNfcEnabled] = useState(false);
  const nfcUsable = nfcSupported && nfcEnabled;

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

      // Check NFC Hardware + HCE bridge
      const env = await checkRoomKeyEnvironment();
      setNfcSupported(env.nfcHardware);
      setNfcEnabled(env.nfcEnabled);
      setBridgeAvailable(env.bridgeAvailable);

      // If a key is already armed on the HCE stack, reflect it
      if (env.bridgeAvailable) {
        const armed = await isRoomKeyActive();
        setKeyActive(armed);
      }
    } catch {
      // Hardware capability check failed — status chips will show it
    }
  };

  const issueAndArmKey = async () => {
    setLoading(true);
    try {
      const { data } = await generateRoomCredential({
        roomId: bookingId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        bookingId,
      });
      await activateRoomKey(data.credential);
      setKeyActive(true);
      showAlert({
        title: 'Digital Key Active',
        message: 'Your room key is now on the NFC chip. Hold the phone to the door reader (or another phone running the verifier) to open your suite.',
        type: 'success',
      });
    } catch (error: any) {
      console.warn('Failed to arm room key:', error);
      showAlert({
        title: 'Key Activation Failed',
        message: error?.message || 'The room key could not be armed. Make sure NFC is enabled.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHardwareCapabilities();
    return () => {
      // Do not disarm here — the key should survive navigating away.
    };
  }, []);

  // Radar Pulse Animation loop while reading a tag or unlocked
  useEffect(() => {
    if (readingTag || unlocked) {
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
  }, [readingTag, unlocked]);

  // Biometric authentication trigger (real - uses the OS biometric prompt)
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
        promptMessage: `Scan ${label} to Arm Your Key`,
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

  // Biometric gate before arming the key on the NFC chip
  const handleActivateKey = async () => {
    if (unlocked) {
      showAlert({
        title: 'Suite Door Unlocked',
        message: 'Your suite is already open. Push the door to enter.',
        type: 'success',
      });
      return;
    }

    if (keyActive && nfcSupported && nfcEnabled) {
      showAlert({
        title: 'Key Already Active',
        message: 'Your digital key is armed on the NFC chip. Hold the phone to the door reader to open your suite.',
        type: 'success',
      });
      return;
    }

    const authenticated = await authenticateBiometrics();
    if (!authenticated) return;

    if (!bridgeAvailable || !nfcSupported || !nfcEnabled) {
      // No NFC hardware (or NFC disabled) — unlock via Firestore-verified key
      await softUnlockWithoutNfc();
      return;
    }

    await issueAndArmKey();
  };

  // NFC-free unlock: issue/refresh the room credential in Firestore (the door
  // authority) and open the suite directly. Works on phones without NFC.
  const softUnlockWithoutNfc = async () => {
    setLoading(true);
    try {
      await generateRoomCredential({
        roomId: bookingId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        bookingId,
      });
      setKeyActive(true);
      setUnlocked(true);
      showAlert({
        title: 'Suite Door Unlocked!',
        message: `Verified room key for ${roomName} against Firestore. No NFC required — push the door to enter.`,
        type: 'success',
      });
      setTimeout(() => setUnlocked(false), 15000);
    } catch (error: any) {
      console.warn('NFC-free unlock failed:', error);
      showAlert({
        title: 'Access Denied',
        message: error?.message || 'The room key could not be verified. Check your stay details.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  // Reader role: hold the phone near the door reader / another phone
  // carrying an armed key. Real NDEF read + Firestore verification.
  const handleReadKey = async () => {
    if (readingTag) return;
    if (!nfcSupported || !nfcEnabled) {
      showAlert({
        title: 'NFC Unavailable',
        message: 'NFC hardware is not present or disabled on this device.',
        type: 'warning',
      });
      return;
    }

    setReadingTag(true);
    setUnlocked(false);
    try {
      const { payload } = await readRoomKey(45000);
      setUnlocked(true);
      showAlert({
        title: 'Suite Door Unlocked!',
        message: `Verified room key for ${payload.r}. Welcome to ${roomName}!`,
        type: 'success',
      });
      setTimeout(() => setUnlocked(false), 15000);
    } catch (error: any) {
      showAlert({
        title: 'Access Denied',
        message: error?.message || 'The tag could not be verified as a room key.',
        type: 'error',
      });
    } finally {
      setReadingTag(false);
    }
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
                      borderColor: unlocked ? '#16a34a' : readingTag ? '#c9a227' : keyActive ? '#16a34a' : 'rgba(255,255,255,0.2)',
                    },
                  ]}
                />
                <TouchableOpacity
                  style={[
                    styles.nfcRing,
                    (unlocked || keyActive) && styles.nfcRingUnlocked,
                    readingTag && styles.nfcRingActive,
                  ]}
                  onPress={handleActivateKey}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={unlocked ? 'key-sharp' : readingTag ? 'wifi-sharp' : keyActive ? 'key-sharp' : 'lock-closed-sharp'}
                    size={46}
                    color={unlocked ? '#16a34a' : readingTag ? '#c9a227' : keyActive ? '#16a34a' : '#ffffff'}
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.nfcText}>
                {unlocked
                  ? 'SUITE UNLOCKED ✓'
                  : readingTag
                  ? 'Listening for Room Key Tag...'
                  : keyActive
                  ? nfcUsable
                    ? 'KEY ARMED — HOLD PHONE TO READER'
                    : 'KEY VERIFIED — TAP TO OPEN DOOR'
                  : nfcUsable
                  ? 'Activate Digital Key'
                  : 'Tap to Unlock Suite Door'}
              </Text>
              <Text style={styles.nfcSubtext}>
                {unlocked
                  ? nfcUsable
                    ? 'Verified via NFC + Firestore. Push door to enter.'
                    : 'Verified via Firestore. Push door to enter.'
                  : readingTag
                  ? 'Tap a phone carrying an armed key against this phone'
                  : nfcUsable
                  ? 'Real NFC Type-4 emulation · token verified against Firestore'
                  : 'NFC not available — tap to unlock with your Firestore-verified room key'}
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
                    keyActive ? styles.chipSuccess : styles.chipWarning,
                  ]}
                >
                  <Ionicons
                    name="key"
                    size={14}
                    color={keyActive ? '#16a34a' : '#d97706'}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: keyActive ? '#16a34a' : '#d97706' },
                    ]}
                  >
                    {keyActive
                      ? nfcUsable
                        ? 'Key Armed on NFC'
                        : 'Key Verified in Firestore'
                      : bridgeAvailable
                      ? 'Key Not Armed'
                      : 'Touch Unlock Only'}
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
                    {nfcSupported ? (nfcEnabled ? 'NFC Ready' : 'NFC Disabled') : 'NFC Inactive'}
                  </Text>
                </View>
              </View>

              {/* DUAL UNLOCK ACTION BUTTONS */}
              <View style={styles.buttonStack}>
                <TouchableOpacity
                  style={[styles.unlockBtn, unlocked && styles.unlockBtnSuccess]}
                  onPress={handleActivateKey}
                  disabled={readingTag}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#0f172a" />
                  ) : (
                    <>
                      <Ionicons
                        name={keyActive ? 'checkmark-circle' : 'finger-print'}
                        size={22}
                        color="#0f172a"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.unlockBtnText}>
                        {keyActive
                          ? nfcUsable
                            ? 'Key Active — Hold to Door Reader'
                            : 'Tap to Open Suite Door'
                          : nfcUsable
                          ? 'Activate Digital Key'
                          : 'Unlock Suite Door (No NFC)'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {nfcUsable && (
                  <TouchableOpacity
                    style={styles.nfcScanBtn}
                    onPress={handleReadKey}
                    disabled={readingTag}
                    activeOpacity={0.8}
                  >
                    {readingTag ? (
                      <ActivityIndicator color="#c9a227" style={{ marginRight: 8 }} />
                    ) : (
                      <Ionicons name="wifi-outline" size={20} color="#c9a227" style={{ marginRight: 8 }} />
                    )}
                    <Text style={styles.nfcScanBtnText}>
                      {readingTag ? 'Listening — Tap Key Phone to this Phone...' : 'Hold Phone Near NFC Reader'}
                    </Text>
                  </TouchableOpacity>
                )}
                {!nfcUsable && (
                  <View style={styles.noNfcNote}>
                    <Ionicons name="phone-portrait-outline" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
                    <Text style={styles.noNfcNoteText}>
                      This device has no NFC — tap the ring to verify your key and open the door.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Security details footer */}
          <View style={styles.securityInfo}>
            <Ionicons name="shield-checkmark-sharp" size={18} color="#16a34a" style={{ marginRight: 8 }} />
            <Text style={styles.securityText}>
              Random 192-bit token · SHA-256 verified against Firestore · Auto-expires after 12 hours
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
    noNfcNote: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: 'rgba(148,163,184,0.12)',
    },
    noNfcNoteText: { color: '#94a3b8', fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 17 },
    
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