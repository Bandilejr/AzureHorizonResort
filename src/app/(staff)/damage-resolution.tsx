import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, useColorScheme, SafeAreaView, Modal, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import PhotoThumb from '@/components/PhotoThumb';
import {
  db, updateDamageRecordStatus
} from '../../services/firebase-services';
import {
  collection, query, where, getDocs, onSnapshot, orderBy, doc, getDoc
} from 'firebase/firestore';

const STATUS_OPTS = ['recorded', 'reported', 'in_repair', 'resolved'] as const;
type DamageStatus = typeof STATUS_OPTS[number];

const statusConfig = (theme: any, status: DamageStatus) => {
  switch (status) {
    case 'resolved': return { color: theme.colors.success, bg: theme.colors.successLight, label: 'Resolved', icon: 'checkmark-circle' };
    case 'in_repair': return { color: theme.colors.warning, bg: theme.colors.warningLight, label: 'In Repair', icon: 'construct' };
    case 'reported': return { color: theme.colors.warning, bg: theme.colors.warningLight, label: 'Reported', icon: 'alert-circle' };
    default: return { color: theme.colors.error, bg: theme.colors.errorLight, label: 'Recorded', icon: 'alert-circle' };
  }
};

export default function DamageResolutionScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const S = createStyles(theme);

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Status update modal
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [newStatus, setNewStatus] = useState<DamageStatus>('recorded');
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter
  const [filterStatus, setFilterStatus] = useState<DamageStatus | 'all'>('all');

  const loadData = async () => {
    try {
      // Load all damage records
      const snap = await getDocs(query(collection(db, 'damage_records'), orderBy('createdAt', 'desc')));
      const rawList = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Enrich with event name
      const enriched: any[] = [];
      for (const recDoc of rawList) {
        const rec = recDoc as any;
        let eventName = rec.eventId;
        if (rec.eventId) {
          try {
            const evSnap = await getDoc(doc(db, 'event_bookings', rec.eventId));
            if (evSnap.exists()) {
              const ed = evSnap.data() as any;
              eventName = `${ed.venueName || 'Venue'} — ${ed.eventType || 'Event'}`;
            }
          } catch { /* skip */ }
        }
        enriched.push({ ...rec, eventName });
      }
      setRecords(enriched);

      // Load staff for technician assignment
      const staffSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'staff')));
      setStaffList(staffSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const openUpdateModal = (record: any) => {
    setSelectedRecord(record);
    setNewStatus(record.status || 'recorded');
    setSelectedTechnician(record.assignedTechnicianId || '');
  };

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const handleUpdate = async () => {
    if (!selectedRecord) return;
    setIsUpdating(true);
    try {
      await updateDamageRecordStatus(selectedRecord.id, newStatus, selectedTechnician || undefined);
      showAlert({ title: '✅ Updated', message: `Damage record status changed to "${newStatus.replace('_', ' ')}".`, type: 'success' });
      setSelectedRecord(null);
      loadData();
    } catch (e: any) {
      showAlert({ title: 'Error', message: e.message || 'Failed to update status.', type: 'error' });
    } finally {
      setIsUpdating(false);
    }
  };

  const filtered = records.filter(r => filterStatus === 'all' || r.status === filterStatus);

  const totalPending = records.filter(r => r.status === 'recorded').length;
  const totalInRepair = records.filter(r => r.status === 'in_repair').length;
  const totalResolved = records.filter(r => r.status === 'resolved').length;
  const totalCost = records.reduce((s, r) => s + (r.totalCost || 0), 0);

  return (
    <SafeAreaView style={S.container}>
      <ScrollView
        contentContainerStyle={S.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* ── HEADER ── */}
        <View style={S.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.secondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={S.title}>Damage Resolution</Text>
            <Text style={S.subtitle}>Track, assign and close out damage claims</Text>
          </View>
          <TouchableOpacity style={S.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── SUMMARY STRIP ── */}
        {!loading && (
          <View style={S.summaryCard}>
            <View style={S.summaryItem}>
              <Text style={[S.summaryNum, { color: theme.colors.error }]}>{totalPending}</Text>
              <Text style={S.summaryLbl}>Open</Text>
            </View>
            <View style={S.summaryDivider} />
            <View style={S.summaryItem}>
              <Text style={[S.summaryNum, { color: theme.colors.warning }]}>{totalInRepair}</Text>
              <Text style={S.summaryLbl}>In Repair</Text>
            </View>
            <View style={S.summaryDivider} />
            <View style={S.summaryItem}>
              <Text style={[S.summaryNum, { color: theme.colors.success }]}>{totalResolved}</Text>
              <Text style={S.summaryLbl}>Resolved</Text>
            </View>
            <View style={S.summaryDivider} />
            <View style={S.summaryItem}>
              <Text style={[S.summaryNum, { color: theme.colors.text }]}>R {totalCost.toLocaleString()}</Text>
              <Text style={S.summaryLbl}>Total</Text>
            </View>
          </View>
        )}

        {/* ── FILTER SEGMENTS ── */}
        <View style={S.filterRow}>
          {(['all', ...STATUS_OPTS] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[S.filterSegment, filterStatus === f && { backgroundColor: theme.colors.primary }]}
              onPress={() => setFilterStatus(f)}
            >
              <Text style={[S.filterText, filterStatus === f && { color: '#fff' }]}>
                {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── RECORDS ── */}
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />
        ) : filtered.length === 0 ? (
          <View style={S.emptyCard}>
            <View style={S.emptyIconWrap}>
              <Ionicons name="hammer-outline" size={36} color={theme.colors.textMuted} />
            </View>
            <Text style={S.emptyText}>
              {records.length === 0 ? 'No damage records yet' : 'Nothing matches this filter'}
            </Text>
            <Text style={S.emptySub}>
              {records.length === 0 ? 'Damages are created automatically after a post-event inspection finds problems.' : 'Try a different status above.'}
            </Text>
          </View>
        ) : (
          filtered.map((record) => {
            const sc = statusConfig(theme, record.status || 'recorded');
            const itemCount = (record.items || []).length;
            const techName = staffList.find(s => s.id === record.assignedTechnicianId)?.displayName || null;
            return (
              <View key={record.id} style={S.recordCard}>
                {/* Card header: event + status */}
                <View style={S.recordTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.eventName} numberOfLines={1}>{record.eventName || 'Unknown Event'}</Text>
                    <Text style={S.recordMeta}>
                      {record.createdAt?.seconds
                        ? new Date(record.createdAt.seconds * 1000).toLocaleDateString('en-ZA')
                        : 'Unknown date'}
                      {itemCount > 0 ? `  •  ${itemCount} damage item${itemCount !== 1 ? 's' : ''}` : ''}
                    </Text>
                  </View>
                  <View style={[S.statusBadge, { backgroundColor: sc.bg }]}>
                    <View style={[S.statusDot, { backgroundColor: sc.color }]} />
                    <Text style={[S.statusText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                </View>

                {/* Damage items */}
                {itemCount > 0 && (
                  <View style={S.itemsBox}>
                    {(record.items || []).slice(0, 3).map((item: any, i: number) => (
                      <View key={i} style={S.itemTag}>
                        <Text style={S.itemTagText} numberOfLines={1}>{item.item || item.description}</Text>
                        <Text style={S.itemCost}>R {(item.estimatedCost || item.price || 0).toLocaleString()}</Text>
                      </View>
                    ))}
                    {itemCount > 3 && (
                      <Text style={S.moreItems}>+{itemCount - 3} more</Text>
                    )}
                  </View>
                )}

                {/* Damage proof photos — reads BOTH record shapes:
                    web inspections store per-asset photos in items[].photo,
                    mobile inspections store items[].photos[], legacy flows use
                    top-level record.photos. */}
                {(() => {
                  const nested = (record.items || []).flatMap((it: any) => it.photo ? [it.photo] : (it.photoUrl ? [it.photoUrl] : (it.photos || [])));
                  const all = [
                    ...(record.photos || []),
                    ...(record.photoUris || []),
                    ...nested,
                    ...(record.photoUrl ? [record.photoUrl] : []),
                    ...(record.imageUrl ? [record.imageUrl] : []),
                    ...(record.imageUri ? [record.imageUri] : []),
                  ];
                  const rawList = all.filter(Boolean);
                  if (!rawList || rawList.length === 0) return null;
                  return (
                    <View style={S.photosBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                        <Ionicons name="camera" size={13} color={theme.colors.textMuted} />
                        <Text style={S.photosLabel}>Proof Photos ({rawList.length})</Text>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {rawList.map((uri: string, idx: number) => (
                            <PhotoThumb
                              key={idx}
                              uri={uri}
                              size={64}
                              borderRadius={10}
                              borderColor={theme.colors.border}
                              label="Unavailable"
                            />
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  );
                })()}

                {/* Technician + cost row */}
                <View style={S.recordBottom}>
                  <View style={S.techWrap}>
                    <Ionicons name="person-outline" size={14} color={theme.colors.textMuted} />
                    <Text style={S.techText}>{techName || 'Unassigned'}</Text>
                  </View>
                  <Text style={S.costText}>R {(record.totalCost || 0).toLocaleString()}</Text>
                </View>

                {/* Primary action */}
                <TouchableOpacity style={S.actionBtn} onPress={() => openUpdateModal(record)} activeOpacity={0.85}>
                  <Ionicons name="create-outline" size={16} color="#fff" />
                  <Text style={S.actionBtnText}>Update Status</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── STATUS UPDATE MODAL ── */}
      <Modal visible={!!selectedRecord} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <View style={S.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={S.modalTitle}>Update Status</Text>
                <Text style={S.modalSub} numberOfLines={1}>{selectedRecord?.eventName}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedRecord(null)}>
                <Ionicons name="close" size={26} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={S.fieldLabel}>Current: {statusConfig(theme, selectedRecord?.status || 'recorded').label}</Text>
            <Text style={S.fieldLabel}>Set New Status</Text>
            <View style={{ gap: 8 }}>
              {STATUS_OPTS.map(s => {
                const sc = statusConfig(theme, s);
                return (
                  <TouchableOpacity
                    key={s}
                    style={[S.statusOption, { borderColor: newStatus === s ? sc.color : theme.colors.border, backgroundColor: newStatus === s ? sc.bg : theme.colors.surfaceVariant }]}
                    onPress={() => setNewStatus(s)}
                  >
                    <View style={[S.optionIconWrap, { backgroundColor: sc.bg }]}>
                      <Ionicons name={sc.icon as any} size={18} color={sc.color} />
                    </View>
                    <Text style={[S.statusOptionText, { color: newStatus === s ? sc.color : theme.colors.text }]}>{sc.label}</Text>
                    {newStatus === s && <Ionicons name="checkmark-circle" size={20} color={sc.color} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[S.fieldLabel, { marginTop: 18 }]}>Assign Technician (Optional)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <TouchableOpacity
                style={[S.techChip, !selectedTechnician && { backgroundColor: theme.colors.primary }]}
                onPress={() => setSelectedTechnician('')}
              >
                <Text style={[S.techChipText, !selectedTechnician && { color: '#fff' }]}>Unassigned</Text>
              </TouchableOpacity>
              {staffList.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[S.techChip, selectedTechnician === s.id && { backgroundColor: theme.colors.primary }]}
                  onPress={() => setSelectedTechnician(s.id)}
                >
                  <Text style={[S.techChipText, selectedTechnician === s.id && { color: '#fff' }]}>
                    {s.displayName || s.email?.split('@')[0] || s.id}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 22 }}>
              <TouchableOpacity
                style={[S.confirmBtn, { backgroundColor: theme.colors.border }]}
                onPress={() => setSelectedRecord(null)}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.confirmBtn, { backgroundColor: theme.colors.primary, flex: 2 }]}
                onPress={handleUpdate}
                disabled={isUpdating}
              >
                {isUpdating ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Themed Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingTop: 16, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' },
  refreshBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },

  // Summary strip
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 12,
    marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNum: { fontSize: 18, fontWeight: '800' },
  summaryLbl: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '600', marginTop: 2 },
  summaryDivider: { width: 1, height: 30, backgroundColor: theme.colors.border },

  // Filter segments
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterSegment: {
    flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
    backgroundColor: theme.colors.surfaceVariant,
  },
  filterText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },

  emptyCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 32,
    alignItems: 'center', gap: 8, marginTop: 8,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.surfaceVariant,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  emptyText: { fontSize: 15, color: theme.colors.text, fontWeight: '700' },
  emptySub: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 18 },

  // Record cards
  recordCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  recordTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  eventName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  recordMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },

  itemsBox: { backgroundColor: theme.colors.surfaceVariant, borderRadius: 10, padding: 10, gap: 6, marginBottom: 12 },
  itemTag: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 4,
  },
  itemTagText: { fontSize: 12, color: theme.colors.text, fontWeight: '500', flex: 1 },
  itemCost: { fontSize: 12, fontWeight: '700', color: theme.colors.error },
  moreItems: { fontSize: 11, color: theme.colors.textMuted, paddingHorizontal: 8 },

  photosBox: { marginBottom: 12, paddingTop: 4 },
  photosLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  photoThumb: { width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },

  recordBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  techWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  techText: { fontSize: 13, color: theme.colors.textMuted },
  costText: { fontSize: 17, fontWeight: '800', color: theme.colors.error },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.primary, paddingVertical: 11, borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '88%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  modalSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 6 },

  statusOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 12, padding: 12,
  },
  optionIconWrap: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  statusOptionText: { fontSize: 15, fontWeight: '600' },

  techChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: theme.colors.surfaceVariant,
  },
  techChipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },

  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
});