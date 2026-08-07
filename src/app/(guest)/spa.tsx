import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  ImageBackground
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Firebase Imports
import { auth, db } from '../../services/firebase-services';
import { collection, addDoc } from 'firebase/firestore';

// Hardcoded Spa Menu for the Presentation
const spaTreatments = [
  { id: 't1', name: 'Deep Tissue Massage', duration: '60 Min', price: 850, icon: 'body', desc: 'Releases chronic muscle tension.' },
  { id: 't2', name: 'Ocean Radiance Facial', duration: '45 Min', price: 600, icon: 'sparkles', desc: 'Hydrating and brightening facial.' },
  { id: 't3', name: 'Couples Retreat', duration: '90 Min', price: 1500, icon: 'heart', desc: 'Side-by-side massage with champagne.' },
  { id: 't4', name: 'Hot Stone Therapy', duration: '60 Min', price: 900, icon: 'flame', desc: 'Warm stones to ease stiffness and increase circulation.' },
];

export default function SpaScreen() {
  const [selectedTreatment, setSelectedTreatment] = useState<any>(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const user = auth.currentUser;

  const handleOpenBooking = (treatment: any) => {
    setSelectedTreatment(treatment);
    setShowBookingModal(true);
  };

  const handleConfirmBooking = async () => {
    if (!bookingDate || !bookingTime) {
      Alert.alert("Missing Details", "Please enter a preferred date and time.");
      return;
    }

    if (!user) {
      Alert.alert("Authentication Error", "You must be logged in to book a spa treatment.");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const bookingData = {
        guestId: user.uid,
        guestName: user.displayName || 'Guest',
        treatmentName: selectedTreatment.name,
        price: selectedTreatment.price,
        date: bookingDate,
        time: bookingTime,
        specialRequests: specialRequests,
        status: 'confirmed',
        createdAt: new Date().toISOString()
      };

      // Push to Firestore
      await addDoc(collection(db, 'spa_bookings'), bookingData);

      setShowBookingModal(false);
      setShowSuccessModal(true);
      
      // Reset form
      setBookingDate('');
      setBookingTime('');
      setSpecialRequests('');
      
    } catch (error) {
      console.error("Booking error:", error);
      Alert.alert("Booking Failed", "We couldn't process your request. Please try again.");
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
            <Text style={styles.heroText}>Award-winning wellness therapies tailored to your body's specific needs.</Text>
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
      <Modal visible={showBookingModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Schedule Treatment</Text>
              <TouchableOpacity onPress={() => setShowBookingModal(false)}>
                <Ionicons name="close-circle" size={28} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {selectedTreatment && (
              <View style={styles.selectedServiceCard}>
                <Text style={styles.selectedServiceName}>{selectedTreatment.name}</Text>
                <Text style={styles.selectedServicePrice}>R {selectedTreatment.price} • {selectedTreatment.duration}</Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Preferred Date (YYYY-MM-DD)</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. 2026-10-15"
              value={bookingDate}
              onChangeText={setBookingDate}
            />

            <Text style={styles.inputLabel}>Preferred Time</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. 14:00"
              value={bookingTime}
              onChangeText={setBookingTime}
            />

            <Text style={styles.inputLabel}>Special Requests (Optional)</Text>
            <TextInput 
              style={[styles.input, styles.textArea]} 
              placeholder="e.g. Focus on lower back..."
              multiline
              numberOfLines={3}
              value={specialRequests}
              onChangeText={setSpecialRequests}
            />

            <TouchableOpacity 
              style={styles.confirmButton} 
              onPress={handleConfirmBooking}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm Reservation</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SUCCESS MODAL */}
      <Modal visible={showSuccessModal} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.successModal}>
            <Ionicons name="checkmark-circle" size={60} color="#81b29a" />
            <Text style={styles.successTitle}>Booking Confirmed!</Text>
            <Text style={styles.successText}>
              Your {selectedTreatment?.name} has been scheduled. Our spa concierge will be ready for you!
            </Text>
            <TouchableOpacity style={styles.successBtn} onPress={() => setShowSuccessModal(false)}>
              <Text style={styles.successBtnText}>Done</Text>
            </TouchableOpacity>
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
    color: '#81b29a', 
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroBanner: {
    backgroundColor: '#1e3a5f',
    margin: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  heroOverlay: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', 
  },
  heroIcon: {
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroText: {
    color: '#cbd5e1',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  treatmentsContainer: {
    paddingHorizontal: 16,
  },
  treatmentCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  treatmentInfo: {
    flex: 1,
    marginRight: 12,
  },
  treatmentName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  treatmentDesc: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  treatmentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  treatmentDuration: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  treatmentPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#c9a227',
  },
  bookButton: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  bookButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
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
    minHeight: '60%',
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
    color: '#1e3a5f',
  },
  selectedServiceCard: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#81b29a',
  },
  selectedServiceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  selectedServicePrice: {
    color: '#64748b',
    fontSize: 13,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#0f172a',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  confirmButton: {
    backgroundColor: '#1e3a5f',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successModal: {
    backgroundColor: '#fff',
    width: '100%',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e3a5f',
    marginTop: 16,
    marginBottom: 8,
  },
  successText: {
    textAlign: 'center',
    color: '#64748b',
    marginBottom: 24,
    lineHeight: 22,
  },
  successBtn: {
    backgroundColor: '#81b29a',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  successBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
