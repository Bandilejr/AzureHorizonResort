import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getTheme } from '@/constants/theme';
import { db , getAttendeeCheckIns } from '@/services/firebase-services';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

interface EventBooking {
  id: string;
  guestName?: string;
  venueName?: string;
  eventDate?: string;
  eventDateStr?: string;
  expectedAttendance?: number;
  status?: string;
}

export default function TodayEventsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const [events, setEvents] = useState<EventBooking[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  const loadCounts = useCallback(async (list: EventBooking[]) => {
    const entries = await Promise.all(
      list.map(async (e) => {
        try {
          const checkins = await getAttendeeCheckIns(e.id);
          return [e.id, checkins.length] as const;
        } catch {
          return [e.id, 0] as const;
        }
      })
    );
    setCounts(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'event_bookings'), where('eventDateStr', '==', today));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventBooking, 'id'>) }));
        setEvents(list);
        setLoading(false);
        if (list.length > 0) loadCounts(list);
      },
      (err) => {
        console.warn('today-events error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [today, loadCounts]);

  const openEvent = (event: EventBooking) => {
    router.push({
      pathname: '/(staff)/event-ops',
      params: {
        eventId: event.id,
        guestName: event.guestName || 'Event Organizer',
        venueName: event.venueName || 'Venue',
        expected: event.expectedAttendance ?? 0,
      },
    } as any);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Today&apos;s Events</Text>
        <Text style={styles.subtitle}>{new Date().toDateString()}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.secondary} style={{ marginTop: 60 }} />
      ) : events.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={44} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>No events today</Text>
          <Text style={styles.emptyText}>
            Events booked for today will appear here with live attendance, inspections and tasks.
          </Text>
        </View>
      ) : (
        events.map((event) => {
          const c = counts[event.id] ?? 0;
          const expected = event.expectedAttendance ?? 0;
          const progress = expected > 0 ? Math.min(100, Math.round((c / expected) * 100)) : 0;
          return (
            <TouchableOpacity key={event.id} style={styles.eventCard} onPress={() => openEvent(event)}>
              <View style={styles.eventRow}>
                <View style={styles.venue}>
                  <Ionicons name="gift" size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventVenue}>{event.venueName || 'Event'}</Text>
                  <Text style={styles.eventGuest}>
                    Hosted by {event.guestName || 'Organizer'} • {event.status || 'confirmed'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
              </View>

              <View style={styles.progressRow}>
                <Text style={styles.progressText}>
                  {c} / {expected} guests checked in
                </Text>
                <Text style={styles.progressPct}>{progress}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>

              <View style={styles.chips}>
                <View style={styles.chip}>
                  <Ionicons name="people" size={13} color={theme.colors.success} />
                  <Text style={styles.chipText}>{c} checked in</Text>
                </View>
                <View style={styles.chip}>
                  <Ionicons name="clipboard" size={13} color={theme.colors.secondary} />
                  <Text style={styles.chipText}>Operations</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.colors.text },
  subtitle: { fontSize: 14, color: theme.colors.textMuted, marginTop: 4 },
  emptyCard: { alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 16, padding: 32, marginTop: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text, marginTop: 12 },
  emptyText: { color: theme.colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  eventCard: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  eventRow: { flexDirection: 'row', alignItems: 'center' },
  venue: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(201,162,39,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  eventInfo: { flex: 1 },
  eventVenue: { fontSize: 17, fontWeight: 'bold', color: theme.colors.text },
  eventGuest: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 },
  progressText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '500' },
  progressPct: { fontSize: 12, color: theme.colors.text, fontWeight: 'bold' },
  progressTrack: { height: 6, backgroundColor: theme.colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: theme.colors.success, borderRadius: 3 },
  chips: { flexDirection: 'row', marginTop: 12, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  chipText: { fontSize: 12, color: theme.colors.text, marginLeft: 4 },
});