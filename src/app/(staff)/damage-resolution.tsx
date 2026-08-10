import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, useColorScheme, SafeAreaView, Modal, RefreshControl, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import {
  db, updateDamageRecordStatus
} from '../../services/firebase-services';
import {
  collection, query, where, getDocs, onSnapshot, orderBy, doc, getDoc
} from 'firebase/firestore';

const STATUS_OPTS = ['recorded', 'in_repair', 'resolved'] as const;
type DamageStatus = typeof STATUS_OPTS[number];

const statusConfig = (theme: any, status: DamageStatus) => {
  switch (status) {
    case 'resolved': return { color: theme.colors.success, bg: theme.colors.successLight, label: 'Resolved', icon: 'checkmark-circle' };
    case 'in_repair': return { color: theme.colors.warning, bg: theme.colors.warningLight, label: 'In Repair', icon: 'construct' };
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
            <Text style={S.subtitle}>UC30 · Track and resolve damage claims</Text>
          </View>
          <TouchableOpacity style={S.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── STATS ── */}
        {!loading && (
          <View style={S.statsRow}>
            <View style={[S.statChip, { backgroundColor: theme.colors.errorLight }]}>
              <Text style={[S.statNum, { color: theme.colors.error }]}>{totalPending}</Text>
              <Text style={[S.statLbl, { color: theme.colors.error }]}>Recorded</Text>
            </View>
            <View style={[S.statChip, { backgroundColor: theme.colors.warningLight }]}>
              <Text style={[S.statNum, { color: theme.colors.warning }]}>{totalInRepair}</Text>
              <Text style={[S.statLbl, { color: theme.colors.warning }]}>In Repair</Text>
            </View>
            <View style={[S.statChip, { backgroundColor: theme.colors.successLight }]}>
              <Text style={[S.statNum, { color: theme.colors.success }]}>{totalResolved}</Text>
              <Text style={[S.statLbl, { color: theme.colors.success }]}>Resolved</Text>
            </View>
            <View style={[S.statChip, { backgroundColor: theme.colors.surfaceVariant, flex: 1.2 }]}>
              <Text style={[S.statNum, { color: theme.colors.text, fontSize: 13 }]}>R {totalCost.toLocaleString()}</Text>
              <Text style={[S.statLbl, { color: theme.colors.textMuted }]}>Total</Text>
            </View>
          </View>
        )}

        {/* ── FILTER CHIPS ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {(['all', ...STATUS_OPTS] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[S.filterChip, filterStatus === f && { backgroundColor: theme.colors.secondary }]}
              onPress={() => setFilterStatus(f)}
            >
              <Text style={[S.filterText, filterStatus === f && { color: '#fff' }]}>
                {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── RECORDS ── */}
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />
        ) : filtered.length === 0 ? (
          <View style={S.emptyCard}>
            <Ionicons name="hammer-outline" size={40} color={theme.colors.textMuted} />
            <Text style={S.emptyText}>
              {records.length === 0 ? 'No damage records found' : 'No records match this filter'}
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' }}>
              {records.length === 0 ? 'Submit a post-event inspection to create damage records' : ''}
            </Text>
          </View>
        ) : (
          filtered.map((record) => {
            const sc = statusConfig(theme, record.status || 'recorded');
            const techName = staffList.find(s => s.id === record.assignedTechnicianId)?.displayName || record.assignedTechnicianId || null;
            return (
              <TouchableOpacity key={record.id} style={S.recordCard} onPress={() => openUpdateModal(record)} activeOpacity={0.8}>
                <View style={S.recordCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.eventName} numberOfLines={1}>{record.eventName || 'Unknown Event'}</Text>
                    <Text style={S.recordDate}>
                      {record.createdAt?.seconds
                        ? new Date(record.createdAt.seconds * 1000).toLocaleDateString('en-ZA')
                        : 'Unknown date'}
                    </Text>
                  </View>
                  <View style={[S.statusBadge, { backgroundColor: sc.bg }]}>
                    <Ionicons name={sc.icon as any} size={12} color={sc.color} />
                    <Text style={[S.statusText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                </View>

                {/* Items */}
                <View style={S.itemsRow}>
                  {(record.items || []).slice(0, 2).map((item: any, i: number) => (
                    <View key={i} style={S.itemTag}>
                      <Text style={S.itemTagText} numberOfLines={1}>{item.item}</Text>
                    </View>
                  ))}
                  {(record.items || []).length > 2 && (
                    <View style={[S.itemTag, { backgroundColor: theme.colors.surfaceVariant }]}>
                      <Text style={[S.itemTagText, { color: theme.colors.textMuted }]}>+{(record.items || []).length - 2} more</Text>
                    </View>
                  )}
                </View>

                {/* Damage Proof Photos */}
                {(() => {
                  const rawList = record.photos || record.photoUris || [record.photoUrl || record.imageUrl || record.imageUri].filter(Boolean);
                  if (!rawList || rawList.length === 0) return null;

                  return (
                    <View style={{ marginTop: 6, marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 4 }}>
                        📷 Damage Proof Photos ({rawList.length}):
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {rawList.map((uri: string, idx: number) => {
                            const cleanUri = typeof uri === 'string' && !uri.startsWith('http') && !uri.startsWith('data:') && !uri.startsWith('file:')
                              ? `data:image/jpeg;base64,${uri}`
                              : uri;

                            return (
                              <Image
                                key={idx}
                                source={{ uri: cleanUri }}
                                style={{ width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border }}
                                resizeMode="cover"
                              />
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  );
                })()}

                <View style={S.recordCardBottom}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="person-outline" size={13} color={theme.colors.textMuted} />
                    <Text style={S.techText}>{techName || 'Unassigned'}</Text>
                  </View>
                  <Text style={S.costText}>R {(record.totalCost || 0).toLocaleString()}</Text>
                </View>

                <View style={S.tapHintRow}>
                  <Ionicons name="create-outline" size={13} color={theme.colors.primary} />
                  <Text style={S.tapHintText}>Tap to update status</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ── STATUS UPDATE MODAL ── */}
      <Modal visible={!!selectedRecord} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={[S.modalSheet, { paddingBottom: 32 }]}>
            <Text style={S.modalTitle}>Update Damage Record</Text>
            <Text style={S.modalSub}>{selectedRecord?.eventName}</Text>

            <Text style={S.fieldLabel}>Change Status</Text>
            <View style={{ gap: 8 }}>
              {STATUS_OPTS.map(s => {
                const sc = statusConfig(theme, s);
                return (
                  <TouchableOpacity
                    key={s}
                    style={[S.statusOption, { borderColor: newStatus === s ? sc.color : theme.colors.border, backgroundColor: newStatus === s ? sc.bg : 'transparent' }]}
                    onPress={() => setNewStatus(s)}
                  >
                    <Ionicons name={sc.icon as any} size={18} color={sc.color} />
                    <Text style={[S.statusOptionText, { color: newStatus === s ? sc.color : theme.colors.text }]}>{sc.label}</Text>
                    {newStatus === s && <Ionicons name="checkmark-circle" size={18} color={sc.color} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[S.fieldLabel, { marginTop: 16 }]}>Assign Technician (Optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <TouchableOpacity
                style={[S.techChip, !selectedTechnician && { backgroundColor: theme.colors.secondary }]}
                onPress={() => setSelectedTechnician('')}
              >
                <Text style={[S.techChipText, !selectedTechnician && { color: '#fff' }]}>Unassigned</Text>
              </TouchableOpacity>
              {staffList.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[S.techChip, selectedTechnician === s.id && { backgroundColor: theme.colors.secondary }]}
                  onPress={() => setSelectedTechnician(s.id)}
                >
                  <Text style={[S.techChipText, selectedTechnician === s.id && { color: '#fff' }]}>
                    {s.displayName || s.email?.split('@')[0] || s.id}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={[S.confirmBtn, { backgroundColor: theme.colors.border }]}
                onPress={() => setSelectedRecord(null)}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.confirmBtn, { backgroundColor: theme.colors.secondary, flex: 2 }]}
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

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statChip: { flex: 1, padding: 10, borderRadius: 12, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800' },
  statLbl: { fontSize: 11, fontWeight: '600' },

  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8,
    backgroundColor: theme.colors.surfaceVariant,
  },
  filterText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },

  emptyCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 32,
    alignItems: 'center', gap: 8, marginTop: 8,
  },
  emptyText: { fontSize: 15, color: theme.colors.textMuted, fontWeight: '600' },

  recordCard: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  recordCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  eventName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  recordDate: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },

  itemsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  itemTag: { backgroundColor: theme.colors.errorLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  itemTagText: { fontSize: 11, color: theme.colors.error, fontWeight: '600' },

  recordCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border },
  techText: { fontSize: 13, color: theme.colors.textMuted },
  costText: { fontSize: 16, fontWeight: '800', color: theme.colors.error },

  tapHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  tapHintText: { fontSize: 12, color: theme.colors.primary, fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  modalSub: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },

  statusOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 12, padding: 12,
  },
  statusOptionText: { fontSize: 15, fontWeight: '600' },

  techChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8,
    backgroundColor: theme.colors.surfaceVariant,
  },
  techChipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },

  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
});