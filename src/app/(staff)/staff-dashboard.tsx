import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getTheme } from '@/constants/theme';
import { auth } from '@/services/firebase-services';
import { listenPublishedRosters, listenOpenShiftsBoard, listenMyLeave, listenMySwaps } from '@/services/increment2-services';
import type { ShiftRoster, OpenShift, LeaveRequest, ShiftSwap } from '@/types/increment2';
import { LiveErrorBanner } from '@/components/detail-kit';
import { todayISO, addDaysISO, formatISODate } from '@/utils/dates';

export default function StaffDashboardScreen() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const S = createStyles(theme);
  const uid = auth.currentUser?.uid || '';

  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [openShifts, setOpenShifts] = useState<OpenShift[]>([]);
  const [myLeave, setMyLeave] = useState<LeaveRequest[]>([]);
  const [mySwaps, setMySwaps] = useState<ShiftSwap[]>([]);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenPublishedRosters(setRosters, onErr);
    const u2 = listenOpenShiftsBoard(setOpenShifts, onErr);
    const u3 = listenMyLeave(uid, setMyLeave, onErr);
    const u4 = listenMySwaps(uid, setMySwaps, onErr);
    const t = setTimeout(() => setLoading(false), 1200);
    return () => { u1(); u2(); u3(); u4(); clearTimeout(t); };
  }, [uid, retryKey]);

  useEffect(() => { if (rosters.length || openShifts.length) setLoading(false); }, [rosters, openShifts]);

  const myShifts = useMemo(() => {
    return rosters.flatMap(r => (r.shifts || []).filter(s => s.staffId === uid).map(s => ({ ...s, week: r.weekStart, department: r.department })))
      .sort((a,b) => (a.date+a.startTime).localeCompare(b.date+b.startTime));
  }, [rosters, uid]);

  const todayStr = todayISO();
  const todayShifts = myShifts.filter(s => s.date === todayStr);
  const todayShift = todayShifts[0] || null;
  const nextUp = myShifts.filter(s => s.date > todayStr).slice(0,2);
  const openCount = openShifts.length;
  const weekEnd = addDaysISO(todayStr, 7);
  const openThisWeek = openShifts.filter(o=> o.date>=todayStr && o.date<=weekEnd).length;
  const pendingLeave = myLeave.filter(l => l.status === 'pending').length;
  const pendingSwaps = mySwaps.filter(s => ['pending_peer','pending_manager','peer_accepted'].includes(s.status)).length;

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning,';
    if (h < 17) return 'Good Afternoon,';
    return 'Good Evening,';
  };

  const onRefresh = () => {
    // Real refresh: bumping retryKey re-subscribes all listeners (forces an
    // immediate re-read instead of a placebo timer).
    setRefreshing(true);
    setRetryKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <SafeAreaView style={S.container}>
      <ScrollView style={S.scroll} contentContainerStyle={S.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}>
        <View style={S.headerRow}>
          <View style={{flex:1}}>
            <Text style={S.greeting}>{getGreeting()}</Text>
            <Text style={S.name}>{profile?.displayName || 'Staff Member'}</Text>
            <View style={S.rolePill}>
              <Ionicons name="shield-checkmark" size={12} color={theme.colors.secondary} />
              <Text style={S.roleText}>{profile?.subRole?.replace('_',' ').toUpperCase() || 'STAFF'}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={S.signOutBtn}
            accessibilityLabel="Sign out"
            accessibilityRole="button"
            onPress={async () => {
              await signOut();
              router.replace('/login' as any);
            }}
          >
            <Ionicons name="log-out-outline" size={22} color={theme.colors.error} />
          </TouchableOpacity>
        </View>

        <LiveErrorBanner error={loadError} onRetry={()=>setLoadError('')} />

        {/* MY NEXT ACTION */}
        {(pendingLeave>0 || pendingSwaps>0) && (
          <TouchableOpacity style={S.actionBanner} onPress={()=> router.push(pendingLeave? '/(staff)/availability-leave' as any : '/(staff)/shift-swaps' as any)}>
            <Ionicons name="alert-circle" size={20} color="#92400e" />
            <Text style={S.actionBannerText}>{pendingLeave? `${pendingLeave} leave request${pendingLeave>1?'s':''} pending` : `${pendingSwaps} shift swap${pendingSwaps>1?'s':''} pending`} — tap to review</Text>
            <Ionicons name="chevron-forward" size={16} color="#92400e" />
          </TouchableOpacity>
        )}

        {/* TODAY — centre of gravity */}
        <Text style={S.sectionTitle}>Today</Text>
        {loading ? <ActivityIndicator color={theme.colors.primary} /> : todayShift ? (
          <View style={S.heroCard}>
            <View style={S.heroTop}>
              <View style={S.heroBadge}><Text style={S.heroBadgeText}>TODAY • {formatISODate(todayShift.date, {weekday:'short'})}</Text></View>
              <Text style={S.heroDept}>{todayShift.department}</Text>
            </View>
            <Text style={S.heroTime}>{todayShift.startTime} – {todayShift.endTime}</Text>
            <Text style={S.heroRole}>{todayShift.role}{todayShift.requiredSkill? ` • ${todayShift.requiredSkill}`:''} • Confirmed</Text>
            <TouchableOpacity style={S.heroBtn} onPress={()=> router.push('/(staff)/my-roster' as any)}>
              <Text style={S.heroBtnText}>View Shift</Text><Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={S.emptyCard}>
            <Ionicons name="calendar-outline" size={32} color={theme.colors.textMuted}/>
            <Text style={S.emptyText}>No shift today. Enjoy your day off — check what’s next below.</Text>
          </View>
        )}

        {/* NEXT UP */}
        <Text style={[S.sectionTitle, {marginTop:20}]}>Next Up</Text>
        {nextUp.length===0 ? (
          <Text style={S.muted}>Nothing scheduled after today.</Text>
        ) : (
          nextUp.map(s => (
            <View key={s.shiftId} style={S.upcomingCard}>
              <View style={S.upcomingLeft}>
                <Text style={S.upcomingDate}>{formatISODate(s.date, {weekday:'short'})} {s.date.slice(8,10)}</Text>
                <Text style={S.upcomingTime}>{s.startTime}–{s.endTime}</Text>
              </View>
              <View style={{flex:1, marginLeft:12}}>
                <Text style={S.upcomingRole} numberOfLines={1}>{s.role}</Text>
                <Text style={S.muted}>{s.department}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted}/>
            </View>
          ))
        )}

        {/* OPEN SHIFTS */}
        <TouchableOpacity style={S.openCard} onPress={()=> router.push('/(staff)/open-shifts' as any)} activeOpacity={0.8}>
          <View style={{flex:1}}>
            <Text style={S.openTitle}>Open Shifts</Text>
            <Text style={S.openSub}>{openThisWeek===0? 'No openings this week' : `${openThisWeek} available this week • ${openCount} total`}</Text>
          </View>
          <View style={S.openBadge}><Text style={S.openBadgeText}>{openThisWeek || openCount}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted}/>
        </TouchableOpacity>

        {/* NEEDS YOUR ATTENTION */}
        <Text style={[S.sectionTitle, {marginTop:20}]}>Needs Your Attention</Text>
        {(pendingLeave===0 && pendingSwaps===0) ? (
          <View style={S.doneCard}><Ionicons name="checkmark-circle" size={20} color={theme.colors.success}/><Text style={S.doneText}>All caught up — no pending requests.</Text></View>
        ) : (
          <View style={S.pendingRow}>
            {pendingSwaps>0 && (
              <TouchableOpacity style={[S.pendingCard,{borderColor:theme.colors.info, backgroundColor:'#e0f2fe'}]} onPress={()=> router.push('/(staff)/shift-swaps' as any)}>
                <Ionicons name="swap-horizontal" size={18} color={theme.colors.info}/>
                <Text style={S.pendingLabel}>Shift swap</Text>
                <Text style={S.pendingValue}>{pendingSwaps}</Text>
              </TouchableOpacity>
            )}
            {pendingLeave>0 && (
              <TouchableOpacity style={[S.pendingCard,{borderColor:theme.colors.warning, backgroundColor:'#fef3c7'}]} onPress={()=> router.push('/(staff)/availability-leave' as any)}>
                <Ionicons name="time" size={18} color={theme.colors.warning}/>
                <Text style={S.pendingLabel}>Leave request</Text>
                <Text style={S.pendingValue}>{pendingLeave}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* QUICK ACTIONS — hierarchy: HOME = now, SCHEDULE = when, OPEN = opportunities */}
        <Text style={[S.sectionTitle, {marginTop:20}]}>Quick Actions</Text>
        <View style={S.quickGrid}>
          {[
            { label:'My Schedule', icon:'calendar', color:theme.colors.primary, bg:theme.colors.primaryLight, route:'/(staff)/my-roster' as const },
            { label:'Clock In', icon:'finger-print', color:'#16a34a', bg:'#dcfce7', route:'/(staff)/clock-in-out' as const },
            { label:'Open Shifts', icon:'search', color:'#7c3aed', bg:'#f3e8ff', route:'/(staff)/open-shifts' as const },
            { label:'Availability', icon:'time', color:'#0284c7', bg:'#e0f2fe', route:'/(staff)/availability-leave' as const },
            { label:'Activity', icon:'notifications', color:'#0ea5e9', bg:'#e0f2fe', route:'/(staff)/notifications' as const },
          ].map(a=>(
            <TouchableOpacity key={a.label} style={[S.quickCard,{backgroundColor:a.bg}]} onPress={()=> router.push(a.route as any)}>
              <Ionicons name={a.icon as any} size={22} color={a.color}/>
              <Text style={[S.quickLabel,{color:a.color}]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{height:40}}/>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme:any)=> StyleSheet.create({
  container:{flex:1, backgroundColor:theme.colors.background},
  scroll:{flex:1},
  content:{padding:16, paddingBottom:40},
  headerRow:{flexDirection:'row', alignItems:'flex-start', marginBottom:8},
  greeting:{fontSize:13, textTransform:'uppercase', letterSpacing:1, color:theme.colors.textMuted, fontWeight:'600'},
  name:{fontSize:26, fontWeight:'800', color:theme.colors.text, marginTop:2},
  rolePill:{flexDirection:'row', alignItems:'center', gap:4, backgroundColor:theme.colors.secondaryLight, alignSelf:'flex-start', paddingHorizontal:10, paddingVertical:4, borderRadius:20, marginTop:6},
  roleText:{fontSize:11, fontWeight:'700', color:theme.colors.secondary, letterSpacing:0.5},
  signOutBtn:{width:42, height:42, borderRadius:21, backgroundColor:theme.colors.errorLight, justifyContent:'center', alignItems:'center'},
  sectionTitle:{fontSize:16, fontWeight:'700', color:theme.colors.text, marginBottom:12},
  actionBanner:{flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#fef3c7', borderWidth:1, borderColor:'#fde68a', borderRadius:12, padding:12, marginBottom:12},
  actionBannerText:{flex:1, fontSize:13, fontWeight:'600', color:'#92400e'},
  heroCard:{backgroundColor:theme.colors.surface, borderRadius:16, padding:16, borderWidth:1, borderColor:theme.colors.border, shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.08, shadowRadius:12, elevation:4},
  heroTop:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8},
  heroBadge:{backgroundColor:theme.colors.primaryLight, paddingHorizontal:10, paddingVertical:4, borderRadius:20},
  heroBadgeText:{fontSize:11, fontWeight:'700', color:theme.colors.primary},
  heroDept:{fontSize:13, fontWeight:'600', color:theme.colors.textMuted},
  heroTime:{fontSize:28, fontWeight:'800', color:theme.colors.text, marginBottom:4},
  heroRole:{fontSize:14, color:theme.colors.textSecondary, marginBottom:12},
  heroBtn:{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:theme.colors.text, paddingVertical:12, borderRadius:12},
  heroBtnText:{color:'#fff', fontWeight:'700', fontSize:14},
  emptyCard:{backgroundColor:theme.colors.surface, borderRadius:16, padding:24, alignItems:'center', gap:12, borderWidth:1, borderColor:theme.colors.border},
  emptyText:{fontSize:14, color:theme.colors.textMuted, textAlign:'center'},
  smallBtn:{backgroundColor:theme.colors.primary, paddingHorizontal:16, paddingVertical:10, borderRadius:20, marginTop:4},
  smallBtnText:{color:'#fff', fontWeight:'700', fontSize:13},
  doneCard:{flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#f0fdf4', borderWidth:1, borderColor:'#bbf7d0', borderRadius:12, padding:12},
  doneText:{fontSize:13, fontWeight:'600', color:'#166534'},
  upcomingCard:{flexDirection:'row', alignItems:'center', backgroundColor:theme.colors.surface, borderRadius:12, padding:12, marginBottom:8, borderWidth:1, borderColor:theme.colors.border},
  upcomingLeft:{alignItems:'center', minWidth:70},
  upcomingDate:{fontSize:12, fontWeight:'700', color:theme.colors.text},
  upcomingTime:{fontSize:12, color:theme.colors.textMuted, marginTop:2},
  upcomingRole:{fontSize:14, fontWeight:'600', color:theme.colors.text},
  muted:{fontSize:13, color:theme.colors.textMuted},
  openCard:{flexDirection:'row', alignItems:'center', backgroundColor:theme.colors.surface, borderRadius:12, padding:16, marginTop:8, borderWidth:1, borderColor:theme.colors.border, gap:12},
  openTitle:{fontSize:15, fontWeight:'700', color:theme.colors.text},
  openSub:{fontSize:13, color:theme.colors.textMuted, marginTop:2},
  openBadge:{backgroundColor:'#dcfce7', borderRadius:20, paddingHorizontal:10, paddingVertical:4, borderWidth:1, borderColor:'#bbf7d0'},
  openBadgeText:{fontSize:13, fontWeight:'700', color:'#16a34a'},
  pendingRow:{flexDirection:'row', gap:8},
  pendingCard:{flex:1, backgroundColor:theme.colors.surface, borderRadius:12, padding:12, borderWidth:1, borderColor:theme.colors.border, alignItems:'center', gap:6},
  pendingLabel:{fontSize:11, fontWeight:'600', color:theme.colors.textMuted, textAlign:'center'},
  pendingValue:{fontSize:20, fontWeight:'800', color:theme.colors.text},
  quickGrid:{flexDirection:'row', flexWrap:'wrap', gap:12},
  quickCard:{width:'30%', padding:14, borderRadius:16, alignItems:'center', minHeight:90, justifyContent:'center'},
  quickLabel:{fontSize:11, fontWeight:'700', textAlign:'center', marginTop:8},
});
