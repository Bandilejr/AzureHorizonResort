import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Modal,
  Alert
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Firebase Imports
import { auth, rtdb } from '../../services/firebase-services';
import { ref, onValue, off } from 'firebase/database';

interface FoodOrder {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber?: string;
  tableNumber?: number;
  orderType: 'dine_in' | 'takeaway' | 'room_delivery';
  items: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  status: 'pending' | 'preparing' | 'ready' | 'picked_up' | 'delivered';
  createdAt: string;
}

export default function MyOrdersScreen() {
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  
  const [selectedOrder, setSelectedOrder] = useState<FoodOrder | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);

  const user = auth.currentUser;

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
      case 'pending': return { text: 'Pending', color: '#d97706', bg: '#fef3c7', icon: 'time', progress: '25%' };
      case 'preparing': return { text: 'Preparing', color: '#2563eb', bg: '#dbeafe', icon: 'restaurant', progress: '50%' };
      case 'ready': return { text: 'Ready for Pickup', color: '#16a34a', bg: '#dcfce3', icon: 'checkmark-circle', progress: '75%' };
      case 'picked_up': return { text: 'Out for Delivery', color: '#9333ea', bg: '#f3e8ff', icon: 'bicycle', progress: '90%' };
      case 'delivered': return { text: 'Delivered', color: '#475569', bg: '#f1f5f9', icon: 'checkmark-done-circle', progress: '100%' };
      default: return { text: status, color: '#475569', bg: '#f1f5f9', icon: 'cube', progress: '0%' };
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

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#1e3a5f" />
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
          <ActivityIndicator size="large" color="#1e3a5f" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {displayOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={60} color="#cbd5e1" />
              <Text style={styles.emptyStateText}>
                No {activeTab} orders found.
              </Text>
            </View>
          ) : (
            displayOrders.map((order) => {
              const config = getStatusConfig(order.status);
              const orderDate = new Date(order.createdAt);
              
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
                      <Ionicons name={getOrderTypeIcon(order.orderType) as any} size={16} color="#64748b" />
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
                      <Text style={styles.dateText}>{orderDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
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
                    <Ionicons name="close-circle" size={28} color="#94a3b8" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.orderMetaBox}>
                    <View style={styles.metaRow}>
                      <Ionicons name={getOrderTypeIcon(selectedOrder.orderType) as any} size={18} color="#1e3a5f" />
                      <Text style={styles.metaText}>
                        {selectedOrder.orderType.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                    {selectedOrder.roomNumber && (
                      <Text style={styles.metaDetail}>Deliver to Room: {selectedOrder.roomNumber}</Text>
                    )}
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
                      <Ionicons name="mail-outline" size={20} color="#1e3a5f" style={{ marginRight: 8 }} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
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
    color: '#1e3a5f',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b', 
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#e2e8f0',
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
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  activeTabText: {
    color: '#1e3a5f',
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
    color: '#94a3b8',
    fontSize: 16,
    marginTop: 12,
  },
  orderCard: {
    backgroundColor: '#fff',
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
    color: '#475569',
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
    backgroundColor: '#f8fafc',
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
    backgroundColor: '#e2e8f0',
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
    color: '#94a3b8',
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  itemsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  dateText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  priceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e3a5f',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#fff',
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
    color: '#0f172a',
  },
  sheetSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
    letterSpacing: 1,
  },
  orderMetaBox: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#1e3a5f',
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
    color: '#1e3a5f',
  },
  metaDetail: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
    marginLeft: 26,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 12,
  },
  receiptContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    color: '#334155',
    flex: 1,
  },
  receiptItemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
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
    color: '#0f172a',
  },
  receiptTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e3a5f',
  },
  actionButtons: {
    paddingBottom: 20,
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 16,
    borderRadius: 12,
  },
  emailButtonText: {
    color: '#1e3a5f',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
