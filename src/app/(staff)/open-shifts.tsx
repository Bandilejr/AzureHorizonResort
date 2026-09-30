// Open Shifts — calendar-first (transformed)
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '@/services/firebase-services';
import { listenOpenShiftsBoard, listenPublishedRosters, claimOpenShiftMobile, checkOpenShiftEligibility, ShiftEligibility } from '@/services/increment2-services';
import type { OpenShift, ShiftRoster } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { todayISO, localDateISO } from '@/utils/dates';
import { Calendar, CalendarIndicator } from '@/components/Calendar';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

export default function StaffOpenShiftsCalendarScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const staffId = auth.currentUser?.uid || '';

  const [open, setOpen] = useState<OpenShift[]>([]);
  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [loadError, setLoadError] = useState('');
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<OpenShift | null>(null);
  const [elig, setElig] = useState<ShiftEligibility | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => {
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenOpenShiftsBoard(setOpen, onErr);
    const u2 = listenPublishedRosters(setRosters, onErr);
    return () => { u1(); u2(); };
  }, []);

  const myShifts = useMemo(()=> rosters.flatMap(r=> (r.shifts||[]).filter(s=>s.staffId===staffId).map(s=> ({...s, date: s.date}))) , [rosters, staffId]);

  const indicators: CalendarIndicator[] = useMemo(()=>{
    const byDate = new Map<string, {total:number, urgent:number}>();
    open.forEach(o=>{
      const cur = byDate.get(o.date) || {total:0, urgent:0};
      cur.total +=1;
      if(o.urgency==='urgent' || o.urgency==='critical') cur.urgent+=1;
      byDate.set(o.date, cur);
    });
    const mySet = new Set(myShifts.map(s=>s.date));
    const y=month.getFullYear(), m=month.getMonth(), dim=new Date(y,m+1,0).getDate();
    const res: CalendarIndicator[] = [];
    for(let d=1; d<=dim; d++){
      const iso=localDateISO(new Date(y,m,d)); // local-safe key — matches Calendar.tsx cell keys
      const info=byDate.get(iso);
      if(!info) {
        if(mySet.has(iso)) res.push({date:iso, type:'scheduled'});
        else res.push({date:iso, type:'none'});
      } else {
        if(mySet.has(iso) && info.total>0) res.push({date:iso, type:'conflict', count:info.total});
        else if(info.urgent>0) res.push({date:iso, type:'pending', count:info.total});
        else res.push({date:iso, type:'open', count:info.total});
      }
    }
    return res;
  },[open, myShifts, month]);

  const filtered = useMemo(()=>{
    let base = showAll ? open : open.filter(s=> s.date===selectedDate);
    if(query) base = base.filter(s=> `${s.role} ${s.department} ${s.date}`.toLowerCase().includes(query.toLowerCase()));
    return base.sort((a,b)=> (a.date+a.startTime).localeCompare(b.date+b.startTime));
  },[open, selectedDate, showAll, query]);

  const openShift = async (s: OpenShift) => {
    setSelected(s); setConfirming(false); setElig(null); setChecking(true);
    // Phase 1 (§26): past-date shifts are not claimable — skip the live check.
    if (s.date < todayISO()) { setChecking(false); return; }
    try { setElig(await checkOpenShiftEligibility(s, staffId)); } catch { setElig(null); } finally { setChecking(false); }
  };
  const claim = async () => {
    if(!selected) return;
    setBusy(true);
    try { await claimOpenShiftMobile(selected.id); setSelected(null); setConfirming(false); showAlert({title:'Shift claimed', message:'Added to your roster.', type:'success'}); }
    catch(e:any){ showAlert({title:'Claim failed', message:e?.message||'Shift may have just been filled.', type:'error'}); }
    finally{ setBusy(false); }
  };

  const selectedLabel = new Date(selectedDate).toLocaleDateString('en-ZA', {weekday:'long', day:'numeric', month:'long'});

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={()=> goBack(router, '/(staff)/staff-dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text}/></TouchableOpacity>
        <Text style={styles.title}>Open Shifts</Text>
        <TouchableOpacity onPress={()=> setShowAll(v=>!v)} style={[styles.toggle, showAll && {backgroundColor:theme.colors.primary}]}><Text style={[styles.toggleText, showAll && {color:'#fff'}]}>{showAll? 'All dates':'Selected date'}</Text></TouchableOpacity>
      </View>
      <LiveErrorBanner error={loadError} onRetry={()=>setLoadError('')} />

      <Calendar month={month} selectedDate={selectedDate} indicators={indicators} onSelectDate={setSelectedDate} onMonthChange={setMonth} />

      <View style={{marginTop:12, flexDirection:'row', alignItems:'center', gap:8}}>
        <Ionicons name="search-outline" size={16} color={theme.colors.textMuted}/>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search role or department" placeholderTextColor={theme.colors.textMuted} style={{flex:1, color:theme.colors.text, borderWidth:1, borderColor:theme.colors.border, borderRadius:8, padding:8, backgroundColor:theme.colors.surface}} />
        {query? <TouchableOpacity onPress={()=>setQuery('')}><Ionicons name="close-circle" size={16} color={theme.colors.textMuted}/></TouchableOpacity>:null}
      </View>

      <Text style={styles.section}>{showAll? `All open (${filtered.length})` : `${selectedLabel} — ${filtered.length} shift${filtered.length!==1?'s':''}`}</Text>
      {filtered.length===0 && (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={40} color={theme.colors.textMuted}/>
          <Text style={styles.muted}>{open.length===0? 'No open shifts right now. Manager publishes surge shifts and they appear here.' : showAll? 'No shifts match your filter.' : 'No open shifts on this date. Try another date or view all.'}</Text>
          {!showAll && <TouchableOpacity onPress={()=> setShowAll(true)} style={{marginTop:8}}><Text style={{color:theme.colors.primary, fontWeight:'600'}}>View all open shifts ›</Text></TouchableOpacity>}
        </View>
      )}
      {filtered.map(s=>{
        const mineThatDay = myShifts.some(m=> m.date===s.date);
        return (
          <TouchableOpacity key={s.id} style={styles.card} onPress={()=>openShift(s)} activeOpacity={0.7}>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
              <Text style={styles.cardTitle}>{s.startTime}–{s.endTime} • {s.role}</Text>
              {s.urgency==='urgent'||s.urgency==='critical'? <View style={styles.urgent}><Text style={styles.urgentText}>{s.urgency}</Text></View>:null}
            </View>
            <Text style={styles.muted}>{s.department} · {s.hours}h · {s.requiredSkill||'no skill req'} {mineThatDay? '• you’re scheduled this day':''}</Text>
            <Text style={styles.review}>Tap to inspect ›</Text>
          </TouchableOpacity>
        );
      })}

      <DetailModal visible={selected!==null} title={selected? `${selected.date} • ${selected.role}`:''} onClose={()=>setSelected(null)}>
        {selected && !confirming && (
          <View>
            <StatusBadge status={selected.status}/>
            <SectionTitle>SHIFT</SectionTitle>
            <KV label="Date" value={selected.date}/>
            <KV label="Time" value={`${selected.startTime}–${selected.endTime} (${selected.hours}h)`}/>
            <KV label="Role" value={selected.role}/>
            <KV label="Skill" value={selected.requiredSkill||'None'}/>
            <KV label="Department" value={selected.department}/>
            <KV label="Urgency" value={selected.urgency||'normal'}/>
            {selected.date < todayISO() && (
              <View style={styles.warnBox}>
                <Text style={styles.warnTitle}>PAST DATE</Text>
                <View style={styles.checkRow}><Ionicons name="close-circle" size={14} color="#dc2626"/><Text style={styles.warn}> This shift date has passed and can no longer be claimed.</Text></View>
              </View>
            )}
            <SectionTitle>ELIGIBILITY</SectionTitle>
            {checking && <ActivityIndicator color={theme.colors.primary}/>}
            {!checking && elig && elig.eligible && (
              <View style={styles.okBox}>
                <Text style={styles.okTitle}>YOU CAN CLAIM THIS SHIFT</Text>
                <View style={{marginTop:6, gap:4}}>
                  <View style={styles.checkRow}><Ionicons name="checkmark-circle" size={14} color="#16a34a"/><Text style={styles.checkText}>Qualified</Text></View>
                  <View style={styles.checkRow}><Ionicons name="checkmark-circle" size={14} color="#16a34a"/><Text style={styles.checkText}>Available</Text></View>
                  <View style={styles.checkRow}><Ionicons name="checkmark-circle" size={14} color="#16a34a"/><Text style={styles.checkText}>No schedule conflict</Text></View>
                  <View style={styles.checkRow}><Ionicons name="checkmark-circle" size={14} color="#16a34a"/><Text style={styles.checkText}>Leave does not overlap</Text></View>
                  <View style={styles.checkRow}><Ionicons name="checkmark-circle" size={14} color="#16a34a"/><Text style={styles.checkText}>Within working-hour limits</Text></View>
                </View>
              </View>
            )}
            {!checking && elig && !elig.eligible && (
              <View style={styles.warnBox}>
                <Text style={styles.warnTitle}>CAN&apos;T CLAIM</Text>
                {elig.reasons.map((r,i)=> <View key={i} style={styles.checkRow}><Ionicons name="close-circle" size={14} color="#dc2626"/><Text style={styles.warn}> {r}</Text></View>)}
              </View>
            )}
            {!checking && !elig && <Text style={styles.muted}>Checking eligibility failed — please retry. Claim is blocked until check passes.</Text>}
            <View style={{marginTop:12}}>
              <ModalButton label={checking? 'Checking…':'Review claim'} onPress={()=>setConfirming(true)} disabled={checking || !elig || !elig.eligible || selected.date < todayISO()} />
            </View>
          </View>
        )}
        {selected && confirming && (
          <ConfirmBlock title="Claim this shift?" rows={[['Shift', `${selected.date} ${selected.startTime}–${selected.endTime}`], ['Role', `${selected.role}${selected.requiredSkill? ` (${selected.requiredSkill})`:''}`], ['Department', selected.department], ['Effect','Shift fills immediately and links into your roster']]} confirmLabel="Confirm claim" onConfirm={claim} onCancel={()=>setConfirming(false)} busy={busy}/>
        )}
      </DetailModal>
      <View style={{height:40}}/>
      <CustomAlertModal config={alertConfig} onClose={()=>setAlertConfig(p=>({...p, visible:false}))}/>
    </ScrollView>
  );
}
const createStyles=(theme:any)=> StyleSheet.create({
  container:{flex:1, backgroundColor:theme.colors.background, padding:16},
  header:{flexDirection:'row', alignItems:'center', gap:12, marginBottom:12},
  title:{flex:1, fontSize:20, fontWeight:'700', color:theme.colors.text},
  toggle:{paddingHorizontal:10, paddingVertical:6, borderRadius:20, borderWidth:1, borderColor:theme.colors.border, backgroundColor:theme.colors.surface},
  toggleText:{fontSize:12, fontWeight:'600', color:theme.colors.textSecondary},
  section:{fontSize:16, fontWeight:'700', color:theme.colors.text, marginTop:16, marginBottom:8},
  card:{backgroundColor:theme.colors.surface, borderRadius:10, padding:14, marginBottom:8, borderWidth:1, borderColor:theme.colors.border},
  cardTitle:{color:theme.colors.text, fontWeight:'700'},
  muted:{color:theme.colors.textMuted, fontSize:12, marginTop:4},
  review:{color:theme.colors.primary, fontSize:12, fontWeight:'700', marginTop:6},
  empty:{alignItems:'center', padding:24, gap:8},
  urgent:{backgroundColor:'#fef2f2', borderRadius:6, paddingHorizontal:8, paddingVertical:2, borderWidth:1, borderColor:'#fecaca'},
  urgentText:{fontSize:10, fontWeight:'700', color:'#dc2626', textTransform:'uppercase'},
  okBox:{backgroundColor:'#f0fdf4', borderRadius:8, padding:12, borderWidth:1, borderColor:'#bbf7d0'},
  okTitle:{color:'#16a34a', fontWeight:'700', fontSize:13, letterSpacing:0.5},
  checkRow:{flexDirection:'row', alignItems:'center', gap:6},
  checkText:{fontSize:13, color:'#065f46', fontWeight:'500'},
  warnBox:{backgroundColor:'#fffbeb', borderRadius:8, padding:12, borderWidth:1, borderColor:'#fde68a'},
  warnTitle:{color:'#92400e', fontWeight:'700', fontSize:13, letterSpacing:0.5, marginBottom:4},
  warn:{color:'#92400e', fontSize:12, marginTop:2},
});
