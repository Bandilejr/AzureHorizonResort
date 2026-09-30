// UC41 mobile — My availability + leave requests.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, TextInput, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auth } from '@/services/firebase-services';
import {
  listenMyAvailability, listenMyLeave, submitAvailabilityMobile, submitLeaveMobile,
} from '@/services/increment2-services';
import type { StaffAvailability, LeaveRequest } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { LiveErrorBanner } from '@/components/detail-kit';
import { formatStatus } from '@/utils/status-labels';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { todayISO, localDateISO, parseISOLocal } from '@/utils/dates';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const LEAVE_TYPES = [
  { value: 'Annual', label: 'Annual', icon: 'sunny-outline' as const },
  { value: 'Sick', label: 'Sick', icon: 'medkit-outline' as const },
  { value: 'Family', label: 'Family', icon: 'people-outline' as const },
  { value: 'Unpaid', label: 'Unpaid', icon: 'cash-outline' as const },
];

export default function AvailabilityLeaveScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const staffId = auth.currentUser?.uid || '';

  const [weekStart, setWeekStart] = useState(() => todayISO());
  const [slots, setSlots] = useState<Record<string, { start: string; end: string; on: boolean }>>(
    Object.fromEntries(DAYS.map((d) => [d, { start: '08:00', end: '17:00', on: true }]))
  );
  const [leaveType, setLeaveType] = useState('Annual');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [showLeaveStart, setShowLeaveStart] = useState(false);
  const [showLeaveEnd, setShowLeaveEnd] = useState(false);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [timePicker, setTimePicker] = useState<{day:string, which:'start'|'end'}|null>(null);
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [myLeave, setMyLeave] = useState<LeaveRequest[]>([]);
  const [myAvail, setMyAvail] = useState<StaffAvailability[]>([]);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => {
    if (!staffId) return;
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    const u1 = listenMyAvailability(staffId, setMyAvail, onErr);
    const u2 = listenMyLeave(staffId, setMyLeave, onErr);
    return () => { u1(); u2(); };
  }, [staffId, retryKey]);

  const pickProof = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!res.canceled && res.assets?.[0]?.uri) setProofUri(res.assets[0].uri);
  };

  const saveAvailability = async () => {
    setBusy(true);
    try {
      await submitAvailabilityMobile({
        weekStart,
        availability: DAYS.filter((d) => slots[d].on).map((d) => ({ day: d, startTime: slots[d].start, endTime: slots[d].end })),
      });
      showAlert({ title: 'Availability saved', message: `Week of ${weekStart} submitted.`, type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Save failed', message: e?.message || 'Could not save.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const submitLeave = async () => {
    if (!leaveStart || !leaveEnd) { showAlert({ title: 'Dates required', message: 'Enter leave start and end dates (YYYY-MM-DD).', type: 'error' }); return; }
    setBusy(true);
    try {
      await submitLeaveMobile({ leaveType, startDate: leaveStart, endDate: leaveEnd, proofUri: proofUri || undefined });
      setLeaveStart(''); setLeaveEnd(''); setProofUri(null);
      showAlert({ title: 'Leave submitted', message: 'Manager will review your request.', type: 'success' });
    } catch (e: any) {
      showAlert({ title: 'Submission failed', message: e?.message || 'Could not submit.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(staff)/staff-dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Availability & Leave</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      <Text style={styles.section}>When can you work?</Text>
      <TouchableOpacity style={styles.input} onPress={() => setShowWeekPicker(true)}>
        <Text style={{ color: theme.colors.text }}>Week start: {weekStart} — tap to pick</Text>
      </TouchableOpacity>
      {showWeekPicker && (
        <DateTimePicker
          value={weekStart ? parseISOLocal(weekStart) : new Date()}
          mode="date" display="default"
          onChange={(_, d) => { setShowWeekPicker(false); if (d) setWeekStart(localDateISO(d)); }}
        />
      )}
      <View style={{flexDirection:'row', gap:6, marginBottom:8, flexWrap:'wrap'}}>
        {[
          {label:'Weekdays 08–17', fn:()=> setSlots(p=>{
            const n={...p};
            ['Monday','Tuesday','Wednesday','Thursday','Friday'].forEach(day=> n[day]={...n[day], on:true, start:'08:00', end:'17:00'});
            ['Saturday','Sunday'].forEach(day=> n[day]={...n[day], on:false});
            return n;
          })},
          {label:'All week', fn:()=> setSlots(p=>{ const n={...p}; DAYS.forEach(day=> n[day]={...n[day], on:true}); return n;})},
          {label:'Clear', fn:()=> setSlots(p=>{ const n={...p}; DAYS.forEach(day=> n[day]={...n[day], on:false}); return n;})},
        ].map(b=>(
          <TouchableOpacity key={b.label} onPress={b.fn} style={{paddingHorizontal:10, paddingVertical:6, borderRadius:20, borderWidth:1, borderColor:theme.colors.border, backgroundColor:theme.colors.surface}}>
            <Text style={{fontSize:12, fontWeight:'600', color:theme.colors.textSecondary}}>{b.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {DAYS.map((d) => {
        const s = slots[d];
        const parse = (hhmm:string)=>{ const [h,m]=hhmm.split(':').map(Number); const dt=new Date(); dt.setHours(h||0,m||0,0,0); return dt; };
        const isOpen = timePicker?.day===d;
        return (
        <View key={d} style={styles.dayRow}>
          <View style={styles.row}>
            <Text style={styles.label}>{d.slice(0,3).toUpperCase()}</Text>
            <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
              <Text style={{fontSize:12, color: s.on? theme.colors.success : theme.colors.textMuted, fontWeight:'600'}}>{s.on? 'Available':'Not available'}</Text>
              <Switch value={s.on} onValueChange={(v) => setSlots((p) => ({ ...p, [d]: { ...p[d], on: v } }))} />
            </View>
          </View>
          {s.on ? (
            <>
              <View style={styles.halfRow}>
                <TouchableOpacity style={[styles.timeBox, {flex:1}]} onPress={()=> setTimePicker({day:d, which:'start'})}>
                  <Ionicons name="time-outline" size={14} color={theme.colors.textMuted}/>
                  <Text style={styles.timeText}>{s.start}</Text>
                </TouchableOpacity>
                <Text style={{alignSelf:'center', color:theme.colors.textMuted}}>—</Text>
                <TouchableOpacity style={[styles.timeBox, {flex:1}]} onPress={()=> setTimePicker({day:d, which:'end'})}>
                  <Ionicons name="time-outline" size={14} color={theme.colors.textMuted}/>
                  <Text style={styles.timeText}>{s.end}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.rangeBar}>
                <View style={[styles.rangeFill, {left: `${(parseInt(s.start.split(':')[0])/24)*100}%`, width: `${Math.max(8, ((parseInt(s.end.split(':')[0])-parseInt(s.start.split(':')[0]))/24)*100)}%`}]} />
              </View>
              <View style={{flexDirection:'row', gap:6, marginTop:6, flexWrap:'wrap'}}>
                {[
                  {l:'Morning', v:['08:00','12:00']},
                  {l:'Afternoon', v:['13:00','17:00']},
                  {l:'Evening', v:['18:00','22:00']},
                  {l:'Full day', v:['08:00','17:00']},
                ].map(pr=>(
                  <TouchableOpacity key={pr.l} onPress={()=> setSlots(p=> ({...p, [d]: {...p[d], start:pr.v[0], end:pr.v[1]}}))} style={styles.presetChip}>
                    <Text style={styles.presetText}>{pr.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {isOpen && (
                <DateTimePicker
                  value={parse(timePicker.which==='start'? s.start : s.end)}
                  mode="time" is24Hour display="default"
                  onChange={(_, dt)=>{ setTimePicker(null); if(dt){ const hh=String(dt.getHours()).padStart(2,'0'); const mm=String(dt.getMinutes()).padStart(2,'0'); const val=`${hh}:${mm}`; setSlots(p=> ({...p, [d]: {...p[d], [timePicker.which]: val}})); }}}
                />
              )}
            </>
          ) : null}
        </View>
        );
      })}
      {busy ? <ActivityIndicator color={theme.colors.primary} /> : (
        <TouchableOpacity style={styles.button} onPress={saveAvailability}><Text style={styles.buttonText}>Submit availability</Text></TouchableOpacity>
      )}
      {myAvail.length > 0 && <Text style={styles.muted}>Submitted: {myAvail.length} week(s)</Text>}

      <Text style={styles.section}>Request leave</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {LEAVE_TYPES.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[styles.chip, leaveType === t.value && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
            onPress={() => setLeaveType(t.value)}
          >
            <Ionicons name={t.icon} size={14} color={leaveType === t.value ? '#fff' : theme.colors.textMuted} />
            <Text style={[styles.chipText, leaveType === t.value && { color: '#fff' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.input} onPress={() => setShowLeaveStart(true)}>
        <Text style={{ color: leaveStart ? theme.colors.text : theme.colors.textMuted }}>{leaveStart || 'Start date — tap to pick'}</Text>
      </TouchableOpacity>
      {showLeaveStart && (
        <DateTimePicker
          value={leaveStart ? parseISOLocal(leaveStart) : new Date()}
          mode="date" display="default"
          onChange={(_, d) => { setShowLeaveStart(false); if (d) setLeaveStart(localDateISO(d)); }}
        />
      )}
      <TouchableOpacity style={styles.input} onPress={() => setShowLeaveEnd(true)}>
        <Text style={{ color: leaveEnd ? theme.colors.text : theme.colors.textMuted }}>{leaveEnd || 'End date — tap to pick'}</Text>
      </TouchableOpacity>
      {showLeaveEnd && (
        <DateTimePicker
          value={leaveEnd ? parseISOLocal(leaveEnd) : new Date()}
          mode="date" display="default"
          onChange={(_, d) => { setShowLeaveEnd(false); if (d) setLeaveEnd(localDateISO(d)); }}
        />
      )}
      {leaveStart && leaveEnd && (() => {
        const s = parseISOLocal(leaveStart), e = parseISOLocal(leaveEnd);
        const days = Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
        const overlaps = myLeave.some((l) => l.status !== 'rejected' && !(e < parseISOLocal(l.startDate) || s > parseISOLocal(l.endDate)));
        return (
          <View style={[styles.preview, days > 3 && leaveType === 'Sick' ? { borderColor: theme.colors.warning, backgroundColor: '#fef3c7' } : {}]}>
            <Text style={styles.previewText}>{days} working day{days !== 1 ? 's' : ''} · {leaveType}</Text>
            {(days > 3 && leaveType === 'Sick') ? <Text style={styles.warnText}>Sick over 3 days — proof recommended</Text> : null}
            {overlaps ? <Text style={styles.warnText}>Overlaps an existing request</Text> : null}
          </View>
        );
      })()}
      <TouchableOpacity style={styles.secondary} onPress={pickProof}>
        <Text style={styles.secondaryText}>{proofUri ? 'Proof attached ✓' : 'Attach supporting document (optional)'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={submitLeave}><Text style={styles.buttonText}>Submit leave request</Text></TouchableOpacity>

      <Text style={styles.section}>My leave ({myLeave.length})</Text>
      {myLeave.map((l) => (
        <View key={l.id} style={styles.card}>
          <Text style={styles.cardTitle}>{l.leaveType}: {l.startDate} → {l.endDate}</Text>
          <Text style={styles.muted}>{formatStatus(l.status)}{l.rejectionReason ? ` — ${l.rejectionReason}` : ''}</Text>
        </View>
      ))}
      <View style={{ height: 40 }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  section: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, color: theme.colors.text, marginBottom: 10, backgroundColor: theme.colors.surface },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  dayRow: { borderWidth:1, borderColor:theme.colors.border, borderRadius:12, padding:12, marginBottom:8, backgroundColor:theme.colors.surface },
  halfRow: { flexDirection: 'row', gap: 8, alignItems:'center' },
  half: { flex: 1 },
  label: { color: theme.colors.text, fontWeight:'700', fontSize:13 },
  timeBox:{flexDirection:'row', alignItems:'center', gap:6, borderWidth:1, borderColor:theme.colors.border, borderRadius:8, padding:10, backgroundColor:theme.colors.surfaceVariant},
  timeText:{fontWeight:'600', color:theme.colors.text},
  rangeBar:{height:6, backgroundColor:'#e2e8f0', borderRadius:3, marginTop:8, overflow:'hidden'},
  rangeFill:{position:'absolute', top:0, bottom:0, backgroundColor:theme.colors.primary, borderRadius:3},
  presetChip:{paddingHorizontal:8, paddingVertical:4, borderRadius:12, borderWidth:1, borderColor:theme.colors.border, backgroundColor:'#fff'},
  presetText:{fontSize:11, fontWeight:'600', color:theme.colors.textSecondary},
  button: { backgroundColor: theme.colors.primary, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: theme.colors.primary, padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 8 },
  secondaryText: { color: theme.colors.primary, fontWeight: '600' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTitle: { color: theme.colors.text, fontWeight: '600' },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  preview: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, backgroundColor: '#f8fafc', marginBottom: 8 },
  previewText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  warnText: { fontSize: 12, color: '#92400e', marginTop: 4, fontWeight: '600' },
});
