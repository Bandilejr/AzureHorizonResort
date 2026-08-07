import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { db } from '@/services/firebase-services';
import { submitEventFeedback } from '@/services/firebase-services';

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

  const setRating = (category: string, stars: number) => {
    setRatings(prev => ({ ...prev, [category]: stars }));
  };

  const handleSubmit = async () => {
    if (Object.keys(ratings).length !== CATEGORIES.length) {
      Alert.alert('Incomplete', 'Please rate all categories');
      return;
    }

    setSubmitting(true);
    try {
      await submitEventFeedback({
        eventId,
        guestId: 'current', // Will be replaced by actual user ID in service
        ratings: ratings as any,
        comments,
      });
      Alert.alert('Thank You!', 'Your feedback has been submitted.');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#1e3a5f" />
        </TouchableOpacity>
        <Text style={styles.title}>Event Feedback</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>How was your experience?</Text>
        <Text style={styles.cardSubtitle}>Rate each category and share your thoughts</Text>

        {CATEGORIES.map((cat) => (
          <View key={cat.key} style={styles.ratingRow}>
            <View style={styles.ratingLabel}>
              <Ionicons name={cat.icon} size={20} color="#c9a227" style={{ marginRight: 8 }} />
              <Text style={styles.ratingLabelText}>{cat.label}</Text>
            </View>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(cat.key, star)}>
                  <Ionicons
                    name={ratings[cat.key] >= star ? 'star' : 'star-outline'}
                    size={32}
                    color={ratings[cat.key] >= star ? '#c9a227' : '#cbd5e1'}
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
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Feedback</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backButton: { padding: 8, marginLeft: -8 },
  title: { flex: 1, fontSize: 28, fontWeight: 'bold', color: '#1e3a5f', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e3a5f', marginBottom: 8 },
  cardSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 24 },
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  ratingLabel: { flexDirection: 'row', alignItems: 'center' },
  ratingLabelText: { fontSize: 16, fontWeight: '600', color: '#1e3a5f' },
  stars: { flexDirection: 'row', gap: 8 },
  commentsSection: { marginTop: 16 },
  commentsLabel: { fontSize: 16, fontWeight: '600', color: '#1e3a5f', marginBottom: 8 },
  commentsInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 16, fontSize: 16, textAlignVertical: 'top', backgroundColor: '#f8fafc' },
  submitBtn: { backgroundColor: '#c9a227', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { backgroundColor: '#cbd5e1' },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});