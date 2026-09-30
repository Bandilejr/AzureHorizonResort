// (kitchen) Order queue — live RTDB orders.
// REMEDIATED Phase C (P0-2): card → ORDER DETAIL (customer/context, items,
// totals, current state, assignee) → CONFIRM (next state + actor) → advance
// with per-order busy + failure feedback. No opaque one-tap progression.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePermissions } from '@/context/PermissionsContext';
import { listenKitchenOrders, advanceOrder, type KitchenOrder, type OrderStatus } from '@/services/order-queue';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { DetailModal, ConfirmBlock, KV, ModalButton, SectionTitle, StatusBadge, LiveErrorBanner } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

const FILTERS: ('all' | OrderStatus)[] = ['all', 'pending', 'preparing', 'ready', 'picked_up', 'delivered'];
const ACTION: Partial<Record<OrderStatus, string>> = {
  pending: 'Claim', preparing: 'Mark ready', ready: 'Pick up', picked_up: 'Deliver',
};
const NEXT_STATE: Partial<Record<OrderStatus, string>> = {
  pending: 'preparing (you own it)', preparing: 'ready', ready: 'picked up (you carry it)', picked_up: 'delivered (+ receipt)',
};

export default function OrderQueueScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const { hasPermission, isStaff } = usePermissions();
  const canWork = hasPermission('kitchen_orders') || isStaff;
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [selected, setSelected] = useState<KitchenOrder | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({ visible: false, title: '', message: '' });
  const showAlert = (config: Omit<AlertConfig, 'visible'>) => setAlertConfig({ ...config, visible: true });

  useEffect(() => listenKitchenOrders((list) => {
    setOrders([...list].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
    setLoading(false);
    // Keep the open detail live: realtime is authoritative (stale guard).
    setSelected((prev) => (prev ? list.find((o) => o.id === prev.id) || null : prev));
  }, (e) => { setLoadError(e.message); setLoading(false); }), [retryKey]);

  const advance = async () => {
    if (!selected) return;
    setBusyId(selected.id);
    try {
      const res = await advanceOrder(selected.id);
      if (!res.ok) {
        showAlert({ title: 'Cannot advance', message: res.message, type: 'warning' });
      } else {
        setSelected(null); setConfirming(false);
      }
    } catch (e: any) {
      showAlert({ title: 'Update failed', message: e?.message || 'Could not update order.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  if (!canWork) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBack(router, '/(kitchen)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
          <Text style={styles.title}>Order Queue</Text>
        </View>
        <Text style={styles.muted}>Your role cannot work orders.</Text>
      </View>
    );
  }
  if (loading) return <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 60 }} />;

  const visible = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(kitchen)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Order Queue ({orders.filter((o) => o.status !== 'delivered').length} open)</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f} style={[styles.chip, filter === f && styles.chipOn]} onPress={() => setFilter(f)}>
            <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>{f.replace('_', ' ')}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {visible.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name={"receipt-outline" as any} size={40} color={theme.colors.textMuted} />
          <Text style={styles.muted}>No orders here.</Text>
        </View>
      )}
      {visible.map((o) => (
        <TouchableOpacity key={o.id} style={styles.card} onPress={() => { setSelected(o); setConfirming(false); }} activeOpacity={0.7}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{o.guestName || 'Guest'}{o.roomNumber ? ` · Room ${o.roomNumber}` : ''}{o.tableNumber ? ` · Table ${o.tableNumber}` : ''}</Text>
            <StatusBadge status={o.status} />
          </View>
          <Text style={styles.muted}>{(o.items || []).map((i) => `${i.quantity}× ${i.name}`).join(', ') || '—'} · R{o.totalAmount ?? '—'}</Text>
          <Text style={styles.review}>Tap to inspect ›</Text>
        </TouchableOpacity>
      ))}

      <DetailModal visible={selected !== null} title={selected ? `Order · ${selected.guestName || 'Guest'}` : ''} onClose={() => setSelected(null)}>
        {selected && !confirming && (
          <View>
            <StatusBadge status={selected.status} />
            <SectionTitle>CUSTOMER / CONTEXT</SectionTitle>
            <KV label="Guest" value={selected.guestName || '—'} />
            <KV label="Room" value={selected.roomNumber || '—'} />
            <KV label="Table" value={selected.tableNumber || '—'} />
            <KV label="Type" value={selected.orderType || '—'} />
            <KV label="Placed" value={selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'} />
            <SectionTitle>ITEMS</SectionTitle>
            {(selected.items || []).length === 0 && <Text style={styles.muted}>No line items.</Text>}
            {(selected.items || []).map((i, idx) => (
              <KV key={idx} label={`${i.quantity}× ${i.name}`} value={i.price != null ? `R${i.price}` : '—'} />
            ))}
            <KV label="Total" value={`R${selected.totalAmount ?? '—'}`} />
            <SectionTitle>STATE</SectionTitle>
            <KV label="Current" value={selected.status.replace('_', ' ')} />
            <KV label="Handled by" value={selected.assignedTo || 'Unassigned'} />
            {ACTION[selected.status] && (
              <View style={{ marginTop: 12 }}>
                <ModalButton label={`Review: ${ACTION[selected.status]}`} onPress={() => setConfirming(true)} />
              </View>
            )}
          </View>
        )}
        {selected && confirming && ACTION[selected.status] && (
          <ConfirmBlock
            title={`${ACTION[selected.status]} this order?`}
            rows={[
              ['Order', `${selected.guestName || 'Guest'} · R${selected.totalAmount ?? '—'}`],
              ['Current state', selected.status.replace('_', ' ')],
              ['Next state', NEXT_STATE[selected.status] || '—'],
              ['Actor', 'You (recorded as assignee where applicable)'],
            ]}
            warning={selected.status === 'picked_up' ? 'Delivery writes the receipt — this is the point of no return.' : undefined}
            confirmLabel={ACTION[selected.status] || 'Confirm'}
            onConfirm={advance} onCancel={() => setConfirming(false)} busy={busyId === selected.id}
          />
        )}
      </DetailModal>
      <View style={{ height: 40 }} />
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  chips: { marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { color: theme.colors.text, fontWeight: '700', flex: 1 },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  review: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 6 },
  empty: { alignItems: 'center', padding: 24, gap: 8 },
});