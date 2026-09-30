import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  TextInput,
  ImageBackground,
  Modal,
  Alert,
  ActivityIndicator,
  useColorScheme
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebase-services';
import { collection, addDoc } from 'firebase/firestore';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import { useAuth } from '@/context/AuthContext';

const spaTreatments = [
  { id: '1', name: 'Azure Signature Massage', duration: '60 min', price: 1200, icon: 'body-outline', desc: 'A soothing deep-tissue massage using custom essential oils harvested from resort gardens.' },
  { id: '2', name: 'Hydrotherapy Soak & Scrub', duration: '45 min', price: 850, icon: 'water-outline', desc: 'Exfoliating sea salt scrub followed by a therapeutic mineral bath overlooking the ocean.' },
  { id: '3', name: 'Hot Stone Renewal', duration: '75 min', price: 1450, icon: 'flame-outline', desc: 'Smooth basalt stones release deep muscle tension and restore body harmony.' },
  { id: '4', name: 'Radiance Ocean Facial', duration: '60 min', price: 1100, icon: 'sparkles-outline', desc: 'Marine extract collagen treatment that hydrates and illuminates sun-kissed skin.' },
  { id: '5', name: 'Couples Sunset Serenity', duration: '90 min', price: 2800, icon: 'heart-outline', desc: 'Side-by-side massages in a private beachside cabana followed by champagne.' },
];

