import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Firebase Imports
import { auth, db, rtdb } from '../../services/firebase-services';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ref, get } from 'firebase/database';

export default function BillingScreen() {
  const [isLoading, setIsLoading] = useState(true);
  
  // Data States
  const [roomCharges, setRoomCharges] = useState(0);
  const [diningTotal, setDiningTotal] = useState(0);
  const [spaTotal, setSpaTotal] = useState(0);
  const [toursTotal, setToursTotal] = useState(0);
  
  const user = auth.currentUser;

  // Base Room Rate (Simulated for presentation purposes)
  const nightlyRate = 3500;
  const nightsStayed = 3;
  const baseRoomTotal = nightlyRate * nightsStayed;

  useEffect(() => {
    if (!user) return;
    fetchGuestCharges();
  }, [user]);

  const fetchGuestCharges = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Spa Bookings
      const spaQuery = query(collection(db, 'spa_bookings'), where('guestId', '==', user?.uid));
      const spaDocs = await getDocs(spaQuery);
      let spaSum = 0;
      spaDocs.forEach(doc => { spaSum += doc.data().price || 0; });
      setSpaTotal(spaSum);

      // 2. Fetch Tour Bookings
      const toursQuery = query(collection(db, 'tour_bookings'), where('guestId', '==', user?.uid));
      const toursDocs = await getDocs(toursQuery);
      let toursSum = 0;
      toursDocs.forEach(doc => { toursSum += doc.data().totalAmount || 0; });
      setToursTotal(toursSum);

      // 3. Fetch Dining Orders from RTDB
      const ordersRef = ref(rtdb, 'orders');
      const snapshot = await get(ordersRef);
      let diningSum = 0;
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach(key => {
          if (data[key].guestId === user?.uid) {
            diningSum += data[key].totalAmount || 0;
          }
        });
      }
      setDiningTotal(diningSum);
      
      // Calculate Room Charges (Base + Extras)
      setRoomCharges(baseRoomTotal);

    } catch (error) {
      console.error("Error fetching billing data:", error);
    } finally {
      setIsLoading(false);
    }
  };

const grandTotal = roomCharges + diningTotal + spaTotal + toursTotal;
  const taxAmount = grandTotal * 0.15; // Assuming 15% VAT
  const subTotal = grandTotal - taxAmount;

  const handleDigitalCheckout = () => {
    Alert.alert(
      "Confirm Checkout",
      `Are you ready to checkout and settle your balance of R ${grandTotal.toLocaleString()}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Proceed to Payment", 
          onPress: () => router.push({
            pathname: '/payment',
            params: { 
              roomName: 'Grand Resort Folio',
              total: grandTotal, 
              depositAmount: grandTotal 
            }
          } as any)
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1e3a5f" />
        <Text style={styles.loadingText}>Compiling your folio...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#1e3a5f" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Folio</Text>
          <Text style={styles.headerSubtitle}>Current Balance</Text>
        </View>
        <TouchableOpacity onPress={fetchGuestCharges} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={24} color="#1e3a5f" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* TOTAL BALANCE CARD */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Outstanding</Text>
          <Text style={styles.balanceAmount}>R {grandTotal.toLocaleString()}</Text>
          <View style={styles.guestInfoRow}>
            <Ionicons name="person-circle-outline" size={16} color="#94a3b8" />
            <Text style={styles.guestInfoText}>{user?.displayName || 'Guest'}</Text>
            <Text style={styles.guestInfoDot}>•</Text>
            <Text style={styles.guestInfoText}>Room 312</Text>
          </View>
        </View>

        {/* ITEMIZED CHARGES */}
        <Text style={styles.sectionTitle}>Itemized Charges</Text>
        
        <View style={styles.receiptContainer}>
          
          {/* Room Base */}
          <View style={styles.receiptRow}>
            <View style={styles.receiptItemLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#e0e7ff' }]}>
                <Ionicons name="bed" size={18} color="#4f46e5" />
              </View>
              <View>
                <Text style={styles.itemName}>Accommodation</Text>
                <Text style={styles.itemDesc}>{nightsStayed} Nights @ R{nightlyRate}</Text>
              </View>
            </View>
            <Text style={styles.itemPrice}>R {baseRoomTotal.toLocaleString()}</Text>
          </View>

          {/* Dining */}
          <View style={styles.receiptRow}>
            <View style={styles.receiptItemLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#fee2e2' }]}>
                <Ionicons name="restaurant" size={18} color="#e11d48" />
              </View>
              <View>
                <Text style={styles.itemName}>Dining & Room Service</Text>
                <Text style={styles.itemDesc}>Food & Beverages</Text>
              </View>
            </View>
            <Text style={styles.itemPrice}>R {diningTotal.toLocaleString()}</Text>
          </View>

          {/* Spa */}
          <View style={styles.receiptRow}>
            <View style={styles.receiptItemLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#dcfce3' }]}>
                <Ionicons name="leaf" size={18} color="#16a34a" />
              </View>
              <View>
                <Text style={styles.itemName}>Horizon Spa</Text>
                <Text style={styles.itemDesc}>Wellness Treatments</Text>
              </View>
            </View>
            <Text style={styles.itemPrice}>R {spaTotal.toLocaleString()}</Text>
          </View>

          {/* Tours */}
          <View style={styles.receiptRow}>
            <View style={styles.receiptItemLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="compass" size={18} color="#d97706" />
              </View>
              <View>
                <Text style={styles.itemName}>Excursions</Text>
                <Text style={styles.itemDesc}>Island Tours & Activities</Text>
              </View>
            </View>
            <Text style={styles.itemPrice}>R {toursTotal.toLocaleString()}</Text>
          </View>

          {/* TAX BREAKDOWN */}
          <View style={styles.divider} />
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>R {subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>VAT (15%)</Text>
            <Text style={styles.summaryValue}>R {taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
        </View>

      </ScrollView>

      {/* CHECKOUT FOOTER */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.checkoutBtn} onPress={handleDigitalCheckout}>
          <Ionicons name="card" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.checkoutBtnText}>Settle & Checkout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 16,
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
  refreshBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  balanceCard: {
    backgroundColor: '#1e3a5f',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#1e3a5f',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  balanceLabel: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  guestInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  guestInfoText: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  guestInfoDot: {
    color: '#64748b',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
    marginLeft: 4,
  },
  receiptContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  receiptItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 2,
  },
  itemDesc: {
    fontSize: 12,
    color: '#64748b',
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e3a5f',
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  summaryValue: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  checkoutBtn: {
    backgroundColor: '#e8aa42',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  checkoutBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
