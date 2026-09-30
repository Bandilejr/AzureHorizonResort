// (staff) Event operations — live event cockpit: attendee check-in progress,
// operational entry points, assigned tasks and wrap-up. Batch F: rebuilt on the
// design system; every Firestore query/listener/write is unchanged.
import React, { useEffect, useState } from 'react';
import { View, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth, db, listenForAttendeeCheckIns, listenForEventInspections } from '@/services/firebase-services';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { ProgressBar } from '@/components/ui/progress';
import { AppText } from '@/components/ui/text';

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
  const theme = useAppTheme();
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
      () => {},
    );
    return () => { unsubBooking(); unsubCheckins(); unsubInsp(); unsubTasks(); };
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
  const checkedPct = expected > 0 ? Math.min(100, Math.round((checkinCount / expected) * 100)) : 0;

  const openRoute = (route: string) => {
    router.push({ pathname: route, params: { eventId } } as any);
  };

  const operations: { key: string; title: string; desc: string; icon: React.ComponentProps<typeof Ionicons>['name']; route: string; badge?: string }[] = [
    { key: 'checkin', title: 'Staff check-in', desc: 'Verify team members on site', icon: 'id-card', route: '/staff-checkin' },
    { key: 'attendees', title: 'Attendee check-in', desc: `${checkinCount} of ${expected} guests in venue`, icon: 'qr-code', route: '/attendee-checkin', badge: `${checkinCount}/${expected}` },
    { key: 'pre', title: 'Pre-event inspection', desc: preDone ? 'Approved' : 'Not completed yet', icon: 'clipboard', route: '/pre-event-inspection' },
    { key: 'post', title: 'Post-event inspection', desc: postDone ? 'Completed' : 'Due after event', icon: 'construct', route: '/post-event-inspection' },
  ];

  return (
    <Screen scroll>
      <PageHeader
        title={venueName}
        subtitle={`Operated by ${guestName}`}
        showBack
        fallback="/(staff)/today-events"
        right={<StatusPill status={String(booking?.status || 'scheduled')} />}
      />

      <Card style={{ gap: theme.space.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="caption" tone="muted">{checkinCount} / {expected} guests checked in</AppText>
          {expected > 0 ? <AppText variant="caption" weight="700">{checkedPct}%</AppText> : null}
        </View>
        <ProgressBar value={checkedPct / 100} tone="success" />
      </Card>

      <SectionHeader title="Event operations" />
      <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
        {operations.map((op, i) => (
          <View key={op.key} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
            <ListRow
              title={op.title}
              subtitle={op.desc}
              leading={
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={op.icon} size={theme.iconSize.md} color={theme.colors.primary} />
                </View>
              }
              status={op.badge ? <StatusPill status="info" size="sm" label={op.badge} /> : undefined}
              onPress={() => openRoute(op.route)}
            />
          </View>
        ))}
      </Card>

      <SectionHeader title="My assigned tasks" actionLabel={(tasks.length === 0 && !busy && (isAdmin || isEventManager)) ? 'Add sample tasks' : undefined} onAction={seedTasks} />
      {tasks.length === 0 ? (
        <AppText variant="body" tone="muted">No tasks yet.</AppText>
      ) : (
        <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
          {tasks.map((task, i) => (
            <View key={task.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.md }, i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : null]}>
              <TouchableOpacity onPress={() => toggleTask(task)} accessibilityRole="button" accessibilityLabel={task.done ? 'Mark task not done' : 'Mark task done'}>
                <Ionicons name={task.done ? 'checkmark-circle' : 'ellipse-outline'} size={theme.iconSize.lg} color={task.done ? theme.colors.success : theme.colors.textMuted} />
              </TouchableOpacity>
              <AppText variant="body" style={[{ flex: 1 }, task.done ? { textDecorationLine: 'line-through', color: theme.colors.textMuted } : null]}>{task.title}</AppText>
              <TouchableOpacity onPress={() => removeTask(task)} accessibilityRole="button" accessibilityLabel="Delete task">
                <Ionicons name="trash-outline" size={theme.iconSize.sm} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </Card>
      )}

      <Button label="Wrap up event" icon="flag-outline" onPress={wrapUp} style={{ marginTop: theme.space['2xl'] }} />
    </Screen>
  );
}
