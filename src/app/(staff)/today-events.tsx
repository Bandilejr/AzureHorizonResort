// (staff) Today's events — live list of event bookings for today with attendee
// check-in progress. Batch F: rebuilt on the design system; the onSnapshot
// listener and getAttendeeCheckIns calls are unchanged.
import React, { useEffect, useState, useCallback } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { db, getAttendeeCheckIns } from '@/services/firebase-services';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { EmptyState, ListSkeleton, ErrorState } from '@/components/ui/states';
import { ProgressBar } from '@/components/ui/progress';
import { AppText } from '@/components/ui/text';

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
  const theme = useAppTheme();
  const [events, setEvents] = useState<EventBooking[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

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
      }),
    );
    setCounts(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'event_bookings'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<EventBooking, 'id'>) }))
          .filter((e) => String(e.eventDateStr || e.eventDate || '').slice(0, 10) === today);
        setEvents(list);
        setLoading(false);
        if (list.length > 0) loadCounts(list);
      },
      () => { setLoadError('Live event data is unavailable.'); setLoading(false); },
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
    <Screen scroll>
      <PageHeader title="Today's events" subtitle={new Date().toDateString()} showBack fallback="/(staff)/staff-dashboard" />

      {loadError && events.length === 0 ? (
        <ErrorState title="Couldn't load events" message="Live event data is unavailable right now." details={loadError} />
      ) : loading ? (
        <ListSkeleton rows={3} />
      ) : events.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No events today" message="Events booked for today will appear here with live attendance." />
      ) : (
        <View style={{ gap: theme.space.md }}>
          {events.map((event) => {
            const c = counts[event.id] ?? 0;
            const expected = event.expectedAttendance ?? 0;
            const progress = expected > 0 ? Math.min(100, Math.round((c / expected) * 100)) : 0;
            return (
              <Card key={event.id} onPress={() => openEvent(event)} style={{ gap: theme.space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="gift" size={20} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>{event.venueName || 'Event'}</AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={1}>
                      Hosted by {event.guestName || 'Organizer'} • {event.status || 'confirmed'}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={theme.iconSize.md} color={theme.colors.textMuted} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="caption" tone="muted">{c} / {expected} guests checked in</AppText>
                  <AppText variant="caption" weight="700">{progress}%</AppText>
                </View>
                <ProgressBar value={progress / 100} />
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
