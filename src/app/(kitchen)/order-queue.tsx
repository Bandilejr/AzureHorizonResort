// (kitchen) Order queue — live RTDB orders. Batch F: rebuilt on the design
// system; card → full-screen ORDER DETAIL → CONFIRM (next state + actor) →
// advance with per-order busy + failure feedback. listenKitchenOrders and
// advanceOrder are unchanged.
import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { usePermissions } from '@/context/PermissionsContext';
import { listenKitchenOrders, advanceOrder, type KitchenOrder, type OrderStatus } from '@/services/order-queue';
import { useAppTheme } from '@/design/use-app-theme';
import { CustomAlertModal, type AlertConfig } from '@/components/CustomAlertModal';
import { Screen, PageHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState, ListSkeleton, ErrorState } from '@/components/ui/states';
import { AppText } from '@/components/ui/text';
import { DetailScreen } from '@/components/ui/detail-screen';
import { ConfirmBlock, KV, ModalButton, SectionTitle, LiveErrorBanner } from '@/components/detail-kit';

const FILTERS: ('all' | OrderStatus)[] = ['all', 'pending', 'preparing', 'ready', 'picked_up', 'delivered'];
const ACTION: Partial<Record<OrderStatus, string>> = {
  pending: 'Claim', preparing: 'Mark ready', ready: 'Pick up', picked_up: 'Deliver',
};
const NEXT_STATE: Partial<Record<OrderStatus, string>> = {
  pending: 'preparing (you own it)', preparing: 'ready', ready: 'picked up (you carry it)', picked_up: 'delivered (+ receipt)',
};

export default function OrderQueueScreen() {
  const theme = useAppTheme();
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
      <Screen scroll>
        <PageHeader title="Order queue" showBack fallback="/(kitchen)/dashboard" />
        <EmptyState icon="lock-closed-outline" title="Restricted" message="Your role cannot work orders." />
      </Screen>
    );
  }

  const visible = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  return (
    <Screen scroll>
      <PageHeader title={`Order queue (${orders.filter((o) => o.status !== 'delivered').length} open)`} subtitle="Live kitchen orders" showBack fallback="/(kitchen)/dashboard" />
      <LiveErrorBanner error={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginBottom: theme.space.md }}>
        {FILTERS.map((f) => {
          const on = filter === f;
          return (
            <TouchableOpacity key={f} onPress={() => setFilter(f)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ borderWidth: 1, borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primary : theme.colors.surface, borderRadius: theme.radius.pill, paddingVertical: 6, paddingHorizontal: 12 }}>
              <AppText variant="caption" color={on ? theme.colors.textInverse : theme.colors.textMuted} weight="600">{f.replace('_', ' ')}</AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : loadError && orders.length === 0 ? (
        <ErrorState title="Couldn't load orders" message="The order queue is unavailable right now." details={loadError} onRetry={() => { setLoadError(''); setRetryKey((k) => k + 1); }} />
      ) : visible.length === 0 ? (
        <EmptyState icon="receipt-outline" title="No orders here" message="Orders matching this filter will appear here." />
      ) : (
        <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
          {visible.map((o, i) => (
            <View key={o.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
              <ListRow
                title={`${o.guestName || 'Guest'}${o.roomNumber ? ` · Room ${o.roomNumber}` : ''}${o.tableNumber ? ` · Table ${o.tableNumber}` : ''}`}
                subtitle={`${(o.items || []).map((it) => `${it.quantity}× ${it.name}`).join(', ') || '—'} · R${o.totalAmount ?? '—'}`}
                status={<StatusPill status={o.status} size="sm" />}
                onPress={() => { setSelected(o); setConfirming(false); }}
              />
            </View>
          ))}
        </Card>
      )}

      <DetailScreen
        visible={selected !== null}
        title={selected ? `Order · ${selected.guestName || 'Guest'}` : 'Order'}
        subtitle={selected ? selected.status.replace('_', ' ') : undefined}
        status={selected ? <StatusPill status={selected.status} /> : undefined}
        onClose={() => setSelected(null)}
      >
        {selected && !confirming ? (
          <View>
            <SectionTitle>CUSTOMER / CONTEXT</SectionTitle>
            <KV label="Guest" value={selected.guestName || '—'} />
            <KV label="Room" value={selected.roomNumber || '—'} />
            <KV label="Table" value={selected.tableNumber || '—'} />
            <KV label="Type" value={selected.orderType || '—'} />
            <KV label="Placed" value={selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'} />
            <SectionTitle>ITEMS</SectionTitle>
            {(selected.items || []).length === 0 ? <AppText variant="body" tone="muted">No line items.</AppText> : null}
            {(selected.items || []).map((it, idx) => (
              <KV key={idx} label={`${it.quantity}× ${it.name}`} value={it.price != null ? `R${it.price}` : '—'} />
            ))}
            <KV label="Total" value={`R${selected.totalAmount ?? '—'}`} />
            <SectionTitle>STATE</SectionTitle>
            <KV label="Current" value={selected.status.replace('_', ' ')} />
            <KV label="Handled by" value={selected.assignedTo || 'Unassigned'} />
            {ACTION[selected.status] ? (
              <View style={{ marginTop: theme.space.md }}>
                <ModalButton label={`Review: ${ACTION[selected.status]}`} onPress={() => setConfirming(true)} />
              </View>
            ) : null}
          </View>
        ) : null}
        {selected && confirming && ACTION[selected.status] ? (
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
        ) : null}
      </DetailScreen>
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((p) => ({ ...p, visible: false }))} />
    </Screen>
  );
}
