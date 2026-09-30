// (npo) Dashboard — my organisation, allocation counts, workflow entry points.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useColorScheme, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/services/firebase-services';
import { listenNpoPartners, listenMyAllocations } from '@/services/increment2-services';
import type { NpoPartner, DonationBatch } from '@/types/increment2';
import { ROLE_AREA_META } from '@/utils/role-home';
import { formatStatus } from '@/utils/status-labels';
import { getTheme } from '@/constants/theme';
import { LiveErrorBanner } from '@/components/detail-kit';
import { useRouter } from 'expo-router';

export default function NpoDashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const { profile, signOut } = useAuth();
  const email = (profile?.email || auth.currentUser?.email || '').toLowerCase();
  const [myNpo, setMyNpo] = useState<NpoPartner | null>(null);
  const [known, setKnown] = useState(false);
  const [items, setItems] = useState<DonationBatch[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!email) { setKnown(true); return; }
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    return listenNpoPartners((list) => {
      setMyNpo(list.find((n) => n.email.toLowerCase() === email) || null);
      setKnown(true);
    }, onErr);
  }, [email]);

  useEffect(() => {
    if (!myNpo) return;
    return listenMyAllocations(myNpo.npoId, setItems, (e) => setLoadError(e.message));
  }, [myNpo?.npoId]);

  if (!known) return <ActivityIndicator size="large" color={theme.colors.primary} />;

  const awaiting = items.filter((b) => b.status === 'allocated_awaiting_claim').length;
  const scheduled = items.filter((b) => b.status === 'claimed_ready_for_scheduling' || b.status === 'collection_scheduled').length;
  const collected = items.filter((b) => b.status === 'collected_completed').length;
  const nextCollection = [...items].filter(b=> b.pickupWindowStart && (b.status==='collection_scheduled' || b.status==='claimed_ready_for_scheduling')).sort((a,b)=> (a.pickupWindowStart||'').localeCompare(b.pickupWindowStart||''))[0] || null;
  const getGreeting = ()=> { const h=new Date().getHours(); if(h<12) return 'Good Morning,'; if(h<17) return 'Good Afternoon,'; return 'Good Evening,'; };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.eyebrow}>{ROLE_AREA_META.npo.title}</Text>
      <LiveErrorBanner error={loadError} onRetry={() => setLoadError('')} />
      {!myNpo ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Verification: not linked</Text>
          <Text style={styles.muted}>
            No NPO record matches {email || 'this account'} yet. Apply on the web or ask an administrator to verify your organisation — this dashboard activates on approval.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.org}>{myNpo.organisationName}</Text>
          <Text style={styles.sub}>{formatStatus(myNpo.verificationStatus)} • {myNpo.serviceAreas?.slice(0,2).join(', ')}</Text>

          {/* HERO */}
          <View style={styles.hero}>
            <View style={styles.heroIcon}><Ionicons name="gift" size={24} color="#16a34a"/></View>
            <View style={{flex:1}}>
              <Text style={styles.heroValue}>{awaiting} donation{awaiting!==1?'s':''} waiting</Text>
              <Text style={styles.heroSub}>for claim • tap to review</Text>
            </View>
            <TouchableOpacity style={styles.heroBtn} onPress={()=> router.push('/(npo)/allocations' as any)}><Text style={styles.heroBtnText}>View</Text><Ionicons name="arrow-forward" size={14} color="#fff"/></TouchableOpacity>
          </View>

          {nextCollection ? (
            <View style={styles.nextCard}>
              <Text style={styles.nextLabel}>Next Collection</Text>
              <Text style={styles.nextTime}>{new Date(nextCollection.pickupWindowStart!).toLocaleDateString('en-ZA', {weekday:'short', day:'numeric', month:'short'})} • {new Date(nextCollection.pickupWindowStart!).toLocaleTimeString('en-ZA', {hour:'2-digit', minute:'2-digit'})}–{nextCollection.pickupWindowEnd? new Date(nextCollection.pickupWindowEnd).toLocaleTimeString('en-ZA', {hour:'2-digit', minute:'2-digit'}):''}</Text>
              <Text style={styles.nextMeta}>{nextCollection.itemName} • {nextCollection.loadingBay || 'Bay TBC'}</Text>
            </View>
          ): (
            <View style={styles.nextCardEmpty}>
              <Ionicons name="cube-outline" size={20} color={theme.colors.textMuted}/>
              <Text style={styles.muted}>No collection scheduled yet.</Text>
            </View>
          )}

          <Text style={styles.section}>Your Activity</Text>
          <View style={styles.grid}>
            {([['Pending\nAllocations', awaiting, 'gift', '/(npo)/allocations'], ['Scheduled', scheduled, 'cube', '/(npo)/collections'], ['Collected', collected, 'checkmark-circle', '/(npo)/collections']] as [string, number, string, string][]).map(([label, value, icon, route]) => (
              <TouchableOpacity key={label} style={styles.stat} onPress={() => router.push(route as any)} activeOpacity={0.7}>
                <View style={styles.statIcon}><Ionicons name={icon as any} size={20} color={theme.colors.primary} /></View>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {(
            [
              ['My Allocations', 'Claim allocated batches (UC36)', 'gift-outline', '/(npo)/allocations'],
              ['Collection Schedule', 'Pickup windows & loading bays (UC37)', 'cube-outline', '/(npo)/collections'],
              ['Organisation', 'Verification status & profile', 'business-outline', '/(npo)/organisation'],
              ['Notifications', 'Allocation & collection alerts', 'notifications-outline', '/(npo)/notifications'],
            ] as [string, string, string, string][]
          ).map(([title, sub, icon, route]) => (
            <TouchableOpacity key={route} style={styles.card} onPress={() => router.push(route as any)}>
              <Ionicons name={icon as any} size={24} color={theme.colors.primary} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={styles.muted}>{sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ))}
        </>
      )}
      <TouchableOpacity style={styles.signout} onPress={() => { signOut().then(() => router.replace('/login' as any)); }}>
        <Text style={styles.signoutText}>Sign out</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  eyebrow:{fontSize:11, fontWeight:'700', color:theme.colors.textMuted, letterSpacing:1, textTransform:'uppercase', marginBottom:4},
  greeting:{fontSize:13, color:theme.colors.textMuted, fontWeight:'600'},
  org:{fontSize:22, fontWeight:'800', color:theme.colors.text, marginTop:2},
  sub: { color: theme.colors.textMuted, marginBottom: 12, fontSize:12, marginTop:2 },
  section:{fontSize:13, fontWeight:'700', color:theme.colors.textSecondary, letterSpacing:0.5, textTransform:'uppercase', marginTop:16, marginBottom:8},
  hero:{flexDirection:'row', alignItems:'center', gap:12, backgroundColor:theme.colors.surface, borderRadius:16, padding:16, borderWidth:1, borderColor:theme.colors.border, marginTop:12, shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.06, shadowRadius:8, elevation:3},
  heroIcon:{width:48, height:48, borderRadius:24, backgroundColor:'#dcfce7', alignItems:'center', justifyContent:'center'},
  heroValue:{fontSize:18, fontWeight:'800', color:theme.colors.text},
  heroSub:{fontSize:12, color:theme.colors.textMuted},
  heroBtn:{flexDirection:'row', alignItems:'center', gap:4, backgroundColor:theme.colors.text, paddingHorizontal:12, paddingVertical:8, borderRadius:20},
  heroBtnText:{color:'#fff', fontWeight:'700', fontSize:12},
  nextCard:{backgroundColor:theme.colors.surface, borderRadius:12, padding:14, borderWidth:1, borderColor:theme.colors.border, marginTop:12, borderLeftWidth:4, borderLeftColor:theme.colors.primary},
  nextCardEmpty:{flexDirection:'row', alignItems:'center', gap:8, backgroundColor:theme.colors.surface, borderRadius:12, padding:14, borderWidth:1, borderColor:theme.colors.border, marginTop:12},
  nextLabel:{fontSize:11, fontWeight:'700', color:theme.colors.textMuted, letterSpacing:0.5, textTransform:'uppercase'},
  nextTime:{fontSize:15, fontWeight:'700', color:theme.colors.text, marginTop:4},
  nextMeta:{fontSize:12, color:theme.colors.textMuted, marginTop:2},
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, marginTop:4 },
  stat: { flex: 1, minWidth: '30%', backgroundColor: theme.colors.surface, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  statIcon:{width:36, height:36, borderRadius:18, backgroundColor:theme.colors.primaryLight, alignItems:'center', justifyContent:'center', marginBottom:6},
  statValue: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  statLabel: { fontSize: 11, color: theme.colors.textMuted, textAlign: 'center', lineHeight:13 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardBody: { flex: 1 },
  cardTitle: { color: theme.colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: theme.colors.textMuted, fontSize: 12 },
  signout: { marginTop: 12, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.error },
  signoutText: { color: theme.colors.error, fontWeight: '700' },
});
