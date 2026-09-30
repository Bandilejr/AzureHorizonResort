import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, useColorScheme, Image, SafeAreaView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getTheme } from '@/constants/theme';
import * as ImagePicker from 'expo-image-picker';
import {
  db, createEventInspection, createDamageRecord, uploadImage
} from '../../services/firebase-services';
import {
  collection, query, where, getDocs, onSnapshot
} from 'firebase/firestore';

interface DamageItem {
  item: string;
  description: string;
  estimatedCost: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  photos: string[];
  photoUris: string[]; // local URIs before upload
}

const SEVERITY_OPTS = ['low', 'medium', 'high', 'critical'] as const;

const sevColor = (theme: any, s: string) => {
  switch (s) {
    case 'critical': return { text: theme.colors.error, bg: theme.colors.errorLight };
    case 'high': return { text: '#dc4a00', bg: '#fff0e6' };
    case 'medium': return { text: theme.colors.warning, bg: theme.colors.warningLight };
    default: return { text: theme.colors.success, bg: theme.colors.successLight };
  }
};

export default function PostEventInspectionScreen() {
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
  const [pickerTab, setPickerTab] = useState(0);

  // Day tabs: 0 = today, 1 = 1 day prior, 2 = 2 days prior, 3 = all completed
  const eventDayKeys = ['today', 'oneDayPrior', 'twoDaysPrior', 'allCompleted'];
  const eventDayKey = (raw: string) => {
    const datePart = String(raw || '').slice(0, 10);
    if (datePart.length !== 10) return '';
    const d = new Date(datePart + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return 'oneDayPrior';
    if (diff === 2) return 'twoDaysPrior';
    if (diff > 2) return 'past';
    return '';
  };
  const eventDayLabel = ['Today', '1 Day Prior', '2 Days Prior', 'All Completed'];
  const filteredEvents = pickerTab === 3
    ? events.filter(ev => eventDayKey(ev.eventDate || ev.date) !== '')
    : events.filter(ev => eventDayKey(ev.eventDate || ev.date) === eventDayKeys[pickerTab]);

  const [damages, setDamages] = useState<DamageItem[]>([]);
  const [showAddDamage, setShowAddDamage] = useState(false);
  const [newDamage, setNewDamage] = useState<DamageItem>({
    item: '', description: '', estimatedCost: 0, severity: 'low', photos: [], photoUris: [],
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<any>(null);

  // Real-time Firestore listener for event bookings
  useEffect(() => {
    const q = query(
      collection(db, 'event_bookings'),
      where('status', 'in', ['confirmed', 'paid', 'deposit_paid', 'Deposit Paid', 'pending_payment', 'pending', 'Venue Approved for Guests'])
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((ev: any) => eventDayKey(ev.eventDate || ev.date) !== '');
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

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      const { status: galleryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (galleryStatus !== 'granted') {
        Alert.alert('Permission Required', 'Camera or gallery access is needed to attach photos.');
        return;
      }
    }

    Alert.alert('Attach Photo', 'Choose a source:', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsEditing: true,
          });
          if (!result.canceled && result.assets[0]) {
            setNewDamage(prev => ({
              ...prev,
              photoUris: [...prev.photoUris, result.assets[0].uri],
            }));
          }
        },
      },
      {
        text: 'Choose from Gallery',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsEditing: true,
          });
          if (!result.canceled && result.assets[0]) {
            setNewDamage(prev => ({
              ...prev,
              photoUris: [...prev.photoUris, result.assets[0].uri],
            }));
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const addDamageItem = () => {
    if (!newDamage.item.trim()) {
      Alert.alert('Validation', 'Please enter a damage item name.');
      return;
    }
    if (newDamage.estimatedCost <= 0) {
      Alert.alert('Validation', 'Please enter a valid estimated cost (> 0).');
      return;
    }
    setDamages(prev => [...prev, { ...newDamage }]);
    setNewDamage({ item: '', description: '', estimatedCost: 0, severity: 'low', photos: [], photoUris: [] });
    setShowAddDamage(false);
  };

  const removeDamage = (index: number) => {
    setDamages(prev => prev.filter((_, i) => i !== index));
  };

  const totalCost = damages.reduce((sum, d) => sum + d.estimatedCost, 0);

  const handleSubmit = async () => {
    if (!selectedEvent) {
      Alert.alert('Select Event', 'Please select an event to submit the inspection for.');
      return;
    }
    if (!profile) return;

    if (selectedEvent.guestId === profile.uid) {
      Alert.alert(
        '🔒 Conflict of Interest',
        'Staff members cannot conduct a post-event inspection on an event that they personally organized as a guest.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload photos for each damage item
      const itemsWithPhotos: DamageItem[] = [];
      for (const dmg of damages) {
        const uploadedUrls: string[] = [];
        for (const uri of dmg.photoUris) {
          try {
            const path = `damage_photos/${selectedEvent.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
            const url = await uploadImage(uri, path);
            uploadedUrls.push(url);
          } catch {
            // If upload fails, just skip the photo
          }
        }
        itemsWithPhotos.push({ ...dmg, photos: uploadedUrls });
      }

      // Determine overall status
      const hasHigh = damages.some(d => d.severity === 'high' || d.severity === 'critical');
      const overallStatus = damages.length === 0 ? 'approved' : hasHigh ? 'failed' : 'needs_attention';

      // Create post-event inspection record
      const inspectionRef = await createEventInspection({
        eventId: selectedEvent.id,
        type: 'post_event',
        inspectorId: profile.uid,
        checklistItems: itemsWithPhotos.map(d => ({
          item: d.item,
          status: 'failed',
          notes: `${d.description} | Severity: ${d.severity} | Est. cost: R${d.estimatedCost}`,
          photos: d.photos,
        })),
        overallStatus,
      });

      // Create damage record if there are items
      if (damages.length > 0) {
        await createDamageRecord({
          eventId: selectedEvent.id,
          inspectionId: inspectionRef.id,
          guestId: selectedEvent.guestId || '',
          reportedBy: profile.uid,
          items: itemsWithPhotos.map(d => ({
            item: d.item,
            description: d.description,
            estimatedCost: d.estimatedCost,
            photos: d.photos,
          })),
          totalCost,
        });
      }

      setSubmittedData({ overallStatus, totalCost, itemCount: damages.length, inspectionId: inspectionRef.id });
      setSubmitted(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit inspection. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── SUCCESS SCREEN ──
  if (submitted && submittedData) {
    return (
      <SafeAreaView style={[S.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <View style={[S.successIcon, { backgroundColor: submittedData.itemCount === 0 ? theme.colors.successLight : theme.colors.errorLight }]}>
          <Ionicons
            name={submittedData.itemCount === 0 ? 'checkmark-circle' : 'alert-circle'}
            size={64}
            color={submittedData.itemCount === 0 ? theme.colors.success : theme.colors.error}
          />
        </View>
        <Text style={S.successTitle}>Report Submitted</Text>
        <Text style={S.successSub}>{selectedEvent?.venueName}</Text>
        {submittedData.itemCount > 0 ? (
          <View style={S.successStats}>
            <Text style={S.successStatText}>{submittedData.itemCount} damage item{submittedData.itemCount !== 1 ? 's' : ''} recorded</Text>
            <Text style={[S.successStatText, { color: theme.colors.error, fontWeight: '800', fontSize: 18 }]}>
              Total: R {submittedData.totalCost.toLocaleString()}
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' }}>
              An invoice has been generated and a damage claim has been created.
            </Text>
          </View>
        ) : (
          <Text style={{ color: theme.colors.textMuted, textAlign: 'center', marginTop: 8 }}>No damages recorded — venue cleared.</Text>
        )}
        <TouchableOpacity
          style={[S.submitBtn, { backgroundColor: theme.colors.success, marginTop: 32 }]}
          onPress={() =>
            Alert.alert('Next Step', 'Would you like to view Damage Resolution?', [
              { text: 'Later', onPress: () => router.replace('/staff-dashboard' as any) },
              { text: 'View Damage Records', onPress: () => router.replace('/damage-resolution' as any) },
            ])
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
            <Text style={S.title}>Post-Event Inspection</Text>
            <Text style={S.subtitle}>UC29 · Record damages and generate invoice</Text>
          </View>
        </View>

        {/* ── EVENT SELECTOR ── */}
        <Text style={S.label}>Event Inspected</Text>
        <TouchableOpacity style={S.selectorBtn} onPress={() => setShowEventPicker(true)}>
          {loadingEvents ? <ActivityIndicator color={theme.colors.primary} /> : (
            <>
              <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
              <Text style={[S.selectorText, !selectedEvent && { color: theme.colors.textMuted }]}>
                {selectedEvent ? `${selectedEvent.venueName} — ${selectedEvent.eventType || 'Event'}` : 'Select an event...'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
            </>
          )}
        </TouchableOpacity>

        {/* ── TOTAL COST BANNER ── */}
        {damages.length > 0 && (
          <View style={S.totalBanner}>
            <View>
              <Text style={S.totalLabel}>Total Estimated Damages</Text>
              <Text style={S.totalValue}>R {totalCost.toLocaleString()}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 12, color: '#fff', opacity: 0.8 }}>{damages.length} item{damages.length !== 1 ? 's' : ''}</Text>
              {damages.some(d => d.severity === 'critical') && (
                <Text style={{ fontSize: 12, color: '#ffc4c4', fontWeight: '700' }}>⚠ CRITICAL</Text>
              )}
            </View>
          </View>
        )}

        {/* ── DAMAGE ITEMS ── */}
        <View style={S.sectionHeader}>
          <Text style={S.label}>Damage Items</Text>
          <TouchableOpacity style={S.addBtn} onPress={() => setShowAddDamage(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={S.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {damages.length === 0 ? (
          <View style={S.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={40} color={theme.colors.success} />
            <Text style={S.emptyText}>No damages recorded yet</Text>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>Tap &quot;Add&quot; to record damage items</Text>
          </View>
        ) : (
          damages.map((damage, i) => {
            const sc = sevColor(theme, damage.severity);
            return (
              <View key={i} style={S.damageCard}>
                <View style={S.damageCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.damageItemText}>{damage.item}</Text>
                    {damage.description ? <Text style={S.damageDesc}>{damage.description}</Text> : null}
                  </View>
                  <View style={[S.sevBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[S.sevText, { color: sc.text }]}>{damage.severity.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={S.damageCardBottom}>
                  <Text style={S.damageCost}>R {damage.estimatedCost.toLocaleString()}</Text>
                  {damage.photoUris.length > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="camera" size={14} color={theme.colors.textMuted} />
                      <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{damage.photoUris.length} photo{damage.photoUris.length !== 1 ? 's' : ''}</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={() => removeDamage(i)} style={S.removeBtn}>
                    <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
                {/* Photo thumbnails */}
                {damage.photoUris.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {damage.photoUris.map((uri, pi) => (
                      <Image key={pi} source={{ uri }} style={S.photoThumb} />
                    ))}
                  </ScrollView>
                )}
              </View>
            );
          })
        )}

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
              <Ionicons name="document-text-outline" size={20} color="#fff" />
              <Text style={S.submitBtnText}>
                {damages.length > 0 ? `Submit & Generate Invoice (R ${totalCost.toLocaleString()})` : 'Submit — No Damages'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* ── EVENT PICKER MODAL ── */}
      <Modal visible={showEventPicker} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <Text style={S.modalTitle}>Select Event</Text>

            {/* Day tabs */}
            <View style={S.tabRow}>
              {eventDayKeys.map((key, idx) => (
                <TouchableOpacity
                  key={key}
                  style={[S.tabBtn, pickerTab === idx && { backgroundColor: theme.colors.primary }]}
                  onPress={() => setPickerTab(idx)}
                >
                  <Text style={[S.tabText, pickerTab === idx && { color: '#fff' }]}>{eventDayLabel[idx]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {loadingEvents ? (
              <ActivityIndicator color={theme.colors.primary} style={{ padding: 24 }} />
            ) : filteredEvents.length === 0 ? (
              <Text style={S.modalEmpty}>No {eventDayLabel[pickerTab].toLowerCase()} events found</Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }}>
                {filteredEvents.map(ev => (
                  <TouchableOpacity
                    key={ev.id}
                    style={[S.modalItem, selectedEvent?.id === ev.id && { backgroundColor: theme.colors.primaryLight }]}
                    onPress={() => { setSelectedEvent(ev); setShowEventPicker(false); }}
                  >
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={S.modalItemTitle}>{ev.venueName || 'Venue'}</Text>
                      <Text style={S.modalItemSub}>
                        {ev.eventType || 'Event'} · {String(ev.eventDate || ev.date || '').slice(0, 10)} · {String(ev.status || '').replace('_', ' ')}
                      </Text>
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

      {/* ── ADD DAMAGE MODAL ── */}
      <Modal visible={showAddDamage} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <ScrollView contentContainerStyle={[S.modalSheet, { paddingBottom: 32 }]} style={{ maxHeight: '90%' }}>
            <Text style={S.modalTitle}>Add Damage Item</Text>

            <Text style={S.fieldLabel}>Item Name *</Text>
            <TextInput
              style={S.fieldInput}
              placeholder="e.g. Projector, Chair (x3)"
              placeholderTextColor={theme.colors.textMuted}
              value={newDamage.item}
              onChangeText={t => setNewDamage(prev => ({ ...prev, item: t }))}
            />

            <Text style={S.fieldLabel}>Description</Text>
            <TextInput
              style={[S.fieldInput, { minHeight: 60, textAlignVertical: 'top' }]}
              placeholder="Describe the damage..."
              placeholderTextColor={theme.colors.textMuted}
              multiline
              value={newDamage.description}
              onChangeText={t => setNewDamage(prev => ({ ...prev, description: t }))}
            />

            <Text style={S.fieldLabel}>Estimated Cost (R) *</Text>
            <TextInput
              style={S.fieldInput}
              placeholder="0"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="numeric"
              value={newDamage.estimatedCost > 0 ? String(newDamage.estimatedCost) : ''}
              onChangeText={t => setNewDamage(prev => ({ ...prev, estimatedCost: Number(t) || 0 }))}
            />

            <Text style={S.fieldLabel}>Severity</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {SEVERITY_OPTS.map(sev => {
                const sc = sevColor(theme, sev);
                return (
                  <TouchableOpacity
                    key={sev}
                    style={[S.sevOption, { backgroundColor: sc.bg, borderWidth: newDamage.severity === sev ? 2 : 0, borderColor: sc.text }]}
                    onPress={() => setNewDamage(prev => ({ ...prev, severity: sev }))}
                  >
                    <Text style={[S.sevText, { color: sc.text }]}>{sev.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={S.photoBtn} onPress={pickPhoto}>
              <Ionicons name="camera-outline" size={20} color={theme.colors.secondary} />
              <Text style={[S.addBtnText, { color: theme.colors.secondary }]}>
                {newDamage.photoUris.length > 0 ? `${newDamage.photoUris.length} Photo(s) — Add More` : 'Attach Photo Evidence'}
              </Text>
            </TouchableOpacity>

            {newDamage.photoUris.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {newDamage.photoUris.map((uri, pi) => (
                  <Image key={pi} source={{ uri }} style={S.photoThumb} />
                ))}
              </ScrollView>
            )}

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                style={[S.confirmBtn, { backgroundColor: theme.colors.border }]}
                onPress={() => { setShowAddDamage(false); setNewDamage({ item: '', description: '', estimatedCost: 0, severity: 'low', photos: [], photoUris: [] }); }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.confirmBtn, { backgroundColor: theme.colors.error, flex: 2 }]} onPress={addDamageItem}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Add Damage</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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

  selectorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    padding: 14, borderRadius: 12, marginBottom: 16,
  },
  selectorText: { flex: 1, fontSize: 15, color: theme.colors.text, fontWeight: '500' },

  totalBanner: {
    backgroundColor: theme.colors.error, borderRadius: 16, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  totalLabel: { fontSize: 13, color: '#fff', opacity: 0.8, fontWeight: '600' },
  totalValue: { fontSize: 24, fontWeight: '800', color: '#fff' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.error, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  emptyCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 32,
    alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  emptyText: { fontSize: 15, color: theme.colors.textMuted, fontWeight: '600' },

  damageCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  damageCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  damageItemText: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  damageDesc: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  sevBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  sevText: { fontSize: 11, fontWeight: '700' },
  damageCardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  damageCost: { fontSize: 16, fontWeight: '800', color: theme.colors.error },
  removeBtn: { padding: 4 },
  photoThumb: { width: 60, height: 60, borderRadius: 8, marginRight: 8 },

  submitBtn: {
    backgroundColor: theme.colors.error, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14, marginTop: 24,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  successIcon: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  successTitle: { fontSize: 28, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  successSub: { fontSize: 16, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8 },
  successStats: { marginTop: 16, alignItems: 'center', gap: 8 },
  successStatText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 16 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tabBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: theme.colors.surfaceVariant,
  },
  tabText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  modalEmpty: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', padding: 20 },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8,
    backgroundColor: theme.colors.surfaceVariant,
  },
  modalItemTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  modalItemSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  modalClose: { alignItems: 'center', padding: 16 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 12 },
  fieldInput: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10,
    padding: 12, fontSize: 15, color: theme.colors.text,
  },
  sevOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: theme.colors.secondary, borderStyle: 'dashed',
    paddingVertical: 12, borderRadius: 10, justifyContent: 'center', marginTop: 12,
  },
  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
});