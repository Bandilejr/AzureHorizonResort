import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  ActivityIndicator
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../services/firebase-services';

export default function PaymentScreen() {
  const user = auth.currentUser;
  const params = useLocalSearchParams();

  // Parse details passed via router parameters
  const roomName = (params.roomName as string) || 'Ocean View Suite';
  const total = Number(params.total) || 10500;
  const depositAmount = Number(params.depositAmount) || Math.round(total * 0.15);
  
  // Determine if this is a new booking vs a resident checkout
  const nights = params.nights ? Number(params.nights) : null;
  const checkIn = params.checkIn as string | undefined;
  const isNewBooking = nights !== null && checkIn !== undefined;
  
  // Flag to determine if we should route to catering after (Passed from event-booking.tsx)
  const expectedAttendance = params.expectedAttendance; 

  const [step, setStep] = useState<'disclaimer' | 'confirmation'>('disclaimer');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  
  // Payment Option State
  const [paymentMode, setPaymentMode] = useState<'deposit' | 'full'>('deposit');
  
  // Dynamic Calculation
  const amountToPay = paymentMode === 'full' ? total : depositAmount;
  const balanceDue = paymentMode === 'full' ? 0 : total - depositAmount;

  // Paystack Public Key configuration simulation
  const PAYSTACK_PUBLIC_KEY = 'pk_test_placeholder_key_please_replace';

  const handleTriggerPayment = () => {
    setIsProcessing(true);

    // Simulate Paystack or test mode workflow for mobile presentation
    setTimeout(() => {
      setIsProcessing(false);
      const generatedRef = `BK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      setConfirmationNumber(generatedRef);
      setStep('confirmation');
    }, 1500);
  };

  const handleSimulateEmailReceipt = () => {
    Alert.alert(
      "Receipt Sent", 
      `A PDF receipt for transaction #${confirmationNumber} has been dispatched to ${user?.email || 'your registered email'}.`
    );
  };

  const handleCompleteBooking = () => {
    if (expectedAttendance) {
      // Smart Handoff: Route directly to Event Catering
      Alert.alert(
        "Venue Secured!", 
        "Would you like to arrange catering for your event now?", 
        [
          { text: "Maybe Later", onPress: () => router.replace('/(tabs)/GuestPortal' as any), style: 'cancel' },
          { 
            text: "Setup Catering", 
            onPress: () => router.replace({ 
              pathname: '/event-catering', 
              params: { expectedAttendance, bookingId: params.bookingId } 
            } as any) 
          }
        ]
      );
    } else {
      // Standard Room Booking / Checkout routing
      Alert.alert("Success", isNewBooking ? "Reservation confirmed!" : "Folio balance settled successfully!", [
        { text: "OK", onPress: () => router.replace('/(tabs)/GuestPortal' as any) }
      ]);
    }
  };

  if (step === 'disclaimer') {
    return (
      <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#1e3a5f" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              {isNewBooking ? 'Complete Reservation' : 'Secure Checkout'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {isNewBooking ? 'Booking Gateway' : 'Folio Payment Gateway'}
            </Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* POLICY BOX */}
          <View style={styles.policyCard}>
            <View style={styles.policyHeaderRow}>
              <Ionicons name="alert-circle-outline" size={22} color="#d97706" />
              <Text style={styles.policyHeaderTitle}>Resort Policies & Damages</Text>
            </View>
            <Text style={styles.policyText}>
              • A non-refundable deposit is required to secure {isNewBooking ? 'your booking' : 'folio clearance'}.
            </Text>
            <Text style={styles.policyText}>• Cancellations within 48 hours forfeit the deposit amount.</Text>
            <Text style={styles.policyText}>
              • <Text style={{fontWeight: 'bold'}}>Damage Clause:</Text> Additional penalty fees will be charged to your account if any resort property, furniture, or equipment is damaged during your stay or event.
            </Text>
          </View>

          {/* FINANCIAL BREAKDOWN */}
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>Billing Summary</Text>
            
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Reserved Space:</Text>
              <Text style={styles.breakdownValue}>{roomName}</Text>
            </View>

            {/* Conditionally render booking-specific details */}
            {isNewBooking && (
              <>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Date:</Text>
                  <Text style={styles.breakdownValue}>{checkIn}</Text>
                </View>
                {nights && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Duration:</Text>
                    <Text style={styles.breakdownValue}>{nights} {nights === 1 ? 'Day/Night' : 'Days/Nights'}</Text>
                  </View>
                )}
              </>
            )}

            <View style={styles.breakdownDivider} />

            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Total Charges (inc. Taxes):</Text>
              <Text style={styles.breakdownValue}>R {total.toLocaleString()}</Text>
            </View>
            
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Minimum Deposit:</Text>
              <Text style={styles.breakdownValue}>R {depositAmount.toLocaleString()}</Text>
            </View>
          </View>

          {/* PAYMENT OPTION SELECTOR */}
          <View style={styles.paymentSelectorBox}>
            <Text style={styles.paymentSelectorTitle}>Select Payment Amount</Text>
            <View style={styles.paymentToggleContainer}>
              <TouchableOpacity 
                style={[styles.toggleBtn, paymentMode === 'deposit' && styles.toggleBtnActive]}
                onPress={() => setPaymentMode('deposit')}
              >
                <Text style={[styles.toggleBtnText, paymentMode === 'deposit' && styles.toggleBtnTextActive]}>
                  Pay Deposit
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.toggleBtn, paymentMode === 'full' && styles.toggleBtnActive]}
                onPress={() => setPaymentMode('full')}
              >
                <Text style={[styles.toggleBtnText, paymentMode === 'full' && styles.toggleBtnTextActive]}>
                  Pay Full Amount
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Remaining Balance Due Later:</Text>
              <Text style={styles.balanceValue}>R {balanceDue.toLocaleString()}</Text>
            </View>
          </View>

          {/* SECURE BADGE */}
          <View style={styles.secureBadge}>
            <Ionicons name="lock-closed" size={20} color="#1e3a5f" />
            <View style={{ flex: 1 }}>
              <Text style={styles.secureTitle}>Paystack Secure SSL</Text>
              <Text style={styles.secureDesc}>Encrypted processing. No banking credentials are stored on resort servers.</Text>
            </View>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.payBtn} 
              onPress={handleTriggerPayment}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="card-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.payBtnText}>Pay R {amountToPay.toLocaleString()}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* SUCCESS CONFIRMATION VIEW */}
      <View style={styles.header}>
        <View style={{ width: 28 }} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Payment Complete</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.successIconContainer}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={40} color="#16a34a" />
          </View>
          <Text style={styles.successHeading}>Transaction Successful!</Text>
          <Text style={styles.successSubtext}>
            {isNewBooking ? 'Your reservation is secured.' : 'Your payment has been securely processed.'}
          </Text>
        </View>

        <View style={styles.receiptBox}>
          <Text style={styles.receiptHeader}>CONFIRMATION REF</Text>
          <Text style={styles.receiptRefText}>{confirmationNumber}</Text>
          
          <View style={styles.receiptDivider} />

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Space Booked:</Text>
            <Text style={styles.breakdownValue}>{roomName}</Text>
          </View>

          {isNewBooking && (
            <>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Arrival Date:</Text>
                <Text style={styles.breakdownValue}>{checkIn}</Text>
              </View>
            </>
          )}

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Amount Paid:</Text>
            <Text style={[styles.breakdownValue, { color: '#16a34a' }]}>R {amountToPay.toLocaleString()}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Remaining Balance:</Text>
            <Text style={styles.breakdownValue}>R {balanceDue.toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleSimulateEmailReceipt}>
            <Ionicons name="mail-outline" size={18} color="#1e3a5f" style={{ marginRight: 6 }} />
            <Text style={styles.cancelBtnText}>Email Receipt</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.payBtn} onPress={handleCompleteBooking}>
            <Text style={styles.payBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  backButton: { padding: 4, marginLeft: -8 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e3a5f' },
  headerSubtitle: { fontSize: 12, color: '#64748b' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  
  policyCard: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 16, padding: 16, marginBottom: 20 },
  policyHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  policyHeaderTitle: { fontSize: 15, fontWeight: 'bold', color: '#92400e' },
  policyText: { fontSize: 12, color: '#b45309', lineHeight: 18, marginBottom: 6 },
  
  breakdownCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  breakdownTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginBottom: 16 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  breakdownLabel: { fontSize: 14, color: '#64748b' },
  breakdownValue: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  breakdownDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 12 },
  
  paymentSelectorBox: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#e2e8f0' },
  paymentSelectorTitle: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 12, textAlign: 'center' },
  paymentToggleContainer: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 16 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: '#1e3a5f', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  toggleBtnText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  toggleBtnTextActive: { color: '#fff' },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  balanceLabel: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  balanceValue: { fontSize: 14, color: '#d97706', fontWeight: 'bold' },
  
  secureBadge: { flexDirection: 'row', backgroundColor: '#f1f5f9', padding: 16, borderRadius: 16, alignItems: 'center', gap: 12, marginBottom: 24 },
  secureTitle: { fontSize: 13, fontWeight: 'bold', color: '#1e3a5f' },
  secureDesc: { fontSize: 11, color: '#64748b', marginTop: 2 },
  
  actionButtons: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  cancelBtnText: { color: '#1e3a5f', fontWeight: 'bold', fontSize: 15 },
  payBtn: { flex: 1, backgroundColor: '#16a34a', paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  payBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  
  successIconContainer: { alignItems: 'center', marginVertical: 30 },
  successCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#dcfce3', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successHeading: { fontSize: 22, fontWeight: 'bold', color: '#1e3a5f', marginBottom: 6 },
  successSubtext: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  
  receiptBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#e2e8f0' },
  receiptHeader: { fontSize: 11, fontWeight: 'bold', color: '#94a3b8', letterSpacing: 1, marginBottom: 4 },
  receiptRefText: { fontSize: 24, fontWeight: 'bold', color: '#1e3a5f', letterSpacing: 2, marginBottom: 16 },
  receiptDivider: { width: '100%', height: 1, backgroundColor: '#f1f5f9', marginBottom: 16 }
});
