// (admin) Dashboard — live oversight counts + role navigation.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { listenNpoPartners, listenDonationBatches, listenLeaveQueue, listenAttendanceExceptions } from '@/services/increment2-services';
import { ROLE_AREA_META } from '@/utils/role-home';
import { getTheme } from '@/constants/theme';
import { LiveErrorBanner } from '@/components/detail-kit';
import { useRouter } from 'expo-router';

export default function AdminDashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const { profile, signOut } = useAuth();
  const [pendingNpo, setPendingNpo] = useState(0);
  const [activeDonations, setActiveDonations] = useState(0);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [openExceptions, setOpenExceptions] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenNpoPartners((list) => setPendingNpo(list.filter((n) => n.verificationStatus === 'pending' || n.verificationStatus === 'under_review').length), onErr);
    const u2 = listenDonationBatches((list) => setActiveDonations(list.filter((b) => b.status !== 'collected_completed' && b.status !== 'cancelled').length), undefined, onErr);
    const u3 = listenLeaveQueue((list) => setPendingLeave(list.length), onErr);
    const u4 = listenAttendanceExceptions((list) => setOpenExceptions(list.filter((e) => e.reviewStatus !== 'verified').length), onErr);
    return () => { u1(); u2(); u3(); u4(); };
  }, [retryKey]);

  // Tappable stats (§28): every metric opens its queue (cross-area where the
  // queue lives — admin reads all queues by rule).
  const stats: [string, number, string, string][] = [
    ['Pending NPOs', pendingNpo, 'business', '/(admin)/npo-verification'],
    ['Active Donations', activeDonations, 'fast-food', '/(admin)/impact'],
    ['Leave Requests', pendingLeave, 'calendar', '/(kitchen)/leave-manage'],
    ['Open Exceptions', openExceptions, 'warning', '/(kitchen)/attendance'],
  ];
  const links: [string, string, string, string][] = [
    ['NPO Verification', 'Review & approve partners', 'business-outline', '/(admin)/npo-verification'],
    ['Refund Management', 'Guest refund approvals', 'cash-outline', '/(admin)/refund-management'],
    ['Impact Reports', 'Food rescue metrics', 'bar-chart-outline', '/(admin)/impact'],
    ['Notifications', 'System inbox', 'notifications-outline', '/(admin)/notifications'],
  ];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{ROLE_AREA_META.admin.title}</Text>
      <Text style={styles.sub}>Signed in as {profile?.displayName || profile?.email}</Text>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      <View style={styles.grid}>
        {stats.map(([label, value, icon, route]) => (
          <TouchableOpacity key={label} style={styles.stat} onPress={() => router.push(route as any)} activeOpacity={0.7}>
            <Ionicons name={icon as any} size={22} color={theme.colors.primary} />
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {links.map(([title, sub, icon, route]) => (
        <TouchableOpacity key={route} style={styles.card} onPress={() => router.push(route as any)}>
          <Ionicons name={icon as any} size={24} color={theme.colors.primary} />
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.muted}>{sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.signout} onPress={() => { signOut().then(() => router.replace('/login' as any)); }}>
        <Text style={styles.signoutText}>Sign out</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  sub: { color: theme.colors.textMuted, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  stat: { flex: 1, minWidth: '47%', backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  statValue: { fontSize: 26, fontWeight: '800', color: theme.colors.text },
  statLabel: { fontSize: 12, color: theme.colors.textMuted },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardBody: { flex: 1 },
  cardTitle: { color: theme.colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: theme.colors.textMuted, fontSize: 12 },
  signout: { marginTop: 12, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.error },
  signoutText: { color: theme.colors.error, fontWeight: '700' },
});
