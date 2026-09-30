import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  Modal,
  useColorScheme
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '@/constants/theme';

// Firebase Imports
import { auth, db, rtdb, awardLoyaltyPoints } from '../../services/firebase-services';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, get } from 'firebase/database';

export default function BillingScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [subTab, setSubTab] = useState<'bills' | 'invoices'>('bills');
  
  // Data States
  const [roomCharges, setRoomCharges] = useState(3500 * 3);
  const [diningTotal, setDiningTotal] = useState(0);
  const [spaTotal, setSpaTotal] = useState(0);
  const [toursTotal, setToursTotal] = useState(0);
  const [roomNumber, setRoomNumber] = useState<string | null>(null);

  // Line item selection state
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({
    accommodation: true,
    dining: true,
    spa: true,
    tours: true,
  });

  // Paid Receipts & Invoices History State
  const [paidInvoices, setPaidInvoices] = useState<any[]>([]);
  const [damageInvoices, setDamageInvoices] = useState<any[]>([]);
  const [paymentSuccessModal, setPaymentSuccessModal] = useState<{ visible: boolean; amount: number; points: number; invoiceNo: string }>({
    visible: false,
    amount: 0,
    points: 0,
    invoiceNo: '',
  });
  const [selectedInvoiceModal, setSelectedInvoiceModal] = useState<any>(null);

  const user = auth.currentUser;
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  const nightlyRate = 3500;
  const nightsStayed = 3;

  const fetchGuestCharges = async () => {
    setIsLoading(true);
    try {
      // Fetch Dining Orders from RTDB
      const ordersRef = ref(rtdb, 'orders');
      const snapshot = await get(ordersRef);
      let diningSum = 0;
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach(key => {
          if (data[key].guestId === user?.uid && data[key].status !== 'paid') {
            diningSum += data[key].totalAmount || 0;
          }
        });
      }
      setDiningTotal(diningSum);

      // User Room Number
      try {
        const userSnap = await getDoc(doc(db, 'users', user?.uid || ''));
        if (userSnap.exists()) {
          const data = userSnap.data();
          setRoomNumber(data.roomNumber || data.room || null);
        }
      } catch {}

    } catch (error) {
      console.error("Error fetching billing data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    // 1. Live Realtime Listener for Paid Invoices
    const paymentsQuery = query(collection(db, 'payments'), where('guestId', '==', user.uid));
    const unsubscribePayments = onSnapshot(
      paymentsQuery, 
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPaidInvoices(list);
      },
      (err) => console.warn('Payments snapshot permission error:', err)
    );

    // 2. Live Listener for Spa Bookings
    const spaQuery = query(collection(db, 'spa_bookings'), where('guestId', '==', user.uid));
    const unsubscribeSpa = onSnapshot(
      spaQuery, 
      (snap) => {
        let sum = 0;
        snap.docs.forEach(d => {
          if (d.data().status !== 'paid') sum += d.data().price || 0;
        });
        setSpaTotal(sum);
      },
      (err) => console.warn('Spa snapshot permission error:', err)
    );

    // 3. Live Listener for Tour Bookings
    const toursQuery = query(collection(db, 'tour_bookings'), where('guestId', '==', user.uid));
    const unsubscribeTours = onSnapshot(
      toursQuery, 
      (snap) => {
        let sum = 0;
        snap.docs.forEach(d => {
          if (d.data().status !== 'paid') sum += d.data().totalAmount || 0;
        });
        setToursTotal(sum);
      },
      (err) => console.warn('Tours snapshot permission error:', err)
    );

    // 4. Live Listener for Official Damage/Liability Invoices (issued by Admin)
    const invoicesQuery = query(collection(db, 'invoices'), where('guestId', '==', user.uid));
    const unsubscribeInvoices = onSnapshot(
      invoicesQuery,
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setDamageInvoices(list);
      },
      (err) => console.warn('Invoices snapshot permission error:', err)
    );

    fetchGuestCharges();

    return () => {
      unsubscribePayments();
      unsubscribeSpa();
      unsubscribeTours();
      unsubscribeInvoices();
    };
  }, [user]);

  const toggleItemSelection = (key: string) => {
    setSelectedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Calculate Payable Totals
  const totalUnpaid = roomCharges + diningTotal + spaTotal + toursTotal;
  const payableAmount = 
    (selectedItems.accommodation ? roomCharges : 0) +
    (selectedItems.dining ? diningTotal : 0) +
    (selectedItems.spa ? spaTotal : 0) +
    (selectedItems.tours ? toursTotal : 0);

  const handlePaySelected = async () => {
    if (!user) return;
    if (payableAmount <= 0) {
      Alert.alert('No Items Selected', 'Please select at least one unpaid item to process payment.');
      return;
    }

    Alert.alert(
      "Confirm Payment",
      `Settle selected line items for R ${payableAmount.toLocaleString()}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Pay & Earn Points", 
          onPress: async () => {
            setIsLoading(true);
            try {
              // 1. Calculate Loyalty Points (10 pts per R100 paid)
              const pointsEarned = Math.floor(payableAmount / 10);
              const invoiceNo = `INV-AZURE-${Math.floor(100000 + Math.random() * 900000)}`;

              // 2. Record Official Paid Invoice in Firestore
              const selectedNames = Object.keys(selectedItems).filter(k => selectedItems[k]);
              await addDoc(collection(db, 'payments'), {
                guestId: user.uid,
                guestEmail: user.email,
                guestName: user.displayName || 'Guest',
                amount: payableAmount,
                items: selectedNames,
                status: 'paid',
                invoiceNumber: invoiceNo,
                pointsEarned,
                createdAt: serverTimestamp(),
                dateStr: new Date().toLocaleDateString(),
              });

              // 3. Atomically Award Loyalty Points & Update Tier
              await awardLoyaltyPoints(
                user.uid,
                user.uid,
                pointsEarned,
                `Payment Reward for ${invoiceNo} (R ${payableAmount.toLocaleString()})`
              );

              // 5. Update paid item states
              if (selectedItems.accommodation) setRoomCharges(0);
              if (selectedItems.dining) setDiningTotal(0);
              if (selectedItems.spa) setSpaTotal(0);
              if (selectedItems.tours) setToursTotal(0);

              // 6. Show Success Modal & transition to Invoices sub-tab
              setPaymentSuccessModal({
                visible: true,
                amount: payableAmount,
                points: pointsEarned,
                invoiceNo,
              });
              setSubTab('invoices');

            } catch (err: any) {
              Alert.alert('Payment Error', err.message || 'Payment processing failed.');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Ionicons name="lock-closed-outline" size={64} color="#c9a227" />
        <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text, marginTop: 16, textAlign: 'center' }}>
          Folio & Billing Locked
        </Text>
        <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          Resort folio details and express checkout are reserved for checked-in resort residents. Please sign in to your stay.
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

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
        <Text style={styles.loadingText}>Compiling your folio...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.secondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Folio</Text>
          <Text style={styles.headerSubtitle}>Current Balance</Text>
        </View>
        <TouchableOpacity onPress={fetchGuestCharges} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={24} color={theme.colors.secondary} />
        </TouchableOpacity>
      </View>

      {/* SUB TABS */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, gap: 8, backgroundColor: theme.colors.background }}>
        <TouchableOpacity
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: subTab === 'bills' ? theme.colors.primary : theme.colors.surface,
            borderWidth: 1,
            borderColor: subTab === 'bills' ? theme.colors.primary : theme.colors.border,
          }}
          onPress={() => setSubTab('bills')}
        >
          <Ionicons name="card-outline" size={16} color={subTab === 'bills' ? theme.colors.textInverse : theme.colors.textMuted} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: subTab === 'bills' ? theme.colors.textInverse : theme.colors.textMuted }}>My Bills (Unpaid)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: subTab === 'invoices' ? theme.colors.primary : theme.colors.surface,
            borderWidth: 1,
            borderColor: subTab === 'invoices' ? theme.colors.primary : theme.colors.border,
          }}
          onPress={() => setSubTab('invoices')}
        >
          <Ionicons name="receipt-outline" size={16} color={subTab === 'invoices' ? theme.colors.textInverse : theme.colors.textMuted} />
          <Text style={{ fontSize: 13, fontWeight: '800', color: subTab === 'invoices' ? theme.colors.textInverse : theme.colors.textMuted }}>
            Invoices & Paid ({paidInvoices.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {subTab === 'bills' ? (
          <>
            {/* TOTAL BALANCE CARD */}
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Total Outstanding</Text>
              <Text style={styles.balanceAmount}>R {totalUnpaid.toLocaleString()}</Text>
              <View style={styles.guestInfoRow}>
                <Ionicons name="person-circle-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.guestInfoText}>{user?.displayName || 'Guest'}</Text>
                {roomNumber ? (
                  <>
                    <Text style={styles.guestInfoDot}>•</Text>
                    <Text style={styles.guestInfoText}>Room {roomNumber}</Text>
                  </>
                ) : null}
              </View>
            </View>

            {/* ITEMIZED UNPAID CHARGES WITH SELECTIVE CHECKBOXES */}
            <Text style={styles.sectionTitle}>Select Charges to Settle</Text>
            
            <View style={styles.receiptContainer}>
              
              {/* Room Base */}
              <TouchableOpacity style={styles.receiptRow} onPress={() => toggleItemSelection('accommodation')}>
                <View style={styles.receiptItemLeft}>
                  <Ionicons 
                    name={selectedItems.accommodation ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={selectedItems.accommodation ? theme.colors.primary : theme.colors.textMuted} 
                    style={{ marginRight: 8 }}
                  />
                  <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Ionicons name="bed" size={18} color={theme.colors.info} />
                  </View>
                  <View>
                    <Text style={styles.itemName}>Accommodation</Text>
                    <Text style={styles.itemDesc}>{nightsStayed} Nights @ R{nightlyRate}</Text>
                  </View>
                </View>
                <Text style={styles.itemPrice}>R {roomCharges.toLocaleString()}</Text>
              </TouchableOpacity>

              {/* Dining */}
              <TouchableOpacity style={styles.receiptRow} onPress={() => toggleItemSelection('dining')}>
                <View style={styles.receiptItemLeft}>
                  <Ionicons 
                    name={selectedItems.dining ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={selectedItems.dining ? theme.colors.primary : theme.colors.textMuted} 
                    style={{ marginRight: 8 }}
                  />
                  <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Ionicons name="restaurant" size={18} color={theme.colors.error} />
                  </View>
                  <View>
                    <Text style={styles.itemName}>Dining & Room Service</Text>
                    <Text style={styles.itemDesc}>Food & Beverages</Text>
                  </View>
                </View>
                <Text style={styles.itemPrice}>R {diningTotal.toLocaleString()}</Text>
              </TouchableOpacity>

              {/* Spa */}
              <TouchableOpacity style={styles.receiptRow} onPress={() => toggleItemSelection('spa')}>
                <View style={styles.receiptItemLeft}>
                  <Ionicons 
                    name={selectedItems.spa ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={selectedItems.spa ? theme.colors.primary : theme.colors.textMuted} 
                    style={{ marginRight: 8 }}
                  />
                  <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Ionicons name="leaf" size={18} color={theme.colors.success} />
                  </View>
                  <View>
                    <Text style={styles.itemName}>Spa & Wellness</Text>
                    <Text style={styles.itemDesc}>Treatments & Massages</Text>
                  </View>
                </View>
                <Text style={styles.itemPrice}>R {spaTotal.toLocaleString()}</Text>
              </TouchableOpacity>

              {/* Tours */}
              <TouchableOpacity style={styles.receiptRow} onPress={() => toggleItemSelection('tours')}>
                <View style={styles.receiptItemLeft}>
                  <Ionicons 
                    name={selectedItems.tours ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={selectedItems.tours ? theme.colors.primary : theme.colors.textMuted} 
                    style={{ marginRight: 8 }}
                  />
                  <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Ionicons name="compass" size={18} color={theme.colors.warning} />
                  </View>
                  <View>
                    <Text style={styles.itemName}>Tours & Excursions</Text>
                    <Text style={styles.itemDesc}>Resort Experiences</Text>
                  </View>
                </View>
                <Text style={styles.itemPrice}>R {toursTotal.toLocaleString()}</Text>
              </TouchableOpacity>

            </View>

            {/* PAYABLE SUMMARY CARD */}
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 20, padding: 20, marginVertical: 16, borderWidth: 1, borderColor: theme.colors.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, color: theme.colors.textMuted }}>Selected Amount</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text }}>R {payableAmount.toLocaleString()}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: theme.colors.success, fontWeight: '700' }}>🎁 Loyalty Reward</Text>
                <Text style={{ fontSize: 13, color: theme.colors.success, fontWeight: '800' }}>+{Math.floor(payableAmount / 10)} Points</Text>
              </View>

              <TouchableOpacity 
                style={{ backgroundColor: payableAmount > 0 ? theme.colors.primary : theme.colors.border, paddingVertical: 16, borderRadius: 14, alignItems: 'center' }} 
                onPress={handlePaySelected}
                disabled={payableAmount <= 0}
              >
                <Text style={{ color: theme.colors.textInverse, fontWeight: '900', fontSize: 16 }}>
                  Settle Selected (R {payableAmount.toLocaleString()})
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* INVOICES & PAID HISTORY SUB-TAB */
          <View style={{ gap: 14, marginTop: 10 }}>
            {damageInvoices.length > 0 && (
              <>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 6 }}>
                  Official Damage Invoices
                </Text>
                {damageInvoices.map((inv) => (
                  <TouchableOpacity 
                    key={inv.id} 
                    style={{ backgroundColor: theme.colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#f59e0b', borderLeftWidth: 4, borderLeftColor: '#f59e0b' }}
                    onPress={() => setSelectedInvoiceModal(inv)}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Ionicons name="receipt" size={20} color="#f59e0b" />
                        <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text }}>{inv.invoiceNumber}</Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: '#f59e0b' }}>R {(inv.amount || inv.subtotal || 0).toLocaleString()}</Text>
                    </View>

                    <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginBottom: 8 }}>
                      Issued {inv.sentAt ? new Date(inv.sentAt).toDateString() : 'Recently'} · Outstanding — Awaiting Payment
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {Array.isArray(inv.lineItems) && inv.lineItems.map((item: { name?: string }, idx: number) => (
                        <View key={idx} style={{ backgroundColor: '#f59e0b18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#f59e0b', textTransform: 'capitalize' }}>{item.name || 'Damaged Asset'}</Text>
                        </View>
                      ))}
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {paidInvoices.length === 0 && damageInvoices.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48, backgroundColor: theme.colors.surface, borderRadius: 20 }}>
                <Ionicons name="receipt-outline" size={48} color={theme.colors.textMuted} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 12 }}>
                  No Invoices Yet
                </Text>
                <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 }}>
                  Official damage invoices and settled receipts will be stored here live.
                </Text>
              </View>
            ) : (
              paidInvoices.map((inv) => (
                <TouchableOpacity 
                  key={inv.id} 
                  style={{ backgroundColor: theme.colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: theme.colors.border }}
                  onPress={() => setSelectedInvoiceModal(inv)}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                      <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text }}>{inv.invoiceNumber}</Text>
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.success }}>R {inv.amount?.toLocaleString()}</Text>
                  </View>

                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginBottom: 8 }}>
                    Paid on {inv.dateStr || 'Recent'} • +{inv.pointsEarned || 0} Loyalty Pts Earned
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {Array.isArray(inv.items) && inv.items.map((item: string, idx: number) => (
                      <View key={idx} style={{ backgroundColor: theme.colors.background, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'capitalize' }}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

      </ScrollView>

      {/* PAYMENT SUCCESS MODAL */}
      <Modal visible={paymentSuccessModal.visible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 24, padding: 28, alignItems: 'center', width: '90%' }}>
            <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
            <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text, marginTop: 12 }}>Payment Successful!</Text>
            <Text style={{ fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
              Invoice <Text style={{ fontWeight: '800', color: theme.colors.primary }}>{paymentSuccessModal.invoiceNo}</Text> has been issued.
            </Text>

            <View style={{ backgroundColor: '#16a34a15', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, marginVertical: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.success }}>+ {paymentSuccessModal.points} Loyalty Points Earned!</Text>
              <Text style={{ fontSize: 12, color: theme.colors.success, marginTop: 2 }}>Added directly to your reward balance</Text>
            </View>

            <TouchableOpacity
              style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, width: '100%', alignItems: 'center' }}
              onPress={() => setPaymentSuccessModal(prev => ({ ...prev, visible: false }))}
            >
              <Text style={{ color: theme.colors.textInverse, fontWeight: '800', fontSize: 16 }}>View Paid Invoices</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {selectedInvoiceModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedInvoiceModal(null)}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 24 }}>
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Ionicons name="receipt" size={26} color="#16a34a" />
                <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text, flex: 1 }}>
                  {selectedInvoiceModal.invoiceNumber}
                </Text>
                <TouchableOpacity onPress={() => setSelectedInvoiceModal(null)}>
                  <Ionicons name="close-circle" size={26} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={{ backgroundColor: selectedInvoiceModal.type === 'damage' ? '#f59e0b18' : '#16a34a10', borderRadius: 12, padding: 14, marginBottom: 14, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: selectedInvoiceModal.type === 'damage' ? '#f59e0b' : theme.colors.success, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {selectedInvoiceModal.type === 'damage' ? 'Invoice Outstanding' : 'Amount Paid'}
                </Text>
                <Text style={{ fontSize: 26, fontWeight: '900', color: selectedInvoiceModal.type === 'damage' ? '#f59e0b' : theme.colors.success, marginTop: 2 }}>
                  R {(selectedInvoiceModal.amount || selectedInvoiceModal.subtotal || 0).toLocaleString()}
                </Text>
              </View>

              {Array.isArray(selectedInvoiceModal.items) && selectedInvoiceModal.items.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.text, marginBottom: 6 }}>Charges Covered</Text>
                  {selectedInvoiceModal.items.map((item: string, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 }}>
                      <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                      <Text style={{ fontSize: 13, color: theme.colors.textMuted, flex: 1 }}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12, gap: 6 }}>
                {selectedInvoiceModal.type === 'damage' ? (
                  <>
                    <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
                      Issued {selectedInvoiceModal.sentAt ? new Date(selectedInvoiceModal.sentAt).toDateString() : 'Recently'} · Awaiting payment
                    </Text>
                    {selectedInvoiceModal.guestEmail && (
                      <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>Sent to: {selectedInvoiceModal.guestEmail}</Text>
                    )}
                  </>
                ) : (
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
                    Paid on {selectedInvoiceModal.dateStr || 'Recent'} • +{selectedInvoiceModal.pointsEarned || 0} loyalty pts
                  </Text>
                )}
                {selectedInvoiceModal.method && (
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>Method: {selectedInvoiceModal.method}</Text>
                )}
              </View>

              <TouchableOpacity
                style={{ backgroundColor: theme.colors.primary, paddingVertical: 13, borderRadius: 12, marginTop: 18, alignItems: 'center' }}
                onPress={() => setSelectedInvoiceModal(null)}
              >
                <Text style={{ color: theme.colors.textInverse, fontWeight: '800', fontSize: 15 }}>Close Receipt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: theme.colors.textMuted,
    fontSize: 16,
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
  refreshBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  balanceCard: {
    backgroundColor: theme.colors.secondary,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: theme.colors.secondary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  balanceLabel: {
    color: theme.colors.textMuted,
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
    color: theme.colors.textSecondary,
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 16,
    marginLeft: 4,
  },
  receiptContainer: {
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.text,
    marginBottom: 2,
  },
  itemDesc: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  summaryValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  checkoutBtn: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  checkoutBtnText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  }
});
