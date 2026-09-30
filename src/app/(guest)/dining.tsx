import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  TextInput,
  ActivityIndicator,
  Image,
  Modal,
  Alert
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ListSkeleton } from '@/components/ui/states';

// Firebase Imports
import { auth, db, rtdb } from '../../services/firebase-services';
import { ref, onValue, push, set } from 'firebase/database';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';

// ==========================================
// ⚠️ LOCAL IMAGE MAP FOR REACT NATIVE
// React Native cannot load local images from dynamic strings.
// You must map the image names from your database to your local require() paths here:
// ==========================================
// ==========================================
// ⚠️ LOCAL IMAGE MAP FOR REACT NATIVE
// ==========================================
const localMenuImages: Record<string, any> = {
  'beer.jpg': require('../../../assets/images/food/beer.jpg'),
  'bruschetta.jpg': require('../../../assets/images/food/bruschetta.jpg'),
  'cabernet.jpg': require('../../../assets/images/food/cabernet.jpg'),
  'calamari-fritti.jpg': require('../../../assets/images/food/calamari-fritti.jpg'),
  'charcuterie.jpg': require('../../../assets/images/food/charcuterie.jpg'),
  'chocolate-lava-cake.jpg': require('../../../assets/images/food/chocolate-lava-cake.jpg'),
  'coconut.jpg': require('../../../assets/images/food/coconut.jpg'),
  'creme-brulee.jpg': require('../../../assets/images/food/creme-brulee.jpg'),
  'grilled-lobster.jpg': require('../../../assets/images/food/grilled-lobster.jpg'),
  'lamb-chops.jpg': require('../../../assets/images/food/lamb-chops.jpg'),
  'mushroom-risotto.jpg': require('../../../assets/images/food/mushroom-risotto.jpg'),
  'oysters-rockefeller.jpg': require('../../../assets/images/food/oysters-rockefeller.jpg'),
  'paella.jpg': require('../../../assets/images/food/paella.jpg'),
  'sauvignon.jpg': require('../../../assets/images/food/sauvignon.jpg'),
  'signature-cocktail.jpg': require('../../../assets/images/food/signature-cocktail.jpg'),
  'sorbet.jpg': require('../../../assets/images/food/sorbet.jpg'),
  'tiramisu.jpg': require('../../../assets/images/food/tiramisu.jpg'),
  'tuna-tartare.jpg': require('../../../assets/images/food/tuna-tartare.jpg'),
  'wagyu-steak.jpg': require('../../../assets/images/food/wagyu-steak.jpg'),
  'wellington.jpg': require('../../../assets/images/food/wellington.jpg'),
  
  // Using coconut.jpg as a guaranteed safe fallback to prevent crashes!
  'placeholder': require('../../../assets/images/food/coconut.jpg'), 
};

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  image?: string;
}

// EXPANDED FILTER LOGIC: Looks for more keywords to ensure items don't disappear
const getDietaryTags = (name: string, description: string = ''): string[] => {
  const text = (name + ' ' + description).toLowerCase();
  const tags: string[] = [];
  
  if (text.includes('vegan') || text.includes('plant') || text.includes('tofu')) tags.push('vegan');
  if (text.includes('veg') || text.includes('cheese') || text.includes('salad') || text.includes('mushroom') || tags.includes('vegan')) tags.push('vegetarian');
  if (text.includes('gluten-free') || text.includes('gf') || text.includes('rice') || text.includes('corn')) tags.push('gluten-free');
  if (text.includes('halal') || text.includes('chicken') || text.includes('beef') || text.includes('lamb') || text.includes('fish')) tags.push('halal');
  
  return [...new Set(tags)];
};

