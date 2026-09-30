import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ListSkeleton } from '@/components/ui/states';
import { usePermissions } from '@/context/PermissionsContext';
import { listenForRefundRequests, updateRefundRequestStatus } from '@/services/firebase-services';

export default function RefundManagementScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { hasPermission } = usePermissions();
  const canApprove = hasPermission('refund_approve');

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  // Rejection reason modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    if (!canApprove) return;
    const unsub = listenForRefundRequests((data) => {
      // Sort: pending first, then by createdAt desc
      const sorted = [...data].sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      setRequests(sorted);
      setLoading(false);
    });
    return unsub;
  }, [canApprove]);

  // SRS: no staff refund UC — refunds are admin / event_manager only.
  if (!canApprove) {
    return (
      <Screen scroll={false} padded={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Refund Management</Text>
            <Text style={styles.subtitle}>Not available for your role</Text>
          </View>
        </View>
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>Refunds are handled by Admin / Event Manager.</Text>
        </View>
      </Screen>
    );
  }

  const handleApprove = (request: any) => {
    Alert.alert(
      'Approve Refund',
      `Approve R ${Number(request.requestedAmount || 0).toLocaleString()} refund for this booking?\n\nThis will notify the guest immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setProcessing(request.id);
            try {
              await updateRefundRequestStatus(request.id, 'approved');
              Alert.alert('✅ Approved', 'Refund approved and guest notified.');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to approve refund.');
            } finally {
              setProcessing(null);
            }
          },
        },
      ]
    );
  };

  const openRejectModal = (request: any) => {
    setRejectTarget(request);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    if (!rejectionReason.trim()) {
      Alert.alert('Required', 'Please provide a rejection reason before proceeding.');
      return;
    }
    setShowRejectModal(false);
    setProcessing(rejectTarget.id);
    try {
      await updateRefundRequestStatus(rejectTarget.id, 'rejected', undefined, rejectionReason.trim());
      Alert.alert('Rejected', 'Refund request rejected and guest notified.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to reject refund.');
    } finally {
      setProcessing(null);
      setRejectTarget(null);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'approved': return { bg: theme.colors.successLight, text: theme.colors.success };
      case 'rejected': return { bg: theme.colors.errorLight, text: theme.colors.error };
      default: return { bg: theme.colors.warningLight, text: theme.colors.warningStrong };
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <Screen scroll={false} padded={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Refund Management</Text>
          <Text style={styles.subtitle}>
            {requests.filter(r => r.status === 'pending').length} pending · {requests.length} total
          </Text>
        </View>
      </View>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : requests.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title="All Clear" message="No refund requests at the moment." />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {requests.map((request) => {
            const sc = statusColor(request.status);
            const isPending = request.status === 'pending';
            const isProcessing = processing === request.id;

            return (
              <View key={request.id} style={styles.card}>
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <Ionicons name="receipt-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.eventName} numberOfLines={1}>
                      {request.eventId ? `Event #${String(request.eventId).slice(-6).toUpperCase()}` : 'Booking Refund'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusText, { color: sc.text }]}>
                      {request.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Info rows */}
                <View style={styles.infoGrid}>
                  <InfoRow label="Amount" value={`R ${Number(request.requestedAmount || 0).toLocaleString()}`} valueStyle={{ color: theme.colors.error, fontWeight: '700' }} theme={theme} />
                  <InfoRow label="Reason" value={request.reason || '—'} theme={theme} />
                  {request.hasDamageRecord && (
                    <InfoRow label="⚠️ Damage on file" value={`R ${Number(request.damageCost || 0).toLocaleString()}`} valueStyle={{ color: theme.colors.warning }} theme={theme} />
                  )}
                  <InfoRow label="Requested" value={formatDate(request.createdAt)} theme={theme} />
                  {request.status !== 'pending' && (
                    <InfoRow label="Reviewed" value={formatDate(request.updatedAt)} theme={theme} />
                  )}
                  {request.rejectionReason && (
                    <InfoRow label="Rejection reason" value={request.rejectionReason} theme={theme} />
                  )}
                </View>

                {/* Actions */}
                {isPending && (
                  <View style={styles.actions}>
                    {isProcessing ? (
                      <ActivityIndicator color={theme.colors.primary} style={{ flex: 1 }} />
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[styles.btn, { backgroundColor: theme.colors.success }]}
                          onPress={() => handleApprove(request)}
                        >
                          <Ionicons name="checkmark" size={16} color={theme.colors.textInverse} />
                          <Text style={styles.btnText}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.btn, { backgroundColor: theme.colors.error }]}
                          onPress={() => openRejectModal(request)}
                        >
                          <Ionicons name="close" size={16} color={theme.colors.textInverse} />
                          <Text style={styles.btnText}>Reject</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Rejection Reason Modal */}
      <Modal visible={showRejectModal} transparent animationType="slide" onRequestClose={() => setShowRejectModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Reject Refund</Text>
            <Text style={styles.modalSub}>
              Provide a clear reason. This will be sent directly to the guest.
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="e.g. Damage costs offset refund amount…"
              placeholderTextColor={theme.colors.textMuted}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={3}
              maxLength={200}
            />
            <Text style={styles.charCount}>{rejectionReason.length}/200</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.colors.surfaceVariant, flex: 1 }]}
                onPress={() => setShowRejectModal(false)}
              >
                <Text style={[styles.btnText, { color: theme.colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.colors.error, flex: 1 }]}
                onPress={handleRejectConfirm}
              >
                <Text style={styles.btnText}>Confirm Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function InfoRow({ label, value, theme, valueStyle }: any) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <Text style={{ fontSize: 13, color: theme.colors.textMuted, flex: 1 }}>{label}</Text>
      <Text style={[{ fontSize: 13, fontWeight: '600', color: theme.colors.text, flex: 2, textAlign: 'right' }, valueStyle]}>{value}</Text>
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '700', color: theme.colors.text },
  subtitle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  loadingText: { color: theme.colors.textMuted, fontSize: 14 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  list: { padding: 16, paddingBottom: 40, gap: 14 },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16,
    shadowColor: theme.colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06,
    shadowRadius: 8, elevation: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  eventName: { fontSize: 15, fontWeight: '700', color: theme.colors.text, flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  infoGrid: { gap: 0 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: 10,
  },
  btnText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: 14 },
  modalOverlay: {
    flex: 1, backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  modalSub: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  reasonInput: {
    borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 12,
    padding: 12, color: theme.colors.text, fontSize: 14, minHeight: 80,
    textAlignVertical: 'top', backgroundColor: theme.colors.background,
  },
  charCount: { fontSize: 11, color: theme.colors.textMuted, textAlign: 'right' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});