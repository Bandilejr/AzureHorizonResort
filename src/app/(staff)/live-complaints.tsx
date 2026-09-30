import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import PhotoThumb from '@/components/PhotoThumb';
import {
  db, updateLiveComplaintStatus,
} from '@/services/firebase-services';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';

const STATUS_ORDER = ['open', 'assigned', 'in_progress', 'resolved'];
const STATUS_NEXT: Record<string, string> = {
  open: 'assigned',
  assigned: 'in_progress',
  in_progress: 'resolved',
};

const urgencyColors = (theme: any, urgency: string) => {
  switch (urgency) {
    case 'critical': return { bg: theme.colors.errorLight, text: theme.colors.error };
    case 'high': return { bg: theme.colors.warningSoft, text: theme.colors.warningStrong };
    case 'medium': return { bg: theme.colors.warningLight, text: theme.colors.warningStrong };
    default: return { bg: theme.colors.successLight, text: theme.colors.success };
  }
};

const statusColors = (theme: any, status: string) => {
  switch (status) {
    case 'resolved': return { bg: theme.colors.successLight, text: theme.colors.success };
    case 'in_progress': return { bg: theme.colors.infoSoft, text: theme.colors.infoStrong };
    case 'assigned': return { bg: theme.colors.warningLight, text: theme.colors.warningStrong };
    default: return { bg: theme.colors.surfaceVariant, text: theme.colors.textMuted };
  }
};

