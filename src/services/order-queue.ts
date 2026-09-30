// Staff order queue (RTDB 'orders'): same transitions as web KitchenDisplay /
// ServiceDashboard (pending→preparing→ready→picked_up→delivered). No new model.
// REMEDIATED: actor bound to auth uid (was caller-supplied, spoofable).
// NOTE: RTDB has no repo-managed rules file; writes rely on console rules —
// recorded as known limitation (final report §53).
import { auth, db, rtdb } from './firebase-services';
import { ref, onValue, off, get, update } from 'firebase/database';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled';

export interface KitchenOrder {
  id: string;
  guestId?: string;
  guestName?: string;
  roomNumber?: string;
  tableNumber?: string;
  orderType?: string;
  items?: { name: string; quantity: number; price?: number }[];
  totalAmount?: number;
  status: OrderStatus;
  assignedTo?: string | null;
  createdAt?: string;
}

export function listenKitchenOrders(cb: (orders: KitchenOrder[]) => void, onError?: (e: Error) => void) {
  const ordersRef = ref(rtdb, 'orders');
  onValue(ordersRef, (snap) => {
    const data = snap.val();
    cb(data ? Object.keys(data).map((key) => ({ id: key, ...data[key] })) as KitchenOrder[] : []);
  }, (err) => onError?.(err as Error));
  return () => off(ordersRef);
}

const NEXT: Record<string, { to: OrderStatus; extra: (uid: string) => Record<string, unknown> }> = {
  pending: { to: 'preparing', extra: (uid) => ({ assignedTo: uid, claimedAt: Date.now() }) },
  preparing: { to: 'ready', extra: () => ({ assignedTo: null }) },
  ready: { to: 'picked_up', extra: (uid) => ({ assignedTo: uid, pickedUpAt: Date.now() }) },
  picked_up: { to: 'delivered', extra: () => ({ completedAt: new Date().toISOString() }) },
};

/** Advance an order one step; guards invalid transitions by reading first. */
export async function advanceOrder(orderId: string): Promise<{ ok: boolean; message: string; to?: OrderStatus }> {
  const staffUid = auth.currentUser?.uid;
  if (!staffUid) return { ok: false, message: 'You must be signed in.' };
  const orderRef = ref(rtdb, `orders/${orderId}`);
  const snap = await get(orderRef);
  const order = snap.val() as KitchenOrder | null;
  if (!order) return { ok: false, message: 'Order not found.' };
  const step = NEXT[order.status];
  if (!step) return { ok: false, message: `Order is ${order.status} — no further action.` };
  // Claim steps must not steal an order another staffer already holds.
  if ((order.status === 'pending' || order.status === 'ready') && order.assignedTo && order.assignedTo !== staffUid)
    return { ok: false, message: 'Another staff member is already handling this order.' };
  await update(orderRef, { status: step.to, ...step.extra(staffUid) });
  if (step.to === 'delivered') {
    try {
      await addDoc(collection(db, 'receipts'), {
        orderId, guestId: order.guestId || null, guestName: order.guestName || '',
        totalAmount: order.totalAmount || 0, items: order.items || [],
        createdAt: serverTimestamp(), isoTime: new Date().toISOString(),
      });
    } catch { /* receipt best-effort; order state is authoritative */ }
  }
  return { ok: true, message: `Order ${step.to.replace('_', ' ')}.`, to: step.to };
}
