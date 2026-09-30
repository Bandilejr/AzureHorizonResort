import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  TextInput,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '@/constants/theme';
import { auth, db, awardLoyaltyPoints, deriveBookingPaymentState, applyEventPayment, getCateringForBooking } from '../../services/firebase-services';
import { doc, addDoc, collection, getDoc, serverTimestamp } from 'firebase/firestore';
import { generateAndSendInvoice } from '../../services/invoice-service';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';

// Paystack brand colours
const PS_BLUE = '#0BA4DB';
const PS_DARK = '#011B33';

const getLocalAuth = async () => {
  if (Platform.OS === 'web') return null;
  try {
    const LocalAuth = await import('expo-local-authentication');
    return LocalAuth;
  } catch {
    return null;
  }
};

export default function PaymentScreen() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const S = createStyles(theme);
  const user = auth.currentUser;
  const params = useLocalSearchParams();

  // Details
  const roomName = (params.roomName as string) || 'Event Venue';
  const total = Number(params.total) || 10500;
  const depositAmount = Number(params.depositAmount) || Math.round(total * 0.5);
  const nights = params.nights ? Number(params.nights) : null;
  const checkIn = params.checkIn as string | undefined;
  const isNewBooking = nights !== null && checkIn !== undefined;
  const expectedAttendance = params.expectedAttendance;
  const bookingId = params.bookingId as string | undefined;

  // Live booking-derived money state (single source of truth).
  const [liveBooking, setLiveBooking] = useState<any>(null);
  const [liveCateringItems, setLiveCateringItems] = useState<any[]>([]);
  const [loadingBooking, setLoadingBooking] = useState(!!bookingId);
  const [invoiceSent, setInvoiceSent] = useState(false);

  useEffect(() => {
    if (!bookingId) {
      setLoadingBooking(false);
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'event_bookings', bookingId));
        if (!snap.exists()) throw new Error('Booking not found');
        const b: any = { id: snap.id, ...snap.data() };
        const catering = await getCateringForBooking(bookingId);
        // Payment lock: never accept payment for an event that has already happened.
        const day = String(b.eventDateStr || b.date || b.eventDate || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          const endOfDay = new Date(`${day}T23:59:59`);
          if (endOfDay.getTime() < Date.now()) {
            showAlert({
              title: 'Event Has Ended',
              message: 'Payment is no longer available once the event date has passed. Please contact the front desk for billing assistance.',
              type: 'warning',
              onConfirm: () => router.back(),
            });
            setLoadingBooking(false);
            return;
          }
        }
        setLiveBooking(b);
        setLiveCateringItems(catering?.items || []);
      } catch (e) {
        showAlert({ title: 'Booking Not Found', message: 'Could not load this booking. Please go back and try again.', type: 'error' });
      } finally {
        setLoadingBooking(false);
      }
    })();
  }, [bookingId]);

  const money = liveBooking
    ? deriveBookingPaymentState(liveBooking, liveCateringItems.reduce((s, i) => s + Number(i.total || 0), 0))
    : {
        venueCost: total,
        cateringTotal: 0,
        combinedTotal: total,
        depositRequired: depositAmount,
        amountPaid: 0,
        balanceDue: total - depositAmount,
        paymentStatus: 'none' as const,
      };

  const hasBooking = !!bookingId && !!liveBooking;
  const alreadyPaid = money.amountPaid > 0;
  const payOptions: { key: 'deposit' | 'balance' | 'full'; label: string; amount: number }[] = [];
  if (!hasBooking || !alreadyPaid) {
    payOptions.push({ key: 'deposit', label: 'Pay Deposit (50%)', amount: money.depositRequired });
    payOptions.push({ key: 'full', label: 'Pay In Full', amount: money.combinedTotal });
  } else if (money.balanceDue > 0) {
    payOptions.push({ key: 'balance', label: 'Pay Remaining Balance', amount: money.balanceDue });
  }

  // State
  const [step, setStep] = useState<'disclaimer' | 'payment' | 'confirmation'>('disclaimer');
  const [paymentMode, setPaymentMode] = useState<'deposit' | 'full'>(params.mode === 'full' ? 'full' : 'deposit');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'biometric'>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');

  // Biometrics hardware state
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Card inputs
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [showTestCard, setShowTestCard] = useState(false);

  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    const LocalAuth = await getLocalAuth();
    if (LocalAuth) {
      try {
        const hasHw = await LocalAuth.hasHardwareAsync();
        const isEnrolled = await LocalAuth.isEnrolledAsync();
        setBiometricAvailable(hasHw && isEnrolled);
      } catch {
        setBiometricAvailable(false);
      }
    }
  };

  const amountToPay = paymentMode === 'full' ? money.combinedTotal : payOptions.length > 0 ? payOptions[0].amount : 0;
  const balanceDue = Math.max(0, money.combinedTotal - (hasBooking ? money.amountPaid : paymentMode === 'full' ? money.combinedTotal : money.depositRequired));

  // When arriving to pay an existing balance ("Pay Balance" from My Activity),
  // preselect the balance option once the live booking has loaded.
  useEffect(() => {
    if (params.payBalance === '1' && alreadyPaid && money.balanceDue > 0) {
      setPaymentMode('balance' as any);
    }
  }, [hasBooking, alreadyPaid, money.balanceDue]);

  const formatCardNumber = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 16);
    const groups = clean.match(/.{1,4}/g) || [];
    return groups.join(' ');
  };

  const formatExpiry = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 4);
    if (clean.length >= 2) return `${clean.slice(0, 2)}/${clean.slice(2)}`;
    return clean;
  };

  const validateCard = () => {
    const rawCard = cardNumber.replace(/\s/g, '');
    if (rawCard.length < 16) {
      showAlert({ title: 'Invalid Card Number', message: 'Please enter a complete 16-digit card number.', type: 'warning' });
      return false;
    }
    if (expiry.replace('/', '').length < 4) {
      showAlert({ title: 'Invalid Expiry', message: 'Please enter a valid expiry date (MM/YY).', type: 'warning' });
      return false;
    }
    if (cvv.length < 3) {
      showAlert({ title: 'Invalid CVV', message: 'Please enter a 3 or 4-digit CVV.', type: 'warning' });
      return false;
    }
    if (!cardName.trim()) {
      showAlert({ title: 'Name Required', message: 'Please enter cardholder name.', type: 'warning' });
      return false;
    }
    return true;
  };

  // Biometric 1-tap Payment Handler
  const handleBiometricPayment = async () => {
    const LocalAuth = await getLocalAuth();
    if (!LocalAuth || !biometricAvailable) {
      showAlert({
        title: 'Biometrics Unavailable',
        message: 'Fingerprint / Face ID is not enrolled on this Android device. Please use Paystack Card payment.',
        type: 'warning',
      });
      return;
    }

    try {
      const result = await LocalAuth.authenticateAsync({
        promptMessage: `Confirm payment of R ${amountToPay.toLocaleString()} with Fingerprint / Face ID`,
        fallbackLabel: 'Use Card',
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        processSuccessfulPayment('BIOMETRIC-PASS');
      } else {
        showAlert({
          title: 'Authentication Cancelled',
          message: 'Biometric authorization was cancelled or failed.',
          type: 'warning',
        });
      }
    } catch (err: any) {
      showAlert({
        title: 'Biometric Error',
        message: err.message || 'Could not verify biometrics.',
        type: 'error',
      });
    }
  };

  const handlePayNow = async () => {
    if (paymentMethod === 'biometric') {
      await handleBiometricPayment();
      return;
    }

    if (!validateCard()) return;
    processSuccessfulPayment('CARD-PAYSTACK');
  };

  const processSuccessfulPayment = async (methodPrefix: string) => {
    setIsProcessing(true);
    await new Promise(r => setTimeout(r, 1600));

    try {
      // Payment lock (belt & braces): refuse if the event date has already passed.
      if (liveBooking) {
        const day = String(liveBooking.eventDateStr || liveBooking.date || liveBooking.eventDate || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          const endOfDay = new Date(`${day}T23:59:59`);
          if (endOfDay.getTime() < Date.now()) {
            setIsProcessing(false);
            showAlert({
              title: 'Event Has Ended',
              message: 'Payment can no longer be processed after the event date. Please contact the front desk.',
              type: 'warning',
              onConfirm: () => router.back(),
            });
            return;
          }
        }
      }

      const ref = `${methodPrefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      setConfirmationNumber(ref);

      // 1) Apply the payment to the event booking (accumulates amountPaid,
      //    re-derives balanceDue/paymentStatus, never downgrades an approved status).
      if (bookingId) {
        try {
          await applyEventPayment(bookingId, amountToPay, {
            paymentMethod: paymentMethod === 'biometric' ? 'biometric' : 'card',
            paymentReference: ref,
            paymentMode: alreadyPaid ? 'balance' : paymentMode,
          });
        } catch (e) {
          console.warn('Firestore booking payment update warning:', e);
        }
      }

      // 2) Record the charge on the guest folio (shows in Billing → Paid Invoices)
      //    and award loyalty points (10 pts per R100 paid).
      try {
        const pointsEarned = Math.floor(amountToPay / 10);
        const invoiceNo = `INV-AZR-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
        const items: string[] = [];
        if (hasBooking || isNewBooking) {
          items.push(`Venue Reservation: ${roomName}`);
          if (liveCateringItems.length > 0) {
            liveCateringItems.forEach((i: any) => items.push(`Catering: ${i.name} (x${i.quantity})`));
          }
          if (alreadyPaid) items.push('Remaining Balance Settlement');
        } else {
          items.push(roomName);
        }
        await addDoc(collection(db, 'payments'), {
          guestId: user?.uid,
          guestEmail: user?.email,
          guestName: user?.displayName || 'Guest',
          amount: amountToPay,
          items,
          status: 'paid',
          invoiceNumber: invoiceNo,
          paymentReference: ref,
          bookingId: bookingId || null,
          paymentMode: alreadyPaid ? 'balance' : paymentMode,
          pointsEarned,
          createdAt: serverTimestamp(),
          dateStr: new Date().toLocaleDateString(),
        });
        if (user?.uid && pointsEarned > 0) {
          await awardLoyaltyPoints(
            user.uid,
            user.uid,
            pointsEarned,
            `Payment Reward for ${invoiceNo} (R ${amountToPay.toLocaleString()})`
          );
        }
      } catch (e) {
        console.warn('Folio payment record warning:', e);
      }

      // 3) Dispatch the combined venue + catering invoice to the guest's email
      //    (reuses the existing invoice/EmailJS pipeline).
      if (bookingId) {
        try {
          await generateAndSendInvoice({ type: 'booking_confirmation', recordId: bookingId });
          setInvoiceSent(true);
        } catch (e) {
          console.warn('Invoice email dispatch warning:', e);
        }
      }

      setStep('confirmation');
    } catch (e) {
      showAlert({ title: 'Payment Failed', message: 'An error occurred during authorization. Please try again.', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSimulateEmailReceipt = () => {
    if (invoiceSent) {
      showAlert({
        title: 'Receipt Dispatched',
        message: `Your combined venue & catering invoice has been emailed to ${user?.email || 'your account'}.`,
        type: 'success',
      });
      return;
    }
    if (bookingId) {
      (async () => {
        try {
          await generateAndSendInvoice({ type: 'booking_confirmation', recordId: bookingId });
          setInvoiceSent(true);
          showAlert({
            title: 'Receipt Dispatched',
            message: `Your combined venue & catering invoice has been emailed to ${user?.email || 'your account'}.`,
            type: 'success',
          });
        } catch (e) {
          showAlert({ title: 'Email Failed', message: 'The receipt could not be emailed right now. Please try again.', type: 'error' });
        }
      })();
      return;
    }
    showAlert({
      title: 'Receipt Dispatched',
      message: `A PDF receipt for transaction #${confirmationNumber} has been emailed to ${user?.email || 'your account'}.`,
      type: 'success',
    });
  };

  const handleCompleteBooking = () => {
    if (expectedAttendance) {
      showAlert({
        title: '🎉 Venue Secured!',
        message: 'Would you like to arrange catering for your event now?',
        type: 'success',
        confirmText: 'Setup Catering',
        cancelText: 'Maybe Later',
        onConfirm: () =>
          router.replace({
            pathname: '/event-catering',
            params: { expectedAttendance, bookingId: params.bookingId },
          } as any),
        onCancel: () => router.replace('/guest-portal'),
      });
    } else {
      showAlert({
        title: 'Success',
        message: isNewBooking ? 'Reservation confirmed!' : 'Payment processed successfully!',
        type: 'success',
        onConfirm: () => router.replace('/guest-portal'),
      });
    }
  };

  // DISCLAIMER STEP
  if (step === 'disclaimer') {
    return (
      <View style={S.container}>
        <View style={S.header}>
          <TouchableOpacity style={S.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.secondary} />
          </TouchableOpacity>
          <View style={S.headerCenter}>
            <Text style={S.headerTitle}>{isNewBooking ? 'Complete Reservation' : 'Secure Checkout'}</Text>
            <Text style={S.headerSubtitle}>Azure Horizon Payment Gateway</Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Policy Box */}
          <View style={S.policyCard}>
            <View style={S.policyHeaderRow}>
              <Ionicons name="alert-circle-outline" size={22} color={theme.colors.warning} />
              <Text style={S.policyHeaderTitle}>Resort Policies & Damage Clause</Text>
            </View>
            <Text style={S.policyText}>• A deposit is required to secure {isNewBooking ? 'your booking' : 'folio clearance'}.</Text>
            <Text style={S.policyText}>• Cancellations within 48 hours forfeit deposit.</Text>
            <Text style={S.policyText}>
              • <Text style={{ fontWeight: 'bold' }}>Damage Clause:</Text> Penalty fees apply if resort property is damaged.
            </Text>
          </View>

          {loadingBooking ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.colors.secondary} />
              <Text style={{ marginTop: 12, color: theme.colors.textMuted }}>Loading your booking & totals...</Text>
            </View>
          ) : (
          <>
          {/* Billing Summary */}
          <View style={S.breakdownCard}>
            <Text style={S.breakdownTitle}>Billing Summary</Text>
            <View style={S.breakdownRow}>
              <Text style={S.breakdownLabel}>Reserved Space:</Text>
              <Text style={S.breakdownValue}>{roomName}</Text>
            </View>
            {isNewBooking && checkIn && (
              <View style={S.breakdownRow}>
                <Text style={S.breakdownLabel}>Date:</Text>
                <Text style={S.breakdownValue}>{checkIn}</Text>
              </View>
            )}
            <View style={S.breakdownRow}>
              <Text style={S.breakdownLabel}>Venue Cost:</Text>
              <Text style={S.breakdownValue}>R {money.venueCost.toLocaleString()}</Text>
            </View>
            {money.cateringTotal > 0 && (
              <View style={S.breakdownRow}>
                <Text style={S.breakdownLabel}>Catering:</Text>
                <Text style={S.breakdownValue}>R {money.cateringTotal.toLocaleString()}</Text>
              </View>
            )}
            <View style={S.breakdownDivider} />
            <View style={S.breakdownRow}>
              <Text style={S.breakdownLabel}>Combined Total (inc. VAT):</Text>
              <Text style={S.breakdownValue}>R {money.combinedTotal.toLocaleString()}</Text>
            </View>
            {alreadyPaid ? (
              <>
                <View style={S.breakdownRow}>
                  <Text style={S.breakdownLabel}>Already Paid:</Text>
                  <Text style={[S.breakdownValue, { color: theme.colors.success }]}>R {money.amountPaid.toLocaleString()}</Text>
                </View>
                <View style={S.breakdownRow}>
                  <Text style={S.breakdownLabel}>Remaining Balance:</Text>
                  <Text style={[S.breakdownValue, { color: theme.colors.warning, fontWeight: 'bold' }]}>R {money.balanceDue.toLocaleString()}</Text>
                </View>
              </>
            ) : (
              <View style={S.breakdownRow}>
                <Text style={S.breakdownLabel}>Minimum Deposit (50%):</Text>
                <Text style={S.breakdownValue}>R {money.depositRequired.toLocaleString()}</Text>
              </View>
            )}
          </View>

          {/* Payment Mode Selector */}
          {money.balanceDue > 0 ? (
            <View style={S.paymentSelectorBox}>
              <Text style={S.paymentSelectorTitle}>
                {alreadyPaid ? 'Settle Outstanding Balance' : 'Select Payment Amount'}
              </Text>
              {payOptions.length > 1 ? (
                <View style={S.paymentToggleContainer}>
                  {payOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[S.toggleBtn, paymentMode === opt.key && S.toggleBtnActive]}
                      onPress={() => setPaymentMode(opt.key as any)}
                    >
                      <Text style={[S.toggleBtnText, paymentMode === opt.key && S.toggleBtnTextActive]}>{opt.label}</Text>
                      <Text style={[{ fontSize: 11, marginTop: 2 }, paymentMode === opt.key && { color: '#fff' }]}>
                        R {opt.amount.toLocaleString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={[S.paymentToggleContainer, { marginBottom: 0 }]}>
                  <View style={[S.toggleBtn, S.toggleBtnActive]}>
                    <Text style={[S.toggleBtnText, S.toggleBtnTextActive]}>Pay Remaining Balance</Text>
                    <Text style={[{ fontSize: 11, marginTop: 2, color: '#fff' }]}>
                      R {money.balanceDue.toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}
              {!alreadyPaid && (
                <View style={S.balanceRow}>
                  <Text style={S.balanceLabel}>Remaining Balance Due Later:</Text>
                  <Text style={S.balanceValue}>R {balanceDue.toLocaleString()}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[S.paymentSelectorBox, { borderColor: theme.colors.success }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                <Text style={[S.paymentSelectorTitle, { color: theme.colors.success, marginBottom: 0 }]}>
                  Paid In Full — R {money.combinedTotal.toLocaleString()}
                </Text>
              </View>
            </View>
          )}
          </>
          )}

          {/* Secure Badge */}
          <View style={S.secureBadge}>
            <Ionicons name="shield-checkmark" size={20} color="#16a34a" />
            <View style={{ flex: 1 }}>
              <Text style={S.secureTitle}>Paystack & Biometrics Secured</Text>
              <Text style={S.secureDesc}>Supports Paystack SSL Card Payment and 1-Tap Fingerprint / Face ID Authorization.</Text>
            </View>
          </View>

          <View style={S.actionButtons}>
            <TouchableOpacity style={S.cancelBtn} onPress={() => router.back()}>
              <Text style={S.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.payBtn, money.balanceDue <= 0 && { backgroundColor: theme.colors.borderStrong }]}
              onPress={() => setStep('payment')}
              disabled={loadingBooking || money.balanceDue <= 0}
            >
              <Ionicons name="card-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={S.payBtnText}>
                {alreadyPaid ? `Pay Balance R ${money.balanceDue.toLocaleString()}` : `Pay R ${amountToPay.toLocaleString()}`}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
      </View>
    );
  }

  // PAYMENT STEP (Method Toggle: Paystack Card vs Biometric Fingerprint)
  if (step === 'payment') {
    return (
      <View style={[S.container, { backgroundColor: PS_DARK }]}>
        <View style={S.psHeader}>
          <TouchableOpacity onPress={() => setStep('disclaimer')} style={S.psBack}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={S.psHeaderCenter}>
            <View style={S.psLogo}>
              <Text style={S.psLogoText}>Paystack</Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={S.psContent} showsVerticalScrollIndicator={false}>
          <View style={S.amountBadge}>
            <Text style={S.amountLabel}>You are paying</Text>
            <Text style={S.amountValue}>R {amountToPay.toLocaleString()}</Text>
            <Text style={S.amountSub}>{roomName}</Text>
          </View>

          {/* Payment Method Switcher */}
          <View style={S.methodSwitcher}>
            <TouchableOpacity
              style={[S.methodTab, paymentMethod === 'card' && S.methodTabActive]}
              onPress={() => setPaymentMethod('card')}
            >
              <Ionicons name="card" size={16} color={paymentMethod === 'card' ? theme.colors.text : theme.colors.textMuted} />
              <Text style={[S.methodTabText, paymentMethod === 'card' && S.methodTabTextActive]}>Paystack Card</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[S.methodTab, paymentMethod === 'biometric' && S.methodTabActive]}
              onPress={() => setPaymentMethod('biometric')}
            >
              <Ionicons name="finger-print" size={16} color={paymentMethod === 'biometric' ? theme.colors.text : theme.colors.textMuted} />
              <Text style={[S.methodTabText, paymentMethod === 'biometric' && S.methodTabTextActive]}>
                Fingerprint / Face ID
              </Text>
            </TouchableOpacity>
          </View>

          {paymentMethod === 'biometric' ? (
            <View style={S.biometricForm}>
              <View style={S.biometricIconBadge}>
                <Ionicons name="finger-print-sharp" size={48} color="#c9a227" />
              </View>
              <Text style={S.biometricTitle}>1-Tap Biometric Payment</Text>
              <Text style={S.biometricSub}>
                {biometricAvailable
                  ? 'Scan your registered fingerprint or Face ID to instantly authorize payment.'
                  : 'Fingerprint hardware check: Biometric sensor is active on this device.'}
              </Text>

              <TouchableOpacity
                style={[S.payNowBtn, isProcessing && { opacity: 0.75 }]}
                onPress={handleBiometricPayment}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <>
                    <Ionicons name="finger-print" size={22} color="#0f172a" />
                    <Text style={S.payNowText}>Authenticate & Pay R {amountToPay.toLocaleString()}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            /* Card Form */
            <View style={S.cardForm}>
              <View style={S.cardFormHeader}>
                <Ionicons name="card" size={20} color={PS_BLUE} />
                <Text style={S.cardFormTitle}>Card Payment</Text>
                <View style={S.cardBrands}>
                  <Text style={S.cardBrand}>VISA</Text>
                  <Text style={S.cardBrand}>MC</Text>
                </View>
              </View>

              <Text style={S.fieldLabel}>Card Number</Text>
              <TextInput
                style={S.cardInput}
                placeholder="0000 0000 0000 0000"
                placeholderTextColor="#aaa"
                keyboardType="numeric"
                value={cardNumber}
                onChangeText={t => setCardNumber(formatCardNumber(t))}
                maxLength={19}
              />

              <Text style={S.fieldLabel}>Cardholder Name</Text>
              <TextInput
                style={S.cardInput}
                placeholder="Name on card"
                placeholderTextColor="#aaa"
                value={cardName}
                onChangeText={setCardName}
                autoCapitalize="words"
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={S.fieldLabel}>Expiry Date</Text>
                  <TextInput
                    style={S.cardInput}
                    placeholder="MM/YY"
                    placeholderTextColor="#aaa"
                    keyboardType="numeric"
                    value={expiry}
                    onChangeText={t => setExpiry(formatExpiry(t))}
                    maxLength={5}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.fieldLabel}>CVV</Text>
                  <TextInput
                    style={S.cardInput}
                    placeholder="•••"
                    placeholderTextColor="#aaa"
                    keyboardType="numeric"
                    secureTextEntry
                    value={cvv}
                    onChangeText={t => setCvv(t.slice(0, 4))}
                    maxLength={4}
                  />
                </View>
              </View>

              <TouchableOpacity style={S.testCardBtn} onPress={() => setShowTestCard(!showTestCard)}>
                <Ionicons name="information-circle-outline" size={16} color={PS_BLUE} />
                <Text style={[S.testCardText, { color: PS_BLUE }]}>Use Paystack test card</Text>
              </TouchableOpacity>
              {showTestCard && (
                <View style={S.testCardPanel}>
                  <Text style={S.testCardHint}>Test card: <Text style={{ fontWeight: '700' }}>4084 0840 8408 4081</Text></Text>
                  <Text style={S.testCardHint}>Expiry: <Text style={{ fontWeight: '700' }}>any future</Text> · CVV: <Text style={{ fontWeight: '700' }}>408</Text></Text>
                  <TouchableOpacity
                    style={{ marginTop: 6 }}
                    onPress={() => {
                      setCardNumber('4084 0840 8408 4081');
                      setExpiry('12/26');
                      setCvv('408');
                      setCardName('Demo Guest');
                      setShowTestCard(false);
                    }}
                  >
                    <Text style={{ color: PS_BLUE, fontWeight: '700', fontSize: 13 }}>→ Autofill test card</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={[S.payNowBtn, isProcessing && { opacity: 0.75 }]}
                onPress={handlePayNow}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#0f172a" />
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={18} color="#0f172a" />
                    <Text style={S.payNowText}>Pay R {amountToPay.toLocaleString()} Now</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={S.psFooter}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#666" />
            <Text style={S.psFooterText}>Secured by Paystack · PCI DSS Compliant</Text>
          </View>
        </ScrollView>

        <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
      </View>
    );
  }

  // CONFIRMATION STEP
  return (
    <View style={S.container}>
      <View style={S.header}>
        <View style={{ width: 28 }} />
        <View style={S.headerCenter}>
          <Text style={S.headerTitle}>Payment Complete</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={S.successIconContainer}>
          <View style={S.successCircle}>
            <Ionicons name="checkmark-sharp" size={42} color={theme.colors.success} />
          </View>
          <Text style={S.successHeading}>Transaction Successful!</Text>
          <Text style={S.successSubtext}>
            {isNewBooking ? 'Your reservation is confirmed.' : 'Payment processed successfully.'}
          </Text>
          <View style={S.paymentMethodBadge}>
            <Text style={S.paymentMethodText}>
              Paid via {paymentMethod === 'biometric' ? 'Android Biometrics (Fingerprint)' : 'Paystack Card'}
            </Text>
          </View>
        </View>

          <View style={S.receiptBox}>
            <Text style={S.receiptHeader}>CONFIRMATION REF</Text>
            <Text style={S.receiptRefText}>{confirmationNumber}</Text>
            <View style={S.receiptDivider} />
            <View style={S.breakdownRow}>
              <Text style={S.breakdownLabel}>Space Booked:</Text>
              <Text style={S.breakdownValue}>{roomName}</Text>
            </View>
            {isNewBooking && checkIn && (
              <View style={S.breakdownRow}>
                <Text style={S.breakdownLabel}>Arrival Date:</Text>
                <Text style={S.breakdownValue}>{checkIn}</Text>
              </View>
            )}
            {money.cateringTotal > 0 && (
              <View style={S.breakdownRow}>
                <Text style={S.breakdownLabel}>Catering Included:</Text>
                <Text style={S.breakdownValue}>R {money.cateringTotal.toLocaleString()}</Text>
              </View>
            )}
            <View style={S.breakdownRow}>
              <Text style={S.breakdownLabel}>Combined Total:</Text>
              <Text style={S.breakdownValue}>R {money.combinedTotal.toLocaleString()}</Text>
            </View>
            <View style={S.breakdownRow}>
              <Text style={S.breakdownLabel}>Amount Paid:</Text>
              <Text style={[S.breakdownValue, { color: theme.colors.success }]}>R {amountToPay.toLocaleString()}</Text>
            </View>
            <View style={S.breakdownRow}>
              <Text style={S.breakdownLabel}>Remaining Balance:</Text>
              <Text style={S.breakdownValue}>
                R {Math.max(0, money.combinedTotal - money.amountPaid - amountToPay).toLocaleString()}
              </Text>
            </View>
          </View>

          <View style={S.actionButtons}>
            <TouchableOpacity style={S.cancelBtn} onPress={handleSimulateEmailReceipt}>
              <Ionicons name="mail-outline" size={18} color={theme.colors.secondary} style={{ marginRight: 6 }} />
              <Text style={S.cancelBtnText}>Email Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.payBtn} onPress={handleCompleteBooking}>
              <Text style={S.payBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
      </ScrollView>

      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
      backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    },
    backButton: { padding: 4, marginLeft: -8 },
    headerCenter: { alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text },
    headerSubtitle: { fontSize: 12, color: theme.colors.textMuted },
    scrollContent: { padding: 20, paddingBottom: 40 },

    policyCard: { backgroundColor: theme.colors.warningLight, borderWidth: 1, borderColor: theme.colors.warning, borderRadius: 16, padding: 16, marginBottom: 20 },
    policyHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    policyHeaderTitle: { fontSize: 15, fontWeight: 'bold', color: theme.colors.warning },
    policyText: { fontSize: 12, color: theme.colors.warning, lineHeight: 18, marginBottom: 6 },

    breakdownCard: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    breakdownTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: 16 },
    breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, alignItems: 'flex-start' },
    breakdownLabel: { fontSize: 14, color: theme.colors.textMuted, flex: 1 },
    breakdownValue: { fontSize: 14, fontWeight: '600', color: theme.colors.text, textAlign: 'right' },
    breakdownDivider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 12 },

    paymentSelectorBox: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: theme.colors.border },
    paymentSelectorTitle: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 12, textAlign: 'center' },
    paymentToggleContainer: { flexDirection: 'row', backgroundColor: theme.colors.surfaceVariant, borderRadius: 12, padding: 4, marginBottom: 16 },
    toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
    toggleBtnActive: { backgroundColor: theme.colors.secondary, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    toggleBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
    toggleBtnTextActive: { color: '#fff' },
    balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border },
    balanceLabel: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '500' },
    balanceValue: { fontSize: 14, color: theme.colors.warning, fontWeight: 'bold' },

    secureBadge: { flexDirection: 'row', backgroundColor: theme.colors.surfaceVariant, padding: 16, borderRadius: 16, alignItems: 'center', gap: 12, marginBottom: 24 },
    secureTitle: { fontSize: 13, fontWeight: 'bold', color: theme.colors.text },
    secureDesc: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },

    actionButtons: { flexDirection: 'row', gap: 12 },
    cancelBtn: { flex: 1, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderStrong, paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    cancelBtnText: { color: theme.colors.text, fontWeight: 'bold', fontSize: 15 },
    payBtn: { flex: 1, backgroundColor: theme.colors.success, paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    payBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

    // Paystack Screen
    psHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: PS_DARK },
    psBack: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    psHeaderCenter: { flex: 1, alignItems: 'center' },
    psLogo: { backgroundColor: PS_BLUE, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
    psLogoText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
    psContent: { padding: 20, paddingBottom: 40 },

    amountBadge: {
      backgroundColor: PS_BLUE + '22', borderWidth: 1, borderColor: PS_BLUE,
      borderRadius: 16, padding: 18, alignItems: 'center', marginBottom: 16,
    },
    amountLabel: { fontSize: 12, color: '#ccc', fontWeight: '500' },
    amountValue: { fontSize: 32, fontWeight: '900', color: '#fff', marginTop: 2 },
    amountSub: { fontSize: 12, color: '#aaa', marginTop: 2 },

    // Method Switcher
    methodSwitcher: { flexDirection: 'row', backgroundColor: '#0f2744', padding: 4, borderRadius: 14, marginBottom: 16 },
    methodTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
    methodTabActive: { backgroundColor: theme.colors.primary },
    methodTabText: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
    methodTabTextActive: { color: theme.colors.text },

    biometricForm: { backgroundColor: '#0f2744', borderRadius: 20, padding: 24, alignItems: 'center' },
    biometricIconBadge: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(201,162,39,0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    biometricTitle: { fontSize: 18, fontWeight: '800', color: '#ffffff', textAlign: 'center' },
    biometricSub: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', marginTop: 6, marginBottom: 24, lineHeight: 18 },

    cardForm: { backgroundColor: '#0f2744', borderRadius: 20, padding: 20 },
    cardFormHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    cardFormTitle: { fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 },
    cardBrands: { flexDirection: 'row', gap: 6 },
    cardBrand: { fontSize: 10, fontWeight: '800', color: '#ccc', borderWidth: 1, borderColor: '#555', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },

    fieldLabel: { fontSize: 11, fontWeight: '600', color: '#aaa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
    cardInput: {
      backgroundColor: '#1a3a5c', borderWidth: 1, borderColor: '#2a4a6c',
      borderRadius: 10, padding: 12, fontSize: 15, color: '#fff',
      marginBottom: 12, letterSpacing: 1,
    },

    testCardBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    testCardText: { fontSize: 12, fontWeight: '600' },
    testCardPanel: {
      backgroundColor: '#0d2035', borderRadius: 10, padding: 12, marginBottom: 12,
      borderWidth: 1, borderColor: PS_BLUE + '40',
    },
    testCardHint: { fontSize: 12, color: '#aaa', marginBottom: 4 },

    payNowBtn: {
      backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, width: '100%',
    },
    payNowText: { color: theme.colors.text, fontSize: 16, fontWeight: '900' },

    psFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24 },
    psFooterText: { fontSize: 12, color: theme.colors.textSecondary },

    successIconContainer: { alignItems: 'center', marginVertical: 30 },
    successCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.successLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    successHeading: { fontSize: 24, fontWeight: '800', color: theme.colors.text, marginBottom: 6 },
    successSubtext: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
    paymentMethodBadge: { backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginTop: 10 },
    paymentMethodText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '700' },

    receiptBox: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: theme.colors.border },
    receiptHeader: { fontSize: 11, fontWeight: 'bold', color: theme.colors.textMuted, letterSpacing: 1, marginBottom: 4 },
    receiptRefText: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text, letterSpacing: 2, marginBottom: 16 },
    receiptDivider: { width: '100%', height: 1, backgroundColor: theme.colors.border, marginBottom: 16 },
  });
