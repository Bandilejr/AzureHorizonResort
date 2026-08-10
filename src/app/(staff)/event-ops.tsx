import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth, db , listenForAttendeeCheckIns, listenForEventInspections } from '@/services/firebase-services';
import { getTheme } from '@/constants/theme';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';

interface Task {
  id: string;
  eventId: string;
  title: string;
  assigneeUid?: string;
  assigneeName?: string;
  assignedTo?: string;
  done?: boolean;
}

export default function EventOpsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const { isAdmin, isEventManager } = useAuth();
  const eventId = (params.eventId as string) || '';
  const guestName = (params.guestName as string) || 'Host';
  const venueName = (params.venueName as string) || 'Venue';
  const expected = Number(params.expected ?? 0);

  const [booking, setBooking] = useState<any>(null);
  const [checkinCount, setCheckinCount] = useState(0);
  const [inspections, setInspections] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    const unsubBooking = onSnapshot(doc(db, 'event_bookings', eventId), (d) => {
      if (d.exists()) setBooking({ id: d.id, ...(d.data() as object) });
    });
    const unsubCheckins = listenForAttendeeCheckIns(eventId, (list) => setCheckinCount(list.length));
    const unsubInsp = listenForEventInspections(eventId, (list) => setInspections(list));
    const unsubTasks = onSnapshot(
      query(collection(db, 'event_tasks'), where('eventId', '==', eventId)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) }));
        list.sort((a, b) => Number(a.done) - Number(b.done));
        setTasks(list);
      },
      (err) => console.warn('event_ops tasks error:', err)
    );
    return () => {
      unsubBooking();
      unsubCheckins();
      unsubInsp();
      unsubTasks();
    };
  }, [eventId]);

  const seedTasks = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setBusy(true);
    try {
      const samples = [
        'Pre-event: verify ballroom setup',
        'Confirm AV system and stage layout',
        'Coordinate guest parking and arrivals',
      ];
      for (const title of samples) {
        await addDoc(collection(db, 'event_tasks'), {
          eventId,
          title,
          assigneeUid: user.uid,
          assigneeName: (user as any).displayName || 'Me',
          assignedTo: user.uid,
          done: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create tasks');
    } finally {
      setBusy(false);
    }
  };

  const toggleTask = async (task: Task) => {
    try {
      await updateDoc(doc(db, 'event_tasks', task.id), { done: !task.done });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not update task');
    }
  };

  const removeTask = async (task: Task) => {
    try {
      await deleteDoc(doc(db, 'event_tasks', task.id));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not delete task');
    }
  };

  const wrapUp = async () => {
    Alert.alert('Wrap Up Event', `Mark "${venueName}" as completed?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Wrap Up',
        onPress: async () => {
          try {
            await updateDoc(doc(db, 'event_bookings', eventId), { status: 'completed' });
            Alert.alert('Done', 'Event marked as completed.');
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Could not update event');
          }
        },
      },
    ]);
  };

  const preDone = inspections.some((i) => i.type === 'pre_event' && i.overallStatus === 'approved');
  const postDone = inspections.some((i) => i.type === 'post_event' && i.completedAt);
  const checkedPct = expected > 0 ? Math.round((checkinCount / expected) * 100) : 0;

  const openRoute = (route: string) => {
    router.push({ pathname: route, params: { eventId } } as any);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.secondary} />
        </TouchableOpacity>
        <Text style={styles.title}>{venueName}</Text>
        <Text style={styles.subtitle}>Operated by {guestName}</Text>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>{checkinCount} / {expected} guests checked in</Text>
          {expected > 0 && <Text style={styles.progressPct}>{checkedPct}%</Text>}
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${checkedPct}%` }]} />
        </View>
      </View>

      <View style={styles.liveCard}>
        <Ionicons name="pulse" size={16} color={theme.colors.success} />
        <Text style={styles.liveText}> LIVE - status: {booking?.status || 'scheduled'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Event Operations</Text>
        {[
          {
            key: 'checkin',
            title: 'Staff Check-in',
            desc: 'Verify team members on site',
            icon: 'id-card',
            route: '/staff-checkin',
          },
          {
            key: 'attendees',
            title: 'Attendee Check-in',
            desc: `${checkinCount} of ${expected} guests in venue`,
            icon: 'qr-code',
            route: '/attendee-checkin',
            badge: `${checkinCount}/${expected}`,
          },
          {
            key: 'pre',
            title: 'Pre-event Inspection',
            desc: preDone ? 'Approved' : 'Not completed yet',
            icon: 'clipboard',
            route: '/pre-event-inspection',
          },
          {
            key: 'post',
            title: 'Post-event Inspection',
            desc: postDone ? 'Completed' : 'Due after event',
            icon: 'construct',
            route: '/post-event-inspection',
          },
        ].map((op) => (
          <TouchableOpacity key={op.key} style={styles.opRow} onPress={() => openRoute(op.route)}>
            <View style={styles.opIcon}>
              <Ionicons name={op.icon as any} size={20} color={theme.colors.primary} />
            </View>
            <View style={styles.opInfo}>
              <Text style={styles.opTitle}>{op.title}</Text>
              <Text style={styles.opDesc}>{op.desc}</Text>
            </View>
            {op.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{op.badge}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.taskHeader}>
          <Text style={styles.sectionTitle}>My Assigned Tasks</Text>
          {tasks.length === 0 && !busy && (isAdmin || isEventManager) && (
            <TouchableOpacity onPress={seedTasks}>
              <Text style={styles.seedText}>Add sample tasks</Text>
            </TouchableOpacity>
          )}
        </View>
        {busy ? (
          <ActivityIndicator color={theme.colors.secondary} style={{ marginVertical: 16 }} />
        ) : tasks.length === 0 ? (
          <Text style={styles.emptyText}>No tasks yet - tap &quot;Add sample tasks&quot; to demo the flow.</Text>
        ) : (
          tasks.map((task) => (
            <View key={task.id} style={styles.taskRow}>
              <TouchableOpacity onPress={() => toggleTask(task)}>
                <Ionicons
                  name={task.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={task.done ? theme.colors.success : theme.colors.textMuted}
                />
              </TouchableOpacity>
              <Text style={[styles.taskTitle, task.done && styles.taskDone]}>{task.title}</Text>
              <TouchableOpacity onPress={() => removeTask(task)}>
                <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <TouchableOpacity style={styles.wrapBtn} onPress={wrapUp}>
        <Ionicons name="flag" size={18} color={theme.colors.textInverse} style={{ marginRight: 8 }} />
        <Text style={styles.wrapText}>Wrap Up Event</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  header: { marginBottom: 12 },
  backBtn: { marginBottom: 12, alignSelf: 'flex-start' },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.text },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2, marginBottom: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '500' },
  progressPct: { fontSize: 12, color: theme.colors.text, fontWeight: 'bold' },
  progressTrack: { height: 6, backgroundColor: theme.colors.surfaceVariant, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: theme.colors.success, borderRadius: 3 },
  liveCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(22,163,74,0.1)', padding: 10, borderRadius: 10, marginTop: 14 },
  liveText: { color: theme.colors.success, fontSize: 12, fontWeight: '600' },
  section: { marginTop: 22 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: 10 },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  opRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  opIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(201,162,39,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  opInfo: { flex: 1 },
  opTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  opDesc: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  badge: { backgroundColor: theme.colors.secondaryLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  badgeText: { fontSize: 11, color: theme.colors.text, fontWeight: '600' },
  seedText: { color: theme.colors.primary, fontSize: 13, fontWeight: '600' },
  emptyText: { color: theme.colors.textMuted, fontSize: 13, marginBottom: 8 },
  taskRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 12, padding: 12, marginBottom: 8, gap: 10 },
  taskTitle: { flex: 1, fontSize: 14, color: theme.colors.text },
  taskDone: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
  wrapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.secondary, borderRadius: 12, paddingVertical: 14, marginTop: 26 },
  wrapText: { color: theme.colors.textInverse, fontWeight: 'bold', fontSize: 15 },
});