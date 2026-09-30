import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import {
  db, validateAttendeeQR
} from '../../services/firebase-services';
import {
  collection, query, where, getDocs, onSnapshot, orderBy, updateDoc, doc
} from 'firebase/firestore';

export default function AttendeeCheckinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { profile } = useAuth();
  const theme = useAppTheme();
  const S = createStyles(theme);

  // Event state
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // Attendees state
  const [attendees, setAttendees] = useState<any[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [searchText, setSearchText] = useState('');

  // QR scanner state
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessingQR, setIsProcessingQR] = useState(false);
  const [lastScanned, setLastScanned] = useState('');

  // Manual check-in modal
  const [checkingIn, setCheckingIn] = useState<any>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Load events — all active bookings so staff can check in any upcoming event
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'event_bookings'), where('status', 'in', ['confirmed', 'paid', 'deposit_paid', 'Deposit Paid', 'pending_payment', 'Pending Payment', 'Venue Approved for Guests']))
        );
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => {
            const aDate = String(a.eventDate || a.date || '');
            const bDate = String(b.eventDate || b.date || '');
            return bDate.localeCompare(aDate);
          });
        setEvents(list);
        if (params.eventId) {
          const found = list.find((e: any) => e.id === params.eventId);
          if (found) setSelectedEvent(found);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingEvents(false);
      }
    };
    load();
  }, [params.eventId]);

  // Live listener for invitations when event is selected
  useEffect(() => {
    if (!selectedEvent) return;
    setLoadingAttendees(true);
    const q = query(
      collection(db, 'event_invitations'),
      where('eventId', '==', selectedEvent.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((a: any) => a.status === 'accepted' || a.rsvpStatus === 'accepted' || a.status === 'checked_in');
      // Sort: checked in first, then accepted
      list.sort((a: any, b: any) => {
        const order: any = { checked_in: 0, accepted: 1 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      });
      setAttendees(list);
      setLoadingAttendees(false);
    }, (err) => {
      console.error(err);
      setLoadingAttendees(false);
    });
    return () => unsub();
  }, [selectedEvent]);

  const filtered = attendees.filter(a =>
    a.inviteeName?.toLowerCase().includes(searchText.toLowerCase()) ||
    a.inviteeEmail?.toLowerCase().includes(searchText.toLowerCase())
  );

  const checkedInCount = attendees.filter(a => a.status === 'checked_in').length;
  const acceptedCount = attendees.filter(a => a.status !== 'checked_in').length;

  // QR scan handler
  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (isProcessingQR || data === lastScanned) return;
    setIsProcessingQR(true);
    setLastScanned(data);

    try {
      const result = await validateAttendeeQR({ qrPayload: data });
      if (result.data.valid) {
        setScanning(false);
        Alert.alert(
          '✅ Check-in Successful!',
          `${result.data.attendee?.inviteeName || 'Attendee'} has been checked in.`,
          [{ text: 'Scan Next', onPress: () => { setIsProcessingQR(false); setLastScanned(''); } }]
        );
      } else {
        Alert.alert(
          '❌ Check-in Failed',
          result.data.message || 'Invalid QR code.',
          [{ text: 'Try Again', onPress: () => { setIsProcessingQR(false); setLastScanned(''); } }]
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'QR processing failed.');
      setIsProcessingQR(false);
      setLastScanned('');
    }
  };

  // Manual check-in
  const handleManualCheckIn = async (attendee: any) => {
    if (selectedEvent?.status !== 'Venue Approved for Guests' && selectedEvent?.inspectionStatus !== 'passed') {
      Alert.alert(
        '🔒 Check-In Locked',
        'Pre-event inspection (UC26) has not been passed for this venue yet. Venue status must be "Venue Approved for Guests".'
      );
      return;
    }

    if (checkedInCount >= (selectedEvent?.expectedAttendance || selectedEvent?.capacity || 100)) {
      Alert.alert(
        '⚠️ Capacity Limit Reached',
        `Cannot check in more attendees. Venue capacity limit of ${selectedEvent?.expectedAttendance || selectedEvent?.capacity || 100} has been reached.`
      );
      return;
    }

    if (attendee.status === 'checked_in') {
      Alert.alert('Already Checked In', `${attendee.inviteeName} was checked in earlier at ${attendee.checkedInAt || 'today'}.`);
      return;
    }
    setCheckingIn(attendee);
  };

  const confirmManualCheckIn = async () => {
    if (!checkingIn) return;
    setIsCheckingIn(true);
    try {
      // Build a mock QR payload from the invitation data to use the validated function
      const result = await validateAttendeeQR({
        qrPayload: JSON.stringify({
          invitationId: checkingIn.id,
          eventId: checkingIn.eventId,
          inviteeEmail: checkingIn.inviteeEmail,
          inviteeName: checkingIn.inviteeName,
          hostId: checkingIn.hostId,
          status: checkingIn.status,
          issuedAt: checkingIn.issuedAt || Date.now(),
          // Note: manual check-in bypasses signature by directly updating Firestore
        }),
      });

      // If QR validation fails due to sig mismatch, do direct update as manual override
      await updateDoc(doc(db, 'event_invitations', checkingIn.id), {
        status: 'checked_in',
        checkedInAt: new Date().toISOString(),
        checkedInBy: profile?.uid,
        method: 'manual',
      });
      Alert.alert('✅ Success', `${checkingIn.inviteeName} manually checked in.`);
    } catch (e: any) {
      // Manual override — just update directly
      try {
        await updateDoc(doc(db, 'event_invitations', checkingIn.id), {
          status: 'checked_in',
          checkedInAt: new Date().toISOString(),
          checkedInBy: profile?.uid,
          method: 'manual',
        });
        Alert.alert('✅ Success', `${checkingIn.inviteeName} manually checked in.`);
      } catch (e2: any) {
        Alert.alert('Error', 'Could not check in attendee. Please try again.');
      }
    } finally {
      setIsCheckingIn(false);
      setCheckingIn(null);
    }
  };

  const openScanner = async () => {
    if (!selectedEvent) {
      Alert.alert('Select an Event First', 'Please choose an event before opening the QR scanner.');
      return;
    }
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Permission', 'Camera access is required to scan QR codes.');
        return;
      }
    }
    setScanning(true);
    setIsProcessingQR(false);
    setLastScanned('');
  };

  // ── QR SCANNER VIEW ──
  if (scanning) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.cameraBackdrop }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          onBarcodeScanned={isProcessingQR ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={S.scanOverlay}>
          <View style={S.scanFrame} />
          <Text style={S.scanHint}>Point at attendee&apos;s QR code</Text>
          {isProcessingQR && <ActivityIndicator color={theme.colors.textInverse} style={{ marginTop: 16 }} />}
        </View>
        <TouchableOpacity style={S.closeScanBtn} onPress={() => setScanning(false)}>
          <Ionicons name="close" size={28} color={theme.colors.textInverse} />
          <Text style={{ color: theme.colors.textInverse, fontWeight: '600', marginLeft: 8 }}>Close Scanner</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Screen scroll>
        {/* ── HEADER ── */}
        <View style={S.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.secondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={S.title}>Attendee Check-in</Text>
            <Text style={S.subtitle}>UC27 · Scan QR or search by name</Text>
          </View>
        </View>

        {/* ── EVENT SELECTOR ── */}
        <Text style={S.label}>Event</Text>
        <TouchableOpacity style={S.selectorBtn} onPress={() => setShowEventPicker(true)}>
          {loadingEvents ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <>
              <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
              <Text style={[S.selectorText, !selectedEvent && { color: theme.colors.textMuted }]}>
                {selectedEvent ? `${selectedEvent.venueName} — ${selectedEvent.eventType || 'Event'}` : 'Select an event...'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
            </>
          )}
        </TouchableOpacity>

        {/* ── STATS ROW ── */}
        {selectedEvent && (
          <View style={S.statsRow}>
            <View style={[S.statChip, { backgroundColor: theme.colors.successLight }]}>
              <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
              <Text style={[S.statChipText, { color: theme.colors.success }]}>{checkedInCount} In</Text>
            </View>
            <View style={[S.statChip, { backgroundColor: theme.colors.infoLight }]}>
              <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.info} />
              <Text style={[S.statChipText, { color: theme.colors.info }]}>{acceptedCount} Accepted</Text>
            </View>
            <View style={[S.statChip, { backgroundColor: theme.colors.infoLight }]}>
              <Ionicons name="people-outline" size={16} color={theme.colors.info} />
              <Text style={[S.statChipText, { color: theme.colors.info }]}>{attendees.length} Total</Text>
            </View>
          </View>
        )}

        {/* ── SCAN + SEARCH ── */}
        <TouchableOpacity style={S.scanBtn} onPress={openScanner}>
          <Ionicons name="qr-code" size={22} color={theme.colors.textInverse} />
          <Text style={S.scanBtnText}>Open QR Scanner</Text>
        </TouchableOpacity>

        <View style={S.searchRow}>
          <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={S.searchInput}
            placeholder="Search by name or email..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── ATTENDEE LIST ── */}
        {!selectedEvent ? (
          <View style={S.emptyCard}>
            <Ionicons name="calendar-outline" size={40} color={theme.colors.textMuted} />
            <Text style={S.emptyText}>Select an event to see attendees</Text>
          </View>
        ) : loadingAttendees ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 20 }} />
        ) : filtered.length === 0 ? (
          <View style={S.emptyCard}>
            <Ionicons name="people-outline" size={40} color={theme.colors.textMuted} />
            <Text style={S.emptyText}>
              {searchText ? 'No attendees match your search' : 'No invitees have accepted this event yet'}
            </Text>
          </View>
        ) : (
          filtered.map((attendee) => (
            <TouchableOpacity
              key={attendee.id}
              style={[S.attendeeCard, attendee.status === 'checked_in' && { opacity: 0.75 }]}
              onPress={() => handleManualCheckIn(attendee)}
              activeOpacity={0.8}
            >
              <View style={[S.avatarCircle, { backgroundColor: attendee.status === 'checked_in' ? theme.colors.successLight : theme.colors.primaryLight }]}>
                <Text style={[S.avatarText, { color: attendee.status === 'checked_in' ? theme.colors.success : theme.colors.primary }]}>
                  {(attendee.inviteeName || 'A').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={S.attendeeInfo}>
                <Text style={S.attendeeName}>{attendee.inviteeName || 'Unknown'}</Text>
                <Text style={S.attendeeEmail}>{attendee.inviteeEmail}</Text>
                {attendee.status === 'checked_in' && attendee.checkedInAt && (
                  <Text style={S.checkinTime}>
                    ✓ Checked in {attendee.method === 'manual' ? '(manual)' : '(QR)'}
                  </Text>
                )}
              </View>
              <View style={[
                S.statusBadge,
                { backgroundColor: attendee.status === 'checked_in' ? theme.colors.successLight : theme.colors.infoLight }
              ]}>
                <Ionicons
                  name={attendee.status === 'checked_in' ? 'checkmark-circle' : 'checkmark-circle-outline'}
                  size={14}
                  color={attendee.status === 'checked_in' ? theme.colors.success : theme.colors.info}
                />
                <Text style={[S.statusText, { color: attendee.status === 'checked_in' ? theme.colors.success : theme.colors.info }]}>
                  {attendee.status === 'checked_in' ? 'Checked In' : 'Accepted'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      {/* ── EVENT PICKER MODAL ── */}
      <Modal visible={showEventPicker} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <Text style={S.modalTitle}>Select Event</Text>
            {events.length === 0 ? (
              <Text style={S.modalEmpty}>No events available</Text>
            ) : (
              <ScrollView>
                {events.map(ev => (
                  <TouchableOpacity
                    key={ev.id}
                    style={[S.modalItem, selectedEvent?.id === ev.id && { backgroundColor: theme.colors.primaryLight }]}
                    onPress={() => { setSelectedEvent(ev); setShowEventPicker(false); }}
                  >
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={S.modalItemTitle}>{ev.venueName || 'Venue'}</Text>
                      <Text style={S.modalItemSub}>{ev.eventType || 'Event'} · {ev.eventDateStr || ''}</Text>
                    </View>
                    {selectedEvent?.id === ev.id && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={S.modalClose} onPress={() => setShowEventPicker(false)}>
              <Text style={{ color: theme.colors.textMuted, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MANUAL CHECK-IN CONFIRM MODAL ── */}
      <Modal visible={!!checkingIn} transparent animationType="fade">
        <View style={S.modalOverlay}>
          <View style={[S.modalSheet, { paddingBottom: 24 }]}>
            <View style={S.confirmIcon}>
              <Ionicons name="person-add" size={36} color={theme.colors.success} />
            </View>
            <Text style={S.modalTitle}>Manually Check In?</Text>
            <Text style={S.confirmSub}>{checkingIn?.inviteeName}</Text>
            <Text style={S.confirmEmail}>{checkingIn?.inviteeEmail}</Text>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', marginTop: 8 }}>
              This is a manual override. Use QR scan when available.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                style={[S.confirmBtn, { backgroundColor: theme.colors.border }]}
                onPress={() => setCheckingIn(null)}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.confirmBtn, { backgroundColor: theme.colors.success, flex: 2 }]}
                onPress={confirmManualCheckIn}
                disabled={isCheckingIn}
              >
                {isCheckingIn ? (
                  <ActivityIndicator color={theme.colors.textInverse} />
                ) : (
                  <Text style={{ color: theme.colors.textInverse, fontWeight: '700' }}>✓ Check In</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingTop: 16, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },

  label: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  selectorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    padding: 14, borderRadius: 12, marginBottom: 16,
  },
  selectorText: { flex: 1, fontSize: 15, color: theme.colors.text, fontWeight: '500' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 10,
  },
  statChipText: { fontSize: 13, fontWeight: '700' },

  scanBtn: {
    backgroundColor: theme.colors.secondary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginBottom: 12,
  },
  scanBtnText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: 16 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    padding: 12, borderRadius: 12, marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.text },

  emptyCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 32,
    alignItems: 'center', gap: 12, marginTop: 8,
  },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },

  attendeeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surface, padding: 14, borderRadius: 14, marginBottom: 10,
    shadowColor: theme.colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: '800' },
  attendeeInfo: { flex: 1 },
  attendeeName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  attendeeEmail: { fontSize: 13, color: theme.colors.textMuted, marginTop: 1 },
  checkinTime: { fontSize: 11, color: theme.colors.success, marginTop: 3 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  statusText: { fontSize: 12, fontWeight: '600' },

  // Scanner overlay
  scanOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center', alignItems: 'center',
  },
  scanFrame: {
    width: 240, height: 240, borderWidth: 3, borderColor: theme.colors.textInverse,
    borderRadius: 16, backgroundColor: 'transparent',
  },
  scanHint: { color: theme.colors.textInverse, fontSize: 14, fontWeight: '600', marginTop: 20, textAlign: 'center' },
  closeScanBtn: {
    position: 'absolute', bottom: 60, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.overlay, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
  },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 16, textAlign: 'center' },
  modalEmpty: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', padding: 20 },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8,
    backgroundColor: theme.colors.surfaceVariant,
  },
  modalItemTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  modalItemSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  modalClose: { alignItems: 'center', padding: 16 },

  confirmIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.colors.successLight,
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16,
  },
  confirmSub: { fontSize: 20, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  confirmEmail: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 4 },
  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
});