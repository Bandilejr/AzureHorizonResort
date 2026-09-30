import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, TextInput, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth, db } from '@/services/firebase-services';
import { collection, query, orderBy, limit, onSnapshot, addDoc, getDocs, where } from 'firebase/firestore';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';

// Mirrors the web Leave a Review page (app/src/components/guest/Feedback.tsx):
// same categories, same eligibility rules, and the SAME 'reviews' collection —
// a review written on mobile appears in the web community feed instantly, and vice versa.
const CATEGORIES = [
  { id: 'room', label: 'Room & Stay', icon: 'bed', color: '#3b82f6' },
  { id: 'restaurant', label: 'Dining', icon: 'restaurant', color: '#f97316' },
  { id: 'tour', label: 'Tours & Excursions', icon: 'boat', color: '#f59e0b' },
  { id: 'spa', label: 'Spa Services', icon: 'leaf', color: '#a855f7' },
  { id: 'event', label: 'Event Venue', icon: 'calendar', color: '#ef4444' },
];

const CATEGORY_MAP: Record<string, typeof CATEGORIES[0]> = {};
CATEGORIES.forEach(c => (CATEGORY_MAP[c.id] = c));

const RATING_LABELS: Record<number, string> = {
  1: 'Terrible',
  2: 'Poor',
  3: 'Average',
  4: 'Very Good',
  5: 'Excellent',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const t = new Date(dateStr).getTime();
  if (!t) return '';
  const diffMins = Math.floor((now - t) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'G';
}

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f43f5e', '#f59e0b', '#06b6d4', '#6366f1', '#ec4899'];
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function LeaveReviewScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  const [activeTab, setActiveTab] = useState<'browse' | 'write'>('browse');

  // Write form state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [eligibleCategories, setEligibleCategories] = useState<Set<string>>(new Set());
  const [checkingEligibility, setCheckingEligibility] = useState(true);

  // Community reviews (live)
  const [reviews, setReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  // Live feed from the same 'reviews' collection the web app reads
  useEffect(() => {
    const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingReviews(false);
    }, () => setLoadingReviews(false));
    return unsub;
  }, []);

  // Eligibility: only services the guest has actually booked/used (matches web)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { setCheckingEligibility(false); return; }
    const check = async () => {
      const eligible = new Set<string>();
      try {
        const gid = user.uid;
        const roomSnap = await getDocs(query(collection(db, 'bookings'), where('guestId', '==', gid)));
        if (!roomSnap.empty) eligible.add('room');
        const diningSnap = await getDocs(query(collection(db, 'order_confirmations'), where('guestId', '==', gid)));
        if (!diningSnap.empty) eligible.add('restaurant');
        const tourSnap = await getDocs(query(collection(db, 'tour_bookings'), where('guestId', '==', gid)));
        if (!tourSnap.empty) eligible.add('tour');
        const spaSnap = await getDocs(query(collection(db, 'spa_bookings'), where('guestId', '==', gid)));
        if (!spaSnap.empty) eligible.add('spa');
        const eventSnap = await getDocs(query(collection(db, 'event_bookings'), where('guestId', '==', gid)));
        if (!eventSnap.empty) eligible.add('event');
      } catch (e) {
        console.error('Eligibility check error:', e);
      }
      setEligibleCategories(eligible);
      setCheckingEligibility(false);
    };
    check();
  }, []);

  const handleSubmit = async () => {
    const user = auth.currentUser;
    if (!user) {
      showAlert({
        title: 'Sign In Required',
        message: 'Please sign in to submit a review.',
        type: 'warning',
        confirmText: 'Sign In',
        cancelText: 'Cancel',
        onConfirm: () => router.push('/login'),
      });
      return;
    }
    if (!selectedCategory) {
      showAlert({ title: 'Missing Information', message: 'Please select a category to review.', type: 'warning' });
      return;
    }
    if (rating === 0) {
      showAlert({ title: 'Missing Information', message: 'Please provide a star rating.', type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const reviewData = {
        guestId: user.uid,
        guestName: user.displayName || 'Anonymous Guest',
        category: selectedCategory,
        rating,
        comments,
        createdAt: new Date().toISOString(),
        helpful: 0,
      };
      await addDoc(collection(db, 'reviews'), reviewData);
      showAlert({
        title: 'Thank You!',
        message: 'Your review has been submitted and is now live in the community reviews.',
        type: 'success',
        confirmText: 'Done',
        onConfirm: () => {
          setSelectedCategory(null);
          setRating(0);
          setComments('');
          setActiveTab('browse');
        },
      });
    } catch (e) {
      console.error('Error submitting review:', e);
      showAlert({ title: 'Submission Failed', message: 'There was an error submitting your review. Please try again.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length).toFixed(1)
    : '0.0';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Reviews & Ratings</Text>
      </View>

      {/* Stats strip */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{avgRating}</Text>
          <Text style={styles.statLabel}>Avg Rating</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{reviews.length}</Text>
          <Text style={styles.statLabel}>Reviews</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {reviews.length > 0 ? Math.round((reviews.filter(r => Number(r.rating) >= 4).length / reviews.length) * 100) : 0}%
          </Text>
          <Text style={styles.statLabel}>Satisfied</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'browse' && styles.tabActive]}
          onPress={() => setActiveTab('browse')}
        >
          <Ionicons name="chatbubbles-outline" size={16} color={activeTab === 'browse' ? theme.colors.primary : theme.colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'browse' && { color: theme.colors.primary }]}>Community ({reviews.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'write' && styles.tabActive]}
          onPress={() => setActiveTab('write')}
        >
          <Ionicons name="star-outline" size={16} color={activeTab === 'write' ? theme.colors.primary : theme.colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'write' && { color: theme.colors.primary }]}>Write a Review</Text>
        </TouchableOpacity>
      </View>

      {/* ═══════ BROWSE ═══════ */}
      {activeTab === 'browse' && (
        <View>
          {loadingReviews ? (
            <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
          ) : reviews.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="chatbubbles-outline" size={44} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>No reviews yet — be the first to share your experience!</Text>
            </View>
          ) : (
            reviews.map((review) => {
              const cat = CATEGORY_MAP[review.category];
              return (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={[styles.avatar, { backgroundColor: getAvatarColor(review.guestName) }]}>
                      <Text style={styles.avatarText}>{getInitials(review.guestName)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewerName}>{review.guestName}</Text>
                      <Text style={styles.reviewTime}>{timeAgo(review.createdAt)}</Text>
                    </View>
                    {cat && (
                      <View style={[styles.categoryPill, { backgroundColor: cat.color + '22' }]}>
                        <Ionicons name={cat.icon as any} size={12} color={cat.color} />
                        <Text style={[styles.categoryPillText, { color: cat.color }]}>{cat.label}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons
                        key={s}
                        name={s <= Number(review.rating) ? 'star' : 'star-outline'}
                        size={16}
                        color={s <= Number(review.rating) ? '#f59e0b' : theme.colors.borderStrong}
                      />
                    ))}
                    <Text style={styles.ratingLabelText}>{RATING_LABELS[Number(review.rating)] || ''}</Text>
                  </View>

                  {review.comments ? (
                    <Text style={styles.commentText}>{`"${review.comments}"`}</Text>
                  ) : null}

                  {review.managementResponse ? (
                    <View style={styles.managementBox}>
                      <Text style={styles.managementTitle}>Management Response</Text>
                      <Text style={styles.managementText}>{`"${review.managementResponse}"`}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      )}

      {/* ═══════ WRITE ═══════ */}
      {activeTab === 'write' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>What would you like to review?</Text>
          <Text style={styles.cardSubtitle}>{`Select the service you used — you can only review what you've actually booked or visited.`}</Text>

          {checkingEligibility ? (
            <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 24 }} />
          ) : eligibleCategories.size === 0 ? (
            <View style={styles.noServicesBox}>
              <Ionicons name="lock-closed" size={32} color="#d97706" />
              <Text style={styles.noServicesTitle}>No Services Used Yet</Text>
              <Text style={styles.noServicesText}>{`You can only review services you've actually booked — a room stay, dining order, tour, spa treatment, or event venue.`}</Text>
            </View>
          ) : (
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                const isEligible = eligibleCategories.has(cat.id);
                return (
                  <TouchableOpacity
                    key={cat.id}
                    disabled={!isEligible}
                    onPress={() => setSelectedCategory(cat.id)}
                    style={[
                      styles.categoryCard,
                      isEligible && isSelected && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '14' },
                      !isEligible && styles.categoryCardLocked,
                    ]}
                  >
                    <Ionicons name={cat.icon as any} size={26} color={isEligible ? cat.color : theme.colors.textMuted} />
                    <Text style={[styles.categoryLabel, !isEligible && { color: theme.colors.textMuted }]}>{cat.label}</Text>
                    {isEligible ? (
                      <Text style={styles.categoryEligible}>Available</Text>
                    ) : (
                      <View style={{ alignItems: 'center' }}>
                        <Ionicons name="lock-closed" size={12} color={theme.colors.textMuted} />
                        <Text style={styles.categoryLockedText}>No booking found</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Text style={styles.sectionLabel}>How would you rate your experience?</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => setRating(star)}>
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={40}
                  color={star <= rating ? '#f59e0b' : theme.colors.borderStrong}
                />
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && <Text style={styles.ratingLabelText}>{RATING_LABELS[rating]}</Text>}

          <Text style={styles.sectionLabel}>Additional Comments (Optional)</Text>
          <TextInput
            style={styles.commentsInput}
            placeholder="Tell us what you loved or what we could improve..."
            value={comments}
            onChangeText={setComments}
            multiline
            numberOfLines={4}
          />

          <TouchableOpacity
            style={[styles.submitBtn, (submitting || !selectedCategory || rating === 0) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || !selectedCategory || rating === 0}
          >
            {submitting ? <ActivityIndicator color={theme.colors.textInverse} /> : <Text style={styles.submitBtnText}>Submit Review</Text>}
          </TouchableOpacity>
        </View>
      )}

      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backButton: { padding: 8, marginLeft: -8 },
  title: { flex: 1, fontSize: 24, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text },
  statLabel: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },

  tabs: { flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: 12, padding: 4, marginBottom: 16 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 9 },
  tabActive: { backgroundColor: theme.colors.primary + '14' },
  tabText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },

  reviewCard: { backgroundColor: theme.colors.surface, borderRadius: 14, padding: 16, marginBottom: 12 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  reviewerName: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  reviewTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  categoryPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  categoryPillText: { fontSize: 11, fontWeight: '600' },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  ratingLabelText: { fontSize: 12, color: theme.colors.warning, marginLeft: 6, fontWeight: '500' },
  commentText: { fontSize: 14, color: theme.colors.text, lineHeight: 20, fontStyle: 'italic', marginTop: 2 },
  managementBox: { backgroundColor: theme.colors.surfaceVariant, borderRadius: 10, padding: 12, marginTop: 10, borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
  managementTitle: { fontSize: 11, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 3 },
  managementText: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic' },
  emptyCard: { backgroundColor: theme.colors.surface, borderRadius: 14, padding: 36, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },

  card: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20 },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginBottom: 6 },
  cardSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 20 },
  noServicesBox: { alignItems: 'center', paddingVertical: 28, gap: 8, backgroundColor: theme.colors.surfaceVariant, borderRadius: 12, marginBottom: 16 },
  noServicesTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text },
  noServicesText: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', paddingHorizontal: 20 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  categoryCard: { width: '48%', borderWidth: 2, borderColor: 'transparent', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center', gap: 6, backgroundColor: theme.colors.surfaceVariant },
  categoryCardLocked: { opacity: 0.5 },
  categoryLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.text, textAlign: 'center' },
  categoryEligible: { fontSize: 10, color: theme.colors.success, fontWeight: '600' },
  categoryLockedText: { fontSize: 9, color: theme.colors.textMuted, marginTop: 1 },
  sectionLabel: { fontSize: 16, fontWeight: '600', color: theme.colors.text, marginTop: 18, marginBottom: 10 },
  commentsInput: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 16, fontSize: 14, textAlignVertical: 'top', minHeight: 100, backgroundColor: theme.colors.surfaceVariant, color: theme.colors.text },
  submitBtn: { backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { backgroundColor: theme.colors.borderStrong },
  submitBtnText: { color: theme.colors.textInverse, fontWeight: 'bold', fontSize: 16 },
});
