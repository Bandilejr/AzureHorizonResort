import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, ActivityIndicator, RefreshControl, useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getTheme } from '@/constants/theme';
import {
  db, auth
} from '../../services/firebase-services';
import {
  collection, query, where, getDocs, onSnapshot, orderBy, limit
} from 'firebase/firestore';

type StatCard = { label: string; value: string | number; icon: string; color: string; bg: string };

export default function StaffDashboardScreen() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const S = createStyles(theme);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [todayEvents, setTodayEvents] = useState<any[]>([]);
  const [stats, setStats] = useState({
    todayEvents: 0,
    pendingCheckins: 0,
    openComplaints: 0,
    pendingInspections: 0,
  });

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning,';
    if (h < 17) return 'Good Afternoon,';
    return 'Good Evening,';
  };

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let evList: any[] = [];
    let pendingCheckinCount = 0;
    let openComplaintCount = 0;
    let pendingInspectionCount = 0;

    const updateCombinedStats = () => {
      setTodayEvents(evList);
      setStats({
        todayEvents: evList.length,
        pendingCheckins: pendingCheckinCount,
        openComplaints: openComplaintCount,
        pendingInspections: pendingInspectionCount,
      });
      setLoading(false);
      setRefreshing(false);
    };

    // 1. Live today's events
    const unsubEvents = onSnapshot(
      query(collection(db, 'event_bookings'), where('eventDateStr', '==', todayStr)),
      (snap) => {
        evList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateCombinedStats();
      },
      (err) => console.warn('Events sub error:', err)
    );

    // 2. Live pending invitations
    const unsubInvites = onSnapshot(
      query(collection(db, 'event_invitations'), where('status', '==', 'pending')),
      (snap) => {
        pendingCheckinCount = snap.size;
        updateCombinedStats();
      },
      (err) => console.warn('Invites sub error:', err)
    );

    // 3. Live open complaints
    const unsubComplaints = onSnapshot(
      query(collection(db, 'live_complaints'), where('status', '==', 'open')),
      (snap) => {
        openComplaintCount = snap.size;
        updateCombinedStats();
      },
      (err) => console.warn('Complaints sub error:', err)
    );

    // 4. Live upcoming events needing inspection
    const unsubUpcoming = onSnapshot(
      query(
        collection(db, 'event_bookings'),
        where('eventDate', '>=', now.toISOString()),
        where('eventDate', '<=', nextWeek.toISOString())
      ),
      (snap) => {
        pendingInspectionCount = snap.docs.filter(d => !d.data().preInspectionStatus).length;
        updateCombinedStats();
      },
      (err) => console.warn('Upcoming sub error:', err)
    );

    return () => {
      unsubEvents();
      unsubInvites();
      unsubComplaints();
      unsubUpcoming();
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  const statCards: StatCard[] = [
    {
      label: "Today's Events",
      value: stats.todayEvents,
      icon: 'calendar',
      color: theme.colors.secondary,
      bg: theme.colors.secondaryLight,
    },
    {
      label: 'Pending Check-ins',
      value: stats.pendingCheckins,
      icon: 'people',
      color: theme.colors.primary,
      bg: theme.colors.primaryLight,
    },
    {
      label: 'Open Complaints',
      value: stats.openComplaints,
      icon: 'warning',
      color: theme.colors.error,
      bg: theme.colors.errorLight,
    },
    {
      label: 'Inspections Due',
      value: stats.pendingInspections,
      icon: 'clipboard',
      color: theme.colors.success,
      bg: theme.colors.successLight,
    },
  ];

  const quickActions = [
    {
      title: 'Pre-Event\nInspection',
      icon: 'clipboard-outline',
      color: theme.colors.secondary,
      bg: theme.colors.secondaryLight,
      onPress: () => router.push('/pre-event-inspection' as any),
    },
    {
      title: 'Attendee\nCheck-in',
      icon: 'qr-code-outline',
      color: theme.colors.success,
      bg: theme.colors.successLight,
      onPress: () => router.push('/attendee-checkin' as any),
    },
    {
      title: 'Post-Event\nInspection',
      icon: 'search-outline',
      color: theme.colors.warning,
      bg: theme.colors.warningLight,
      onPress: () => router.push('/post-event-inspection' as any),
    },
    {
      title: 'Damage\nResolution',
      icon: 'hammer-outline',
      color: theme.colors.error,
      bg: theme.colors.errorLight,
      onPress: () => router.push('/damage-resolution' as any),
    },
    {
      title: 'Clock\nIn / Out',
      icon: 'time-outline',
      color: theme.colors.primary,
      bg: theme.colors.primaryLight,
      onPress: () => router.push('/clock-in' as any),
    },
    {
      title: 'Scan Loyalty\n& Coupons',
      icon: 'gift-outline',
      color: theme.colors.primary,
      bg: theme.colors.primaryLight,
      onPress: () => router.push('/loyalty-scanner' as any),
    },
    {
      title: 'Live\nComplaints',
      icon: 'alert-circle-outline',
      color: '#7c3aed',
      bg: '#ede9fe',
      onPress: () => router.push('/live-complaints' as any),
    },
    {
      title: 'Refund\nManagement',
      icon: 'cash-outline',
      color: '#c9a227',
      bg: '#fef3c7',
      onPress: () => router.push('/(admin)/refund-management' as any),
    },
  ];

  const getEventStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return theme.colors.success;
      case 'pending_payment': return theme.colors.warning;
      default: return theme.colors.textMuted;
    }
  };

  const getEventStatusBg = (status: string) => {
    switch (status) {
      case 'confirmed': return theme.colors.successLight;
      case 'pending_payment': return theme.colors.warningLight;
      default: return theme.colors.surfaceVariant;
    }
  };

  return (
    <SafeAreaView style={S.container}>
      <ScrollView
        style={S.scroll}
        contentContainerStyle={S.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* ── HEADER ── */}
        <View style={S.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={S.greeting}>{getGreeting()}</Text>
            <Text style={S.name}>{profile?.displayName || 'Staff Member'}</Text>
            <View style={S.rolePill}>
              <Ionicons name="shield-checkmark" size={12} color={theme.colors.secondary} />
              <Text style={S.roleText}>{profile?.subRole?.replace('_', ' ').toUpperCase() || 'STAFF'}</Text>
            </View>
          </View>
          <TouchableOpacity style={S.signOutBtn} onPress={signOut}>
            <Ionicons name="log-out-outline" size={22} color={theme.colors.error} />
          </TouchableOpacity>
        </View>

        {/* ── DIVIDER ── */}
        <View style={S.divider} />

        {/* ── STATS ── */}
        <Text style={S.sectionTitle}>Live Overview</Text>
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 20 }} />
        ) : (
          <View style={S.statsGrid}>
            {statCards.map((s, i) => (
              <View key={i} style={[S.statCard, { backgroundColor: s.bg }]}>
                <View style={[S.statIconCircle, { backgroundColor: s.color + '20' }]}>
                  <Ionicons name={s.icon as any} size={20} color={s.color} />
                </View>
                <Text style={[S.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={S.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── QUICK ACTIONS ── */}
        <Text style={[S.sectionTitle, { marginTop: 24 }]}>Quick Actions</Text>
        <View style={S.actionGrid}>
          {quickActions.map((a, i) => (
            <TouchableOpacity
              key={i}
              style={[S.actionCard, { backgroundColor: a.bg }]}
              onPress={a.onPress}
              activeOpacity={0.7}
            >
              <View style={[S.actionIconBg, { backgroundColor: a.color + '20' }]}>
                <Ionicons name={a.icon as any} size={26} color={a.color} />
              </View>
              <Text style={[S.actionTitle, { color: a.color }]}>{a.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── TODAY'S EVENTS ── */}
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>Today&apos;s Events</Text>
          <View style={S.todayBadge}>
            <Text style={S.todayBadgeText}>{new Date().toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : todayEvents.length === 0 ? (
          <View style={S.emptyCard}>
            <Ionicons name="calendar-outline" size={40} color={theme.colors.textMuted} />
            <Text style={S.emptyText}>No events scheduled for today</Text>
          </View>
        ) : (
          todayEvents.map((event) => (
            <View key={event.id} style={S.eventCard}>
              <View style={S.eventCardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={S.eventVenue}>{event.venueName || 'Venue'}</Text>
                  <Text style={S.eventType}>{event.eventType || 'Event'}</Text>
                </View>
                <View style={[S.statusPill, { backgroundColor: getEventStatusBg(event.status) }]}>
                  <Text style={[S.statusText, { color: getEventStatusColor(event.status) }]}>
                    {(event.status || 'pending').replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={S.eventMeta}>
                <View style={S.metaItem}>
                  <Ionicons name="people-outline" size={14} color={theme.colors.textMuted} />
                  <Text style={S.metaText}>{event.expectedAttendance || '—'} guests</Text>
                </View>
                <View style={S.metaItem}>
                  <Ionicons name="person-outline" size={14} color={theme.colors.textMuted} />
                  <Text style={S.metaText}>{event.guestName || 'Unknown organizer'}</Text>
                </View>
              </View>
              <View style={S.eventActions}>
                <TouchableOpacity
                  style={[S.eventActionBtn, { borderColor: theme.colors.secondary }]}
                  onPress={() => router.push({ pathname: '/pre-event-inspection', params: { eventId: event.id } } as any)}
                >
                  <Ionicons name="clipboard-outline" size={14} color={theme.colors.secondary} />
                  <Text style={[S.eventActionText, { color: theme.colors.secondary }]}>Inspect</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.eventActionBtn, { borderColor: theme.colors.success }]}
                  onPress={() => router.push({ pathname: '/attendee-checkin', params: { eventId: event.id } } as any)}
                >
                  <Ionicons name="qr-code-outline" size={14} color={theme.colors.success} />
                  <Text style={[S.eventActionText, { color: theme.colors.success }]}>Check-in</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.eventActionBtn, { borderColor: theme.colors.error }]}
                  onPress={() => router.push({ pathname: '/post-event-inspection', params: { eventId: event.id } } as any)}
                >
                  <Ionicons name="search-outline" size={14} color={theme.colors.error} />
                  <Text style={[S.eventActionText, { color: theme.colors.error }]}>Post-Inspect</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  content: { padding: 20, paddingTop: 16, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  greeting: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: theme.colors.textMuted, fontWeight: '600' },
  name: { fontSize: 26, fontWeight: '800', color: theme.colors.text, marginTop: 2 },
  rolePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.secondaryLight,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, marginTop: 6,
  },
  roleText: { fontSize: 11, fontWeight: '700', color: theme.colors.secondary, letterSpacing: 0.5 },
  signOutBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: theme.colors.errorLight,
    justifyContent: 'center', alignItems: 'center',
  },

  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 20 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 14 },
  todayBadge: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  todayBadgeText: { fontSize: 11, fontWeight: '600', color: theme.colors.primary },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    width: '47%', padding: 16, borderRadius: 16,
    alignItems: 'flex-start',
  },
  statIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  statValue: { fontSize: 30, fontWeight: '800', lineHeight: 34 },
  statLabel: { fontSize: 12, color: '#64748b', fontWeight: '500', marginTop: 2 },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: {
    width: '31%', padding: 14, borderRadius: 16,
    alignItems: 'center', minHeight: 90, justifyContent: 'center',
  },
  actionIconBg: {
    width: 48, height: 48, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  actionTitle: { fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 16 },

  emptyCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 32,
    alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },

  eventCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  eventCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  eventVenue: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  eventType: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginLeft: 8 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  eventMeta: { flexDirection: 'row', gap: 16, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.border },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: theme.colors.textMuted },

  eventActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  eventActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5,
  },
  eventActionText: { fontSize: 12, fontWeight: '600' },
});