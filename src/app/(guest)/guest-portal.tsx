import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { auth, db, listenForNotifications, markNotificationRead, deriveBookingPaymentState } from '@/services/firebase-services';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAppTheme } from '@/design/use-app-theme';
import type { Theme } from '@/design/tokens';
import { useTranslation } from '@/i18n/hooks';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppShell } from '@/components/ui/app-shell';
import { AppText } from '@/components/ui/text';
import { Card } from '@/components/ui/surface';
import { StatusPill } from '@/components/ui/status-pill';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';

const PINNED_STORAGE_KEY = '@azure_horizon_pinned_tabs';

type TileTone = 'primary' | 'gold' | 'accent' | 'info' | 'success' | 'warning';

function tileColors(theme: Theme, tone: TileTone): { fg: string; bg: string } {
  const c = theme.colors;
  switch (tone) {
    case 'gold': return { fg: c.warningStrong, bg: c.warningSoft };
    case 'accent': return { fg: c.accentStrong, bg: c.accentSoft };
    case 'info': return { fg: c.infoStrong, bg: c.infoSoft };
    case 'success': return { fg: c.successStrong, bg: c.successSoft };
    case 'warning': return { fg: c.warningStrong, bg: c.warningSoft };
    default: return { fg: c.primary, bg: c.primarySoft };
  }
}

