import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  SafeAreaView,
  useColorScheme,
  StatusBar,
  RefreshControl,
  Modal,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { auth, db, listenForNotifications, markNotificationRead, deriveBookingPaymentState } from '../../services/firebase-services';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getTheme } from '@/constants/theme';
import { useTranslation } from '@/i18n/hooks';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PINNED_STORAGE_KEY = '@azure_horizon_pinned_tabs';

const UPCOMING_RESORT_EVENTS = [
  {
    id: 'evt-1',
    title: 'Sunset Lounge Cocktail & Jazz Soirée',
    date: 'Tonight · 18:30',
    venue: 'Oceanfront Sunset Terrace',
    price: 'R250 / person',
    category: 'Gala & Music',
    imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'evt-2',
    title: 'Azure Horizon Grand Gala Dinner',
    date: 'Tomorrow · 20:00',
    venue: 'Grand Crystal Ballroom',
    price: 'R450 / person',
    category: 'Dining & Gala',
    imageUrl: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'evt-3',
    title: 'Beachside Seafood & Wine Tasting',
    date: 'Saturday · 12:30',
    venue: 'Private Beach Pavilion',
    price: 'R350 / person',
    category: 'Culinary',
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
  },
];

export default function GuestPortal() {
  const { profile, refreshProfile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const { t } = useTranslation();
  const styles = createStyles(theme);

  const AVAILABLE_TABS_TO_PIN = [
    { id: 'guest-portal', label: t('portalHome'), icon: 'home' },
    { id: 'digital-key', label: t('digitalRoomKey'), icon: 'key' },
    { id: 'event-booking', label: t('eventsAndGalas'), icon: 'calendar' },
    { id: 'dining', label: t('resortDining'), icon: 'restaurant' },
    { id: 'spa', label: t('spaAndWellness'), icon: 'leaf' },
    { id: 'loyalty', label: t('rewardsAndPoints'), icon: 'diamond' },
    { id: 'profile', label: t('userProfile'), icon: 'person' },
  ];

  const [userBookings, setUserBookings] = useState<any[]>([]);
  const [activeRoomStay, setActiveRoomStay] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinnedTabs, setPinnedTabs] = useState<string[]>([
    'guest-portal', 'digital-key', 'event-booking', 'dining', 'spa', 'loyalty', 'profile'
  ]);

  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  // Notifications
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  const params = useLocalSearchParams();
  const user = auth.currentUser;
  // Visitor Mode is active when navigating via Explore or when unauthenticated
  const isVisitor = params.mode === 'visitor' || !user || profile?.status === 'visitor';
  const isResident = !isVisitor && user !== null;

  const loadPortalData = async () => {
    try {
      if (!user || isVisitor) {
        setIsLoading(false);
        setRefreshing(false);
        return;
      }

      // Query active bookings for current user across collections
      const fetchedBookings: any[] = [];

      const todayStr = new Date().toISOString().split('T')[0];

      try {
        const bookingsRef = collection(db, 'event_bookings');
        const q = query(bookingsRef, where('guestId', '==', user.uid));
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const data = d.data() as any;
          const status = (data.status || 'confirmed').toLowerCase();
          const dateVal = data.eventDate || data.date || data.eventDateStr || '';

          // Only active/upcoming events (not cancelled or completed, and date >= today)
          if (status !== 'cancelled' && status !== 'completed') {
            if (!dateVal || dateVal >= todayStr || new Date(dateVal).getTime() >= new Date(todayStr).getTime()) {
              fetchedBookings.push({ id: d.id, type: 'Event', ...data });
            }
          }
        });
      } catch (_) {}

      try {
        const diningRef = collection(db, 'dining_reservations');
        const qD = query(diningRef, where('guestId', '==', user.uid));
        const snapD = await getDocs(qD);
        snapD.forEach((d) => {
          const data = d.data() as any;
          const status = (data.status || 'confirmed').toLowerCase();
          const dateVal = data.reservationDate || data.date || '';

          if (status !== 'cancelled' && status !== 'completed') {
            if (!dateVal || dateVal >= todayStr || new Date(dateVal).getTime() >= new Date(todayStr).getTime()) {
              fetchedBookings.push({ id: d.id, type: 'Dining Table', ...data });
            }
          }
        });
      } catch (_) {}

      // Deduplicate by ID and sort chronologically
      const uniqueBookings = Array.from(new Map(fetchedBookings.map(item => [item.id, item])).values());
      uniqueBookings.sort((a: any, b: any) => {
        const dA = a.eventDate || a.date || a.reservationDate || '';
        const dB = b.eventDate || b.date || b.reservationDate || '';
        return dA.localeCompare(dB);
      });

      setUserBookings(uniqueBookings);

      if (isResident) {
        setActiveRoomStay({
          id: 'res-101',
          roomNumber: profile?.roomNumber !== 'N/A' && profile?.roomNumber ? profile.roomNumber : '101',
          roomName: `Oceanfront Luxury Suite ${profile?.roomNumber || '101'}`,
          checkInDate: 'Today',
          checkOutDate: 'In 3 Days',
          wifiPass: `AZURE-${profile?.roomNumber || '101'}`,
          status: 'confirmed',
        });
      }

      // Load pinned tabs
      const savedPins = await AsyncStorage.getItem(PINNED_STORAGE_KEY);
      if (savedPins) {
        setPinnedTabs(JSON.parse(savedPins));
      }
    } catch (error) {
      console.error('Guest portal fetch error:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPortalData();
  }, [user, profile]);

  // Live notification listener for resident
  useEffect(() => {
    if (!user || !isResident) return;
    const unsub = listenForNotifications(user.uid, (notifs) => {
      const sorted = [...notifs].sort((a, b) => {
        const aT = a.createdAt?.seconds || 0;
        const bT = b.createdAt?.seconds || 0;
        return bT - aT;
      });
      setNotifications(sorted);
    });
    return unsub;
  }, [user?.uid, isResident]);

  const onRefresh = () => {
    setRefreshing(true);
    refreshProfile();
    loadPortalData();
  };

  const handleTileClick = (featureTitle: string, route: string, locked: boolean) => {
    if (locked) {
      showAlert({
        title: '🔒 Resident Access Required',
        message: `"${featureTitle}" is reserved for checked-in resort guests.\n\nPlease sign in to your room stay to access digital room key, room service, and billing.`,
        type: 'warning',
        confirmText: 'Sign In Now',
        cancelText: 'Cancel',
        onConfirm: () => {
          router.push('/login');
        },
      });
      return;
    }
    router.push(route as any);
  };

  const togglePinTab = async (tabId: string) => {
    let updated: string[];
    if (pinnedTabs.includes(tabId)) {
      if (pinnedTabs.length <= 3) {
        showAlert({ title: 'Minimum Tabs Required', message: 'You must keep at least 3 pinned tabs.', type: 'warning' });
        return;
      }
      updated = pinnedTabs.filter(id => id !== tabId);
    } else {
      updated = [...pinnedTabs, tabId];
    }
    setPinnedTabs(updated);
    await AsyncStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(updated));
  };

  const featuresGrid = [
    { title: t('digitalRoomKey'), sub: t('nfcBiometricUnlock'), icon: 'key', color: '#c9a227', route: '/(guest)/digital-key', locked: isVisitor },
    { title: 'Suites & Villas', sub: 'Explore Luxury Accommodations', icon: 'bed', color: '#3b82f6', route: '/(guest)/room-gallery', locked: false },
    { title: t('resortDining'), sub: t('menusTableReservations'), icon: 'restaurant', color: '#eab308', route: '/(guest)/dining', locked: false },
    { title: 'Room Service', sub: 'In-Room Food & Amenities', icon: 'fast-food', color: '#f97316', route: '/(guest)/room-service', locked: isVisitor },
    { title: t('spaAndWellness'), sub: t('massagesHydrotherapy'), icon: 'leaf', color: '#10b981', route: '/(guest)/spa', locked: false },
    { title: 'Resort Events', sub: 'Galas, Jazz & Beach Parties', icon: 'calendar', color: '#8b5cf6', route: '/(guest)/event-booking', locked: false },
    { title: 'Loyalty Rewards', sub: 'Points, Tiers & Food Coupons', icon: 'diamond', color: '#ec4899', route: '/(guest)/loyalty', locked: false },
    { title: 'My Stays', sub: 'View & Manage Reservations', icon: 'calendar-number', color: '#06b6d4', route: '/(guest)/reservations', locked: isVisitor },
    { title: 'Folio & Billing', sub: 'Paystack Cards & Room Charges', icon: 'card', color: '#6366f1', route: '/(guest)/billing', locked: isVisitor },
    { title: 'My Orders', sub: 'Track Room Service & Spa', icon: 'receipt', color: '#f43f5e', route: '/(guest)/my-orders', locked: isVisitor },
    { title: 'Local Tours', sub: 'Guided Island Excursions', icon: 'boat', color: '#14b8a6', route: '/(guest)/tours', locked: false },
    { title: 'Live Complaint', sub: 'Maintenance & Service Requests', icon: 'warning', color: '#ef4444', route: '/(guest)/live-complaint', locked: isVisitor },
    { title: 'Leave Review', sub: 'Rate Your Stay & Events', icon: 'star', color: '#f59e0b', route: '/(guest)/leave-review', locked: false },
  ];

  // Increment 2 (UC37): NPO card only for linked NPO representatives —
  // provisioned as users/{email} { role: 'npo_rep', npoId } on UC34 approval.
  const profileAny = profile as any;
  if (profileAny?.role === 'npo_rep' || profileAny?.npoId) {
    featuresGrid.push(
      { title: 'NPO Donations', sub: 'Claim allocated food batches', icon: 'gift', color: '#16a34a', route: '/(npo)/allocations', locked: false },
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingLabel}>GOOD MORNING,</Text>
            <Text style={styles.userName}>
              {isVisitor ? 'Guest Explorer' : (profile?.displayName || user?.displayName || 'Resort Resident')}
            </Text>
            <View style={[styles.statusBadge, isVisitor && styles.statusBadgeVisitor]}>
              <Ionicons
                name={isVisitor ? 'compass-outline' : 'shield-checkmark-sharp'}
                size={12}
                color={isVisitor ? '#d97706' : '#16a34a'}
              />
              <Text style={[styles.statusBadgeText, isVisitor && styles.statusBadgeTextVisitor]}>
                {isVisitor
                  ? 'Visitor Mode (Explore Access)'
                  : `Verified Resident (Room ${profile?.roomNumber || '101'})`}
              </Text>
            </View>
          </View>

          <View style={styles.headerActionRow}>
            {isVisitor ? (
              <TouchableOpacity
                style={styles.signInHeaderBtn}
                onPress={() => router.push('/login')}
                activeOpacity={0.8}
              >
                <Ionicons name="log-in-outline" size={16} color="#0f172a" />
                <Text style={styles.signInHeaderBtnText}>Sign In</Text>
              </TouchableOpacity>
            ) : (
              <>
                {/* Notification Bell */}
                <TouchableOpacity
                  style={styles.pinBtn}
                  onPress={() => setShowNotifModal(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="notifications-outline" size={20} color="#c9a227" />
                  {unreadCount > 0 && (
                    <View style={styles.notifBadge}>
                      <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.pinBtn} onPress={() => setShowPinModal(true)} activeOpacity={0.8}>
                  <Ionicons name="options-outline" size={20} color="#c9a227" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/(guest)/profile')} style={styles.avatarButton}>
                  <Ionicons name="person" size={22} color="#c9a227" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Visitor Banner with Direct Sign In */}
        {isVisitor && (
          <View style={styles.visitorBanner}>
            <Ionicons name="lock-closed" size={20} color="#c9a227" />
            <View style={{ flex: 1 }}>
              <Text style={styles.visitorBannerTitle}>Visitor Access Active</Text>
              <Text style={styles.visitorBannerSub}>{t('signInToUnlock')}</Text>
            </View>
            <TouchableOpacity
              style={styles.visitorSignInBtn}
              onPress={() => router.push('/login')}
              activeOpacity={0.8}
            >
              <Text style={styles.visitorSignInBtnText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Resort Climate Widget */}
        <View style={styles.weatherCard}>
          <View style={styles.weatherInfo}>
            <Ionicons name="sunny-outline" size={28} color="#eab308" />
            <View>
              <Text style={styles.weatherLocation}>Coastal Bay Resort</Text>
              <Text style={styles.weatherTemp}>26°C · Sunny & Clear</Text>
            </View>
          </View>
          <View style={styles.weatherMeta}>
            <Text style={styles.weatherMetaText}>Humidity 58%</Text>
            <Text style={styles.weatherMetaText}>UV Index: High</Text>
          </View>
        </View>

        {/* Priority NFC Digital Room Key Banner for Residents */}
        {isResident && (
          <TouchableOpacity
            style={styles.digitalKeyBanner}
            onPress={() => router.push('/(guest)/digital-key')}
            activeOpacity={0.85}
          >
            <View style={styles.digitalKeyIconWrap}>
              <Ionicons name="key" size={28} color="#0f172a" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.digitalKeyBannerTitle}>{t('digitalRoomKeyReady')}</Text>
              <Text style={styles.digitalKeyBannerSub}>Tap to open Room {profile?.roomNumber || '101'} via NFC or Biometrics</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#0f172a" />
          </TouchableOpacity>
        )}

        {/* MY UPCOMING BOOKINGS & RESERVATIONS (RESIDENT PERSONAL LOG) */}
        {isResident && (
          <View style={{ marginTop: 12, marginBottom: 8 }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('myBookedEventsAndStays')}</Text>
              <TouchableOpacity onPress={() => router.push('/(guest)/reservations')}>
                <Text style={styles.seeAllText}>{t('manageStays')}</Text>
              </TouchableOpacity>
            </View>

            {userBookings.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventsScroll}>
                {userBookings.map((b) => {
                  const rawStatus = (b.status || 'confirmed').toLowerCase();
                  const isPending = rawStatus === 'pending' || rawStatus === 'pending_payment';
                  const statusLabel = isPending ? 'PENDING PAYMENT' : rawStatus.replace('_', ' ').toUpperCase();
                  const statusBg = isPending ? '#fffbeb' : '#f0fdf4';
                  const statusColor = isPending ? '#d97706' : '#16a34a';
                  const statusBorder = isPending ? '#f59e0b' : '#22c55e';

                  const title = b.venueName
                    ? `${b.venueName}${b.eventType ? ` · ${b.eventType}` : ''}`
                    : b.restaurantName
                    ? `${b.restaurantName} (Dining)`
                    : b.eventTitle || b.title || b.roomName || 'Resort Stay Reservation';

                  const dateStr = b.eventDate || b.reservationDate || b.date || b.eventDateStr || 'Upcoming';
                  const guestNum = b.expectedAttendance || b.guestsCount || b.guests || b.partySize || b.numberOfGuests || 1;

                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={styles.myBookingCard}
                      onPress={() => router.push('/(guest)/reservations')}
                      activeOpacity={0.85}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <View style={[styles.myBookingBadge, { backgroundColor: statusBg, borderColor: statusBorder, borderWidth: 1 }]}>
                          <Text style={[styles.myBookingBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                        </View>
                      </View>

                      <Text style={styles.myBookingTitle} numberOfLines={1}>{title}</Text>
                      <Text style={styles.myBookingMeta}>
                        <Ionicons name="calendar-outline" size={12} color="#c9a227" /> {dateStr}
                      </Text>
                      <Text style={styles.myBookingMeta}>
                        <Ionicons name="people-outline" size={12} color="#94a3b8" /> Guests: {guestNum}
                      </Text>

                      {b.type === 'Event' && b.venueName && (
                        (() => {
                          const m = deriveBookingPaymentState(b);
                          const nothingPaid = m.combinedTotal > 0 && m.balanceDue === m.combinedTotal;
                          return (
                            <View style={{ marginTop: 8, gap: 6 }}>
                              <Text style={{ fontSize: 11, color: '#64748b' }}>
                                Total <Text style={{ fontWeight: '800', color: '#0f172a' }}>R {m.combinedTotal.toLocaleString()}</Text>
                                {' · '}Paid <Text style={{ fontWeight: '800', color: '#0f172a' }}>R {m.amountPaid.toLocaleString()}</Text>
                                {' · '}Balance <Text style={{ fontWeight: '800', color: m.balanceDue > 0 ? '#d97706' : '#16a34a' }}>R {m.balanceDue.toLocaleString()}</Text>
                              </Text>
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                {m.balanceDue > 0 && (
                                  <TouchableOpacity
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: nothingPaid ? '#16a34a' : '#d97706', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                                    onPress={() => router.push({ pathname: '/payment', params: { bookingId: b.id, payBalance: nothingPaid ? '' : '1' } } as any)}
                                  >
                                    <Ionicons name="card-outline" size={13} color="#fff" />
                                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{nothingPaid ? 'Pay Deposit' : 'Pay Balance'}</Text>
                                  </TouchableOpacity>
                                )}
                                {m.cateringTotal === 0 && (
                                  <TouchableOpacity
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                                    onPress={() => router.push({ pathname: '/event-catering', params: { bookingId: b.id, expectedAttendance: String(guestNum || 30) } } as any)}
                                  >
                                    <Ionicons name="restaurant" size={13} color="#dc2626" />
                                    <Text style={{ color: '#dc2626', fontSize: 11, fontWeight: '800' }}>Add Catering</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          );
                        })()
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.emptyBookingsCard}>
                <Ionicons name="calendar-outline" size={28} color="#c9a227" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.emptyBookingsTitle}>{t('emptyBookingsTitle')}</Text>
                  <Text style={styles.emptyBookingsSub}>Explore resort galas, jazz nights, and dining below to book your seats.</Text>
                </View>
              </View>
            )}
          </View>
        )}



        {/* Explore Resort Feature Grid */}
        <Text style={styles.sectionTitleGrid}>Explore Azure Horizon</Text>
        <View style={styles.gridContainer}>
          {featuresGrid.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.gridTile, item.locked && styles.gridTileLocked]}
              onPress={() => handleTileClick(item.title, item.route, item.locked)}
              activeOpacity={0.8}
            >
              <View style={[styles.tileIconWrap, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon as any} size={24} color={item.color} />
              </View>

              {item.locked && (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={12} color="#f59e0b" />
                </View>
              )}

              <Text style={styles.tileTitle}>{item.title}</Text>
              <Text style={styles.tileSub} numberOfLines={2}>{item.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>

      {/* CUSTOMIZE PINNED TABS MODAL */}
      <Modal visible={showPinModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Customize Pinned Navigation</Text>
              <TouchableOpacity onPress={() => setShowPinModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Select which features stay pinned on your bottom tab bar for 1-tap access.</Text>

            <ScrollView style={{ maxHeight: 300, marginVertical: 12 }}>
              {AVAILABLE_TABS_TO_PIN.map((tab) => {
                const isPinned = pinnedTabs.includes(tab.id);
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[styles.pinItem, isPinned && styles.pinItemActive]}
                    onPress={() => togglePinTab(tab.id)}
                  >
                    <Ionicons name={tab.icon as any} size={20} color={isPinned ? '#c9a227' : '#94a3b8'} />
                    <Text style={[styles.pinItemLabel, isPinned && styles.pinItemLabelActive]}>{tab.label}</Text>
                    <Ionicons
                      name={isPinned ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={isPinned ? '#c9a227' : '#475569'}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.modalSaveBtn} onPress={() => setShowPinModal(false)}>
              <Text style={styles.modalSaveBtnText}>Done / Save Layout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* NOTIFICATIONS MODAL */}
      <Modal visible={showNotifModal} animationType="slide" transparent onRequestClose={() => setShowNotifModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{t('notificationsTitle')}</Text>
                {unreadCount > 0 && (
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>
                    {unreadCount} unread
                  </Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                {unreadCount > 0 && (
                  <TouchableOpacity
                    onPress={async () => {
                      await Promise.all(
                        notifications.filter(n => !n.read).map(n => markNotificationRead(n.id))
                      );
                    }}
                  >
                    <Text style={{ fontSize: 12, color: '#c9a227', fontWeight: '700' }}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowNotifModal(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {notifications.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
                <Ionicons name="notifications-off-outline" size={48} color={theme.colors.textMuted} />
                <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>{t('noNotifications')}</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' }}>
                  Staff updates about your bookings and events will appear here.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ marginVertical: 12 }} showsVerticalScrollIndicator={false}>
                {notifications.map((notif) => {
                  const typeIcon: Record<string, any> = {
                    refund_update: 'cash-outline',
                    inspection_update: 'clipboard-outline',
                    damage_record: 'warning-outline',
                    complaint_resolved: 'checkmark-done-outline',
                  };
                  const iconName = typeIcon[notif.type] || 'notifications-outline';
                  const createdAt = notif.createdAt?.seconds
                    ? new Date(notif.createdAt.seconds * 1000).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : '—';

                  return (
                    <TouchableOpacity
                      key={notif.id}
                      style={[
                        styles.notifItem,
                        !notif.read && styles.notifItemUnread,
                      ]}
                      onPress={async () => {
                        if (!notif.read) await markNotificationRead(notif.id);
                      }}
                    >
                      <View style={[styles.notifIcon, !notif.read && { backgroundColor: 'rgba(201,162,39,0.15)' }]}>
                        <Ionicons name={iconName} size={20} color={notif.read ? theme.colors.textMuted : '#c9a227'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.notifTitle, !notif.read && { color: theme.colors.text }]}>
                          {notif.title}
                        </Text>
                        <Text style={styles.notifMessage} numberOfLines={3}>{notif.message}</Text>
                        <Text style={styles.notifTime}>{createdAt}</Text>
                      </View>
                      {!notif.read && <View style={styles.unreadDot} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    content: { padding: 20, paddingTop: 10, paddingBottom: 40 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    greetingLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textMuted, letterSpacing: 1 },
    userName: { fontSize: 24, fontWeight: '900', color: theme.colors.text, marginTop: 2 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(22,163,74,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 6, alignSelf: 'flex-start' },
    statusBadgeVisitor: { backgroundColor: 'rgba(217,119,6,0.15)' },
    statusBadgeText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
    statusBadgeTextVisitor: { color: '#d97706' },

    headerActionRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    signInHeaderBtn: { backgroundColor: '#c9a227', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
    signInHeaderBtnText: { color: '#0f172a', fontWeight: '800', fontSize: 13 },
    pinBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#c9a227' },
    avatarButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#c9a227' },

    visitorBanner: { backgroundColor: 'rgba(201,162,39,0.12)', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#c9a227', marginBottom: 16 },
    visitorBannerTitle: { color: '#c9a227', fontWeight: '800', fontSize: 14 },
    visitorBannerSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
    visitorSignInBtn: { backgroundColor: '#c9a227', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    visitorSignInBtnText: { color: '#0f172a', fontWeight: '800', fontSize: 12 },

    weatherCard: { backgroundColor: theme.colors.surface, borderRadius: 20, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, marginBottom: 16 },
    weatherInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    weatherLocation: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
    weatherTemp: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
    weatherMeta: { alignItems: 'flex-end' },
    weatherMetaText: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '600' },

    digitalKeyBanner: { backgroundColor: '#c9a227', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20, elevation: 4 },
    digitalKeyIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
    digitalKeyBannerTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
    digitalKeyBannerSub: { color: '#1e293b', fontSize: 12, marginTop: 2, fontWeight: '600' },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
    seeAllText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },

    eventsScroll: { gap: 14, paddingRight: 20, paddingBottom: 16 },
    eventCard: { width: 280, backgroundColor: theme.colors.surface, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border },
    eventImage: { width: '100%', height: 130 },
    eventBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(15,23,42,0.85)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#c9a227' },
    eventBadgeText: { color: '#c9a227', fontSize: 10, fontWeight: '800' },
    eventBody: { padding: 14 },
    eventTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 6 },
    eventDate: { fontSize: 12, color: '#c9a227', fontWeight: '700', marginBottom: 4 },
    eventVenue: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 12 },
    eventFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    eventPrice: { fontSize: 14, fontWeight: '900', color: theme.colors.text },
    eventBookBtn: { backgroundColor: '#c9a227', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    eventBookBtnText: { color: '#0f172a', fontSize: 12, fontWeight: '800' },

    myBookingCard: { width: 240, backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#c9a227' },
    myBookingBadge: { backgroundColor: 'rgba(22,163,74,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 8 },
    myBookingBadgeText: { color: '#16a34a', fontSize: 10, fontWeight: '800' },
    myBookingTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '800', marginBottom: 6 },
    myBookingMeta: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },

    emptyBookingsCard: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: theme.colors.border },
    emptyBookingsTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '800' },
    emptyBookingsSub: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },

    sectionTitleGrid: { fontSize: 18, fontWeight: '900', color: theme.colors.text, marginTop: 12, marginBottom: 14 },
    gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    gridTile: { width: '48%', backgroundColor: theme.colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.colors.border, position: 'relative' },
    gridTileLocked: { opacity: 0.85, borderColor: 'rgba(245,158,11,0.3)' },
    tileIconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    lockBadge: { position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.8)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#f59e0b' },
    tileTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
    tileSub: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    modalTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
    modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    modalSub: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },

    pinItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surfaceVariant, padding: 14, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
    pinItemActive: { borderColor: '#c9a227', backgroundColor: 'rgba(201,162,39,0.1)' },
    pinItemLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
    pinItemLabelActive: { color: theme.colors.text, fontWeight: '800' },

    modalSaveBtn: { backgroundColor: '#c9a227', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 12 },
    modalSaveBtnText: { color: '#0f172a', fontWeight: '800', fontSize: 15 },

    // Notification bell
    notifBadge: {
      position: 'absolute', top: -4, right: -4,
      backgroundColor: '#ef4444', borderRadius: 8,
      minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 3, borderWidth: 1.5, borderColor: theme.colors.surface,
    },
    notifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

    // Notification items
    notifItem: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      padding: 14, borderRadius: 14, marginBottom: 8,
      backgroundColor: theme.colors.surfaceVariant,
      borderWidth: 1, borderColor: theme.colors.border,
    },
    notifItemUnread: {
      borderColor: '#c9a227', backgroundColor: 'rgba(201,162,39,0.07)',
    },
    notifIcon: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: theme.colors.border,
      justifyContent: 'center', alignItems: 'center',
      flexShrink: 0,
    },
    notifTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 4 },
    notifMessage: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
    notifTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6 },
    unreadDot: {
      width: 8, height: 8, borderRadius: 4, backgroundColor: '#c9a227',
      flexShrink: 0, marginTop: 4,
    },
  });