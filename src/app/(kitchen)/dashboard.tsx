// Kitchen Operations — transformed to operational dashboard (spec 19)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';
import { listenDonationBatches, listenLeaveQueue, listenAttendanceExceptions, listenOpenShiftsBoard, listenPublishedRosters } from '@/services/increment2-services';
import { ROLE_AREA_META } from '@/utils/role-home';
import { todayISO, localDateTimeISO } from '@/utils/dates';
import { getTheme } from '@/constants/theme';
import { LiveErrorBanner } from '@/components/detail-kit';
import { useRouter } from 'expo-router';

export default function KitchenDashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const { profile, signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const isManager = profile?.role === 'kitchen_manager' || profile?.role === 'admin';
  const isFoodLead = isManager || profile?.role === 'chef';
  const [unassigned, setUnassigned] = useState(0);
  const [toSchedule, setToSchedule] = useState(0);
  const [collectionsToday, setCollectionsToday] = useState(0);
  const [overdue, setOverdue] = useState(0);
  const [pendingLeave, setPendingLeave] = useState(0);
  const [openExceptions, setOpenExceptions] = useState(0);
  const [openShifts, setOpenShifts] = useState(0);
  const [todayRoster, setTodayRoster] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const today = todayISO();
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenDonationBatches((list) => {
      setUnassigned(list.filter((b) => b.status === 'safety_verified_unassigned').length);
      setToSchedule(list.filter((b) => b.status === 'claimed_ready_for_scheduling').length);
      setCollectionsToday(list.filter((b) => b.status === 'collection_scheduled' && (b.pickupDate === today || (b.pickupWindowStart || '').slice(0, 10) === today)).length);
      setOverdue(list.filter(b=> b.status==='collection_scheduled' && (b.pickupWindowEnd||b.pickupDate||'') < localDateTimeISO(new Date()) && (b.pickupWindowStart||b.pickupDate||'').slice(0,10) < today).length);
    }, undefined, onErr);
    const u2 = listenLeaveQueue((list) => setPendingLeave(list.length), onErr);
    const u3 = listenAttendanceExceptions((list) => setOpenExceptions(list.filter((e) => e.reviewStatus !== 'verified').length), onErr);
    const u4 = listenOpenShiftsBoard((list) => setOpenShifts(list.length), onErr);
    const u5 = listenPublishedRosters((list)=>{
      const t=list.flatMap(r=> r.shifts||[]).filter(s=> s.date===today).length;
      setTodayRoster(t);
    }, onErr);
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [retryKey]);

  const needsAttention = unassigned + pendingLeave + openExceptions + overdue;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{ROLE_AREA_META.kitchen.title}</Text>
      <Text style={styles.sub}>Signed in as {profile?.displayName || profile?.email}</Text>

      {needsAttention>0 && (
        <View style={styles.attention}>
          <Ionicons name="alert-circle" size={20} color="#92400e"/>
          <Text style={styles.attentionText}>{needsAttention} item{needsAttention>1?'s':''} need your attention</Text>
          <TouchableOpacity
            onPress={()=> {
              // Route to the actor who can act: managers → workforce queue; food leads → allocation.
              if (isManager && pendingLeave>0) router.push('/(kitchen)/leave-manage' as any);
              else if (isFoodLead && (unassigned>0 || overdue>0)) router.push(unassigned>0 ? '/(kitchen)/allocations' : '/(kitchen)/logistics' as any);
              else if (isFoodLead) router.push('/(kitchen)/logistics' as any);
              else router.push('/(kitchen)/donation-log' as any);
            }}
            style={styles.attentionBtn}
          >
            <Text style={styles.attentionBtnText}>Review</Text>
          </TouchableOpacity>
        </View>
      )}

      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      {/* TODAY */}
      <Text style={styles.groupTitle}>Today</Text>
      <View style={styles.groupCard}>
        <View style={styles.metricRow}>
          <Ionicons name="people" size={20} color={theme.colors.primary}/>
          <View style={{flex:1, marginLeft:10}}>
            <Text style={styles.metricLabel}>Staff scheduled</Text>
            <Text style={styles.metricValue}>{todayRoster} on roster</Text>
          </View>
          {isManager && <TouchableOpacity onPress={()=> router.push('/(kitchen)/roster-builder' as any)}><Text style={styles.link}>View ›</Text></TouchableOpacity>}
        </View>
        <View style={styles.divider}/>
        <View style={styles.metricRow}>
          <Ionicons name="qr-code" size={20} color="#2563eb"/>
          <View style={{flex:1, marginLeft:10}}>
            <Text style={styles.metricLabel}>Collections today</Text>
            <Text style={styles.metricValue}>{collectionsToday} scheduled{overdue? ` • ${overdue} overdue`:''}</Text>
          </View>
          <TouchableOpacity onPress={()=> router.push('/(kitchen)/logistics' as any)}><Text style={styles.link}>View ›</Text></TouchableOpacity>
        </View>
      </View>

      {/* FOOD RESCUE */}
      <Text style={styles.groupTitle}>Food Rescue</Text>
      <View style={styles.statsGrid}>
        {[
          {label:'Awaiting\nallocation', value:unassigned, icon:'fast-food', route:'/(kitchen)/allocations', show:isFoodLead, color:'#16a34a'},
          {label:'Ready to\nschedule', value:toSchedule, icon:'calendar', route:'/(kitchen)/logistics', show:isFoodLead, color:'#2563eb'},
          {label:'Collections\ntoday', value:collectionsToday, icon:'truck', route:'/(kitchen)/logistics', show:isFoodLead, color:'#7c3aed'},
        ].map(s=> s.show ? (
          <TouchableOpacity key={s.label} style={styles.stat} onPress={()=> router.push(s.route as any)}>
            <View style={[styles.statIcon,{backgroundColor: s.color+'15'}]}><Ionicons name={s.icon as any} size={20} color={s.color}/></View>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </TouchableOpacity>
        ): null)}
      </View>

      {/* WORKFORCE */}
      {isManager && (
        <>
          <Text style={styles.groupTitle}>Workforce</Text>
          <View style={styles.statsGrid}>
            {[
              {label:'Leave\nrequests', value:pendingLeave, icon:'time', route:'/(kitchen)/leave-manage', color:'#d97706'},
              {label:'Swap\nrequests', value:0, icon:'swap-horizontal', route:'/(kitchen)/leave-manage', color:'#7c3aed'}, // placeholder — swaps counted in same queue
              {label:'Open\nshifts', value:openShifts, icon:'people', route:'/(kitchen)/open-shifts', color:'#0284c7'},
              {label:'Exceptions', value:openExceptions, icon:'warning', route:'/(kitchen)/attendance', color:'#dc2626'},
            ].map(s=>(
              <TouchableOpacity key={s.label} style={styles.stat} onPress={()=> router.push(s.route as any)}>
                <View style={[styles.statIcon,{backgroundColor: s.color+'15'}]}><Ionicons name={s.icon as any} size={20} color={s.color}/></View>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* QUICK ACTIONS */}
      <Text style={styles.groupTitle}>Quick Actions</Text>
      <View style={styles.actions}>
        {[
          ['Log Donation','Camera → AI → review','camera', '/(kitchen)/donation-log', true],
          ['Allocate','Match & allocate','git-compare','/(kitchen)/allocations', isFoodLead],
          ['Schedule','Pickup & QR','truck','/(kitchen)/logistics', isFoodLead],
          ['Scan','Verify collection','qr-code','/(kitchen)/donation-scan', true],
          ['Kitchen Orders','Live order queue','list','/(kitchen)/order-queue', hasPermission('kitchen_orders')],
          ['Roster','Build & publish','calendar','/(kitchen)/roster-builder', isManager],
          ['Attendance','Review exceptions','time','/(kitchen)/attendance', isManager],
          ['Leave Queue','Approve leave & swaps','time','/(kitchen)/leave-manage', isManager],
        ].filter(([, , , , show])=>show).map(([title, sub, icon, route])=>(
          <TouchableOpacity key={route as string} style={styles.card} onPress={()=> router.push(route as any)}>
            <View style={styles.cardIcon}><Ionicons name={icon as any} size={22} color={theme.colors.primary}/></View>
            <View style={{flex:1}}>
              <Text style={styles.cardTitle}>{title as string}</Text>
              <Text style={styles.muted}>{sub as string}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted}/>
          </TouchableOpacity>
        ))}
      </View>

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
  sub: { color: theme.colors.textMuted, marginBottom: 8, fontSize:12 },
  attention:{flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#fef3c7', borderWidth:1, borderColor:'#fde68a', borderRadius:12, padding:12, marginBottom:12},
  attentionText:{flex:1, fontWeight:'600', color:'#92400e', fontSize:13},
  attentionBtn:{backgroundColor:'#92400e', paddingHorizontal:12, paddingVertical:6, borderRadius:20},
  attentionBtnText:{color:'#fff', fontWeight:'700', fontSize:12},
  groupTitle:{fontSize:13, fontWeight:'700', color:theme.colors.textSecondary, letterSpacing:0.8, textTransform:'uppercase', marginTop:16, marginBottom:8},
  groupCard:{backgroundColor:theme.colors.surface, borderRadius:12, padding:12, borderWidth:1, borderColor:theme.colors.border},
  metricRow:{flexDirection:'row', alignItems:'center', paddingVertical:6},
  metricLabel:{fontSize:13, color:theme.colors.textMuted, fontWeight:'500'},
  metricValue:{fontSize:15, fontWeight:'700', color:theme.colors.text},
  link:{color:theme.colors.primary, fontWeight:'700', fontSize:13},
  divider:{height:1, backgroundColor:theme.colors.border, marginVertical:6},
  statsGrid:{flexDirection:'row', flexWrap:'wrap', gap:8},
  stat:{flex:1, minWidth:'22%', backgroundColor:theme.colors.surface, borderRadius:12, padding:12, alignItems:'center', borderWidth:1, borderColor:theme.colors.border},
  statIcon:{width:40, height:40, borderRadius:20, alignItems:'center', justifyContent:'center', marginBottom:6},
  statValue:{fontSize:22, fontWeight:'800', color:theme.colors.text},
  statLabel:{fontSize:11, color:theme.colors.textMuted, textAlign:'center', lineHeight:13},
  actions:{gap:8, marginTop:4},
  card:{flexDirection:'row', alignItems:'center', gap:12, backgroundColor:theme.colors.surface, borderRadius:12, padding:14, borderWidth:1, borderColor:theme.colors.border},
  cardIcon:{width:44, height:44, borderRadius:12, backgroundColor:theme.colors.primaryLight, alignItems:'center', justifyContent:'center'},
  cardTitle:{color:theme.colors.text, fontWeight:'700', fontSize:15},
  muted:{color:theme.colors.textMuted, fontSize:12, marginTop:2},
  signout:{marginTop:16, padding:14, borderRadius:12, alignItems:'center', borderWidth:1, borderColor:theme.colors.error, backgroundColor:theme.colors.surface},
  signoutText:{color:theme.colors.error, fontWeight:'700'},
});
