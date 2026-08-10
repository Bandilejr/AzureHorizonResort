import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, useColorScheme, Modal, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getTheme } from '@/constants/theme';
import {
  db, createEventInspection
} from '../../services/firebase-services';
import {
  collection, query, where, getDocs, orderBy, updateDoc, doc, onSnapshot
} from 'firebase/firestore';

const DEFAULT_CHECKLIST = [
  'Room layout matches floor plan',
  'Seating count matches guest list',
  'Lighting system fully operational',
  'AV equipment tested & working',
  'Microphones tested',
  'Projector/screen aligned & calibrated',
  'Climate control set to correct temperature',
  'Emergency exits clear & signage visible',
  'Catering tables positioned correctly',
  'Decorations match client brief',
  'Flooring clean & free of hazards',
  'Registration desk set up',
];

type CheckStatus = 'pending' | 'passed' | 'failed' | 'na';

interface CheckItem {
  item: string;
  status: CheckStatus;
  notes: string;
}

export default function PreEventInspectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { profile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const S = createStyles(theme);

  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [checklist, setChecklist] = useState<CheckItem[]>(
    DEFAULT_CHECKLIST.map(item => ({ item, status: 'pending', notes: '' }))
  );
  const [notesModalIndex, setNotesModalIndex] = useState<number | null>(null);
  const [tempNote, setTempNote] = useState('');
  const [overallStatus, setOverallStatus] = useState<'approved' | 'needs_attention' | 'failed'>('approved');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Real-time Firestore listener for event bookings
  useEffect(() => {
    const todayISO = new Date().toISOString().split('T')[0];
    const q = query(
      collection(db, 'event_bookings'),
      where('status', 'in', ['confirmed', 'pending_payment', 'paid']),
      where('eventDateStr', '>=', todayISO)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEvents(list);
      if (params.eventId) {
        const found = list.find((e: any) => e.id === params.eventId);
        if (found) setSelectedEvent(found);
      }
      setLoadingEvents(false);
    }, (err) => {
      console.warn('Error listening for event bookings:', err);
      setLoadingEvents(false);
    });
    return () => unsub();
  }, [params.eventId]);

  const cycleStatus = (index: number) => {
    const order: CheckStatus[] = ['pending', 'passed', 'failed', 'na'];
    setChecklist(prev => {
      const updated = [...prev];
      const current = updated[index].status;
      const nextIdx = (order.indexOf(current) + 1) % order.length;
      updated[index] = { ...updated[index], status: order[nextIdx] };
      return updated;
    });
  };

  const openNotes = (index: number) => {
    setTempNote(checklist[index].notes);
    setNotesModalIndex(index);
  };

  const saveNote = () => {
    if (notesModalIndex === null) return;
    setChecklist(prev => {
      const updated = [...prev];
      updated[notesModalIndex] = { ...updated[notesModalIndex], notes: tempNote };
      return updated;
    });
    setNotesModalIndex(null);
  };

  // Auto-derive overall status from checklist
  useEffect(() => {
    const failedCount = checklist.filter(c => c.status === 'failed').length;
    const pendingCount = checklist.filter(c => c.status === 'pending').length;
    if (failedCount >= 3) setOverallStatus('failed');
    else if (failedCount > 0 || pendingCount > 0) setOverallStatus('needs_attention');
    else setOverallStatus('approved');
  }, [checklist]);

  const passedCount = checklist.filter(c => c.status === 'passed').length;
  const failedCount = checklist.filter(c => c.status === 'failed').length;
  const progress = passedCount / checklist.length;

  const handleSubmit = async () => {
    if (!selectedEvent) {
      Alert.alert('Select Event', 'Please select an event before submitting.');
      return;
    }
    const pending = checklist.filter(c => c.status === 'pending').length;
    if (pending > 0) {
      Alert.alert(
        'Incomplete Checklist',
        `${pending} item(s) still marked as pending. Submit anyway?`,
        [
          { text: 'Go Back', style: 'cancel' },
          { text: 'Submit Anyway', onPress: doSubmit },
        ]
      );
    } else {
      doSubmit();
    }
  };

  const doSubmit = async () => {
    if (!selectedEvent || !profile) return;

    if (selectedEvent.guestId === profile.uid) {
      Alert.alert(
        '🔒 Conflict of Interest',
        'Staff members cannot inspect an event that they personally organized as a guest.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const formattedItems = checklist.map(c => ({
        item: c.item,
        status: c.status as 'passed' | 'failed' | 'na',
        notes: c.notes || '',
        photos: [],
      }));

      await createEventInspection({
        eventId: selectedEvent.id,
        type: 'pre_event',
        inspectorId: profile.uid,
        checklistItems: formattedItems,
        overallStatus,
      });

      // Update the event booking with inspection status
      await updateDoc(doc(db, 'event_bookings', selectedEvent.id), {
        preInspectionStatus: 'completed',
        preInspectionResult: overallStatus,
      });

      setSubmitted(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit inspection. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusIcon = (status: CheckStatus) => {
    switch (status) {
      case 'passed': return 'checkmark-circle';
      case 'failed': return 'close-circle';
      case 'na': return 'remove-circle';
      default: return 'radio-button-off';
    }
  };

  const getStatusColor = (status: CheckStatus) => {
    switch (status) {
      case 'passed': return theme.colors.success;
      case 'failed': return theme.colors.error;
      case 'na': return theme.colors.textMuted;
      default: return theme.colors.border;
    }
  };

  const getOverallColor = () => {
    switch (overallStatus) {
      case 'approved': return theme.colors.success;
      case 'needs_attention': return theme.colors.warning;
      case 'failed': return theme.colors.error;
    }
  };

  // ── SUCCESS SCREEN ──
  if (submitted) {
    return (
      <SafeAreaView style={[S.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <View style={[S.successIcon, { backgroundColor: overallStatus === 'approved' ? theme.colors.successLight : theme.colors.warningLight }]}>
          <Ionicons
            name={overallStatus === 'approved' ? 'checkmark-circle' : 'alert-circle'}
            size={64}
            color={getOverallColor()}
          />
        </View>
        <Text style={S.successTitle}>Inspection Submitted</Text>
        <Text style={S.successSub}>
          {selectedEvent?.venueName} — {overallStatus.replace('_', ' ').toUpperCase()}
        </Text>
        <Text style={S.successStats}>
          {passedCount} passed · {failedCount} failed · {checklist.filter(c => c.status === 'na').length} N/A
        </Text>
        <TouchableOpacity
          style={[S.submitBtn, { backgroundColor: theme.colors.success, marginTop: 32 }]}
          onPress={() =>
            Alert.alert(
              'Next Step',
              'Would you like to proceed to Attendee Check-in?',
              [
                { text: 'Later', onPress: () => router.replace('/staff-dashboard' as any) },
                {
                  text: 'Check-in',
                  onPress: () =>
                    router.replace({
                      pathname: '/attendee-checkin',
                      params: { eventId: selectedEvent?.id },
                    } as any),
                },
              ]
            )
          }
        >
          <Text style={S.submitBtnText}>Done — What&apos;s Next?</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/staff-dashboard' as any)} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Back to Dashboard</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={S.container}>
      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>
        {/* ── HEADER ── */}
        <View style={S.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.secondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={S.title}>Pre-Event Inspection</Text>
            <Text style={S.subtitle}>UC26 · Verify venue readiness before event</Text>
          </View>
        </View>

        {/* ── EVENT SELECTOR ── */}
        <Text style={S.label}>Event to Inspect</Text>
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

        {/* ── PROGRESS BAR ── */}
        {selectedEvent && (
          <View style={S.progressCard}>
            <View style={S.progressHeader}>
              <Text style={S.progressLabel}>Checklist Progress</Text>
              <Text style={[S.progressPct, { color: getOverallColor() }]}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
            <View style={S.progressTrack}>
              <View style={[S.progressFill, { width: `${progress * 100}%`, backgroundColor: getOverallColor() }]} />
            </View>
            <View style={S.progressStats}>
              <Text style={{ color: theme.colors.success, fontWeight: '600', fontSize: 13 }}>✓ {passedCount} Passed</Text>
              <Text style={{ color: theme.colors.error, fontWeight: '600', fontSize: 13 }}>✗ {failedCount} Failed</Text>
              <View style={[S.overallBadge, { backgroundColor: getOverallColor() + '20' }]}>
                <Text style={[S.overallText, { color: getOverallColor() }]}>
                  {overallStatus.replace('_', ' ').toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── CHECKLIST ── */}
        <Text style={[S.label, { marginTop: 16 }]}>Checklist Items</Text>
        <Text style={S.tapHint}>Tap an item to cycle: PENDING → PASSED → FAILED → N/A · Long-press to add notes</Text>
        <View style={S.checkCard}>
          {checklist.map((ci, i) => (
            <View key={i} style={S.checkRow}>
              <TouchableOpacity
                style={S.checkLeft}
                onPress={() => cycleStatus(i)}
                onLongPress={() => openNotes(i)}
                activeOpacity={0.7}
              >
                <Ionicons name={getStatusIcon(ci.status) as any} size={26} color={getStatusColor(ci.status)} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[S.checkText, ci.status === 'na' && { textDecorationLine: 'line-through', color: theme.colors.textMuted }]}>
                    {ci.item}
                  </Text>
                  {ci.notes ? (
                    <Text style={S.notePreview} numberOfLines={1}>📝 {ci.notes}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openNotes(i)} style={S.noteBtn}>
                <Ionicons name="create-outline" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* ── SUBMIT ── */}
        <TouchableOpacity
          style={[S.submitBtn, { opacity: isSubmitting ? 0.7 : 1 }]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
              <Text style={S.submitBtnText}>Submit Inspection Report</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* ── EVENT PICKER MODAL ── */}
      <Modal visible={showEventPicker} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <Text style={S.modalTitle}>Select Event</Text>
            {events.length === 0 ? (
              <Text style={S.modalEmpty}>No upcoming events found</Text>
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

      {/* ── NOTES MODAL ── */}
      <Modal visible={notesModalIndex !== null} transparent animationType="fade">
        <View style={S.modalOverlay}>
          <View style={[S.modalSheet, { paddingBottom: 24 }]}>
            <Text style={S.modalTitle}>
              Notes — {notesModalIndex !== null ? checklist[notesModalIndex]?.item : ''}
            </Text>
            <TextInput
              style={S.notesInput}
              multiline
              numberOfLines={4}
              placeholder="Add inspection notes here..."
              placeholderTextColor={theme.colors.textMuted}
              value={tempNote}
              onChangeText={setTempNote}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={[S.modalActionBtn, { backgroundColor: theme.colors.border }]} onPress={() => setNotesModalIndex(null)}>
                <Text style={{ color: theme.colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.modalActionBtn, { backgroundColor: theme.colors.secondary, flex: 2 }]} onPress={saveNote}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save Note</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  tapHint: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 12, fontStyle: 'italic' },

  selectorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    padding: 14, borderRadius: 12, marginBottom: 16,
  },
  selectorText: { flex: 1, fontSize: 15, color: theme.colors.text, fontWeight: '500' },

  progressCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  progressPct: { fontSize: 18, fontWeight: '800' },
  progressTrack: { height: 8, backgroundColor: theme.colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  overallBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  overallText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  checkCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  checkLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  checkText: { fontSize: 14, color: theme.colors.text, fontWeight: '500' },
  notePreview: { fontSize: 12, color: theme.colors.primary, marginTop: 3 },
  noteBtn: { padding: 8 },

  submitBtn: {
    backgroundColor: theme.colors.secondary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14, marginTop: 24,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  successIcon: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  successTitle: { fontSize: 28, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  successSub: { fontSize: 16, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8 },
  successStats: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 12 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 16 },
  modalEmpty: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', padding: 20 },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8,
    backgroundColor: theme.colors.surfaceVariant,
  },
  modalItemTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  modalItemSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  modalClose: { alignItems: 'center', padding: 16 },
  modalActionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },

  notesInput: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 14,
    fontSize: 15, color: theme.colors.text, textAlignVertical: 'top', minHeight: 100,
  },
});