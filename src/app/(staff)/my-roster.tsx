// My Schedule — calendar-first (transformed from My Roster list)
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '@/services/firebase-services';
import { listenPublishedRosters, listenOpenShiftsBoard, listenMySwaps, listenMyLeave } from '@/services/increment2-services';
import type { ShiftRoster, OpenShift, ShiftSwap, LeaveRequest } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { DetailModal, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { Calendar, CalendarIndicator } from '@/components/Calendar';
import { localDateISO, todayISO, parseISOLocal, addDaysISO, daysInclusive } from '@/utils/dates';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

type MyShift = ShiftRoster['shifts'][number] & { rosterDocId: string; week: string; department: string };

export default function MyScheduleScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const staffId = auth.currentUser?.uid || '';

  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [openShifts, setOpenShifts] = useState<OpenShift[]>([]);
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [selectedShift, setSelectedShift] = useState<MyShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!staffId) { setLoading(false); return; }
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenPublishedRosters(setRosters, onErr);
    const u2 = listenOpenShiftsBoard(setOpenShifts, onErr);
    const u3 = listenMySwaps(staffId, setSwaps, onErr);
    const u4 = listenMyLeave(staffId, setLeaves, onErr);
    const t = setTimeout(()=>setLoading(false), 800);
    return () => { u1(); u2(); u3(); u4(); clearTimeout(t); };
  }, [staffId]);
  useEffect(()=>{ if(rosters.length||openShifts.length) setLoading(false); },[rosters,openShifts]);

  const myShifts: MyShift[] = useMemo(()=> rosters.flatMap(r=> (r.shifts||[]).filter(s=>s.staffId===staffId).map(s=> ({...s, rosterDocId:r.id, week:r.weekStart, department:r.department}))) , [rosters, staffId]);

  const indicators: CalendarIndicator[] = useMemo(()=>{
    const map = new Map<string, CalendarIndicator>();
    const leaveDates = new Set<string>();
    leaves.filter(l=>l.status==='approved').forEach(l=>{
      // local-safe: never new Date(iso)/toISOString() — UTC parsing shifts day boundaries in UTC+2
      const n = daysInclusive(l.startDate, l.endDate);
      for(let i=0;i<n;i++) leaveDates.add(addDaysISO(l.startDate, i));
    });
    const pendingDates = new Set(swaps.filter(s=>['pending_peer','pending_manager','peer_accepted'].includes(s.status)).flatMap(s=>{
      // approximate via shift dates lookup
      const a = myShifts.find(x=>x.shiftId===s.requesterShiftId)?.date;
      const b = myShifts.find(x=>x.shiftId===s.targetShiftId)?.date;
      return [a,b].filter(Boolean) as string[];
    }));
    const openByDate = new Map<string, number>();
    openShifts.forEach(o=> openByDate.set(o.date, (openByDate.get(o.date)||0)+1));
    const myByDate = new Map<string, MyShift[]>();
    myShifts.forEach(s=>{ const arr=myByDate.get(s.date)||[]; arr.push(s); myByDate.set(s.date, arr); });

    // union dates from all sources in current month view
    const y=month.getFullYear(), m=month.getMonth();
    const dim=new Date(y,m+1,0).getDate();
    for(let d=1; d<=dim; d++){
      const iso=localDateISO(new Date(y,m,d)); // local-safe key — matches Calendar.tsx cell keys
      if(myByDate.has(iso)){
        const dayList = myByDate.get(iso)!;
        // Real conflict detection: a scheduled shift on an approved leave day,
        // or two same-day shifts overlapping in time
        const onLeave = leaveDates.has(iso);
        const overlaps = dayList.some((a,i)=> dayList.some((b,j)=> i<j && a.startTime < b.endTime && b.startTime < a.endTime));
        if(onLeave || overlaps) map.set(iso,{date:iso,type:'conflict',count:dayList.length});
        else map.set(iso,{date:iso,type:'scheduled',count:dayList.length});
      }
      else if(leaveDates.has(iso)) map.set(iso, {date:iso, type:'leave'});
      else if(pendingDates.has(iso)) map.set(iso, {date:iso, type:'pending'});
      else if(openByDate.has(iso)) map.set(iso,{date:iso,type:'open',count:openByDate.get(iso)});
      else map.set(iso,{date:iso,type:'none'});
    }
    return Array.from(map.values());
  },[myShifts, openShifts, swaps, leaves, month]);

  const dayShifts = myShifts.filter(s=>s.date===selectedDate);
  const dayOpen = openShifts.filter(o=>o.date===selectedDate);
  const dayPending = swaps.filter(s=> myShifts.some(m=> m.shiftId===s.requesterShiftId && m.date===selectedDate) || myShifts.some(m=>m.shiftId===s.targetShiftId && m.date===selectedDate));
  const dayLeave = leaves.filter(l=> l.status==='approved' && selectedDate>=l.startDate && selectedDate<=l.endDate);

  const formattedSelected = parseISOLocal(selectedDate).toLocaleDateString('en-ZA', {weekday:'long', day:'numeric', month:'long'});

  if (loading) return <ActivityIndicator size="large" color={theme.colors.primary} style={{marginTop:60}}/>;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={()=> goBack(router, '/(staff)/staff-dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text}/></TouchableOpacity>
        <Text style={styles.title}>My Schedule</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={()=>setLoadError('')} />

      <Calendar month={month} selectedDate={selectedDate} indicators={indicators} onSelectDate={setSelectedDate} onMonthChange={setMonth} />

      <Text style={styles.section}>{formattedSelected}</Text>

      {dayLeave.length>0 && (
        <View style={[styles.card, {borderColor:theme.colors.warning, backgroundColor:'#fffbeb'}]}>
          <View style={{flexDirection:'row', alignItems:'center', gap:6}}><Ionicons name="calendar-outline" size={16} color="#92400e"/><Text style={{fontWeight:'700', color:'#92400e'}}>On leave</Text></View>
          <Text style={styles.muted}>{dayLeave[0].leaveType}: {dayLeave[0].startDate} → {dayLeave[0].endDate}</Text>
        </View>
      )}

      <Text style={styles.subSection}>Your Shifts {dayShifts.length? `· ${dayShifts.length}`:''}</Text>
      {dayShifts.length===0 ? <Text style={styles.muted}>No shifts scheduled.</Text> : dayShifts.map(s=>(
        <TouchableOpacity key={s.shiftId} style={styles.shiftCard} onPress={()=> setSelectedShift(s)} activeOpacity={0.7}>
          <Text style={styles.cardTitle}>{s.startTime} – {s.endTime}</Text>
          <Text style={styles.muted}>{s.department} • {s.role}{s.requiredSkill? ` • ${s.requiredSkill}`:''}</Text>
          <Text style={styles.review}>Tap to inspect ›</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.subSection}>Open Shifts {dayOpen.length? `· ${dayOpen.length}`:''}</Text>
      {dayOpen.length===0 ? <Text style={styles.muted}>No open shifts.</Text> : dayOpen.slice(0,3).map(o=>(
        <TouchableOpacity key={o.id} style={styles.openCard} onPress={()=> router.push('/(staff)/open-shifts' as any)}>
          <View style={{flex:1}}>
            <Text style={styles.cardTitle}>{o.startTime}–{o.endTime} • {o.role}</Text>
            <Text style={styles.muted}>{o.department} · {o.hours}h {o.urgency==='urgent'||o.urgency==='critical'? `• ${o.urgency}`:''}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted}/>
        </TouchableOpacity>
      ))}
      {dayOpen.length>3 && <TouchableOpacity onPress={()=> router.push('/(staff)/open-shifts' as any)}><Text style={styles.link}>View all open shifts ›</Text></TouchableOpacity>}

      {dayPending.length>0 && (
        <>
          <Text style={styles.subSection}>Pending</Text>
          {dayPending.map(sw=>(
            <View key={sw.id} style={[styles.card,{borderColor:theme.colors.warning, backgroundColor:'#fef3c7'}]}>
              <Text style={styles.cardTitle}>Swap {sw.requesterShiftId.slice(0,6)} ⇄ {sw.targetShiftId.slice(0,6)}</Text>
              <Text style={styles.muted}>{sw.status.replace('_',' ')}</Text>
            </View>
          ))}
        </>
      )}

      <DetailModal visible={selectedShift!==null} title={selectedShift? `${selectedShift.date} ${selectedShift.startTime}–${selectedShift.endTime}`:''} onClose={()=>setSelectedShift(null)}>
        {selectedShift && (
          <View>
            <StatusBadge status="published"/>
            <SectionTitle>SHIFT</SectionTitle>
            <KV label="Date" value={selectedShift.date}/>
            <KV label="Time" value={`${selectedShift.startTime}–${selectedShift.endTime}`}/>
            <KV label="Role" value={selectedShift.role}/>
            <KV label="Skill" value={selectedShift.requiredSkill||'None'}/>
            <KV label="Department" value={selectedShift.department}/>
            <KV label="Week" value={selectedShift.week}/>
            <View style={styles.btnRow}>
              <ModalButton label="Request swap" kind="secondary" onPress={()=>{ const id=selectedShift.shiftId; setSelectedShift(null); router.push({pathname:'/(staff)/shift-swaps', params:{myShiftId:id}} as any);}}/>
              <ModalButton label="Open shifts" kind="secondary" onPress={()=>{ setSelectedShift(null); router.push('/(staff)/open-shifts' as any);}}/>
            </View>
          </View>
        )}
      </DetailModal>
      <View style={{height:40}}/>
    </ScrollView>
  );
}
const createStyles=(theme:any)=> StyleSheet.create({
  container:{flex:1, backgroundColor:theme.colors.background, padding:16},
  header:{flexDirection:'row', alignItems:'center', gap:12, marginBottom:12},
  title:{fontSize:20, fontWeight:'700', color:theme.colors.text},
  section:{fontSize:16, fontWeight:'700', color:theme.colors.text, marginTop:16, marginBottom:8},
  subSection:{fontSize:13, fontWeight:'700', color:theme.colors.textSecondary, marginTop:14, marginBottom:6, textTransform:'uppercase', letterSpacing:0.5},
  card:{backgroundColor:theme.colors.surface, borderRadius:10, padding:14, marginBottom:8, borderWidth:1, borderColor:theme.colors.border},
  shiftCard:{backgroundColor:theme.colors.surface, borderRadius:12, padding:14, marginBottom:8, borderWidth:1, borderColor:theme.colors.border, borderLeftWidth:4, borderLeftColor:theme.colors.success},
  openCard:{backgroundColor:theme.colors.surface, borderRadius:10, padding:12, marginBottom:8, borderWidth:1, borderColor:'#bfdbfe', flexDirection:'row', alignItems:'center', gap:8, borderLeftWidth:4, borderLeftColor:'#2563eb'},
  cardTitle:{color:theme.colors.text, fontWeight:'700'},
  muted:{color:theme.colors.textMuted, fontSize:12, marginTop:4},
  review:{color:theme.colors.primary, fontSize:12, fontWeight:'700', marginTop:6},
  link:{color:theme.colors.primary, fontSize:13, fontWeight:'600', marginTop:4},
  btnRow:{flexDirection:'row', gap:8, marginTop:12},
});
