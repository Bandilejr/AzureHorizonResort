import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Image, Platform
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ListSkeleton } from '@/components/ui/states';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { db, createRefundRequest } from '../../services/firebase-services';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export default function GuestRefundRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const { user, profile } = useAuth();
  const theme = useAppTheme();
  const S = createStyles(theme);

  const [loadingBookings, setLoadingBookings] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);

  const [requestedAmountInput, setRequestedAmountInput] = useState('');
  const [reason, setReason] = useState('');
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [bookingFilter, setBookingFilter] = useState<'active' | 'cancelled' | 'all'>('active');
  const [existingRefunds, setExistingRefunds] = useState<Record<string, any>>({});
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedRefId, setSubmittedRefId] = useState('');

  useEffect(() => {
    loadGuestBookings();
  }, [user]);

  const loadGuestBookings = async () => {
    if (!user) return;
    setLoadingBookings(true);
    try {
      // 1. Fetch bookings
      const bQuery = query(
        collection(db, 'event_bookings'),
        where('guestId', '==', user.uid)
      );
      const bSnap = await getDocs(bQuery);
      const bList = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 2. Fetch existing refund requests for user
      const rQuery = query(
        collection(db, 'refund_requests'),
        where('guestId', '==', user.uid)
      );
      const rSnap = await getDocs(rQuery);
      const refMap: Record<string, any> = {};
      rSnap.docs.forEach(d => {
        const data = d.data() as any;
        if (data.eventId) {
          refMap[data.eventId] = { id: d.id, status: data.status, amount: data.requestedAmount };
        }
      });
      setExistingRefunds(refMap);
      setBookings(bList);

      // Filter active first
      const activeList = bList.filter((b: any) => b.status !== 'cancelled');
      const targetList = activeList.length > 0 ? activeList : bList;

      // Auto select if passed via params
      if (params.eventId) {
        const found = bList.find(b => b.id === params.eventId);
        if (found) {
          selectBookingForRefund(found);
        }
      } else if (targetList.length > 0) {
        selectBookingForRefund(targetList[0]);
      }
    } catch (err) {
      console.warn('Failed to load guest bookings:', err);
    } finally {
      setLoadingBookings(false);
    }
  };

  const selectBookingForRefund = (b: any) => {
    const paid = Number(b.totalAmount || b.paidAmount || b.totalCost || b.depositAmount || 0);
    setSelectedBooking({ ...b, paidAmount: paid });
    setRequestedAmountInput(paid > 0 ? String(paid) : '');
  };

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const handlePickImage = async () => {
    if (proofImages.length >= 3) {
      showAlert({ title: 'Limit Reached', message: 'You can upload up to 3 proof photos per refund claim.', type: 'warning' });
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ title: 'Permission Denied', message: 'Camera roll permissions are required to select proof photos.', type: 'warning' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const base64Data = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      setProofImages(prev => [...prev, base64Data]);
    }
  };

  const handleTakePhoto = async () => {
    if (proofImages.length >= 3) {
      showAlert({ title: 'Limit Reached', message: 'You can upload up to 3 proof photos per refund claim.', type: 'warning' });
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ title: 'Permission Denied', message: 'Camera permissions are required to take proof photos.', type: 'warning' });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const base64Data = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      setProofImages(prev => [...prev, base64Data]);
    }
  };

  const removeImage = (index: number) => {
    setProofImages(prev => prev.filter((_, i) => i !== index));
  };

  const setPercentageAmount = (pct: number) => {
    if (!selectedBooking?.paidAmount) return;
    const calc = Math.round((selectedBooking.paidAmount * pct) / 100);
    setRequestedAmountInput(String(calc));
  };

  const handleSubmitRefund = async () => {
    if (!selectedBooking) {
      showAlert({ title: 'No Booking Selected', message: 'Please select the event booking you wish to claim a refund for.', type: 'warning' });
      return;
    }
    if (!reason.trim()) {
      showAlert({ title: 'Missing Reason', message: 'Please provide a detailed explanation for your refund claim.', type: 'warning' });
      return;
    }
    const amt = Number(requestedAmountInput);
    if (isNaN(amt) || amt <= 0) {
      showAlert({ title: 'Invalid Amount', message: 'Please enter a valid refund claim amount.', type: 'warning' });
      return;
    }
    if (selectedBooking.paidAmount > 0 && amt > selectedBooking.paidAmount) {
      showAlert({ title: 'Amount Exceeded', message: `Refund claim (R ${amt.toLocaleString()}) cannot exceed total paid amount (R ${selectedBooking.paidAmount.toLocaleString()}).`, type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const resDocRef = await createRefundRequest({
        eventId: selectedBooking.id,
        guestId: user!.uid,
        guestName: profile?.displayName || user?.displayName || 'Mpho Resident (Guest)',
        guestEmail: user?.email || 'guest@azurehorizon.com',
        reason: reason.trim(),
        requestedAmount: amt,
        totalPaidAmount: selectedBooking.paidAmount,
        proofImages,
      } as any);

      setSubmittedRefId(resDocRef?.id ? resDocRef.id.slice(-6).toUpperCase() : 'REFUND');
      setIsSuccess(true);
    } catch (err: any) {
      showAlert({ title: 'Submission Error', message: err.message || 'Failed to submit refund claim. Please try again.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      {/* ── HEADER ── */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.textInverse} />
        </TouchableOpacity>
        <View style={S.headerCenter}>
          <Text style={S.headerTitle}>File Refund Claim 💸</Text>
          <Text style={S.headerSubtitle}>UC33 · Resident Refund Portal</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>
        {isSuccess ? (
          /* ── SUCCESS STATE CARD ── */
          <View style={S.successCard}>
            <View style={S.successIconBox}>
              <Ionicons name="checkmark-circle" size={56} color={theme.colors.success} />
            </View>
            <Text style={S.successTitle}>Refund Claim Logged!</Text>
            <Text style={S.successRef}>Claim Reference #: <Text style={{ fontWeight: '900', color: theme.colors.primary }}>REF-{submittedRefId}</Text></Text>
            
            <Text style={S.successMsg}>
              Your refund request for <Text style={{ fontWeight: '700' }}>R {Number(requestedAmountInput).toLocaleString()}</Text> has been submitted to Resort Management.
            </Text>

            <View style={S.slaBox}>
              <Ionicons name="time-outline" size={20} color={theme.colors.gold} />
              <Text style={S.slaText}>Review SLA: Admin review & resolution typically completes within 24 to 48 hours.</Text>
            </View>

            <TouchableOpacity style={S.primaryBtn} onPress={() => router.push('/(guest)/reservations')}>
              <Text style={S.primaryBtnText}>View My Reservations & Claims</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ── REFUND FORM ── */
          <>
            {/* ── STEP 1: SELECT BOOKING ── */}
            <View style={S.card}>
              <View style={S.stepHeader}>
                <View style={S.stepBadge}><Text style={S.stepBadgeText}>1</Text></View>
                <Text style={S.cardTitle}>Select Reserved Event</Text>
              </View>

              {/* FILTER CHIPS: Active vs Cancelled */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, marginTop: 4 }}>
                {[
                  { key: 'active', label: '🟢 Active Events' },
                  { key: 'cancelled', label: '🔴 Cancelled' },
                  { key: 'all', label: 'All History' },
                ].map(tab => (
                  <TouchableOpacity
                    key={tab.key}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                      backgroundColor: bookingFilter === tab.key ? theme.colors.primary : theme.colors.surfaceVariant,
                      borderWidth: 1, borderColor: bookingFilter === tab.key ? theme.colors.primary : theme.colors.border,
                    }}
                    onPress={() => setBookingFilter(tab.key as any)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: bookingFilter === tab.key ? theme.colors.textInverse : theme.colors.textMuted }}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {loadingBookings ? (
                <ListSkeleton rows={3} />
              ) : bookings.length === 0 ? (
                <EmptyState icon="calendar-outline" title="No event bookings found for your account." />
              ) : (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {bookings
                        .filter(b => {
                          if (bookingFilter === 'active') return b.status !== 'cancelled';
                          if (bookingFilter === 'cancelled') return b.status === 'cancelled';
                          return true;
                        })
                        .map(b => {
                          const isSelected = selectedBooking?.id === b.id;
                          const paid = Number(b.totalAmount || b.paidAmount || b.totalCost || b.depositAmount || 0);
                          const isCancelled = b.status === 'cancelled';
                          const existingRef = existingRefunds[b.id];

                          return (
                            <TouchableOpacity
                              key={b.id}
                              style={[
                                S.bookingChip,
                                isSelected && S.bookingChipSelected,
                                isCancelled && { borderColor: theme.colors.error }
                              ]}
                              onPress={() => selectBookingForRefund(b)}
                            >
                              <Text style={[S.bookingChipVenue, isSelected && S.bookingChipVenueSelected]} numberOfLines={1}>
                                {b.venueName || 'Resort Event'}
                              </Text>

                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 4 }}>
                                <View style={{
                                  paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
                                  backgroundColor: isCancelled ? theme.colors.errorSoft : theme.colors.successSoft,
                                  borderWidth: 1, borderColor: isCancelled ? theme.colors.error : theme.colors.success
                                }}>
                                  <Text style={{ fontSize: 9, fontWeight: '800', color: isCancelled ? theme.colors.error : theme.colors.success }}>
                                    {isCancelled ? '🔴 CANCELLED' : '🟢 ACTIVE'}
                                  </Text>
                                </View>

                                {existingRef && (
                                  <View style={{
                                    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
                                    backgroundColor: existingRef.status === 'approved' ? theme.colors.successSoft : existingRef.status === 'rejected' ? theme.colors.errorSoft : theme.colors.warningSoft,
                                    borderWidth: 1, borderColor: existingRef.status === 'approved' ? theme.colors.success : existingRef.status === 'rejected' ? theme.colors.error : theme.colors.warning
                                  }}>
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: existingRef.status === 'approved' ? theme.colors.success : existingRef.status === 'rejected' ? theme.colors.error : theme.colors.warning }}>
                                      {existingRef.status === 'approved' ? '✅ REFUNDED' : existingRef.status === 'rejected' ? '❌ DECLINED' : '⏳ PENDING'}
                                    </Text>
                                  </View>
                                )}
                              </View>

                              <Text style={[S.bookingChipDate, isSelected && { color: theme.colors.textInverse }]}>
                                {b.eventDate || b.date || 'Upcoming'}
                              </Text>
                              <Text style={[S.bookingChipAmount, isSelected && { color: theme.colors.primary }]}>
                                Paid: R {paid.toLocaleString()}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  </ScrollView>

                  {/* CANCELLED NOTIFICATION BANNER */}
                  {selectedBooking?.status === 'cancelled' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.errorSoft, padding: 10, borderRadius: 10, marginTop: 12, borderWidth: 1, borderColor: theme.colors.error }}>
                      <Ionicons name="alert-circle" size={18} color={theme.colors.error} />
                      <Text style={{ fontSize: 12, color: theme.colors.errorStrong, flex: 1, lineHeight: 16 }}>
                        <Text style={{ fontWeight: '800' }}>Cancelled Event Selected:</Text> This event was cancelled. You are eligible to claim a refund for paid fees.
                      </Text>
                    </View>
                  )}

                  {/* EXISTING REFUND NOTICE BANNER */}
                  {selectedBooking?.id && existingRefunds[selectedBooking.id] && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.warningSoft, padding: 10, borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: theme.colors.warning }}>
                      <Ionicons name="information-circle" size={18} color={theme.colors.warning} />
                      <Text style={{ fontSize: 12, color: theme.colors.warningStrong, flex: 1, lineHeight: 16 }}>
                        <Text style={{ fontWeight: '800' }}>Existing Claim ({existingRefunds[selectedBooking.id].status.toUpperCase()}):</Text> A refund claim of R {Number(existingRefunds[selectedBooking.id].amount || 0).toLocaleString()} is recorded for this booking.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* ── STEP 2: REFUND AMOUNT & PRESETS ── */}
            <View style={S.card}>
              <View style={S.stepHeader}>
                <View style={S.stepBadge}><Text style={S.stepBadgeText}>2</Text></View>
                <Text style={S.cardTitle}>Claim Amount (ZAR)</Text>
              </View>

              <View style={S.inputRow}>
                <Text style={S.currencyPrefix}>R</Text>
                <TextInput
                  style={S.amountInput}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textMuted}
                  value={requestedAmountInput}
                  onChangeText={setRequestedAmountInput}
                />
              </View>

              {selectedBooking?.paidAmount > 0 && (
                <View style={S.presetRow}>
                  <Text style={S.presetLabel}>Quick Presets:</Text>
                  <TouchableOpacity style={S.presetBtn} onPress={() => setPercentageAmount(50)}>
                    <Text style={S.presetBtnText}>50% (R {Math.round(selectedBooking.paidAmount * 0.5).toLocaleString()})</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.presetBtn} onPress={() => setPercentageAmount(100)}>
                    <Text style={S.presetBtnText}>100% Full (R {selectedBooking.paidAmount.toLocaleString()})</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ── STEP 3: REASON & JUSTIFICATION ── */}
            <View style={S.card}>
              <View style={S.stepHeader}>
                <View style={S.stepBadge}><Text style={S.stepBadgeText}>3</Text></View>
                <Text style={S.cardTitle}>Reason for Refund Request</Text>
              </View>

              <TextInput
                style={S.reasonInput}
                multiline
                numberOfLines={4}
                placeholder="Describe the issue, cancellation reason, or service deficiency in detail..."
                placeholderTextColor={theme.colors.textMuted}
                value={reason}
                onChangeText={setReason}
              />
            </View>

            {/* ── STEP 4: PROOF PHOTOS & ATTACHMENTS ── */}
            <View style={S.card}>
              <View style={S.stepHeader}>
                <View style={S.stepBadge}><Text style={S.stepBadgeText}>4</Text></View>
                <Text style={S.cardTitle}>Attach Photo Proof (Optional)</Text>
              </View>
              <Text style={S.proofSubtext}>Upload receipt screenshots, photo proof of service deficiency, or damage context.</Text>

              <View style={S.imageActionRow}>
                <TouchableOpacity style={S.imageBtn} onPress={handleTakePhoto}>
                  <Ionicons name="camera" size={18} color={theme.colors.primary} />
                  <Text style={S.imageBtnText}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={S.imageBtn} onPress={handlePickImage}>
                  <Ionicons name="images" size={18} color={theme.colors.primary} />
                  <Text style={S.imageBtnText}>Gallery</Text>
                </TouchableOpacity>
              </View>

              {proofImages.length > 0 && (
                <View style={S.thumbnailRow}>
                  {proofImages.map((uri, idx) => (
                    <View key={idx} style={S.thumbnailBox}>
                      <Image source={{ uri }} style={S.thumbnailImg} />
                      <TouchableOpacity style={S.removeImgBtn} onPress={() => removeImage(idx)}>
                        <Ionicons name="close" size={14} color={theme.colors.textInverse} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* ── SUBMIT BUTTON ── */}
            <TouchableOpacity
              style={[S.primaryBtn, submitting && { opacity: 0.7 }]}
              onPress={handleSubmitRefund}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="paper-plane" size={18} color={theme.colors.textInverse} />
                  <Text style={S.primaryBtnText}>Submit Refund Claim</Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Custom Themed Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </Screen>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 44 : 12, paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: theme.colors.secondary, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.textInverse },
  headerSubtitle: { fontSize: 11, color: theme.colors.primary, marginTop: 2 },
  content: { padding: 16, paddingBottom: 40 },

  card: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  stepBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { color: theme.colors.textInverse, fontSize: 12, fontWeight: '800' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },

  emptyBookingBox: { alignItems: 'center', paddingVertical: 20 },
  emptyBookingText: { color: theme.colors.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' },

  bookingChip: {
    backgroundColor: theme.colors.surfaceVariant, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: theme.colors.border, minWidth: 160,
  },
  bookingChipSelected: { backgroundColor: theme.colors.secondary, borderColor: theme.colors.primary },
  bookingChipVenue: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  bookingChipVenueSelected: { color: theme.colors.textInverse },
  bookingChipDate: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  bookingChipAmount: { fontSize: 12, fontWeight: '700', color: theme.colors.primary, marginTop: 4 },

  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surfaceVariant, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.colors.border },
  currencyPrefix: { fontSize: 20, fontWeight: '800', color: theme.colors.primary, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: '800', color: theme.colors.text, paddingVertical: 12 },

  presetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  presetLabel: { fontSize: 12, color: theme.colors.textMuted },
  presetBtn: { backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border },
  presetBtnText: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },

  reasonInput: {
    backgroundColor: theme.colors.surfaceVariant, borderRadius: 12, padding: 12, fontSize: 14, color: theme.colors.text,
    textAlignVertical: 'top', borderWidth: 1, borderColor: theme.colors.border, minHeight: 90,
  },

  proofSubtext: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 10 },
  imageActionRow: { flexDirection: 'row', gap: 10 },
  imageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.surfaceVariant, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border,
  },
  imageBtnText: { fontSize: 13, fontWeight: '700', color: theme.colors.text },

  thumbnailRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  thumbnailBox: { width: 70, height: 70, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  thumbnailImg: { width: '100%', height: '100%' },
  removeImgBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: theme.colors.overlay, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },

  primaryBtn: { backgroundColor: theme.colors.secondary, paddingVertical: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  primaryBtnText: { color: theme.colors.textInverse, fontWeight: '900', fontSize: 16 },

  successCard: { backgroundColor: theme.colors.surface, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, marginVertical: 20 },
  successIconBox: { marginBottom: 12 },
  successTitle: { fontSize: 22, fontWeight: '900', color: theme.colors.text },
  successRef: { fontSize: 14, color: theme.colors.textMuted, marginTop: 4 },
  successMsg: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  slaBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.warningSoft, padding: 12, borderRadius: 12, marginTop: 16, marginBottom: 20 },
  slaText: { fontSize: 12, color: theme.colors.warningStrong, flex: 1, lineHeight: 16 },
});