export default function GuestPortal() {
  const { profile, refreshProfile } = useAuth();
  const theme = useAppTheme();
  const { t } = useTranslation();

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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinnedTabs, setPinnedTabs] = useState<string[]>([
    'guest-portal', 'digital-key', 'event-booking', 'dining', 'spa', 'loyalty', 'profile',
  ]);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const params = useLocalSearchParams();
  const user = auth.currentUser;
  const isVisitor = params.mode === 'visitor' || !user || profile?.status === 'visitor';
  const isResident = !isVisitor && user !== null;

  const loadPortalData = async () => {
    try {
      if (!user || isVisitor) { setIsLoading(false); setRefreshing(false); return; }

      const fetchedBookings: any[] = [];
      const todayStr = new Date().toISOString().split('T')[0];
      let anyQueryOk = false;

      try {
        const q = query(collection(db, 'event_bookings'), where('guestId', '==', user.uid));
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const data = d.data() as any;
          const status = (data.status || 'confirmed').toLowerCase();
          const dateVal = data.eventDate || data.date || data.eventDateStr || '';
          if (status !== 'cancelled' && status !== 'completed') {
            if (!dateVal || dateVal >= todayStr || new Date(dateVal).getTime() >= new Date(todayStr).getTime()) {
              fetchedBookings.push({ id: d.id, type: 'Event', ...data });
            }
          }
        });
        anyQueryOk = true;
      } catch { /* handled below */ }

      try {
        const qD = query(collection(db, 'dining_reservations'), where('guestId', '==', user.uid));
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
        anyQueryOk = true;
      } catch { /* handled below */ }

      const uniqueBookings = Array.from(new Map(fetchedBookings.map((item) => [item.id, item])).values());
      uniqueBookings.sort((a: any, b: any) => {
        const dA = a.eventDate || a.date || a.reservationDate || '';
        const dB = b.eventDate || b.date || b.reservationDate || '';
        return dA.localeCompare(dB);
      });
      setUserBookings(uniqueBookings);
      setLoadError(anyQueryOk ? '' : 'We could not load your bookings just now.');

      const savedPins = await AsyncStorage.getItem(PINNED_STORAGE_KEY);
      if (savedPins) setPinnedTabs(JSON.parse(savedPins));
    } catch {
      setLoadError('We could not load your bookings just now.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadPortalData(); }, [user, profile]);

  useEffect(() => {
    if (!user || !isResident) return;
    return listenForNotifications(user.uid, (notifs) => {
      setNotifications(
        [...notifs].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
      );
    });
  }, [user?.uid, isResident]);

  const onRefresh = () => { setRefreshing(true); refreshProfile(); loadPortalData(); };

  const handleTileClick = (featureTitle: string, route: string, locked: boolean) => {
    if (locked) {
      showAlert({
        title: 'Resident access required',
        message: `"${featureTitle}" is reserved for checked-in guests. Sign in to your room stay to use the digital room key, room service and billing.`,
        type: 'warning',
        confirmText: 'Sign in',
        cancelText: 'Not now',
        onConfirm: () => router.push('/login'),
      });
      return;
    }
    router.push(route as any);
  };

  const togglePinTab = async (tabId: string) => {
    let updated: string[];
    if (pinnedTabs.includes(tabId)) {
      if (pinnedTabs.length <= 3) {
        showAlert({ title: 'Keep at least 3 tabs', message: 'You must keep at least 3 pinned tabs.', type: 'warning' });
        return;
      }
      updated = pinnedTabs.filter((id) => id !== tabId);
    } else {
      updated = [...pinnedTabs, tabId];
    }
    setPinnedTabs(updated);
    await AsyncStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(updated));
  };

  const featuresGrid: { title: string; sub: string; icon: string; tone: TileTone; route: string; locked: boolean }[] = [
    { title: t('digitalRoomKey'), sub: t('nfcBiometricUnlock'), icon: 'key', tone: 'gold', route: '/(guest)/digital-key', locked: isVisitor },
    { title: 'Suites & villas', sub: 'Explore luxury accommodations', icon: 'bed', tone: 'info', route: '/(guest)/room-gallery', locked: false },
    { title: t('resortDining'), sub: t('menusTableReservations'), icon: 'restaurant', tone: 'gold', route: '/(guest)/dining', locked: false },
    { title: 'Room service', sub: 'In-room food & amenities', icon: 'fast-food', tone: 'warning', route: '/(guest)/room-service', locked: isVisitor },
    { title: t('spaAndWellness'), sub: t('massagesHydrotherapy'), icon: 'leaf', tone: 'success', route: '/(guest)/spa', locked: false },
    { title: 'Resort events', sub: 'Galas, jazz & beach parties', icon: 'calendar', tone: 'primary', route: '/(guest)/event-booking', locked: false },
    { title: 'Loyalty rewards', sub: 'Points, tiers & food coupons', icon: 'diamond', tone: 'accent', route: '/(guest)/loyalty', locked: false },
    { title: 'My stays', sub: 'View & manage reservations', icon: 'calendar-number', tone: 'info', route: '/(guest)/reservations', locked: isVisitor },
    { title: 'Folio & billing', sub: 'Cards & room charges', icon: 'card', tone: 'primary', route: '/(guest)/billing', locked: isVisitor },
    { title: 'My orders', sub: 'Track room service & spa', icon: 'receipt', tone: 'accent', route: '/(guest)/my-orders', locked: isVisitor },
    { title: 'Local tours', sub: 'Guided island excursions', icon: 'boat', tone: 'success', route: '/(guest)/tours', locked: false },
    { title: 'Service request', sub: 'Maintenance & assistance', icon: 'construct', tone: 'warning', route: '/(guest)/live-complaint', locked: isVisitor },
    { title: 'Leave a review', sub: 'Rate your stay & events', icon: 'star', tone: 'gold', route: '/(guest)/leave-review', locked: false },
  ];

  const headerRight = isVisitor ? (
    <Button label="Sign in" onPress={() => router.push('/login')} fullWidth={false} style={{ paddingHorizontal: theme.space.lg }} />
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton
        name="notifications-outline"
        accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        badge={unreadCount}
        onPress={() => setShowNotifModal(true)}
      />
      <IconButton name="options-outline" accessibilityLabel="Customize pinned tabs" onPress={() => setShowPinModal(true)} />
    </View>
  );

  return (
    <AppShell
      context="Guest · Azure Horizon"
      title={isVisitor ? 'Guest Explorer' : (profile?.displayName || user?.displayName || 'Welcome')}
      subtitle="Welcome to Azure Horizon"
      showBell={false}
      showSync={false}
      headerRight={headerRight}
      onProfile={() => router.push('/(guest)/profile' as any)}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {isVisitor ? (
        <Card tone="primarySoft" bordered={false} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, marginBottom: theme.space.lg }}>
          <Ionicons name="compass-outline" size={theme.iconSize.lg} color={theme.colors.warningStrong} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">Visitor access active</AppText>
            <AppText variant="caption" tone="secondary">{t('signInToUnlock')}</AppText>
          </View>
        </Card>
      ) : null}

      {isResident ? (
        <TouchableOpacity onPress={() => router.push('/(guest)/digital-key')} activeOpacity={0.85}>
          <Card tone="primarySoft" bordered={false} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, marginBottom: theme.space.lg }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="key" size={theme.iconSize.lg} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{t('digitalRoomKeyReady')}</AppText>
              <AppText variant="caption" tone="secondary">
                Tap to open Room {profile?.roomNumber || '—'} via NFC or biometrics
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={theme.iconSize.md} color={theme.colors.primary} />
          </Card>
        </TouchableOpacity>
      ) : null}

      {isResident ? (
        <>
          <SectionHeader title={t('myBookedEventsAndStays')} actionLabel={t('manageStays')} onAction={() => router.push('/(guest)/reservations')} />
          {isLoading ? (
            <Skeleton width="100%" height={140} radius={theme.radius.lg} />
          ) : loadError ? (
            <ErrorState title="Bookings unavailable" message={loadError} onRetry={loadPortalData} />
          ) : userBookings.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.md, paddingRight: theme.space.lg }}>
              {userBookings.map((b) => {
                const rawStatus = (b.status || 'confirmed').toLowerCase();
                const isPending = rawStatus === 'pending' || rawStatus === 'pending_payment';
                const statusLabel = isPending ? 'Pending payment' : rawStatus.replace(/_/g, ' ');
                const title = b.venueName
                  ? `${b.venueName}${b.eventType ? ` · ${b.eventType}` : ''}`
                  : b.restaurantName
                    ? `${b.restaurantName} (Dining)`
                    : b.eventTitle || b.title || b.roomName || 'Resort reservation';
                const dateStr = b.eventDate || b.reservationDate || b.date || b.eventDateStr || 'Upcoming';
                const guestNum = b.expectedAttendance || b.guestsCount || b.guests || b.partySize || b.numberOfGuests || 1;
                return (
                  <TouchableOpacity key={b.id} onPress={() => router.push('/(guest)/reservations')} activeOpacity={0.85}>
                    <Card style={{ width: 250, gap: theme.space.xs }}>
                      <StatusPill status={isPending ? 'pending' : 'approved'} label={statusLabel} size="sm" />
                      <AppText variant="bodyStrong" numberOfLines={1}>{title}</AppText>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="calendar-outline" size={12} color={theme.colors.textMuted} />
                        <AppText variant="caption" tone="secondary">{dateStr}</AppText>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="people-outline" size={12} color={theme.colors.textMuted} />
                        <AppText variant="caption" tone="secondary">Guests: {guestNum}</AppText>
                      </View>
                      {b.type === 'Event' && b.venueName ? (() => {
                        const m = deriveBookingPaymentState(b);
                        const nothingPaid = m.combinedTotal > 0 && m.balanceDue === m.combinedTotal;
                        return (
                          <View style={{ marginTop: theme.space.xs, gap: theme.space.sm }}>
                            <AppText variant="micro" tone="secondary">
                              Total R {m.combinedTotal.toLocaleString()} · Paid R {m.amountPaid.toLocaleString()} · Balance{' '}
                              <AppText variant="micro" color={m.balanceDue > 0 ? theme.colors.warningStrong : theme.colors.successStrong}>
                                R {m.balanceDue.toLocaleString()}
                              </AppText>
                            </AppText>
                            <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
                              {m.balanceDue > 0 ? (
                                <Button
                                  label={nothingPaid ? 'Pay deposit' : 'Pay balance'}
                                  icon="card-outline"
                                  fullWidth={false}
                                  onPress={() => router.push({ pathname: '/payment', params: { bookingId: b.id, payBalance: nothingPaid ? '' : '1' } } as any)}
                                  style={{ flex: 1 }}
                                />
                              ) : null}
                              {m.cateringTotal === 0 ? (
                                <Button
                                  label="Add catering"
                                  icon="restaurant-outline"
                                  variant="secondary"
                                  fullWidth={false}
                                  onPress={() => router.push({ pathname: '/event-catering', params: { bookingId: b.id, expectedAttendance: String(guestNum || 30) } } as any)}
                                  style={{ flex: 1 }}
                                />
                              ) : null}
                            </View>
                          </View>
                        );
                      })() : null}
                    </Card>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <EmptyState
              icon="calendar-outline"
              title={t('emptyBookingsTitle')}
              message="Explore resort galas, jazz nights and dining below to book your seats."
              actionLabel="Browse events"
              onAction={() => router.push('/(guest)/event-booking')}
            />
          )}
        </>
      ) : null}

      <SectionHeader title="Explore Azure Horizon" />
      <View style={styles.grid}>
        {featuresGrid.map((item) => {
          const c = tileColors(theme, item.tone);
          return (
            <TouchableOpacity
              key={item.title}
              style={[styles.tile, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.xl, padding: theme.space.lg, opacity: item.locked ? 0.85 : 1 }]}
              onPress={() => handleTileClick(item.title, item.route, item.locked)}
              activeOpacity={0.8}
            >
              <View style={[styles.tileIcon, { backgroundColor: c.bg }]}>
                <Ionicons name={item.icon as any} size={theme.iconSize.lg} color={c.fg} />
              </View>
              {item.locked ? (
                <View style={[styles.lockBadge, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Ionicons name="lock-closed" size={12} color={theme.colors.warningStrong} />
                </View>
              ) : null}
              <AppText variant="bodyStrong" numberOfLines={1}>{item.title}</AppText>
              <AppText variant="micro" tone="secondary" numberOfLines={2}>{item.sub}</AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Customize pinned tabs */}
      <Modal visible={showPinModal} animationType="slide" transparent onRequestClose={() => setShowPinModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowPinModal(false)}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius['2xl'], borderTopRightRadius: theme.radius['2xl'], padding: theme.space['2xl'] }]}>
            <AppText variant="subtitle" style={{ marginBottom: theme.space.sm }}>Customize pinned navigation</AppText>
            <AppText variant="caption" tone="secondary" style={{ marginBottom: theme.space.lg }}>
              Choose which features stay pinned on your bottom tab bar for one-tap access.
            </AppText>
            <ScrollView style={{ maxHeight: 300 }}>
              {AVAILABLE_TABS_TO_PIN.map((tab) => {
                const isPinned = pinnedTabs.includes(tab.id);
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[styles.pinItem, { backgroundColor: theme.colors.surfaceVariant, borderColor: isPinned ? theme.colors.primary : theme.colors.border, borderRadius: theme.radius.md }]}
                    onPress={() => togglePinTab(tab.id)}
                  >
                    <Ionicons name={tab.icon as any} size={theme.iconSize.md} color={isPinned ? theme.colors.primary : theme.colors.textMuted} />
                    <AppText variant="bodyStrong" style={{ flex: 1 }}>{tab.label}</AppText>
                    <Ionicons name={isPinned ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isPinned ? theme.colors.primary : theme.colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Button label="Done" onPress={() => setShowPinModal(false)} style={{ marginTop: theme.space.lg }} />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Notifications */}
      <Modal visible={showNotifModal} animationType="slide" transparent onRequestClose={() => setShowNotifModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowNotifModal(false)}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius['2xl'], borderTopRightRadius: theme.radius['2xl'], padding: theme.space['2xl'], maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.space.md }}>
              <View>
                <AppText variant="subtitle">{t('notificationsTitle')}</AppText>
                {unreadCount > 0 ? <AppText variant="caption" tone="muted">{unreadCount} unread</AppText> : null}
              </View>
              {unreadCount > 0 ? (
                <TouchableOpacity
                  onPress={async () => { await Promise.all(notifications.filter((n) => !n.read).map((n) => markNotificationRead(n.id))); }}
                >
                  <AppText variant="label" tone="primary" weight="600">Mark all read</AppText>
                </TouchableOpacity>
              ) : null}
            </View>
            {notifications.length === 0 ? (
              <EmptyState icon="notifications-off-outline" title={t('noNotifications')} message="Updates about your bookings and events will appear here." />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {notifications.map((notif) => {
                  const typeIcon: Record<string, any> = {
                    refund_update: 'cash-outline',
                    inspection_update: 'clipboard-outline',
                    damage_record: 'warning-outline',
                    complaint_resolved: 'checkmark-done-outline',
                  };
                  const createdAt = notif.createdAt?.seconds
                    ? new Date(notif.createdAt.seconds * 1000).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : '—';
                  return (
                    <TouchableOpacity
                      key={notif.id}
                      style={[styles.notifItem, { backgroundColor: notif.read ? theme.colors.surface : theme.colors.primarySoft, borderColor: theme.colors.border, borderRadius: theme.radius.md }]}
                      onPress={async () => { if (!notif.read) await markNotificationRead(notif.id); }}
                    >
                      <View style={[styles.notifIcon, { backgroundColor: theme.colors.surfaceVariant }]}>
                        <Ionicons name={(typeIcon[notif.type] || 'notifications-outline') as any} size={theme.iconSize.md} color={notif.read ? theme.colors.textMuted : theme.colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong">{notif.title}</AppText>
                        <AppText variant="caption" tone="secondary" numberOfLines={3}>{notif.message}</AppText>
                        <AppText variant="micro" tone="muted" style={{ marginTop: 4 }}>{createdAt}</AppText>
                      </View>
                      {!notif.read ? <View style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '48%', borderWidth: 1, position: 'relative', gap: 4 },
  tileIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  lockBadge: { position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(16,24,40,0.55)', justifyContent: 'flex-end' },
  sheet: { width: '100%' },
  pinItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 8, borderWidth: 1 },
  notifItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, marginBottom: 8, borderWidth: 1 },
  notifIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
});