export default function LiveComplaintsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [prioritySort, setPrioritySort] = useState(true); // Priority-queue triage ON by default

  useEffect(() => {
    const q = query(collection(db, 'live_complaints'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setComplaints(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
      setRefreshing(false);
    }, () => {
      setLoading(false);
      setRefreshing(false);
    });
    return unsub;
  }, []);

  // ── Priority-Queue Triage Algorithm (UC28) ──────────────────────────────
  // Score = urgencyWeight(level) × waitHoursMultiplier(ageHours)
  // Urgency weights: critical=4, high=3, medium=2, low=1
  // Wait multiplier: escalates every 6 hours of unresolved wait
  // Resolved complaints are always sorted to the bottom.
  const urgencyWeight = (urgency: string): number => {
    switch (urgency?.toLowerCase()) {
      case 'critical': return 4;
      case 'high':     return 3;
      case 'medium':   return 2;
      default:         return 1;
    }
  };

  const waitHoursMultiplier = (createdAt: any): number => {
    if (!createdAt) return 1;
    const created = createdAt.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt);
    const ageHours = (Date.now() - created.getTime()) / (1000 * 60 * 60);
    return 1 + ageHours / 6; // +1 per 6 hours of wait
  };

  const priorityScore = (c: any): number => {
    if (c.status === 'resolved') return -1; // Resolved always bottom
    return urgencyWeight(c.urgency) * waitHoursMultiplier(c.createdAt);
  };

  const isEscalating = (c: any): boolean => {
    if (c.status === 'resolved') return false;
    const ageHours = c.createdAt?.seconds
      ? (Date.now() - c.createdAt.seconds * 1000) / (1000 * 60 * 60)
      : 0;
    return ageHours >= 2 && c.urgency !== 'low'; // Flag if unresolved 2+ hours at medium+
  };

  const onRefresh = useCallback(() => setRefreshing(true), []);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const handleAdvanceStatus = (complaint: any) => {
    const nextStatus = STATUS_NEXT[complaint.status];
    if (!nextStatus) return;

    const isResolving = nextStatus === 'resolved';
    const label = nextStatus.replace('_', ' ');

    showAlert({
      title: `Mark as ${label.charAt(0).toUpperCase() + label.slice(1)}`,
      message: isResolving
        ? `Mark this complaint as resolved?\n\nThe guest will be notified immediately.`
        : `Move status to "${label}"?`,
      type: isResolving ? 'success' : 'info',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setProcessing(complaint.id);
        try {
          await updateLiveComplaintStatus(complaint.id, nextStatus as any, profile?.uid);
        } catch (e: any) {
          showAlert({ title: 'Error', message: e.message || 'Could not update status.', type: 'error' });
        } finally {
          setProcessing(null);
        }
      },
    });
  };

  const formatTime = (ts: any) => {
    if (!ts) return '—';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  };

  const FILTER_TABS = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'resolved', label: 'Resolved' },
  ];

  const baseFiltered = activeFilter === 'all'
    ? complaints
    : complaints.filter(c => c.status === activeFilter);

  // Apply priority-queue sort or fallback to chronological
  const filtered = prioritySort
    ? [...baseFiltered].sort((a, b) => priorityScore(b) - priorityScore(a))
    : baseFiltered;

  const pendingCount = complaints.filter(c => c.status !== 'resolved').length;

  return (
    <Screen scroll={false} padded={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Live Complaints</Text>
          <Text style={styles.subtitle}>
            {pendingCount} active · {complaints.length} total
          </Text>
        </View>
        {pendingCount > 0 && (
          <View style={styles.urgentBadge}>
            <Text style={styles.urgentBadgeText}>{pendingCount}</Text>
          </View>
        )}
      </View>

      {/* Priority Sort Toggle */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 10 }}>
        <Ionicons name="podium" size={16} color={prioritySort ? theme.colors.primary : theme.colors.textMuted} />
        <Text style={{ fontSize: 13, color: prioritySort ? theme.colors.primary : theme.colors.textMuted, fontWeight: prioritySort ? '700' : '400' }}>
          {prioritySort ? 'Priority Queue Active' : 'Chronological Order'}
        </Text>
        <TouchableOpacity
          style={{
            marginLeft: 'auto',
            backgroundColor: prioritySort ? theme.colors.primary : theme.colors.surface,
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderWidth: 1,
            borderColor: theme.colors.primary,
          }}
          onPress={() => setPrioritySort(p => !p)}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: prioritySort ? theme.colors.textInverse : theme.colors.primary }}>
            {prioritySort ? '⬆️ Priority Sort' : '🕐 Chronological'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {FILTER_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterTab, activeFilter === tab.key && styles.filterTabActive]}
            onPress={() => setActiveFilter(tab.key)}
          >
            <Text style={[styles.filterTabText, activeFilter === tab.key && styles.filterTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading complaints…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="checkmark-done-circle-outline" size={56} color={theme.colors.success} />
          <Text style={styles.emptyTitle}>
            {activeFilter === 'all' ? 'No Complaints' : `No ${activeFilter.replace('_', ' ')} complaints`}
          </Text>
          <Text style={styles.emptyText}>All clear on this filter.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        >
          {filtered.map((complaint) => {
            const uc = urgencyColors(theme, complaint.urgency);
            const sc = statusColors(theme, complaint.status);
            const isProcessing = processing === complaint.id;
            const nextStatus = STATUS_NEXT[complaint.status];
            const isResolved = complaint.status === 'resolved';

            return (
              <View key={complaint.id} style={styles.card}>
                {/* Urgency stripe */}
                <View style={[styles.urgencyStripe, { backgroundColor: uc.bg }]}>
                  <View style={[styles.urgencyDot, { backgroundColor: uc.text }]} />
                  <Text style={[styles.urgencyLabel, { color: uc.text }]}>
                    {(complaint.urgency || 'low').toUpperCase()}
                  </Text>
                  {/* Priority score + escalation badge */}
                  {prioritySort && !isResolved && (
                    <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {isEscalating(complaint) && (
                        <View style={{ backgroundColor: theme.colors.errorStrong, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ color: theme.colors.textInverse, fontSize: 9, fontWeight: '800' }}>⬆️ ESCALATING</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 10, color: uc.text, fontWeight: '600' }}>
                        Score: {priorityScore(complaint).toFixed(1)}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardBody}>
                  {/* Title row */}
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.category}>{complaint.category || 'Issue'}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusText, { color: sc.text }]}>
                        {(complaint.status || 'open').replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {complaint.description ? (
                    <Text style={styles.description} numberOfLines={2}>{complaint.description}</Text>
                  ) : null}

                  {/* Attached Photos */}
                  {(() => {
                    const rawList = complaint.photos || [complaint.photoUrl || complaint.imageUrl || complaint.imageUri].filter(Boolean);
                    if (!rawList || rawList.length === 0) return null;

                    return (
                      <View style={{ marginTop: 8, marginBottom: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 4 }}>
                          📷 Attached Photos ({rawList.length}):
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            {rawList.map((uri: string, idx: number) => (
                              <PhotoThumb
                                key={idx}
                                uri={uri}
                                size={72}
                                borderRadius={8}
                                borderColor={theme.colors.border}
                                label="Unavailable"
                              />
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    );
                  })()}

                  <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={13} color={theme.colors.textMuted} />
                    <Text style={styles.metaText}>{complaint.location || '—'}</Text>
                    <Text style={styles.metaDivider}>·</Text>
                    <Ionicons name="time-outline" size={13} color={theme.colors.textMuted} />
                    <Text style={styles.metaText}>{formatTime(complaint.createdAt)}</Text>
                  </View>

                  {isResolved && complaint.resolvedAt && (
                    <Text style={[styles.metaText, { color: theme.colors.success, marginTop: 4 }]}>
                      ✅ Resolved at {formatTime(complaint.resolvedAt)}
                    </Text>
                  )}

                  {/* Action button */}
                  {!isResolved && (
                    <TouchableOpacity
                      style={[styles.advanceBtn, isProcessing && { opacity: 0.6 }]}
                      disabled={isProcessing}
                      onPress={() => handleAdvanceStatus(complaint)}
                    >
                      {isProcessing ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      ) : (
                        <>
                          <Ionicons name="arrow-forward-circle-outline" size={16} color={theme.colors.primary} />
                          <Text style={styles.advanceBtnText}>
                            Mark as {(STATUS_NEXT[complaint.status] || '').replace('_', ' ')}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </Screen>
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
  urgentBadge: {
    backgroundColor: theme.colors.error, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  urgentBadgeText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: 13 },
  filterBar: { paddingVertical: 12, flexGrow: 0 },
  filterTab: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
    backgroundColor: theme.colors.surfaceVariant,
  },
  filterTabActive: { backgroundColor: theme.colors.primary },
  filterTabText: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' },
  filterTabTextActive: { color: theme.colors.textInverse },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  loadingText: { color: theme.colors.textMuted, fontSize: 14 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.textMuted },
  list: { padding: 16, paddingBottom: 40, gap: 14 },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 16, overflow: 'hidden',
    shadowColor: theme.colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06,
    shadowRadius: 8, elevation: 3,
  },
  urgencyStripe: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  urgencyDot: { width: 8, height: 8, borderRadius: 4 },
  urgencyLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  cardBody: { padding: 16, paddingTop: 12 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  category: { fontSize: 16, fontWeight: '700', color: theme.colors.text, flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  description: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18, marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: theme.colors.textMuted },
  metaDivider: { color: theme.colors.border, marginHorizontal: 4 },
  advanceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 14, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1.5, borderColor: theme.colors.primary,
    alignSelf: 'flex-start',
  },
  advanceBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 13 },
});