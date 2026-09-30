import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Modal,
  Alert,
  useColorScheme
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '@/constants/theme';

// Firebase Imports
import { auth, rtdb } from '../../services/firebase-services';
import { ref, onValue, off } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase-services';

interface FoodOrder {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber?: string;
  tableNumber?: number;
  orderType: 'dine_in' | 'takeaway' | 'room_delivery';
  items: { name: string; quantity: number; price: number }[];
  totalAmount: number;
  status: 'pending' | 'preparing' | 'ready' | 'picked_up' | 'delivered';
  createdAt: string;
  timestamp?: number;
}

export default function MyOrdersScreen() {
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  
  const [selectedOrder, setSelectedOrder] = useState<FoodOrder | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [userRoomNumber, setUserRoomNumber] = useState<string | null>(null);

  const user = auth.currentUser;

  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  useEffect(() => {
    if (!user) return;
    const fetchRoom = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserRoomNumber(data.roomNumber || null);
        }
      } catch (e) {
        // fall back silently
      }
    };
    fetchRoom();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const ordersRef = ref(rtdb, 'orders');
    
    const handleOrders = (snapshot: any) => {
      const data = snapshot.val();
      if (data) {
        const allOrders = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })) as FoodOrder[];
        
        const userOrders = allOrders.filter(order => order.guestId === user.uid);
        // Sort newest first
        userOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(userOrders);
      } else {
        setOrders([]);
      }
      setIsLoading(false);
    };

    onValue(ordersRef, handleOrders);
    
    return () => {
      off(ordersRef);
    };
  }, [user]);

  const pendingOrders = orders.filter(o => ['pending', 'preparing', 'ready', 'picked_up'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'delivered');

  const displayOrders = activeTab === 'active' ? pendingOrders : completedOrders;

  const handleSimulateEmailReceipt = () => {
    Alert.alert(
      "Receipt Sent", 
      `A detailed receipt for Order #${selectedOrder?.id.slice(-8).toUpperCase()} has been sent to your registered email address.`
    );
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending': return { text: 'Pending', color: theme.colors.warning, bg: theme.colors.warningLight, icon: 'time', progress: '25%' };
      case 'preparing': return { text: 'Preparing', color: theme.colors.info, bg: theme.colors.infoLight, icon: 'restaurant', progress: '50%' };
      case 'ready': return { text: 'Ready for Pickup', color: theme.colors.success, bg: theme.colors.successLight, icon: 'checkmark-circle', progress: '75%' };
      case 'picked_up': return { text: 'Out for Delivery', color: theme.colors.secondary, bg: theme.colors.surfaceVariant, icon: 'bicycle', progress: '90%' };
      case 'delivered': return { text: 'Delivered', color: theme.colors.textSecondary, bg: theme.colors.surfaceVariant, icon: 'checkmark-done-circle', progress: '100%' };
      default: return { text: status, color: theme.colors.textSecondary, bg: theme.colors.surfaceVariant, icon: 'cube', progress: '0%' };
    }
  };

  const getOrderTypeIcon = (type: string) => {
    switch (type) {
      case 'dine_in': return 'restaurant-outline';
      case 'takeaway': return 'bag-handle-outline';
      case 'room_delivery': return 'home-outline';
      default: return 'fast-food-outline';
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Ionicons name="lock-closed-outline" size={64} color="#c9a227" />
        <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text, marginTop: 16, textAlign: 'center' }}>
          My Orders Locked
        </Text>
        <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          Order tracking and history are reserved for checked-in resort residents. Please sign in to your room stay.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginTop: 24 }}
          onPress={() => router.push('/login')}
        >
          <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>Sign In to Your Stay</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Orders</Text>
          <Text style={styles.headerSubtitle}>Real-time Tracker</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* CUSTOM NATIVE TABS */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'active' && styles.activeTab]}
          onPress={() => setActiveTab('active')}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>
            Active ({pendingOrders.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.tabText, activeTab === 'completed' && styles.activeTabText]}>
            Completed ({completedOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ORDER LIST */}
      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {displayOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={60} color={theme.colors.textMuted} />
              <Text style={styles.emptyStateText}>
                No {activeTab} orders found.
              </Text>
            </View>
          ) : (
            displayOrders.map((order) => {
              const config = getStatusConfig(order.status);
              const orderDate = new Date((order.createdAt || order.timestamp || '') as string | number);
              
              return (
                <TouchableOpacity 
                  key={order.id} 
                  style={styles.orderCard}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedOrder(order);
                    setShowOrderDetails(true);
                  }}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.orderTypeRow}>
                      <Ionicons name={getOrderTypeIcon(order.orderType) as any} size={16} color={theme.colors.textMuted} />
                      <Text style={styles.orderIdText}>#{order.id.slice(-8).toUpperCase()}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: config.bg }]}>
                      <Text style={[styles.badgeText, { color: config.color }]}>{config.text}</Text>
                    </View>
                  </View>

                  {/* PROGRESS BAR */}
                  <View style={styles.progressTracker}>
                    <View style={styles.progressRow}>
                      <Ionicons name={config.icon as any} size={20} color={config.color} />
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: config.progress as any, backgroundColor: config.color }]} />
                      </View>
                    </View>
                    <View style={styles.progressLabels}>
                      <Text style={styles.progressLabelText}>Ordered</Text>
                      <Text style={styles.progressLabelText}>Preparing</Text>
                      <Text style={styles.progressLabelText}>Ready</Text>
                      <Text style={styles.progressLabelText}>Done</Text>
                    </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <View>
                      <Text style={styles.itemsText}>{order.items.length} Item(s)</Text>
                      <Text style={styles.dateText}>
                        {isNaN(orderDate.getTime()) ? 'Today' : orderDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </Text>
                    </View>
                    <Text style={styles.priceText}>R {order.totalAmount}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ORDER DETAILS MODAL (BOTTOM SHEET) */}
      <Modal visible={showOrderDetails} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            {selectedOrder && (
              <>
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetTitle}>Order Details</Text>
                    <Text style={styles.sheetSubtitle}>#{selectedOrder.id.slice(-8).toUpperCase()}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowOrderDetails(false)}>
                    <Ionicons name="close-circle" size={28} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.orderMetaBox}>
                    <View style={styles.metaRow}>
                      <Ionicons name={getOrderTypeIcon(selectedOrder.orderType) as any} size={18} color={theme.colors.text} />
                      <Text style={styles.metaText}>
                        {selectedOrder.orderType.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                    {selectedOrder.roomNumber || userRoomNumber ? (
                      <Text style={styles.metaDetail}>Deliver to Room: {selectedOrder.roomNumber || userRoomNumber}</Text>
                    ) : null}
                    {selectedOrder.tableNumber && (
                      <Text style={styles.metaDetail}>Serve at Table: {selectedOrder.tableNumber}</Text>
                    )}
                  </View>

                  <Text style={styles.sectionHeading}>Items Ordered</Text>
                  <View style={styles.receiptContainer}>
                    {selectedOrder.items.map((item, idx) => (
                      <View key={idx} style={styles.receiptRow}>
                        <Text style={styles.receiptItemName}>{item.quantity}x {item.name}</Text>
                        <Text style={styles.receiptItemPrice}>R {item.price * item.quantity}</Text>
                      </View>
                    ))}
                    <View style={styles.receiptDivider} />
                    <View style={styles.receiptTotalRow}>
                      <Text style={styles.receiptTotalLabel}>Grand Total</Text>
                      <Text style={styles.receiptTotalValue}>R {selectedOrder.totalAmount}</Text>
                    </View>
                  </View>

                  <View style={styles.actionButtons}>
                    <TouchableOpacity style={styles.emailButton} onPress={handleSimulateEmailReceipt}>
                      <Ionicons name="mail-outline" size={20} color={theme.colors.text} style={{ marginRight: 8 }} />
                      <Text style={styles.emailButtonText}>Email Receipt</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: 4,
    marginLeft: -8,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted, 
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: theme.colors.border,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  activeTabText: {
    color: theme.colors.text,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyStateText: {
    color: theme.colors.textMuted,
    fontSize: 16,
    marginTop: 12,
  },
  orderCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  orderTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderIdText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textSecondary,
    letterSpacing: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  progressTracker: {
    backgroundColor: theme.colors.surfaceVariant,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingLeft: 32, // Offset for the icon
  },
  progressLabelText: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 12,
  },
  itemsText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 2,
  },
  dateText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  priceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 2,
    letterSpacing: 1,
  },
  orderMetaBox: {
    backgroundColor: theme.colors.surfaceVariant,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  metaText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  metaDetail: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginLeft: 26,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  receiptContainer: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  receiptItemName: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  receiptItemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 12,
  },
  receiptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  receiptTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  actionButtons: {
    paddingBottom: 20,
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceVariant,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingVertical: 16,
    borderRadius: 12,
  },
  emailButtonText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  }
});