export default function DiningScreen() {
  const [menu, setMenu] = useState<{ [key: string]: MenuItem[] }>({});
  const [cart, setCart] = useState<(MenuItem & { quantity: number })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dietaryFilter, setDietaryFilter] = useState<string>('all');
  
  // Modals
  const [showCart, setShowCart] = useState(false);
  const [showTableBooking, setShowTableBooking] = useState(false);
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'room_delivery'>('dine_in');
  
  // Table Booking State
  const [tableReservation, setTableReservation] = useState({ date: '', time: '', partySize: 2, specialRequests: '' });
  const [hasActiveReservation, setHasActiveReservation] = useState(false);
  const [activeReservation, setActiveReservation] = useState<any>(null);

  const user = auth.currentUser;

  const theme = useAppTheme();
  const styles = createStyles(theme);
  
  useEffect(() => {
    // 1. Fetch Menu from RTDB
    const menuRef = ref(rtdb, 'menu');
    const unsubscribe = onValue(menuRef, (snapshot) => {
      if (snapshot.exists()) {
        setMenu(snapshot.val());
      }
      setIsLoading(false);
    });

    // 2. Fetch Active Reservations from Firestore
    const fetchReservation = async () => {
      if (!user) return;
      try {
        const today = new Date().toISOString().split('T')[0];
        const q = query(
          collection(db, 'table_reservations'), 
          where('guestId', '==', user.uid),
          where('status', '==', 'confirmed'),
          where('date', '>=', today)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const res = snapshot.docs[0].data();
          setHasActiveReservation(true);
          setActiveReservation({ id: snapshot.docs[0].id, ...res });
        }
      } catch (error) {
        console.error("Error loading reservation:", error);
      }
    };

    fetchReservation();
    return () => unsubscribe();
  }, [user]);

  // Cart Functions
  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = Math.max(0, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const getCartTotal = () => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalWithTax = parseFloat((getCartTotal() * 1.1).toFixed(2));

  // Table Booking Logic
  const handleBookTable = async () => {
    if (!tableReservation.date || !tableReservation.time || !user) {
      Alert.alert("Missing Info", "Please select date and time.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const newReservation = {
        guestId: user.uid,
        guestName: user.displayName || 'Guest',
        date: tableReservation.date,
        time: tableReservation.time,
        partySize: tableReservation.partySize,
        specialRequests: tableReservation.specialRequests,
        status: 'confirmed',
        tableNumber: Math.floor(Math.random() * 20) + 1, 
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'table_reservations'), newReservation);
      setHasActiveReservation(true);
      setActiveReservation({ id: docRef.id, ...newReservation });
      setShowTableBooking(false);
      Alert.alert("Success", "Table reserved successfully!");
    } catch (error) {
      Alert.alert("Error", "Failed to book table.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Order Submission
  const handlePlaceOrder = async () => {
    if (cart.length === 0 || !user) return;
    
    if (orderType === 'dine_in' && !hasActiveReservation) {
      setShowCart(false);
      setShowTableBooking(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const liveOrderRef = push(ref(rtdb, 'orders'));
      await set(liveOrderRef, {
        guestId: user.uid,
        guestName: user.displayName || 'Guest',
        items: cart.map(item => ({ name: item.name, quantity: item.quantity, price: item.price })),
        orderType: orderType,
        status: 'pending',
        totalAmount: totalWithTax,
        timestamp: Date.now()
      });

      setCart([]);
      setShowCart(false);
      setShowOrderSuccess(true);
    } catch (err) {
      Alert.alert("Error", "Failed to place order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to extract filename and fetch local image
  const resolveImageSource = (imagePath?: string) => {
    if (!imagePath) return localMenuImages['placeholder'];
    if (imagePath.startsWith('http')) return { uri: imagePath };
    
    // Extract filename if it includes paths (e.g. "assets/burger.png" -> "burger.png")
    const filename = imagePath.split('/').pop() || 'placeholder';
    return localMenuImages[filename] || localMenuImages['placeholder'];
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingHorizontal: 20 }]}>
        <ListSkeleton rows={3} style={{ width: '100%' }} />
        <Text style={styles.loadingText}>Loading Menu...</Text>
      </View>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.secondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>The Ocean Grill</Text>
          <Text style={styles.headerSubtitle}>Fine Dining & Room Service</Text>
        </View>
        <TouchableOpacity style={styles.cartIconContainer} onPress={() => setShowCart(true)}>
          <Ionicons name="cart-outline" size={26} color={theme.colors.secondary} />
          {cart.length > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cart.reduce((a, b) => a + b.quantity, 0)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* ORDER TYPE SELECTOR */}
        <View style={styles.orderTypeContainer}>
          {[
            { id: 'dine_in', label: 'Dine In', icon: 'restaurant' },
            { id: 'takeaway', label: 'Takeaway', icon: 'bag-handle' },
            { id: 'room_delivery', label: 'Delivery', icon: 'bed' }
          ].map((type) => (
            <TouchableOpacity 
              key={type.id}
              style={[styles.typeButton, orderType === type.id && styles.typeButtonActive]}
              onPress={() => setOrderType(type.id as any)}
            >
              <Ionicons 
                name={type.icon as any} 
                size={18} 
                color={orderType === type.id ? theme.colors.textInverse : theme.colors.textMuted} 
              />
              <Text style={[styles.typeButtonText, orderType === type.id && styles.typeButtonTextActive]}>
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ACTIVE RESERVATION WIDGET */}
        {hasActiveReservation && activeReservation && (
          <View style={styles.reservationWidget}>
            <View style={styles.reservationIcon}>
              <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />
            </View>
            <View style={styles.reservationInfo}>
              <Text style={styles.reservationTitle}>Table Reserved</Text>
              <Text style={styles.reservationDetails}>
                Table {activeReservation.tableNumber} • {activeReservation.date} • {activeReservation.time}
              </Text>
            </View>
          </View>
        )}

        {/* DIETARY FILTERS */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {['all', 'vegan', 'vegetarian', 'gluten-free', 'halal'].map(filter => (
            <TouchableOpacity 
              key={filter}
              style={[styles.filterPill, dietaryFilter === filter && styles.filterPillActive]}
              onPress={() => setDietaryFilter(filter)}
            >
              <Text style={[styles.filterText, dietaryFilter === filter && styles.filterTextActive]}>
                {filter.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* MENU ITEMS */}
        {Object.entries(menu).map(([category, items]) => {
          const filteredItems = items.filter(item => {
            if (dietaryFilter === 'all') return true;
            return getDietaryTags(item.name, item.description).includes(dietaryFilter);
          });

          if (filteredItems.length === 0) return null;

          return (
            <View key={category} style={styles.categorySection}>
              <Text style={styles.categoryTitle}>{category}</Text>
              {filteredItems.map(item => {
                const tags = getDietaryTags(item.name, item.description);
                return (
                  <View key={item.id} style={styles.menuCard}>
                    {/* IMPLEMENTED IMAGE FIX */}
                    <Image source={resolveImageSource(item.image)} style={styles.menuImage} />
                    
                    <View style={styles.menuDetails}>
                      <Text style={styles.menuName}>{item.name}</Text>
                      {tags.length > 0 && (
                        <View style={styles.tagsContainer}>
                          {tags.map(t => (
                            <View key={t} style={styles.tagBadge}>
                              <Text style={styles.tagText}>{t}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <Text style={styles.menuDesc} numberOfLines={2}>{item.description}</Text>
                      <View style={styles.menuFooter}>
                        <Text style={styles.menuPrice}>R {item.price}</Text>
                        <TouchableOpacity style={styles.addButton} onPress={() => addToCart(item)}>
                          <Ionicons name="add" size={20} color={theme.colors.textInverse} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
        {Object.keys(menu).length === 0 && (
          <EmptyState icon="restaurant-outline" title="Menu unavailable" message="The dining menu could not be loaded right now. Please try again later." />
        )}
      </ScrollView>

      {/* CART MODAL (BOTTOM SHEET STYLE) */}
      <Modal visible={showCart} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Your Order</Text>
              <TouchableOpacity onPress={() => setShowCart(false)}>
                <Ionicons name="close-circle" size={28} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.cartItemsScroll}>
              {cart.length === 0 ? (
                <Text style={styles.emptyCartText}>Your basket is empty.</Text>
              ) : (
                cart.map(item => (
                  <View key={item.id} style={styles.cartItem}>
                    <View style={styles.cartItemInfo}>
                      <Text style={styles.cartItemName}>{item.name}</Text>
                      <Text style={styles.cartItemPrice}>R {item.price * item.quantity}</Text>
                    </View>
                    <View style={styles.quantityControls}>
                      <TouchableOpacity onPress={() => updateQuantity(item.id, -1)} style={styles.qtyBtn}>
<Ionicons name="remove" size={18} color={theme.colors.secondary} />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <TouchableOpacity onPress={() => updateQuantity(item.id, 1)} style={styles.qtyBtn}>
                          <Ionicons name="add" size={18} color={theme.colors.secondary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {cart.length > 0 && (
              <View style={styles.cartFooter}>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Subtotal</Text>
                  <Text style={styles.totalsValue}>R {getCartTotal().toFixed(2)}</Text>
                </View>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Service Fee & Tax (10%)</Text>
                  <Text style={styles.totalsValue}>R {(getCartTotal() * 0.1).toFixed(2)}</Text>
                </View>
                <View style={[styles.totalsRow, styles.grandTotalRow]}>
                  <Text style={styles.grandTotalLabel}>Grand Total</Text>
                  <Text style={styles.grandTotalValue}>R {totalWithTax}</Text>
                </View>
                
                <TouchableOpacity 
                  style={styles.checkoutButton} 
                  onPress={handlePlaceOrder}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={theme.colors.textInverse} />
                  ) : (
                    <Text style={styles.checkoutButtonText}>
                      {orderType === 'dine_in' && !hasActiveReservation ? 'Reserve Table to Continue' : 'Confirm Order'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* TABLE BOOKING MODAL */}
      <Modal visible={showTableBooking} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.centerModal}>
            <Text style={styles.modalTitle}>Reserve a Table</Text>
            
            <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. 2026-10-15"
              placeholderTextColor={theme.colors.textMuted}
              value={tableReservation.date}
              onChangeText={(t) => setTableReservation({...tableReservation, date: t})}
            />
            
            <Text style={styles.inputLabel}>Time (e.g. 18:00)</Text>
            <TextInput 
              style={styles.input} 
              placeholder="17:00 - 22:00"
              placeholderTextColor={theme.colors.textMuted}
              value={tableReservation.time}
              onChangeText={(t) => setTableReservation({...tableReservation, time: t})}
            />
            
            <Text style={styles.inputLabel}>Party Size</Text>
            <TextInput 
              style={styles.input} 
              keyboardType="number-pad"
              placeholderTextColor={theme.colors.textMuted}
              value={tableReservation.partySize.toString()}
              onChangeText={(t) => setTableReservation({...tableReservation, partySize: parseInt(t) || 1})}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTableBooking(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleBookTable}>
                {isSubmitting ? <ActivityIndicator color={theme.colors.textInverse}/> : <Text style={styles.confirmBtnText}>Book Now</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ORDER SUCCESS MODAL */}
      <Modal visible={showOrderSuccess} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.successModal}>
            <Ionicons name="checkmark-circle" size={60} color={theme.colors.success} />
            <Text style={styles.successTitle}>Order Sent to Kitchen!</Text>
            <Text style={styles.successText}>
              Your {orderType.replace('_', ' ')} order is being prepared. 
              {orderType === 'room_delivery' ? ' It will be delivered shortly.' : ' We will bring it to your table.'}
            </Text>
            <TouchableOpacity style={styles.successBtn} onPress={() => setShowOrderSuccess(false)}>
              <Text style={styles.successBtnText}>View Receipt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </Screen>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: theme.colors.textMuted,
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
  cartIconContainer: {
    position: 'relative',
    padding: 4,
  },
  cartBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    color: theme.colors.textInverse,
    fontSize: 10,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  orderTypeContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.border,
    margin: 16,
    borderRadius: 12,
    padding: 4,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  typeButtonActive: {
    backgroundColor: theme.colors.secondary,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  typeButtonTextActive: {
    color: theme.colors.textInverse,
  },
  reservationWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.successLight,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  reservationIcon: {
    marginRight: 12,
  },
  reservationInfo: {
    flex: 1,
  },
  reservationTitle: {
    color: theme.colors.success,
    fontWeight: 'bold',
    fontSize: 14,
  },
  reservationDetails: {
    color: theme.colors.success,
    fontSize: 12,
    marginTop: 2,
  },
  filterScroll: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterPillActive: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  filterTextActive: {
    color: theme.colors.textInverse,
  },
  categorySection: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  menuCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  menuImage: {
    width: 100,
    height: '100%',
    backgroundColor: theme.colors.border,
  },
  menuDetails: {
    flex: 1,
    padding: 12,
  },
  menuName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  tagBadge: {
    backgroundColor: theme.colors.surfaceVariant,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    color: theme.colors.success,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  menuDesc: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 12,
  },
  menuFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
  },
  menuPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  addButton: {
    backgroundColor: theme.colors.secondary,
    padding: 6,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  bottomSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '50%',
    maxHeight: '80%',
    padding: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  cartItemsScroll: {
    maxHeight: 250,
    marginVertical: 10,
  },
  emptyCartText: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    marginTop: 40,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  cartItemPrice: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
  },
  qtyBtn: {
    padding: 6,
  },
  qtyText: {
    width: 24,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  cartFooter: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 16,
    marginTop: 16,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalsLabel: {
    color: theme.colors.textMuted,
  },
  totalsValue: {
    color: theme.colors.text,
  },
  grandTotalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  checkoutButton: {
    backgroundColor: theme.colors.secondary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  checkoutButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  centerModal: {
    backgroundColor: theme.colors.surface,
    width: '100%',
    padding: 24,
    borderRadius: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceVariant,
  },
  cancelBtnText: {
    color: theme.colors.textMuted,
    fontWeight: 'bold',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: theme.colors.secondary,
  },
  confirmBtnText: {
    color: theme.colors.textInverse,
    fontWeight: 'bold',
  },
  successModal: {
    backgroundColor: theme.colors.surface,
    width: '100%',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  successText: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    marginBottom: 24,
    lineHeight: 22,
  },
  successBtn: {
    backgroundColor: theme.colors.primary,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  successBtnText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  }
});
