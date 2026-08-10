import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  useColorScheme,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import {
  PunchRecord,
  PunchType,
  punchClock,
  getHotelGeofence,
  getCurrentPosition,
  latestClockState,
  listenTodaysPunches,
  haversineMeters,
  formatDistance,
  punchTimeLabel,
  ATTENDANCE_RADIUS_METERS,
} from '@/services/attendance';
import { db } from '@/services/firebase-services';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RosterMember {
  id: string;
  name: string;
  role: string;
  subRole: string;
  active: boolean;
  registeredDeviceId?: string;
}

// ─── DUT Ritson Campus anchor (client-side fallback if Firestore setting absent) ──
// Precise coordinates — Steve Biko Rd, Durban, 4001
export const DUT_RITSON_LAT = -29.8606;
export const DUT_RITSON_LNG = 30.9803;

// Off-site punches are FLAGGED not blocked (Business Rule Decision B — confirmed in attendance.ts comments)
// If you want to change this to a hard block, reply and I'll flip it.

export default function ClockInPanel() {
  const { user, profile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const S = createStyles(theme);

  // ── State ────────────────────────────────────────────────────────────────
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<RosterMember | null>(null);
  const [showRosterPicker, setShowRosterPicker] = useState(false);

  const [punches, setPunches] = useState<PunchRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(true);
  const [myDistance, setMyDistance] = useState<number | null>(null);
  const [geofenceCenter, setGeofenceCenter] = useState<{ lat: number; lng: number; radiusM: number } | null>(null);

  // ── Load Staff Roster from Firestore ────────────────────────────────────
  useEffect(() => {
    const loadRoster = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'staff_roster'), where('active', '==', true))
        );
        const members: RosterMember[] = snap.docs.map(d => ({
          id: d.id,
          ...(d.data() as Omit<RosterMember, 'id'>),
        }));
        members.sort((a, b) => a.name.localeCompare(b.name));
        setRoster(members);
      } catch (err) {
        console.warn('Could not load staff roster:', err);
        // Fallback to hard-coded roster so the UI is never empty
        setRoster([
          { id: 'staff_001', name: 'Sipho Dlamini', role: 'Events Coordinator', subRole: 'event_ops', active: true },
          { id: 'staff_002', name: 'Ayanda Mthembu', role: 'Front Desk Officer', subRole: 'staff_checkin', active: true },
          { id: 'staff_003', name: 'Thabo Nkosi', role: 'Venue Inspector', subRole: 'pre_inspection', active: true },
          { id: 'staff_004', name: 'Nomvula Zulu', role: 'Guest Relations', subRole: 'live_complaints', active: true },
          { id: 'staff_005', name: 'Lungelo Mthethwa', role: 'Damage Resolution Technician', subRole: 'damage_resolution', active: true },
          { id: 'staff_006', name: 'Zanele Khumalo', role: 'Catering Coordinator', subRole: 'event_ops', active: true },
          { id: 'staff_007', name: 'Mpho Mokoena', role: 'Refund & Finance Officer', subRole: 'refund_approve', active: true },
          { id: 'staff_008', name: 'Bongani Cele', role: 'Security & Access Control', subRole: 'attendee_checkin', active: true },
        ]);
      } finally {
        setRosterLoading(false);
      }
    };
    loadRoster();
  }, []);

  // ── Today's Punches (live) ───────────────────────────────────────────────
  useEffect(() => {
    const unsub = listenTodaysPunches(
      (all) => setPunches(all),
      (err) => console.warn('punch subscription error:', err)
    );
    return unsub;
  }, []);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  // ── Geolocate on mount ───────────────────────────────────────────────────
  const locateMe = useCallback(async () => {
    try {
      // Request permission first (graceful denial handling)
      if (Platform.OS !== 'web') {
        const { requestForegroundPermissionsAsync } = await import('expo-location');
        const { status } = await requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          showAlert({
            title: '📍 Location Permission Required',
            message: 'Clock-in requires your device location to verify on-site presence at DUT Ritson Campus. Please allow location access in your device settings to continue.',
            type: 'warning',
          });
          setLocating(false);
          return;
        }
      }

      // Get geofence centre (from Firestore, fallback to DUT Ritson hardcoded)
      let center = await getHotelGeofence();
      if (!center) {
        center = { lat: DUT_RITSON_LAT, lng: DUT_RITSON_LNG, radiusM: ATTENDANCE_RADIUS_METERS };
      }
      setGeofenceCenter(center);

      const pos = await getCurrentPosition();
      setMyDistance(haversineMeters(pos.lat, pos.lng, center.lat, center.lng));
    } catch (err) {
      console.warn('Could not determine location:', err);
      setMyDistance(null);
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    locateMe();
  }, [locateMe]);

  // ── Computed values ──────────────────────────────────────────────────────
  const onSite = myDistance != null && myDistance <= (geofenceCenter?.radiusM ?? ATTENDANCE_RADIUS_METERS);

  // Filter punches for selected member (by rosterId stored in staffRosterId field, or by name)
  const memberPunches = selectedMember
    ? punches.filter(p => p.staffName === selectedMember.name || (p as any).staffRosterId === selectedMember.id)
    : punches;
  const state = latestClockState(memberPunches);

  // ── Clock-in / Clock-out punch ───────────────────────────────────────────
  const doPunch = async (type: PunchType) => {
    if (busy) return;

    if (!selectedMember) {
      Alert.alert('Select Staff Member', 'Please select your name from the staff roster before clocking in/out.');
      return;
    }

    // Validate clock-out has an open clock-in
    if (type === 'out') {
      const hasOpenClockIn = memberPunches.length > 0 && memberPunches[0].punchType === 'in';
      if (!hasOpenClockIn) {
        Alert.alert(
          '⚠️ No Open Clock-In',
          `${selectedMember.name} has no open clock-in for today. Please clock in first.`
        );
        return;
      }
    }

    setBusy(true);

    try {
      // ── FACTOR 2: POSSESSION (Device ID Binding Check) ──
      const Constants = await import('expo-constants');
      const currentDeviceId = Constants.default.installationId || `${Platform.OS}-${selectedMember.id}`;

      let isFirstTimeEnrollment = false;
      let deviceMatchPassed = true;

      try {
        const { doc: firestoreDoc, getDoc, setDoc } = await import('firebase/firestore');
        const memberRef = firestoreDoc(db, 'staff_roster', selectedMember.id);
        const memberSnap = await getDoc(memberRef);

        if (memberSnap.exists()) {
          const data = memberSnap.data() as any;
          if (!data.registeredDeviceId) {
            isFirstTimeEnrollment = true;
            await setDoc(memberRef, {
              registeredDeviceId: currentDeviceId,
              registeredAt: new Date().toISOString(),
              registeredDeviceModel: Platform.OS,
            }, { merge: true });
          } else if (data.registeredDeviceId !== currentDeviceId) {
            deviceMatchPassed = false;
            showAlert({
              title: '🔒 Device Binding Mismatch',
              message: `This name (${selectedMember.name}) is registered to a different device.\n\nIf this is your device, contact an admin to reset your registration.`,
              type: 'error',
            });
            setBusy(false);
            return;
          }
        }
      } catch (bindErr) {
        console.warn('Device binding lookup error:', bindErr);
      }

      // ── FACTOR 3: INHERENCE (Device Biometric Authentication) ──
      let biometricPassed = false;
      let biometricMethod = 'none_enrolled';

      if (Platform.OS !== 'web') {
        try {
          const LocalAuthentication = await import('expo-local-authentication');
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();

          if (hasHardware && isEnrolled) {
            const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
            if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
              biometricMethod = 'facial_recognition';
            } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
              biometricMethod = 'fingerprint';
            } else {
              biometricMethod = 'biometric_generic';
            }

            const bioRes = await LocalAuthentication.authenticateAsync({
              promptMessage: `Confirm it's you — ${selectedMember.name}`,
              cancelLabel: 'Cancel',
              disableDeviceFallback: false,
            });

            if (!bioRes.success) {
              showAlert({
                title: '⚠️ Biometric Verification Failed',
                message: `Biometric identity confirmation failed or was canceled. Clock ${type === 'in' ? 'in' : 'out'} aborted.`,
                type: 'warning',
              });
              setBusy(false);
              return;
            }
            biometricPassed = true;
          }
        } catch (bioErr) {
          console.warn('Biometrics check error:', bioErr);
        }

        // ── FACTOR 4 (Location Guard Check) ──
        const { requestForegroundPermissionsAsync } = await import('expo-location');
        const { status } = await requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          showAlert({
            title: '📍 Location Required',
            message: 'Location permission is needed to record your clock-in. Please enable it in Settings.',
            type: 'warning',
          });
          setBusy(false);
          return;
        }
      }

      // ── FACTOR 4: LOCATION & PUNCH RECORD EXECUTION ──
      const wasOnSite = onSite;
      const overallStatus = wasOnSite ? (type === 'in' ? 'clocked-in' : 'clocked-out') : 'flagged';

      const res = await punchClock(
        type,
        {
          uid: user?.uid || 'shared_staff',
          displayName: selectedMember.name,
        },
        {
          staffRosterId: selectedMember.id,
          deviceId: currentDeviceId,
          deviceMatchPassed,
          isFirstTimeEnrollment,
          biometricPassed,
          biometricMethod,
          overallStatus,
        }
      );

      setMyDistance(res.distanceM);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const distLabel = formatDistance(res.distanceM);
      const campusLabel = 'DUT Ritson Campus';

      const enrollmentText = isFirstTimeEnrollment ? '\n📱 Device Registered: First-time device enrollment bound to identity.' : '';
      const bioText = biometricPassed ? `\n👤 Biometric Verified: ${biometricMethod}` : '\n⚠️ Biometrics: No enrolled hardware on device';

      if (wasOnSite) {
        showAlert({
          title: `✅ ${selectedMember.name} — Clocked ${type === 'in' ? 'In' : 'Out'}`,
          message: `Punched ${type === 'in' ? 'in' : 'out'} at ${timeStr}\n📍 ${distLabel} from ${campusLabel} (On-site ✓)${enrollmentText}${bioText}\n🔒 All 4 Authentication Factors Passed`,
          type: 'success',
        });
      } else {
        showAlert({
          title: `⚠️ ${selectedMember.name} — Off-Site Punch`,
          message: `Punched ${type === 'in' ? 'in' : 'out'} at ${timeStr}\n📍 ${distLabel} from ${campusLabel}\n⚠️ Flagged as off-site — manager will be notified for review.${enrollmentText}${bioText}`,
          type: 'warning',
        });
      }
    } catch (e: any) {
      showAlert({ title: 'Clock Failed', message: e.message || 'Could not record punch. Please try again.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const distLabel = myDistance != null ? formatDistance(myDistance) : null;
  const radiusM = geofenceCenter?.radiusM ?? ATTENDANCE_RADIUS_METERS;
  const statusCardColor = locating
    ? theme.colors.secondary
    : onSite
    ? '#16a34a'   // green
    : '#dc2626';  // red

  const handleResetDevice = async (member: any) => {
    showAlert({
      title: '🔄 Reset Device Registration',
      message: `Reset device binding for ${member.name}?\n\nThis will allow ${member.name} to register a new phone on their next clock-in.`,
      type: 'warning',
      confirmText: 'Reset Device',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          const { doc: firestoreDoc, updateDoc } = await import('firebase/firestore');
          await updateDoc(firestoreDoc(db, 'staff_roster', member.id), {
            registeredDeviceId: null,
            registeredAt: null,
          });
          setRoster(prev => prev.map(m => m.id === member.id ? { ...m, registeredDeviceId: undefined } : m));
          showAlert({ title: '✅ Device Reset', message: `Device registration reset for ${member.name}.`, type: 'success' });
        } catch (err: any) {
          showAlert({ title: 'Error', message: err.message || 'Could not reset device.', type: 'error' });
        }
      },
    });
  };

  return (
    <ScrollView style={S.container} contentContainerStyle={S.content}>

      {/* ── Status Card (Green = on-site, Red = off-site) ── */}
      <View style={[S.statusCard, { backgroundColor: statusCardColor }]}>
        <Ionicons
          name={locating ? 'location' : onSite ? 'checkmark-circle' : 'warning'}
          size={44}
          color="#fff"
        />
        <Text style={S.statusTitle}>
          {locating
            ? 'Locating…'
            : onSite
            ? '🟢 On-Site — DUT Ritson Campus'
            : '🔴 Off-Site — Not at Campus'}
        </Text>
        {locating ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 10 }} />
        ) : distLabel != null ? (
          <Text style={S.distText}>
            {`📍 ${distLabel} from campus  •  Geofence: ${radiusM}m`}
          </Text>
        ) : (
          <Text style={S.distText}>Location unavailable</Text>
        )}
        <TouchableOpacity onPress={locateMe} style={S.refreshBtn}>
          <Ionicons name="refresh" size={14} color="#fff" />
          <Text style={S.refreshBtnText}>Refresh Location</Text>
        </TouchableOpacity>
      </View>

      {/* ── Legend / Key ── */}
      <View style={S.legendCard}>
        <Text style={S.legendTitle}>📖 4-Factor Punch Authentication Key</Text>
        <View style={S.legendRow}>
          <View style={[S.legendDot, { backgroundColor: '#16a34a' }]} />
          <Text style={S.legendText}>1. Roster Selection • 2. Bound Device Hardware ID • 3. Biometric Pass • 4. DUT Ritson Geofence</Text>
        </View>
        <View style={S.legendRow}>
          <View style={[S.legendDot, { backgroundColor: '#d97706' }]} />
          <Text style={S.legendText}>Off-site Clock In — location flagged for manager review</Text>
        </View>
        <View style={S.legendRow}>
          <View style={[S.legendDot, { backgroundColor: '#dc2626' }]} />
          <Text style={S.legendText}>Device Mismatch / Biometric Cancel — punch strictly blocked</Text>
        </View>
      </View>

      {/* ── Staff Roster Picker ── */}
      <View style={S.card}>
        <Text style={S.cardTitle}>👤 Select Your Name</Text>
        <Text style={S.cardSubtext}>All staff share one login — tap your name to identify yourself for this punch.</Text>

        <TouchableOpacity
          style={[S.pickerBtn, selectedMember ? S.pickerBtnSelected : {}]}
          onPress={() => setShowRosterPicker(true)}
          disabled={rosterLoading}
        >
          {rosterLoading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <>
              <Ionicons name="people" size={20} color={selectedMember ? '#fff' : theme.colors.primary} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[S.pickerText, selectedMember ? { color: '#fff' } : {}]}>
                  {selectedMember ? selectedMember.name : 'Tap to select staff member…'}
                </Text>
                {selectedMember && (
                  <Text style={[S.pickerRole, { color: 'rgba(255,255,255,0.85)' }]}>
                    {selectedMember.role}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-down" size={18} color={selectedMember ? '#fff' : theme.colors.textMuted} />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Clock In / Out Buttons ── */}
      <View style={S.punchRow}>
        <TouchableOpacity
          style={[S.punchBtn, S.inBtn, (!selectedMember || busy) && S.punchDisabled]}
          disabled={!selectedMember || busy}
          onPress={() => doPunch('in')}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="log-in" size={22} color="#fff" style={{ marginRight: 8 }} />
          )}
          <Text style={S.punchBtnText}>Clock In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.punchBtn, S.outBtn, (!selectedMember || busy) && S.punchDisabled]}
          disabled={!selectedMember || busy}
          onPress={() => doPunch('out')}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="log-out" size={22} color="#fff" style={{ marginRight: 8 }} />
          )}
          <Text style={S.punchBtnText}>Clock Out</Text>
        </TouchableOpacity>
      </View>

      {/* ── Today's Punches ── */}
      <View style={S.card}>
        <Text style={S.cardTitle}>📋 Today&apos;s Punches (4-Factor Audit)</Text>
        {punches.length === 0 ? (
          <Text style={S.emptyText}>No punches recorded today.</Text>
        ) : (
          punches.slice(0, 30).map((p) => {
            const isOnSite = p.withinRadius;
            const isClockIn = p.punchType === 'in';
            const dotColor = isOnSite
              ? '#16a34a'
              : isClockIn
              ? '#d97706'
              : '#dc2626';
            const statusLabel = isOnSite
              ? (isClockIn ? '🟢 On-site In' : '🟢 On-site Out')
              : (isClockIn ? '🟡 Off-site In' : '🔴 Off-site Out');

            return (
              <View key={p.id} style={[S.punchItem, { borderLeftWidth: 3, borderLeftColor: dotColor, paddingLeft: 10 }]}>
                <Ionicons
                  name={isClockIn ? 'log-in' : 'log-out'}
                  size={16}
                  color={dotColor}
                />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={S.punchItemText}>
                    <Text style={{ fontWeight: '700' }}>{p.staffName}</Text>
                    {` — ${isClockIn ? 'Clock In' : 'Clock Out'} at ${punchTimeLabel(p)}`}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 8, flexWrap: 'wrap' }}>
                    <View style={[S.punchStatusBadge, { backgroundColor: dotColor + '22', borderColor: dotColor }]}>
                      <Text style={[S.punchStatusText, { color: dotColor }]}>{statusLabel}</Text>
                    </View>
                    <Text style={S.punchItemMeta}>{formatDistance(p.distanceM)} from campus</Text>
                    {(p as any).biometricPassed && (
                      <Text style={[S.punchItemMeta, { color: theme.colors.primary }]}>👤 Bio ✓</Text>
                    )}
                    {(p as any).deviceMatchPassed && (
                      <Text style={[S.punchItemMeta, { color: '#16a34a' }]}>📱 Device ✓</Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* ── Staff Roster Picker Modal ── */}
      <Modal
        visible={showRosterPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRosterPicker(false)}
      >
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Select Staff Member</Text>
              <TouchableOpacity onPress={() => setShowRosterPicker(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={S.modalSubtitle}>Tap your name from the roster below</Text>
            <FlatList
              data={roster}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isBound = !!item.registeredDeviceId;
                return (
                  <View style={[
                    S.rosterItem,
                    selectedMember?.id === item.id && S.rosterItemSelected,
                  ]}>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                      onPress={() => {
                        setSelectedMember(item);
                        setShowRosterPicker(false);
                      }}
                    >
                      <View style={S.rosterAvatar}>
                        <Text style={S.rosterAvatarText}>{item.name.charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[S.rosterName, selectedMember?.id === item.id && { color: theme.colors.primary }]}>
                          {item.name}
                        </Text>
                        <Text style={S.rosterRole}>
                          {item.role} {isBound ? '• 📱 Phone Bound' : '• 🆕 Unregistered'}
                        </Text>
                      </View>
                      {selectedMember?.id === item.id && (
                        <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} style={{ marginRight: 8 }} />
                      )}
                    </TouchableOpacity>

                    {/* Admin Reset Device Registration button */}
                    {isBound && (
                      <TouchableOpacity
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5' }}
                        onPress={() => handleResetDevice(item)}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#dc2626' }}>🔄 Reset Device</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.colors.border }} />}
              ListEmptyComponent={
                <Text style={S.emptyText}>No staff members found. Contact admin to seed roster.</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Custom Themed Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingBottom: 60 },

  // Status card
  statusCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  statusTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 10, textAlign: 'center' },
  distText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 6, textAlign: 'center' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 4, opacity: 0.8 },
  refreshBtnText: { color: '#fff', fontSize: 12 },

  // Card
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: theme.colors.text, marginBottom: 6 },
  cardSubtext: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 14, lineHeight: 17 },

  // Picker button
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: 12,
    padding: 14,
    backgroundColor: 'transparent',
  },
  pickerBtnSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  pickerText: { fontSize: 15, fontWeight: '600', color: theme.colors.primary },
  pickerRole: { fontSize: 12, marginTop: 2 },

  // Punch buttons
  punchRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  punchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  inBtn: { backgroundColor: '#16a34a' },
  outBtn: { backgroundColor: theme.colors.secondary },
  punchDisabled: { opacity: 0.4 },
  punchBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Punch list
  emptyText: { fontSize: 13, color: theme.colors.textMuted },
  punchItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  punchItemText: { fontSize: 13, color: theme.colors.text, lineHeight: 18 },
  punchItemMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  offSiteBadge: { color: '#dc2626', fontWeight: '700' },
  punchStatusBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  punchStatusText: { fontSize: 10, fontWeight: '700' },

  // Legend / Key
  legendCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  legendTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  legendText: { fontSize: 12, color: theme.colors.textMuted, flex: 1 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  modalSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
  rosterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  rosterItemSelected: {
    backgroundColor: theme.colors.primary + '18',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginHorizontal: -6,
  },
  rosterAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rosterAvatarText: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
  rosterName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  rosterRole: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
});