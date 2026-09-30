import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  useColorScheme
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '@/constants/theme';
import { useTranslation } from '@/i18n/hooks';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { todayISO } from '@/utils/dates';

// Firebase Imports
import { auth, db, createRefundRequest, deriveBookingPaymentState } from '../../services/firebase-services';
import { listenForGuestActivity, GuestActivity } from '../../services/firebase-services';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#16a34a',
  pending_payment: '#d97706',
  pending: '#d97706',
  completed: '#2563eb',
  cancelled: '#dc2626',
  checked_in: '#16a34a',
  delivered: '#16a34a',
  preparing: '#d97706',
  ready: '#2563eb',
  deposit_paid: '#d97706',
  'Deposit Paid': '#d97706',
  paid_in_full: '#16a34a',
  'Paid In Full': '#16a34a',
  'Venue Approved for Guests': '#16a34a',
};

const formatStatus = (status: string) =>
  (status || 'unknown').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const formatMoney = (amount: any) => `R ${Number(amount || 0).toLocaleString()}`;

const formatOrderTime = (order: any) => {
  const raw = order?.createdAt || order?.timestamp;
  if (!raw) return 'Today';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? 'Today' : d.toLocaleString();
};

export default function ReservationsScreen() {
  const [activity, setActivity] = useState<GuestActivity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const user = auth.currentUser;

  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const { t } = useTranslation();
  const styles = createStyles(theme);

  const formatEventDate = (booking: any) => {
    const raw = booking?.eventDateStr || booking?.date || booking?.eventDate;
    if (!raw) return t('dateTBD');
    const d = new Date(raw);
    return isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString();
  };

  // An event/amenity is "past" once its day (and time, where known) has passed.
  const eventDayKey = (item: any) => String(item?.eventDateStr || item?.date || item?.eventDate || '').slice(0, 10);
  const amenityDayKey = (item: any) => String(item?.date || item?.eventDate || '').slice(0, 10);

  const isPastItem = (item: any) => {
    const day = eventDayKey(item) || amenityDayKey(item);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const localDay = new Date(`${day}T23:59:59`);
    const localToday = new Date();
    localToday.setHours(0, 0, 0, 0);
    return localDay.getTime() < localToday.getTime();
  };

  const isPastEvent = (booking: any) => isPastItem(booking);
  const isPastAmenity = (item: any) => isPastItem(item);

  const ticketSummary = (tickets: any) => {
    if (!tickets) return '';
    const arr = Array.isArray(tickets) ? tickets : [tickets];
    const total = arr.reduce((sum: number, item: any) => sum + Number(item?.quantity || 1), 0);
    return `${total} ${total === 1 ? t('ticket') : t('tickets')}`;
  };


  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    const unsubscribe = listenForGuestActivity(user.uid, (data) => {
      setActivity(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const openEventActions = (booking: any) => {
    router.push({
      pathname: '/event-invitations',
      params: { eventId: booking.id },
    } as any);
  };

  const openEventCatering = (booking: any) => {
    if (isPastEvent(booking)) {
      showAlert({
        title: 'Event Has Ended',
        message: 'Catering can only be arranged while the event is still upcoming.',
        type: 'warning',
      });
      return;
    }
    router.push({
      pathname: '/event-catering',
      params: { bookingId: booking.id, expectedAttendance: booking.expectedAttendance || 30 },
    } as any);
  };

  const openEventFeedback = (booking: any) => {
    const raw = booking.eventDateStr || booking.eventDate || booking.date || '';
    const eventDay = String(raw).slice(0, 10);
    const todayStr = todayISO();
    if (/^\d{4}-\d{2}-\d{2}$/.test(eventDay) && eventDay > todayStr) {
      Alert.alert(
        'Event Feedback Locked',
        'Feedback can only be submitted on or after the event date.'
      );
      return;
    }
    router.push({ pathname: '/event-feedback', params: { eventId: booking.id } } as any);
  };

  const openLiveComplaint = (booking: any) => {
    router.push({ pathname: '/live-complaint', params: { eventId: booking.id } } as any);
  };

  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedBookingForRefund, setSelectedBookingForRefund] = useState<any>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const openRefundModal = (booking: any) => {
    router.push({ pathname: '/(guest)/refund-request', params: { eventId: booking.id } } as any);
  };

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const handleConfirmRefundSubmit = async () => {
    if (!refundReason.trim()) {
      showAlert({ title: 'Missing Reason', message: 'Please state the reason for your refund request.', type: 'warning' });
      return;
    }
    const amt = Number(refundAmountInput);
    if (isNaN(amt) || amt <= 0) {
      showAlert({ title: 'Invalid Amount', message: 'Please enter a valid refund amount.', type: 'warning' });
      return;
    }

    setSubmittingRefund(true);
    try {
      await createRefundRequest({
        eventId: selectedBookingForRefund.id,
        guestId: user!.uid,
        reason: refundReason.trim(),
        requestedAmount: amt,
        totalPaidAmount: selectedBookingForRefund.paidAmount,
      });
      setShowRefundModal(false);
      showAlert({ title: '✅ Refund Request Submitted', message: 'Your request has been logged and is pending Admin review.', type: 'success' });
    } catch (err: any) {
      showAlert({ title: 'Refund Error', message: err.message || 'Failed to submit refund request.', type: 'error' });
    } finally {
      setSubmittingRefund(false);
    }
  };

  const handlePayNow = (booking: any) => {
    if (isPastEvent(booking)) {
      showAlert({
        title: 'Event Has Ended',
        message: 'Payment is no longer available once the event date has passed. Contact the front desk for billing questions.',
        type: 'warning',
      });
      return;
    }
    const money = deriveBookingPaymentState(booking);
    const payingDeposit = money.balanceDue === money.combinedTotal;
    router.push({
      pathname: '/payment',
      params: {
        bookingId: booking.id,
        roomName: booking.venueName || 'Event Booking',
        total: String(money.combinedTotal || booking.totalAmount || 0),
        depositAmount: String(money.depositRequired || Math.round((booking.totalAmount || 0) * 0.5)),
        checkIn: booking.eventDateStr || booking.date || '',
        nights: String(1),
        expectedAttendance: booking.expectedAttendance ? String(booking.expectedAttendance) : undefined,
        payBalance: payingDeposit ? '' : '1',
      }
    } as any);
  };

  const handleCancelBooking = (booking: any) => {
    showAlert({
      title: 'Cancel Booking',
      message: `Are you sure you want to cancel your reservation for ${booking.venueName || 'this event'}?`,
      type: 'warning',
      confirmText: 'Yes, Cancel',
      cancelText: 'Keep Booking',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'event_bookings', booking.id), {
            status: 'cancelled',
            cancelledAt: serverTimestamp(),
          });
          showAlert({ title: 'Booking Cancelled', message: 'Your reservation has been cancelled.', type: 'info' });
        } catch (err: any) {
          showAlert({ title: 'Error', message: err.message || 'Could not cancel booking.', type: 'error' });
        }
      }
    });
  };

  const [subTab, setSubTab] = useState<'active' | 'cancelled' | 'completed'>('active');

  const profile = activity?.profile;
  const eventBookings = activity?.eventBookings || [];
  const spaBookings = activity?.spaBookings || [];
  const tourBookings = activity?.tourBookings || [];
  const tableReservations = activity?.tableReservations || [];
  const invitations = activity?.invitations || [];
  const foodOrders = activity?.foodOrders || [];
  const catering = activity?.catering || [];

  const amenityBookings = [
    ...spaBookings.map((b: any) => ({ ...b, kind: 'spa' })),
    ...tourBookings.map((b: any) => ({ ...b, kind: 'tour' })),
    ...tableReservations.map((b: any) => ({ ...b, kind: 'table' })),
  ].sort((a, b) => {
    const da = new Date(`${a.date || ''}T${a.time || '00:00'}`).getTime() || 0;
    const db = new Date(`${b.date || ''}T${b.time || '00:00'}`).getTime() || 0;
    return db - da;
  });

  const filteredEventBookings = eventBookings.filter((b: any) => {
    if (b.status === 'cancelled') return subTab === 'cancelled';
    if (b.status === 'completed' || b.status === 'finished' || isPastEvent(b)) return subTab === 'completed';
    return subTab === 'active';
  });

  const filteredAmenityBookings = amenityBookings.filter((b: any) => {
    if (b.status === 'cancelled') return subTab === 'cancelled';
    if (b.status === 'completed' || b.status === 'finished' || isPastAmenity(b)) return subTab === 'completed';
    return subTab === 'active';
  });

  const iconFor = (kind: string) =>
    kind === 'spa' ? 'leaf' : kind === 'tour' ? 'compass' : 'restaurant';
  const colorFor = (kind: string) =>
    kind === 'spa' ? '#81b29a' : kind === 'tour' ? theme.colors.primary : '#e07a5f';

  const titleFor = (item: any) =>
    item.kind === 'spa' ? item.treatmentName : item.kind === 'tour' ? item.tourName : `Table for ${item.partySize}`;

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.secondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('myActivity')}</Text>
          <Text style={styles.headerSubtitle}>{t('bookingsReservations')}</Text>
        </View>
        <TouchableOpacity onPress={() => {}} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={24} color={theme.colors.secondary} />
        </TouchableOpacity>
      </View>

      {/* SUB TABS */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, gap: 8, backgroundColor: theme.colors.background }}>
        {[
          { key: 'active', label: t('activeUpcoming'), icon: 'calendar-outline' },
          { key: 'cancelled', label: t('cancelled'), icon: 'close-circle-outline' },
          { key: 'completed', label: t('completed'), icon: 'checkmark-done-outline' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: subTab === tab.key ? theme.colors.primary : theme.colors.surface,
              borderWidth: 1,
              borderColor: subTab === tab.key ? theme.colors.primary : theme.colors.border,
            }}
            onPress={() => setSubTab(tab.key as any)}
          >
            <Ionicons name={tab.icon as any} size={15} color={subTab === tab.key ? theme.colors.textInverse : theme.colors.textMuted} />
            <Text style={{ fontSize: 11, fontWeight: '800', color: subTab === tab.key ? theme.colors.textInverse : theme.colors.textMuted }}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!user ? (
        <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Ionicons name="lock-closed-outline" size={64} color="#c9a227" />
          <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text, marginTop: 16, textAlign: 'center' }}>
            {t('myActivityLocked')}
          </Text>
          <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
            {t('activityLockedDesc')}
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#c9a227', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginTop: 24 }}
            onPress={() => router.push('/login')}
          >
            <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 16 }}>{t('signInToYourStay')}</Text>
          </TouchableOpacity>
        </View>
      ) : isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.secondary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* CURRENT STAY — single source: users.roomNumber */}
          {profile?.roomNumber && profile.roomNumber !== 'N/A' && (
            <View style={styles.stayCard}>
              <View style={styles.stayHeader}>
                <Text style={styles.stayLabel}>{t('yourCurrentStay')}</Text>
                <Ionicons name="key" size={20} color="#c9a227" />
              </View>
              <Text style={styles.stayRoom}>{t('suite')} {profile.roomNumber}</Text>
              <Text style={styles.stayName}>{profile.name || 'Guest'}</Text>
              <View style={styles.stayRow}>
                <Text style={styles.stayDetail}>{t('wifi')}: AZURE-{profile.roomNumber}</Text>
                <Text style={styles.stayDetail}>{t('status')}: {formatStatus(profile.status || 'guest')}</Text>
              </View>
            </View>
          )}

          {/* EVENT BOOKINGS */}
          {filteredEventBookings.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('eventBookingsSection')} ({subTab})</Text>
              {filteredEventBookings.map((booking: any) => (
                <View key={booking.id} style={styles.eventCard}>
                  <View style={styles.eventCardHeader}>
                    <View>
                      <Text style={styles.eventVenue}>{booking.venueName}</Text>
                      <Text style={styles.eventDate}>
                        {formatEventDate(booking)}
                        {booking.expectedAttendance ? ` • ${booking.expectedAttendance} guests` : ''}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[booking.status] || '#6b7280') + '22' }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLORS[booking.status] || '#6b7280' }]}>
                        {formatStatus(booking.status)}
                      </Text>
                    </View>
                  </View>
                  {booking.totalAmount || booking.cateringTotal || booking.amountPaid ? (
                    (() => {
                      const money = deriveBookingPaymentState(booking);
                      const nothingPaid = money.balanceDue === money.combinedTotal && money.combinedTotal > 0;
                      return (
                        <View style={styles.paymentBox}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.paymentMeta}>
                              Total <Text style={styles.paymentStrong}>{formatMoney(money.combinedTotal)}</Text>
                              {'  ·  '}Paid <Text style={styles.paymentStrong}>{formatMoney(money.amountPaid)}</Text>
                              {'  ·  '}Balance <Text style={[styles.paymentStrong, { color: money.balanceDue > 0 ? '#d97706' : '#16a34a' }]}>{formatMoney(money.balanceDue)}</Text>
                            </Text>
                            {money.cateringTotal > 0 && (
                              <Text style={styles.paymentCateringNote}>
                                Includes catering R {money.cateringTotal.toLocaleString()}
                              </Text>
                            )}
                          </View>
                          {money.balanceDue > 0 && !isPastEvent(booking) ? (
                            <TouchableOpacity style={[styles.payNowBtn, nothingPaid && { backgroundColor: '#16a34a' }]} onPress={() => handlePayNow(booking)}>
                              <Ionicons name="card-outline" size={15} color="#fff" />
                              <Text style={styles.payNowBtnText}>{nothingPaid ? 'Pay Deposit' : 'Pay Balance'}</Text>
                            </TouchableOpacity>
                          ) : money.balanceDue > 0 ? (
                            <View style={[styles.statusBadge, { backgroundColor: '#6b728022' }]}>
                              <Text style={[styles.statusText, { color: '#6b7280' }]}>Event Concluded</Text>
                            </View>
                          ) : (
                            <View style={[styles.statusBadge, { backgroundColor: '#16a34a22' }]}>
                              <Text style={[styles.statusText, { color: '#16a34a' }]}>Paid In Full</Text>
                            </View>
                          )}
                        </View>
                      );
                    })()
                  ) : null}
                  <View style={styles.eventActions}>
                    {!isPastEvent(booking) && (
                      <TouchableOpacity style={styles.eventActionBtn} onPress={() => openEventCatering(booking)}>
                        <Ionicons name="restaurant" size={16} color={theme.colors.secondary} />
                        <Text style={styles.eventActionText}>{t('catering')}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.eventActionBtn} onPress={() => openEventActions(booking)}>
                      <Ionicons name="people" size={16} color={theme.colors.secondary} />
                      <Text style={styles.eventActionText}>{t('invitations')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.eventActionBtn} onPress={() => openEventFeedback(booking)}>
                      <Ionicons name="star" size={16} color={theme.colors.secondary} />
                      <Text style={styles.eventActionText}>{t('feedback')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.eventActionBtn} onPress={() => openLiveComplaint(booking)}>
                      <Ionicons name="alert-circle" size={16} color={theme.colors.secondary} />
                      <Text style={styles.eventActionText}>{t('complaint')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.eventActionBtn} onPress={() => openRefundModal(booking)}>
                      <Ionicons name="cash-outline" size={16} color="#dc2626" />
                      <Text style={[styles.eventActionText, { color: '#dc2626' }]}>{t('refund')}</Text>
                    </TouchableOpacity>
                    {booking.status !== 'cancelled' && !isPastEvent(booking) && (
                      <TouchableOpacity style={styles.eventActionBtn} onPress={() => handleCancelBooking(booking)}>
                        <Ionicons name="close-circle-outline" size={16} color="#64748b" />
                        <Text style={[styles.eventActionText, { color: '#64748b' }]}>{t('cancel')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* SPA / TOURS / TABLE RESERVATIONS */}
          {filteredAmenityBookings.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('spaToursDining')} ({subTab})</Text>
              {filteredAmenityBookings.map((item) => {
                const iconColor = colorFor(item.kind);
                return (
                  <View key={`${item.kind}-${item.id}`} style={styles.amenityCard}>
                    <View style={[styles.iconBox, { backgroundColor: `${iconColor}20` }]}>
                      <Ionicons name={iconFor(item.kind) as any} size={20} color={iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.amenityTitle}>{titleFor(item)}</Text>
                      <Text style={styles.amenityMeta}>
                        {item.date} {item.time ? `at ${item.time}` : ''}
                        {item.tickets ? ` • ${ticketSummary(item.tickets)}` : ''}
                        {item.totalAmount || item.price ? ` • ${formatMoney(item.totalAmount || item.price)}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] || '#6b7280') + '22' }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] || '#6b7280' }]}>
                        {formatStatus(item.status)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {filteredEventBookings.length === 0 && filteredAmenityBookings.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 48, backgroundColor: theme.colors.surface, borderRadius: 20, marginHorizontal: 16, marginTop: 16 }}>
              <Ionicons name="calendar-outline" size={48} color={theme.colors.textMuted} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 12 }}>
                {t('noBookingsFound').replace('{subTab}', subTab)}
              </Text>
              <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 }}>
                {subTab === 'active' ? t('activeReservationsAppear') : subTab === 'cancelled' ? t('cancelledHistoryAppear') : t('completedActivitiesAppear')}
              </Text>
            </View>
          )}

          {/* FOOD ORDERS */}
          {foodOrders.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('foodOrdersSection')}</Text>
              {foodOrders.slice(0, 10).map((order: any) => (
                <View key={order.id} style={styles.amenityCard}>
                  <View style={[styles.iconBox, { backgroundColor: '#e07a5f20' }]}>
                    <Ionicons name="fast-food" size={20} color="#e07a5f" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.amenityTitle}>
                      {Array.isArray(order.items) && order.items.length > 0
                        ? order.items.map((i: any) => `${i.name} x${i.quantity}`).join(', ')
                        : t('foodOrder')}
                    </Text>
                    <Text style={styles.amenityMeta}>
                      {order.orderType?.split('_').join(' ') || 'Order'}
                      {' • '}
                      {formatOrderTime(order)}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.orderAmount}>{formatMoney(order.totalAmount)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[order.status] || '#6b7280') + '22' }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLORS[order.status] || '#6b7280' }]}>
                        {formatStatus(order.status)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* CATERING BOOKINGS */}
          {catering.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Catering Bookings</Text>
              {catering.map((cat: any) => (
                <View key={cat.id} style={styles.amenityCard}>
                  <View style={[styles.iconBox, { backgroundColor: '#e07a5f20' }]}>
                    <Ionicons name="restaurant" size={20} color="#e07a5f" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.amenityTitle}>
                      {Array.isArray(cat.items)
                        ? cat.items.map((i: any) => `${i.name} x${i.quantity}`).join(', ')
                        : 'Catering order'}
                    </Text>
                    <Text style={styles.amenityMeta}>
                      {cat.expectedAttendance} guests •{' '}
                      {cat.createdAt ? new Date(cat.createdAt).toLocaleDateString() : 'Today'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.orderAmount}>{formatMoney(cat.totalAmount)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[cat.status] || '#6b7280') + '22' }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLORS[cat.status] || '#6b7280' }]}>
                        {formatStatus(cat.status)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* INVITATIONS SENT */}
          {invitations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Invitations Sent</Text>
              {invitations.slice(0, 10).map((inv: any) => (
                <View key={inv.id} style={styles.amenityCard}>
                  <View style={[styles.iconBox, { backgroundColor: `${theme.colors.primary}20` }]}>
                    <Ionicons name="mail" size={20} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.amenityTitle}>{inv.inviteeName}</Text>
                    <Text style={styles.amenityMeta}>{inv.inviteeEmail}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[inv.status] || '#6b7280') + '22' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[inv.status] || '#6b7280' }]}>
                      {formatStatus(inv.status)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {!isLoading &&
            eventBookings.length === 0 &&
            amenityBookings.length === 0 &&
            foodOrders.length === 0 &&
            invitations.length === 0 &&
            catering.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={64} color={theme.colors.textMuted} />
                <Text style={styles.emptyTitle}>Nothing booked yet</Text>
                <Text style={styles.emptyText}>
                  Book an event venue, a spa treatment, a tour, or a table — everything will show up here live.
                </Text>
              </View>
            )}
        </ScrollView>
      )}

      {/* REFUND REQUEST MODAL (UC32) */}
      <Modal visible={showRefundModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#1e293b' }}>Request Event Refund (UC32)</Text>
              <TouchableOpacity onPress={() => setShowRefundModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              Original Paid Amount: <Text style={{ fontWeight: '800', color: '#1e293b' }}>R {selectedBookingForRefund?.paidAmount}</Text>
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 }}>Refund Reason</Text>
            <TextInput
              style={{ backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, fontSize: 14, color: '#0f172a', marginBottom: 14, borderWidth: 1, borderColor: '#cbd5e1' }}
              placeholder="State reason for refund request..."
              placeholderTextColor="#94a3b8"
              value={refundReason}
              onChangeText={setRefundReason}
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 }}>Requested Refund Amount (R)</Text>
            <TextInput
              style={{ backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, fontSize: 14, color: '#0f172a', marginBottom: 16, borderWidth: 1, borderColor: '#cbd5e1' }}
              placeholder="Amount in ZAR"
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
              value={refundAmountInput}
              onChangeText={setRefundAmountInput}
            />

            <TouchableOpacity
              style={{ backgroundColor: '#dc2626', paddingVertical: 14, borderRadius: 14, alignItems: 'center' }}
              onPress={handleConfirmRefundSubmit}
              disabled={submittingRefund}
            >
              {submittingRefund ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '800' }}>Submit Refund Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom Themed Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backButton: { padding: 4, marginLeft: -8 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text },
  headerSubtitle: { fontSize: 12, color: theme.colors.textMuted },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  emptyText: { textAlign: 'center', color: theme.colors.textMuted, lineHeight: 22 },

  stayCard: { backgroundColor: '#1e3a5f', borderRadius: 20, padding: 20, marginBottom: 24 },
  stayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stayLabel: { color: '#c9a227', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  stayRoom: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  stayName: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2, marginBottom: 12 },
  stayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stayDetail: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },

  section: { marginTop: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: 12 },

  eventCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  eventCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  eventVenue: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: 4 },
  eventDate: { fontSize: 13, color: theme.colors.textSecondary },
  eventAmount: { fontSize: 15, fontWeight: '700', color: theme.colors.success, marginTop: 10 },
  paymentBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
    backgroundColor: theme.colors.surfaceVariant, borderRadius: 12, padding: 10,
  },
  paymentMeta: { fontSize: 12, color: theme.colors.textMuted },
  paymentStrong: { fontWeight: '800', color: theme.colors.text },
  paymentCateringNote: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },
  payNowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#d97706', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  payNowBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  eventActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  eventActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  eventActionText: { fontSize: 12, fontWeight: '600', color: theme.colors.secondary },

  amenityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  amenityTitle: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginBottom: 3 },
  amenityMeta: { fontSize: 12, color: theme.colors.textMuted },
  orderAmount: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 4, textAlign: 'right' },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: 'bold' },
});
