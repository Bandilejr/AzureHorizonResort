import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Modal,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { auth, getUserProfileForAuthUser, listenForLoyaltyLog, redeemLoyaltyReward, generateLoyaltyQR, LoyaltyLogEntry } from '../../services/firebase-services';
import QRCode from 'react-native-qrcode-svg';

const TIERS = [
  { name: 'Bronze', min: 0, color: '#b45309' },
  { name: 'Silver', min: 500, color: '#6b7280' },
  { name: 'Gold', min: 1500, color: '#d97706' },
  { name: 'Platinum', min: 5000, color: '#0f172a' },
];

const REWARDS = [
  { id: 1, title: 'Complimentary Dessert', pts: 100 },
  { id: 2, title: 'Room Upgrade Request', pts: 300 },
  { id: 3, title: 'Free Spa Treatment', pts: 500 },
];

const formatTier = (tierName: string) => tierName.charAt(0).toUpperCase() + tierName.slice(1);

export default function LoyaltyScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [logEntries, setLogEntries] = useState<LoyaltyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [voucher, setVoucher] = useState<{ title: string; pts: number; code: string } | null>(null);
  const [qrPayload, setQrPayload] = useState<any>(null);
  const [qrRotation, setQrRotation] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const user = auth.currentUser;
        if (!user) throw new Error('No logged-in user found.');
        
        const profileData = await getUserProfileForAuthUser(user);
        setProfile(profileData);
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Unable to load profile.');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    const unsubscribe = listenForLoyaltyLog(profile.id, setLogEntries);
    return () => unsubscribe();
  }, [profile?.id]);

  // Load initial QR and start rotation
  useEffect(() => {
    if (!profile?.id) return;
    
    const fetchQR = async () => {
      try {
        const response = await generateLoyaltyQR({});
        setQrPayload(response.data.qrPayload);
      } catch (error) {
        console.error('Failed to generate loyalty QR:', error);
      }
    };
    
    fetchQR();
    
    // Rotate QR every 30 seconds
    intervalRef.current = setInterval(() => {
      fetchQR();
      setQrRotation(prev => prev + 1);
    }, 30000);
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [profile?.id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#c9a227" />
      </View>
    );
  }

  const points = profile?.loyaltyPoints || 0;
  const tierName = profile?.loyaltyTier?.toLowerCase() || 'bronze';
  const currentTier = TIERS.find((tier) => tier.name.toLowerCase() === tierName) || TIERS[0];
  const currentTierIndex = TIERS.indexOf(currentTier);
  const nextTier = TIERS[currentTierIndex + 1];
  
  const progressToNext = nextTier
    ? Math.min(100, Math.round(((points - currentTier.min) / (nextTier.min - currentTier.min)) * 100))
    : 100;

  const handleRedeemPress = (reward: { id: number; title: string; pts: number }) => {
    if (points < reward.pts) {
      Alert.alert('Not enough points', 'Earn more points before redeeming this reward.');
      return;
    }
    
    Alert.alert(
      'Confirm redemption',
      `Redeem ${reward.pts} points for ${reward.title}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            setRedeeming(true);
            try {
              const guestId = auth.currentUser?.uid || profile.id;
              const newPoints = await redeemLoyaltyReward(profile.id, guestId, reward);
              setProfile({ ...profile, loyaltyPoints: newPoints });
              setVoucher({
                title: reward.title,
                pts: reward.pts,
                code: `AZURE-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
              });
            } catch (error: any) {
              Alert.alert('Redemption failed', error.message || 'Please try again.');
            } finally {
              setRedeeming(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>
      
      <Text style={styles.pageTitle}>Loyalty & Rewards</Text>
      <Text style={styles.pageSubtitle}>Earn points with every booking and unlock exclusive perks.</Text>
      
      <View style={[styles.card, { backgroundColor: currentTier.color }]}>
        <Text style={styles.cardLabel}>Azure Horizon Rewards</Text>
        <Text style={styles.cardPoints}>{points.toLocaleString()}</Text>
        <Text style={styles.cardSubTitle}>Loyalty Points</Text>
        
        <View style={styles.tierRow}>
          <View>
            <Text style={styles.tierLabel}>Tier</Text>
            <Text style={styles.tierValue}>{formatTier(currentTier.name)}</Text>
          </View>
          {nextTier ? (
            <View style={styles.tierProgress}>
              <Text style={styles.tierText}>
                {nextTier.min - points} pts to {nextTier.name}
              </Text>
              <View style={styles.progressBackground}>
                <View style={[styles.progressFill, { width: `${progressToNext}%` }]} />
              </View>
            </View>
          ) : (
            <Text style={styles.tierText}>You are at the highest tier.</Text>
          )}
        </View>
      </View>

      {/* Rotating Loyalty QR Code */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Loyalty QR Code</Text>
        <Text style={styles.qrSubtitle}>Show this to staff for validation • Rotates every 30 seconds</Text>
        <View style={styles.qrContainer}>
          {qrPayload ? (
            <View style={styles.qrWrapper}>
              <QRCode
                value={JSON.stringify(qrPayload)}
                size={200}
                color="#1e3a5f"
                backgroundColor="#ffffff"
                logo={{ width: 40, height: 40, source: require('../../../assets/images/icon.png') }}
              />
              <View style={styles.rotationIndicator}>
                <Text style={styles.rotationText}>Refreshes in {30 - (Date.now() / 1000) % 30 | 0}s</Text>
              </View>
            </View>
          ) : (
            <ActivityIndicator size="large" color="#c9a227" style={styles.loading} />
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Redeemable Rewards</Text>
        {REWARDS.map((reward) => {
          const canAfford = points >= reward.pts;
          return (
            <View key={reward.id} style={styles.rewardRow}>
              <View>
                <Text style={styles.rewardTitle}>{reward.title}</Text>
                <Text style={styles.rewardPoints}>{reward.pts} pts</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.rewardButton,
                  canAfford ? styles.rewardButtonActive : styles.rewardButtonDisabled,
                ]}
                disabled={!canAfford || redeeming}
                onPress={() => handleRedeemPress(reward)}
              >
                {/* BUG FIX APPLIED HERE: Added dynamic text color for disabled state */}
                <Text style={[
                  styles.rewardButtonText, 
                  !canAfford && styles.rewardButtonTextDisabled
                ]}>
                  {canAfford ? 'Redeem' : 'Not enough pts'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Points History</Text>
        {logEntries.length === 0 ? (
          <Text style={styles.emptyText}>No loyalty activity yet. Complete a booking to start earning.</Text>
        ) : (
          logEntries.slice(0, 20).map((entry) => {
            const isRedemption = entry.points < 0;
            return (
              <View key={entry.id} style={styles.historyRow}>
                <View>
                  <Text style={styles.historyReason}>{entry.reason}</Text>
                  <Text style={styles.historyDate}>{new Date(entry.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={[styles.historyPoints, isRedemption ? styles.negative : styles.positive]}>
                  {isRedemption ? '' : '+'}
                  {entry.points}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <Modal visible={!!voucher} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.voucherTitle}>Reward Voucher</Text>
            <Text style={styles.voucherSubtitle}>Present this code to staff</Text>
            <View style={styles.voucherCard}>
              <Text style={styles.voucherCode}>{voucher?.code}</Text>
            </View>
            <Text style={styles.voucherText}>
              {voucher?.title} redeemed for {voucher?.pts} points.
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={() => setVoucher(null)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  backButton: { marginBottom: 16 },
  backButtonText: { color: '#1e3a5f', fontSize: 16, fontWeight: '600' },
  pageTitle: { fontSize: 28, fontWeight: '700', color: '#0f172a' },
  pageSubtitle: { fontSize: 14, color: '#475569', marginTop: 6 },
  card: { borderRadius: 20, padding: 20, marginTop: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  cardLabel: { color: '#f8fafc', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  cardPoints: { color: '#ffffff', fontSize: 42, fontWeight: '800' },
  cardSubTitle: { color: '#e2e8f0', marginTop: 4, fontSize: 14 },
  tierRow: { marginTop: 24, gap: 12 },
  tierLabel: { color: '#e2e8f0', fontSize: 12, textTransform: 'uppercase' },
  tierValue: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  tierProgress: { marginTop: 12 },
  tierText: { color: '#f8fafc', fontSize: 13, marginBottom: 10 },
  progressBackground: { width: '100%', height: 10, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 6 },
  progressFill: { height: '100%', backgroundColor: '#ffffff', borderRadius: 6 },
  section: { marginTop: 24, backgroundColor: '#ffffff', borderRadius: 20, padding: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 14 },
  qrSubtitle: { fontSize: 12, color: '#64748b', marginBottom: 16, textAlign: 'center' },
  qrContainer: { alignItems: 'center' },
  qrWrapper: { alignItems: 'center', gap: 12 },
  rotationIndicator: { backgroundColor: '#fffbeb', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  rotationText: { fontSize: 12, color: '#92400e', fontWeight: '600' },
  loading: { marginVertical: 20 },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  rewardTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  rewardPoints: { color: '#64748b', fontSize: 12, marginTop: 4 },
  rewardButton: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  rewardButtonActive: { backgroundColor: '#c9a227' },
  rewardButtonDisabled: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  rewardButtonText: { color: '#ffffff', fontWeight: '700' },
  rewardButtonTextDisabled: { color: '#94a3b8' }, // FIXED: Prevents invisible text on white background
  emptyText: { color: '#64748b', fontSize: 13 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  historyReason: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  historyDate: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  historyPoints: { fontSize: 14, fontWeight: '700' },
  positive: { color: '#16a34a' },
  negative: { color: '#dc2626' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', backgroundColor: '#ffffff', borderRadius: 24, padding: 24 },
  voucherTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 8, textAlign: 'center' },
  voucherSubtitle: { color: '#64748b', fontSize: 13, textAlign: 'center', marginBottom: 18 },
  voucherCard: { backgroundColor: '#f8fafc', borderRadius: 16, paddingVertical: 20, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  voucherCode: { fontSize: 24, fontWeight: '800', letterSpacing: 2, color: '#1e3a5f' },
  voucherText: { textAlign: 'center', color: '#475569', marginBottom: 18 },
  closeButton: { backgroundColor: '#1e3a5f', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  closeButtonText: { color: '#ffffff', fontWeight: '700' },
});
