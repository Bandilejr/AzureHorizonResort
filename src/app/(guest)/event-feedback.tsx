import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, TextInput, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth, db , submitEventFeedback } from '@/services/firebase-services';

import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { todayISO } from '@/utils/dates';

interface RatingCategory {
  key: 'venue' | 'catering' | 'staff' | 'setup';
  label: string;
  icon: string;
}

const CATEGORIES: RatingCategory[] = [
  { key: 'venue', label: 'Venue Quality', icon: 'home' },
  { key: 'catering', label: 'Catering', icon: 'restaurant' },
  { key: 'staff', label: 'Staff Service', icon: 'people' },
  { key: 'setup', label: 'Setup & Decor', icon: 'construct' },
];

export default function EventFeedbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const eventId = params.eventId as string;
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  const setRating = (category: string, stars: number) => {
    setRatings(prev => ({ ...prev, [category]: stars }));
  };

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const handleSubmit = async () => {
    const user = auth.currentUser;
    if (!user) {
      showAlert({
        title: "🔒 Sign In Required",
        message: "Please sign in to submit event feedback.",
        type: "warning",
        confirmText: "Sign In",
        cancelText: "Cancel",
        onConfirm: () => router.push('/login'),
      });
      return;
    }

    if (Object.keys(ratings).length !== CATEGORIES.length) {
      showAlert({ title: 'Incomplete', message: 'Please rate all categories', type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const eventDoc = await getDoc(doc(db, 'event_bookings', eventId));
      if (eventDoc.exists()) {
        const eventData = eventDoc.data() as any;
        const eventDateVal = eventData.eventDateStr || eventData.eventDate;
        const eventDay = String(eventDateVal || '').slice(0, 10);
        const todayStr = todayISO();
        if (/^\d{4}-\d{2}-\d{2}$/.test(eventDay) && eventDay > todayStr) {
          showAlert({
            title: 'Event Not Yet Completed',
            message: 'Feedback can only be submitted on or after the event date.',
            type: 'warning',
          });
          setSubmitting(false);
          return;
        }
      }

      let isHost = false;
      if (eventDoc.exists() && eventDoc.data().guestId === user.uid) {
        isHost = true;
      }

      const checkinQuery = query(
        collection(db, 'event_invitations'),
        where('eventId', '==', eventId),
        where('inviteeEmail', '==', user.email?.toLowerCase()),
        where('status', '==', 'checked_in')
      );
      const checkinSnap = await getDocs(checkinQuery);

      if (!isHost && checkinSnap.empty) {
        showAlert({
          title: '🔒 Feedback Locked (UC27 Required)',
          message: 'Only confirmed attendees who checked into this event (UC27) or the verified event host can submit feedback.',
          type: 'warning',
        });
        setSubmitting(false);
        return;
      }

      let guestName = user.displayName || 'Anonymous Guest';
      try {
        const userSnap = await getDoc(doc(db, 'users', (user.email || '').toLowerCase()));
        guestName = userSnap.data()?.name || guestName;
      } catch { /* keep fallback */ }

      await submitEventFeedback({
        eventId,
        guestId: user.uid,
        guestName,
        ratings: ratings as any,
        comments,
      });
      showAlert({
        title: 'Thank You!',
        message: 'Your feedback has been submitted.',
        type: 'success',
        onConfirm: () => router.back(),
      });
    } catch (error) {
      showAlert({ title: 'Error', message: 'Failed to submit feedback', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Event Feedback</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>How was your experience?</Text>
        <Text style={styles.cardSubtitle}>Rate each category and share your thoughts</Text>

        {CATEGORIES.map((cat) => (
          <View key={cat.key} style={styles.ratingRow}>
            <View style={styles.ratingLabel}>
              <Ionicons name={cat.icon as any} size={20} color={theme.colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.ratingLabelText}>{cat.label}</Text>
            </View>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(cat.key, star)}>
                  <Ionicons
                    name={ratings[cat.key] >= star ? 'star' : 'star-outline'}
                    size={32}
                    color={ratings[cat.key] >= star ? theme.colors.primary : theme.colors.borderStrong}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.commentsSection}>
          <Text style={styles.commentsLabel}>Additional Comments</Text>
          <TextInput
            style={styles.commentsInput}
            placeholder="Share your experience..."
            value={comments}
            onChangeText={setComments}
            multiline
            numberOfLines={4}
          />
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={theme.colors.textInverse} /> : <Text style={styles.submitBtnText}>Submit Feedback</Text>}
        </TouchableOpacity>
      </View>

      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backButton: { padding: 8, marginLeft: -8 },
  title: { flex: 1, fontSize: 28, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginBottom: 8 },
  cardSubtitle: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 24 },
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  ratingLabel: { flexDirection: 'row', alignItems: 'center' },
  ratingLabelText: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  stars: { flexDirection: 'row', gap: 8 },
  commentsSection: { marginTop: 16 },
  commentsLabel: { fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 8 },
  commentsInput: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 16, fontSize: 16, textAlignVertical: 'top', backgroundColor: theme.colors.surfaceVariant, color: theme.colors.text },
  submitBtn: { backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { backgroundColor: theme.colors.borderStrong },
  submitBtnText: { color: theme.colors.textInverse, fontWeight: 'bold', fontSize: 16 },
});