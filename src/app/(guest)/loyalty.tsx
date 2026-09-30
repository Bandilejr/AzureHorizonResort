import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db, listenForLoyaltyLog, redeemLoyaltyReward, checkAndRefundExpiredVouchers, LoyaltyLogEntry } from '../../services/firebase-services';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import QRCode from 'react-native-qrcode-svg';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ListSkeleton } from '@/components/ui/states';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { lightColors } from '@/design/tokens';

const TIERS = [
  { name: 'Bronze', min: 0, color: lightColors.warningStrong },
  { name: 'Silver', min: 500, color: lightColors.textMuted },
  { name: 'Gold', min: 1500, color: lightColors.warning },
  { name: 'Platinum', min: 5000, color: lightColors.text },
];

const REWARDS = [
  { id: 1, title: 'Complimentary Dessert & Coffee', pts: 100, category: 'Dining' },
  { id: 2, title: 'Complimentary Welcome Drink', pts: 150, category: 'Bar' },
  { id: 3, title: '2-for-1 Cocktails at Sunset Lounge', pts: 200, category: 'Bar' },
  { id: 4, title: 'Dessert Platter for Two', pts: 250, category: 'Dining' },
  { id: 5, title: '10% Dining Discount Voucher', pts: 300, category: 'Dining' },
];

const formatTier = (tierName: string) => tierName.charAt(0).toUpperCase() + tierName.slice(1);