export default function SpaScreen() {
  const { profile } = useAuth();
  const user = auth.currentUser;
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  const [selectedTreatment, setSelectedTreatment] = useState<any>(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const handleOpenBooking = (treatment: any) => {
    if (!user || profile?.status === 'visitor') {
      showAlert({
        title: "🔒 Sign In Required",
        message: "Please sign in to your room stay account to book spa treatments.",
        type: "warning",
        confirmText: "Sign In",
        cancelText: "Cancel",
        onConfirm: () => router.push('/login'),
      });
      return;
    }
    setSelectedTreatment(treatment);
    setShowBookingModal(true);
  };

  const handleConfirmBooking = async () => {
    if (!bookingDate || !bookingTime) {
      showAlert({ title: "Missing Details", message: "Please enter a preferred date and time.", type: "warning" });
      return;
    }

    if (!user) {
      showAlert({ title: "Authentication Error", message: "You must be logged in to book a spa treatment.", type: "warning" });
      return;
    }

    setIsSubmitting(true);

    try {
      const bookingData = {
        guestId: user.uid,
        guestName: user.displayName || profile?.displayName || 'Resort Guest',
        treatmentName: selectedTreatment.name,
        price: selectedTreatment.price,
        date: bookingDate,
        time: bookingTime,
        specialRequests: specialRequests,
        status: 'confirmed',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'spa_bookings'), bookingData);

      setShowBookingModal(false);
      setShowSuccessModal(true);
      setBookingDate('');
      setBookingTime('');
      setSpecialRequests('');
    } catch (error) {
      console.error("Booking error:", error);
      showAlert({ title: "Booking Failed", message: "We couldn't process your request. Please try again.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#1e3a5f" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Horizon Spa</Text>
          <Text style={styles.headerSubtitle}>Relax & Rejuvenate</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HERO BANNER */}
        <ImageBackground 
          source={require('../../../assets/images/amenity-spa.jpg')} 
          style={styles.heroBanner}
          resizeMode="cover"
        >
          <View style={styles.heroOverlay}>
            <Ionicons name="leaf" size={40} color="#c9a227" style={styles.heroIcon} />
            <Text style={styles.heroTitle}>Find Your Inner Peace</Text>
            <Text style={styles.heroText}>Award-winning wellness therapies tailored to your body&apos;s specific needs.</Text>
          </View>
        </ImageBackground>

        <Text style={styles.sectionTitle}>Signature Treatments</Text>

        {/* TREATMENT CARDS */}
        <View style={styles.treatmentsContainer}>
          {spaTreatments.map((treatment) => (
            <View key={treatment.id} style={styles.treatmentCard}>
              <View style={styles.iconContainer}>
                <Ionicons name={treatment.icon as any} size={28} color="#81b29a" />
              </View>
              
              <View style={styles.treatmentInfo}>
                <Text style={styles.treatmentName}>{treatment.name}</Text>
                <Text style={styles.treatmentDesc}>{treatment.desc}</Text>
                <View style={styles.treatmentMeta}>
                  <Text style={styles.treatmentDuration}>
                    <Ionicons name="time-outline" size={14} /> {treatment.duration}
                  </Text>
                  <Text style={styles.treatmentPrice}>R {treatment.price}</Text>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.bookButton}
                onPress={() => handleOpenBooking(treatment)}
              >
                <Text style={styles.bookButtonText}>Book</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* BOOKING MODAL (BOTTOM SHEET STYLE) */}
      <Modal visible={showBookingModal} animationType="slide" transparent onRequestClose={() => setShowBookingModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reserve {selectedTreatment?.name}</Text>
              <TouchableOpacity onPress={() => setShowBookingModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalPriceText}>Total: R {selectedTreatment?.price} ({selectedTreatment?.duration})</Text>

            <Text style={styles.inputLabel}>Preferred Date</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. Tomorrow, 14 Aug" 
              value={bookingDate} 
              onChangeText={setBookingDate} 
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.inputLabel}>Preferred Time</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. 14:30" 
              value={bookingTime} 
              onChangeText={setBookingTime} 
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.inputLabel}>Special Requests / Allergies</Text>
            <TextInput 
              style={[styles.input, { height: 80 }]} 
              placeholder="e.g. Deep pressure, lavender oil preference..." 
              value={specialRequests} 
              onChangeText={setSpecialRequests} 
              multiline
              placeholderTextColor="#94a3b8"
            />

            <TouchableOpacity 
              style={styles.confirmButton}
              onPress={handleConfirmBooking}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm Spa Appointment</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SUCCESS MODAL */}
      <Modal visible={showSuccessModal} animationType="fade" transparent onRequestClose={() => setShowSuccessModal(false)}>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={60} color="#10b981" />
            <Text style={styles.successTitle}>Spa Appointment Booked!</Text>
            <Text style={styles.successSub}>Our spa therapist has received your booking. Please arrive 15 minutes before your scheduled time.</Text>

            <TouchableOpacity 
              style={styles.doneButton}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={styles.doneButtonText}>Back to Spa Menu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom Themed Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    backButton: { padding: 4 },
    headerCenter: { alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.secondary },
    headerSubtitle: { fontSize: 12, color: theme.colors.textSecondary },

    scrollContent: { padding: 20, paddingBottom: 40 },
    heroBanner: { height: 180, borderRadius: 20, overflow: 'hidden', marginBottom: 24 },
    heroOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', padding: 20, justifyContent: 'center' },
    heroIcon: { marginBottom: 6 },
    heroTitle: { fontSize: 24, fontWeight: '900', color: '#ffffff' },
    heroText: { fontSize: 13, color: '#cbd5e1', marginTop: 4, maxWidth: '85%' },

    sectionTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 14 },
    treatmentsContainer: { gap: 14 },
    treatmentCard: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: theme.colors.border, elevation: 2 },
    iconContainer: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(129, 178, 154, 0.15)', justifyContent: 'center', alignItems: 'center' },
    treatmentInfo: { flex: 1 },
    treatmentName: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
    treatmentDesc: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 },
    treatmentMeta: { flexDirection: 'row', gap: 12, marginTop: 8 },
    treatmentDuration: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
    treatmentPrice: { fontSize: 13, color: '#81b29a', fontWeight: '800' },

    bookButton: { backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
    bookButtonText: { color: theme.colors.textInverse, fontSize: 13, fontWeight: '800' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    bottomSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
    modalPriceText: { fontSize: 14, fontWeight: '700', color: '#81b29a', marginBottom: 16 },

    inputLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 6 },
    input: { backgroundColor: theme.colors.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: theme.colors.text, marginBottom: 14, borderWidth: 1, borderColor: theme.colors.border },

    confirmButton: { backgroundColor: '#81b29a', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
    confirmButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },

    successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    successCard: { backgroundColor: theme.colors.surface, borderRadius: 24, padding: 28, alignItems: 'center', width: '90%' },
    successTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text, marginTop: 12 },
    successSub: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 18 },
    doneButton: { backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 20 },
    doneButtonText: { color: theme.colors.textInverse, fontWeight: '800', fontSize: 14 },
  });