export default function LoyaltyScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const [profile, setProfile] = useState<any>(null);
  const [logEntries, setLogEntries] = useState<LoyaltyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);

  // Voucher modal state
  const [voucher, setVoucher] = useState<{
    title: string;
    pts: number;
    code: string;
    qrPayload: string;
  } | null>(null);

  const qrSvgRef = React.useRef<any>(null);

  // Custom alert state
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  // REAL-TIME FIRESTORE LISTENER FOR USER PROFILE & POINTS
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    let unsubProfile: (() => void) | null = null;

    const setupListener = async () => {
      // 1. Try UID doc
      const uidRef = doc(db, 'users', user.uid);
      const uidSnap = await getDoc(uidRef);

      let targetDocRef = uidRef;
      if (!uidSnap.exists() && user.email) {
        // Fallback to email doc
        const emailKey = user.email.trim().toLowerCase();
        const emailRef = doc(db, 'users', emailKey);
        const emailSnap = await getDoc(emailRef);
        if (emailSnap.exists()) {
          targetDocRef = emailRef;
        }
      }

      unsubProfile = onSnapshot(targetDocRef, (snap) => {
        if (snap.exists()) {
          setProfile({ id: snap.id, ...snap.data() });
          checkAndRefundExpiredVouchers(snap.id);
        }
        setLoading(false);
      }, (err) => {
        console.warn('Loyalty profile listener error:', err);
        setLoading(false);
      });
    };

    setupListener();

    return () => {
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // REAL-TIME LOYALTY LOGS LISTENER
  useEffect(() => {
    const user = auth.currentUser;
    const guestId = user?.uid || profile?.id;
    if (!guestId) return;

    const unsubscribe = listenForLoyaltyLog(guestId, setLogEntries);
    return () => unsubscribe();
  }, [profile?.id]);

  if (loading) {
    return (
      <View style={[styles.centered, { paddingHorizontal: 20 }]}>
        <ListSkeleton rows={3} style={{ width: '100%' }} />
      </View>
    );
  }

  const totalPoints = profile?.loyaltyPoints || 0;
  const heldPoints = profile?.heldPoints || 0;
  const availablePoints = Math.max(0, totalPoints - heldPoints);
  const points = availablePoints;

  const tierName = profile?.loyaltyTier?.toLowerCase() || 'bronze';
  const currentTier = TIERS.find((tier) => tier.name.toLowerCase() === tierName) || TIERS[0];
  const currentTierIndex = TIERS.indexOf(currentTier);
  const nextTier = TIERS[currentTierIndex + 1];

  const progressToNext = nextTier
    ? Math.min(100, Math.max(0, Math.round(((totalPoints - currentTier.min) / (nextTier.min - currentTier.min)) * 100)))
    : 100;

  const handleRedeemPress = (reward: { id: number; title: string; pts: number }) => {
    const user = auth.currentUser;
    if (!user || profile?.status === 'visitor') {
      showAlert({
        title: '🔒 Resident Sign-In Required',
        message: 'Please sign in to your room stay account to earn points and redeem food coupons.',
        type: 'warning',
        confirmText: 'Sign In Now',
        cancelText: 'Cancel',
        onConfirm: () => router.push('/login'),
      });
      return;
    }

    if (availablePoints < reward.pts) {
      showAlert({
        title: 'Not Enough Available Points',
        message: `You need ${reward.pts - availablePoints} more available points to redeem "${reward.title}". ${heldPoints > 0 ? `(${heldPoints} points currently held in pending vouchers).` : ''}`,
        type: 'warning',
      });
      return;
    }

    showAlert({
      title: 'Confirm Reward Redemption',
      message: `Redeem ${reward.pts} loyalty points for "${reward.title}"?\n\nA downloadable QR code voucher will pop up for staff/waiter scanning.`,
      type: 'info',
      confirmText: 'Redeem Now',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setRedeeming(true);
        try {
          const user = auth.currentUser;
          const userDocId = profile?.id || user?.uid || '';
          const guestId = user?.uid || userDocId;

          const { availablePoints: newPoints, voucherCode } = await redeemLoyaltyReward(userDocId, guestId, reward);

          const payload = JSON.stringify({
            voucherCode,
            rewardTitle: reward.title,
            guestId,
            guestName: profile?.displayName || profile?.name || user?.displayName || 'Guest',
            pts: reward.pts,
            issuedAt: new Date().toISOString(),
          });

          setVoucher({
            title: reward.title,
            pts: reward.pts,
            code: voucherCode,
            qrPayload: payload,
          });
        } catch (error: any) {
          showAlert({
            title: 'Redemption Failed',
            message: error.message || 'Please try again.',
            type: 'error',
          });
        }
      },
    });
  };

  const handleShareOrDownloadQR = async () => {
    if (!voucher) return;
    try {
      if (qrSvgRef.current) {
        qrSvgRef.current.toDataURL(async (data: string) => {
          const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
          const fileUri = `${cacheDir}voucher_${voucher.code}.png`;
          await FileSystem.writeAsStringAsync(fileUri, data, { encoding: FileSystem.EncodingType.Base64 });
          
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'image/png',
              dialogTitle: `Azure Horizon Voucher - ${voucher.title}`,
              UTI: 'public.png',
            });
          } else {
            await Share.share({
              title: `Azure Horizon Reward Voucher - ${voucher.title}`,
              message: `Azure Horizon Voucher Code: ${voucher.code}\nReward: ${voucher.title}`,
            });
          }
        });
      } else {
        await Share.share({
          title: `Azure Horizon Reward Voucher - ${voucher.title}`,
          message: `Azure Horizon Voucher Code: ${voucher.code}\nReward: ${voucher.title}`,
        });
      }
    } catch (error: any) {
      console.warn('Share error:', error);
    }
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Loyalty & Rewards</Text>
          <Text style={styles.pageSubtitle}>Points update in real-time when scanned by staff</Text>
        </View>
      </View>

      {/* Main Tier Membership Card */}
      <View style={[styles.card, { backgroundColor: currentTier.color }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>Azure Horizon Pass</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>REAL-TIME</Text>
          </View>
        </View>

        <Text style={styles.cardPoints}>{availablePoints.toLocaleString()}</Text>
        <Text style={styles.cardSubTitle}>Available Loyalty Points</Text>
        {heldPoints > 0 && (
          <Text style={{ color: theme.colors.warningSoft, fontSize: 12, fontWeight: '800', marginTop: 4 }}>
            🔒 {heldPoints} pts held in pending vouchers (Total Balance: {totalPoints})
          </Text>
        )}

        <View style={styles.tierInfoRow}>
          <View>
            <Text style={styles.tierLabel}>Current Tier</Text>
            <Text style={styles.tierValue}>{formatTier(currentTier.name)} Status</Text>
          </View>
          <Ionicons name="diamond-sharp" size={28} color={theme.colors.warningSoft} />
        </View>

        {/* HIGH-CONTRAST BOLD PROGRESS BAR BOX */}
        {nextTier ? (
          <View style={styles.progressBarBox}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>
                PROGRESS TO {nextTier.name.toUpperCase()} TIER
              </Text>
              <Text style={styles.progressPctText}>{progressToNext}%</Text>
            </View>

            {/* Track & Bar */}
            <View style={styles.progressTrackContainer}>
              <View style={[styles.progressTrackFill, { width: `${progressToNext}%` }]} />
            </View>

            <View style={styles.progressFooter}>
              <Text style={styles.progressSubLeft}>
                {points.toLocaleString()} / {nextTier.min.toLocaleString()} pts
              </Text>
              <Text style={styles.progressSubRight}>
                {nextTier.min - points} pts remaining
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.progressBarBox}>
            <Text style={styles.topTierText}>👑 Platinum Top Tier Member — Maximum Status Unlocked</Text>
          </View>
        )}
      </View>

      {/* Redeemable Rewards Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Redeem Rewards</Text>
          <Ionicons name="gift-outline" size={20} color={theme.colors.primary} />
        </View>
        <Text style={styles.sectionSubtitle}>Tap Redeem to generate a downloadable QR code voucher for staff/waiter scanning</Text>

        {REWARDS.map((reward) => {
          const canAfford = points >= reward.pts;
          return (
            <View key={reward.id} style={styles.rewardRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{reward.category}</Text>
                </View>
                <Text style={styles.rewardTitle}>{reward.title}</Text>
                <Text style={styles.rewardPoints}>{reward.pts} Points</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.rewardButton,
                  canAfford ? styles.rewardButtonActive : styles.rewardButtonDisabled,
                ]}
                disabled={!canAfford || redeeming}
                onPress={() => handleRedeemPress(reward)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.rewardButtonText,
                    !canAfford && styles.rewardButtonTextDisabled,
                  ]}
                >
                  {canAfford ? 'Redeem' : 'Needs More Pts'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* Real-time Points History Log */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Real-time Activity Log</Text>
          <Ionicons name="time-outline" size={18} color={theme.colors.textMuted} />
        </View>
        {logEntries.length === 0 ? (
          <EmptyState icon="time-outline" title="No transactions yet" message="Ask staff to scan your member QR code to earn visit points." />
        ) : (
          logEntries.slice(0, 15).map((entry) => {
            const isRedemption = entry.points < 0;
            return (
              <View key={entry.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyReason}>{entry.reason}</Text>
                  <Text style={styles.historyDate}>{new Date(entry.createdAt).toLocaleDateString('en-ZA')} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <Text style={[styles.historyPoints, isRedemption ? styles.negative : styles.positive]}>
                  {isRedemption ? '' : '+'}
                  {entry.points} pts
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* REDEMPTION VOUCHER & QR CODE POPUP MODAL */}
      <Modal visible={!!voucher} transparent animationType="slide" onRequestClose={() => setVoucher(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconBadge}>
              <Ionicons name="qr-code" size={32} color={theme.colors.gold} />
            </View>

            <Text style={styles.voucherTitle}>Reward Voucher Generated!</Text>
            <Text style={styles.voucherSubtitle}>Present this QR code to the waiter or staff member to claim</Text>

            <View style={styles.qrContainer}>
              {voucher && (
                <QRCode
                  value={voucher.qrPayload}
                  size={190}
                  color={theme.colors.text}
                  backgroundColor={theme.colors.surface}
                  getRef={(c) => (qrSvgRef.current = c)}
                />
              )}
            </View>

            <View style={styles.voucherCard}>
              <Text style={styles.voucherCodeLabel}>VOUCHER CODE</Text>
              <Text style={styles.voucherCode}>{voucher?.code}</Text>
            </View>

            <Text style={styles.voucherText}>
              <Text style={{ fontWeight: '700' }}>{voucher?.title}</Text> redeemed for {voucher?.pts} points.
            </Text>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.downloadButton} onPress={handleShareOrDownloadQR} activeOpacity={0.8}>
                <Ionicons name="download-outline" size={18} color={theme.colors.textInverse} style={{ marginRight: 6 }} />
                <Text style={styles.downloadButtonText}>Save / Share QR</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeButton} onPress={() => setVoucher(null)} activeOpacity={0.8}>
                <Text style={styles.closeButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Themed Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </Screen>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' },
    pageTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
    pageSubtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },

    card: { borderRadius: 24, padding: 22, shadowColor: theme.colors.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    cardLabel: { color: theme.colors.background, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '800' },

    liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.successSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.success },
    liveText: { color: theme.colors.textInverse, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

    cardPoints: { color: theme.colors.textInverse, fontSize: 44, fontWeight: '900', letterSpacing: -1 },
    cardSubTitle: { color: theme.colors.border, marginTop: 2, fontSize: 13, fontWeight: '600' },

    tierInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 14 },
    tierLabel: { color: theme.colors.border, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
    tierValue: { color: theme.colors.textInverse, fontSize: 18, fontWeight: '800', marginTop: 2 },

    // HIGH CONTRAST BOLD PROGRESS BAR CONTAINER
    progressBarBox: {
      backgroundColor: theme.colors.overlay,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      marginTop: 4,
    },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    progressTitle: { color: theme.colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    progressPctText: { color: theme.colors.textInverse, fontSize: 14, fontWeight: '900' },

    progressTrackContainer: { width: '100%', height: 14, backgroundColor: theme.colors.cameraBackdrop, borderRadius: 7, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.borderStrong },
    progressTrackFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 7 },

    progressFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    progressSubLeft: { color: theme.colors.textInverse, fontSize: 12, fontWeight: '700' },
    progressSubRight: { color: theme.colors.warningSoft, fontSize: 12, fontWeight: '700' },
    topTierText: { color: theme.colors.warningSoft, fontSize: 13, fontWeight: '800', textAlign: 'center' },

    section: { marginTop: 24, backgroundColor: theme.colors.surface, borderRadius: 24, padding: 20, shadowColor: theme.colors.shadow, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
    sectionSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4, marginBottom: 16 },

    rewardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    categoryBadge: { alignSelf: 'flex-start', backgroundColor: theme.colors.primaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
    categoryText: { fontSize: 11, color: theme.colors.primary, fontWeight: '700' },
    rewardTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
    rewardPoints: { color: theme.colors.textMuted, fontSize: 13, marginTop: 2, fontWeight: '600' },
    rewardButton: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
    rewardButtonActive: { backgroundColor: theme.colors.primary },
    rewardButtonDisabled: { borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceVariant },
    rewardButtonText: { color: theme.colors.text, fontWeight: '800', fontSize: 13 },
    rewardButtonTextDisabled: { color: theme.colors.textMuted },

    emptyText: { color: theme.colors.textMuted, fontSize: 13, fontStyle: 'italic', marginVertical: 12 },
    historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    historyReason: { fontSize: 14, color: theme.colors.text, fontWeight: '600' },
    historyDate: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
    historyPoints: { fontSize: 15, fontWeight: '800' },
    positive: { color: theme.colors.success },
    negative: { color: theme.colors.error },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },

    // Voucher QR Modal
    modalOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { width: '100%', maxWidth: 360, backgroundColor: theme.colors.text, borderRadius: 28, padding: 24, alignItems: 'center', borderWidth: 1.5, borderColor: theme.colors.primary },
    modalIconBadge: { width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.warningSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    voucherTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.textInverse, textAlign: 'center' },
    voucherSubtitle: { color: theme.colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 20 },
    qrContainer: { padding: 16, backgroundColor: theme.colors.surface, borderRadius: 20, marginBottom: 16 },
    voucherCard: { backgroundColor: theme.colors.cameraBackdrop, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 20, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.borderStrong, width: '100%' },
    voucherCodeLabel: { fontSize: 10, color: theme.colors.textMuted, fontWeight: '800', letterSpacing: 1.5 },
    voucherCode: { fontSize: 20, fontWeight: '900', letterSpacing: 2, color: theme.colors.primary, marginTop: 2 },
    voucherText: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 13, marginBottom: 20 },
    modalButtonRow: { flexDirection: 'row', gap: 10, width: '100%' },
    downloadButton: { flex: 1.2, backgroundColor: theme.colors.secondary, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    downloadButtonText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: 14 },
    closeButton: { flex: 0.8, backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    closeButtonText: { color: theme.colors.text, fontWeight: '800', fontSize: 14 },
  });
