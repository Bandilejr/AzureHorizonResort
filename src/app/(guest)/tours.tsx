import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Modal,
  Alert,
  ImageBackground
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';

// Firebase Imports
import { auth, db } from '../../services/firebase-services';
import { collection, addDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';

// Premium Tour Data with Built-in Schedules & Capacities
const availableTours = [
  { 
    id: 'tr1', 
    name: 'Coastal Helicopter Tour', 
    duration: '45 Min', 
    location: 'South Helipad',
    pricing: { adult: 2500, child: 1800, pensioner: 2000 },
    image: 'https://images.unsplash.com/photo-1540962351504-03099e0a754b?q=80&w=800&auto=format&fit=crop',
    desc: 'Experience breathtaking aerial views of the coastline, coral reefs, and the resort from our luxury helicopter.',
    schedules: [
      { id: 's1', date: '2026-08-10', time: '09:00', capacity: 4, booked: 2 },
      { id: 's2', date: '2026-08-10', time: '14:00', capacity: 4, booked: 4 }, // Fully Booked
      { id: 's3', date: '2026-08-11', time: '10:30', capacity: 4, booked: 0 },
    ]
  },
  { 
    id: 'tr2', 
    name: 'Sea Turtle Snorkeling', 
    duration: '2 Hours', 
    location: 'North Beach Marina',
    pricing: { adult: 850, child: 450, pensioner: 650 },
    image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?q=80&w=800&auto=format&fit=crop',
    desc: 'Guided snorkeling through protected coral reefs. Swim alongside majestic sea turtles and vibrant marine life.',
    schedules: [
      { id: 's4', date: '2026-08-12', time: '08:00', capacity: 15, booked: 12 },
      { id: 's5', date: '2026-08-14', time: '13:00', capacity: 15, booked: 2 },
    ]
  },
  { 
    id: 'tr3', 
    name: 'Sunset Catamaran Cruise', 
    duration: '3 Hours', 
    location: 'Main Dock',
    pricing: { adult: 1200, child: 800, pensioner: 1000 },
    image: 'https://images.unsplash.com/photo-1544325997-65774a3f1245?q=80&w=800&auto=format&fit=crop',
    desc: 'Sail into the horizon on a luxury catamaran. Includes champagne, light hors d\'oeuvres, and coastal storytelling.',
    schedules: [
      { id: 's6', date: '2026-08-15', time: '16:30', capacity: 30, booked: 28 }, // Almost Full
      { id: 's7', date: '2026-08-16', time: '16:30', capacity: 30, booked: 30 }, // Fully Booked
      { id: 's8', date: '2026-08-17', time: '16:30', capacity: 30, booked: 5 },
    ]
  }
];

export default function ToursScreen() {
  // 1. Added State for Tours List to allow local capacity updates
  const theme = useAppTheme();
  const styles = createStyles(theme);
  
  const [toursList, setToursList] = useState(availableTours);
  
  const [selectedTour, setSelectedTour] = useState<any>(null);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  
  // Ticket State
  const [tickets, setTickets] = useState({ adult: 0, child: 0, pensioner: 0 });
  const [indemnityAgreed, setIndemnityAgreed] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [bookingRef, setBookingRef] = useState('');

  const user = auth.currentUser;
  const totalTickets = tickets.adult + tickets.child + tickets.pensioner;
  
  const calculateTotal = () => {
    if (!selectedTour) return 0;
    return (
      (tickets.adult * selectedTour.pricing.adult) +
      (tickets.child * selectedTour.pricing.child) +
      (tickets.pensioner * selectedTour.pricing.pensioner)
    );
  };

  const { profile } = useAuth();

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const handleOpenBooking = (tour: any) => {
    if (!user || profile?.status === 'visitor') {
      showAlert({
        title: "🔒 Sign In Required",
        message: "Please sign in to your room stay account to book guided island tours.",
        type: "warning",
        confirmText: "Sign In",
        cancelText: "Cancel",
        onConfirm: () => router.push('/login'),
      });
      return;
    }
    setSelectedTour(tour);
    setSelectedSlot(null);
    setTickets({ adult: 0, child: 0, pensioner: 0 });
    setIndemnityAgreed(false);
    setShowBookingModal(true);
  };

  const handleSelectSlot = (slot: any) => {
    setSelectedSlot(slot);
    // Auto-select 1 adult ticket when they pick a slot (if they haven't picked tickets yet)
    if (totalTickets === 0 && (slot.capacity - slot.booked > 0)) {
      setTickets({ adult: 1, child: 0, pensioner: 0 });
    }
  };

  const updateTicket = (type: 'adult' | 'child' | 'pensioner', delta: number) => {
    if (!selectedSlot) {
      showAlert({ title: "Select a Session", message: "Please choose a date and time first.", type: "warning" });
      return;
    }

    const spotsLeft = selectedSlot.capacity - selectedSlot.booked;
    
    // Prevent adding more tickets if we hit the slot's maximum capacity
    if (delta > 0 && totalTickets >= spotsLeft) {
      showAlert({ title: "Capacity Reached", message: `There are only ${spotsLeft} spots left for this session.`, type: "warning" });
      return;
    }

    setTickets(prev => ({
      ...prev,
      [type]: Math.max(0, prev[type] + delta)
    }));
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot) {
      showAlert({ title: "Missing Details", message: "Please select a session.", type: "warning" });
      return;
    }
    if (totalTickets === 0) {
      showAlert({ title: "No Tickets", message: "Please select at least one ticket.", type: "warning" });
      return;
    }
    if (!indemnityAgreed) {
      showAlert({ title: "Indemnity Required", message: "You must agree to the indemnity waiver to participate in excursions.", type: "warning" });
      return;
    }
    if (!user) {
      showAlert({ title: "Authentication Error", message: "You must be logged in to book an excursion.", type: "warning" });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const reference = `TB-${Date.now().toString(36).toUpperCase()}`;
      
      const bookingData = {
        guestId: user.uid,
        guestName: user.displayName || 'Guest',
        tourName: selectedTour.name,
        date: selectedSlot.date,
        time: selectedSlot.time,
        tickets: tickets,
        totalAmount: calculateTotal(),
        status: 'confirmed',
        bookingReference: reference,
        paymentMethod: 'room_charge',
        createdAt: new Date().toISOString()
      };

      // Push to Firestore
      await addDoc(collection(db, 'tour_bookings'), bookingData);

      // 2. Local Update: Decrease available spots immediately after booking
      setToursList(prevTours => prevTours.map(tour => {
        if (tour.id === selectedTour.id) {
          return {
            ...tour,
            schedules: tour.schedules.map((slot: any) => {
              if (slot.id === selectedSlot.id) {
                return { ...slot, booked: slot.booked + totalTickets };
              }
              return slot;
            })
          };
        }
        return tour;
      }));

      setBookingRef(reference);
      setShowBookingModal(false);
      setShowSuccessModal(true);
      
    } catch (error) {
      console.error("Booking error:", error);
      Alert.alert("Booking Failed", "We couldn't process your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.secondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Excursions</Text>
          <Text style={styles.headerSubtitle}>Discover the Island</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageIntro}>
          <Text style={styles.pageTitle}>Featured Tours</Text>
          <Text style={styles.pageDesc}>Unforgettable experiences curated by Azure Horizon.</Text>
        </View>

        {/* 3. Changed from availableTours.map to toursList.map */}
        {toursList.map((tour) => (
          <TouchableOpacity 
            key={tour.id} 
            style={styles.tourCard}
            onPress={() => handleOpenBooking(tour)}
            activeOpacity={0.9}
          >
            <ImageBackground source={{ uri: tour.image }} style={styles.tourImage}>
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{tour.duration}</Text>
              </View>
            </ImageBackground>
            
            <View style={styles.tourInfo}>
              <Text style={styles.tourName}>{tour.name}</Text>
              <View style={styles.locationRow}>
                <Ionicons name="map" size={14} color={theme.colors.textMuted} />
                <Text style={styles.locationText}>{tour.location}</Text>
              </View>
              <Text style={styles.tourDesc} numberOfLines={2}>{tour.desc}</Text>
              
              <View style={styles.tourFooter}>
                <View>
                  <Text style={styles.priceLabel}>Starting from</Text>
                  <Text style={styles.priceValue}>R {tour.pricing.child}</Text>
                </View>
                <View style={styles.bookButton}>
                  <Text style={styles.bookButtonText}>Select Tickets</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* TICKET & BOOKING MODAL (BOTTOM SHEET) */}
      <Modal visible={showBookingModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Book Excursion</Text>
              <TouchableOpacity onPress={() => setShowBookingModal(false)}>
                <Ionicons name="close-circle" size={28} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedTour && (
                <>
                  <Text style={styles.selectedTourName}>{selectedTour.name}</Text>
                  
                  {/* SCHEDULE SECTION */}
                  <View style={styles.scheduleSection}>
                    <Text style={styles.sectionHeading}>1. Select a Session</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slotScroll}>
                      {selectedTour.schedules.map((slot: any) => {
                        const spotsLeft = slot.capacity - slot.booked;
                        const isFull = spotsLeft === 0;
                        const isSelected = selectedSlot?.id === slot.id;

                        return (
                          <TouchableOpacity 
                            key={slot.id} 
                            disabled={isFull}
                            onPress={() => handleSelectSlot(slot)}
                            style={[
                              styles.slotCard, 
                              isSelected && styles.slotSelected,
                              isFull && styles.slotFull
                            ]}
                          >
                            <Text style={[styles.slotDate, isSelected && styles.slotTextSelected]}>{slot.date}</Text>
                            <Text style={[styles.slotTime, isSelected && styles.slotTextSelected]}>{slot.time}</Text>
                            <View style={styles.spotsBadge}>
                              <Text style={isFull ? styles.spotsFullText : styles.spotsText}>
                                {isFull ? 'Fully Booked' : `${spotsLeft} spots left`}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* TICKET SELECTORS */}
                  <View style={styles.ticketSection}>
                    <Text style={styles.sectionHeading}>2. Select Tickets</Text>
                    
                    {(['adult', 'child', 'pensioner'] as const).map(type => (
                      <View key={type} style={styles.ticketRow}>
                        <View>
                          <Text style={styles.ticketType}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
                          <Text style={styles.ticketPrice}>R {selectedTour.pricing[type]}</Text>
                        </View>
                        <View style={styles.stepper}>
                          <TouchableOpacity onPress={() => updateTicket(type, -1)} style={styles.stepBtn}>
                            <Ionicons name="remove" size={20} color={theme.colors.secondary} />
                          </TouchableOpacity>
                          <Text style={styles.stepValue}>{tickets[type]}</Text>
                          <TouchableOpacity onPress={() => updateTicket(type, 1)} style={styles.stepBtn}>
                            <Ionicons name="add" size={20} color={theme.colors.secondary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* INDEMNITY */}
                  <TouchableOpacity 
                    style={[styles.indemnityBox, indemnityAgreed && styles.indemnityAgreed]} 
                    onPress={() => setIndemnityAgreed(!indemnityAgreed)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.checkbox}>
                      {indemnityAgreed && <Ionicons name="checkmark" size={16} color={theme.colors.textInverse} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.indemnityTitle}>Indemnity & Terms</Text>
                      <Text style={styles.indemnityText}>
                        I acknowledge participation involves inherent risks. I voluntarily assume all risks and release Azure Horizon Resort from liability.
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* TOTAL & SUBMIT */}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total ({totalTickets} Tickets)</Text>
                    <Text style={styles.totalValue}>R {calculateTotal()}</Text>
                  </View>

                  <TouchableOpacity 
                    style={[styles.confirmButton, (!selectedSlot || totalTickets === 0 || !indemnityAgreed) && styles.confirmButtonDisabled]} 
                    onPress={handleConfirmBooking}
                    disabled={isSubmitting || !selectedSlot || totalTickets === 0 || !indemnityAgreed}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color={theme.colors.textInverse} />
                    ) : (
                      <Text style={styles.confirmButtonText}>Confirm & Charge to Room</Text>
                    )}
                  </TouchableOpacity>
                  <View style={{ height: 40 }} />
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SUCCESS MODAL */}
      <Modal visible={showSuccessModal} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.successModal}>
            <Ionicons name="ticket" size={60} color={theme.colors.primary} />
            <Text style={styles.successTitle}>Tour Booked!</Text>
            <Text style={styles.successText}>
              Your tickets for {selectedTour?.name} have been secured and charged to your room.
            </Text>
            <View style={styles.referenceBox}>
              <Text style={styles.refLabel}>BOOKING REF</Text>
              <Text style={styles.refValue}>{bookingRef}</Text>
            </View>
            <TouchableOpacity style={styles.successBtn} onPress={() => setShowSuccessModal(false)}>
              <Text style={styles.successBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom Themed Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </Screen>
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
    color: theme.colors.primary, 
  },
  scrollContent: {
    paddingBottom: 40,
  },
  pageIntro: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  pageDesc: {
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  tourCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  tourImage: {
    height: 180,
    justifyContent: 'flex-end',
    padding: 16,
  },
  durationBadge: {
    backgroundColor: theme.colors.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  durationText: {
    color: theme.colors.textInverse,
    fontWeight: 'bold',
    fontSize: 12,
  },
  tourInfo: {
    padding: 20,
  },
  tourName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  locationText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  tourDesc: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  tourFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 16,
  },
  priceLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  bookButton: {
    backgroundColor: theme.colors.surfaceVariant,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  bookButtonText: {
    color: theme.colors.text,
    fontWeight: 'bold',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
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
  selectedTourName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 24,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  scheduleSection: {
    marginBottom: 24,
  },
  slotScroll: {
    flexDirection: 'row',
    paddingBottom: 10,
  },
  slotCard: {
    backgroundColor: theme.colors.surfaceVariant,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  slotSelected: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  slotFull: {
    backgroundColor: theme.colors.surfaceVariant,
    borderColor: theme.colors.borderStrong,
    opacity: 0.6,
  },
  slotDate: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '600',
    marginBottom: 4,
  },
  slotTime: {
    fontSize: 18,
    color: theme.colors.text,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  slotTextSelected: {
    color: theme.colors.textInverse,
  },
  spotsBadge: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  spotsText: {
    fontSize: 11,
    color: theme.colors.success,
    fontWeight: 'bold',
  },
  spotsFullText: {
    fontSize: 11,
    color: theme.colors.error,
    fontWeight: 'bold',
  },
  ticketSection: {
    marginBottom: 24,
  },
  ticketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  ticketType: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  ticketPrice: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: 'bold',
    marginTop: 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stepBtn: {
    padding: 10,
  },
  stepValue: {
    width: 30,
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
    color: theme.colors.text,
  },
  indemnityBox: {
    flexDirection: 'row',
    backgroundColor: theme.colors.warningLight,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'flex-start',
    gap: 12,
  },
  indemnityAgreed: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.success,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    marginTop: 2,
  },
  indemnityTitle: {
    fontWeight: 'bold',
    color: theme.colors.warning,
    marginBottom: 4,
  },
  indemnityText: {
    fontSize: 12,
    color: theme.colors.warning,
    lineHeight: 18,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 2,
    borderTopColor: theme.colors.border,
    paddingTop: 20,
    marginBottom: 24,
  },
  totalLabel: {
    fontSize: 16,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  confirmButton: {
    backgroundColor: theme.colors.secondary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: theme.colors.textMuted,
  },
  confirmButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  referenceBox: {
    backgroundColor: theme.colors.surfaceVariant,
    padding: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  refLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  refValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
    letterSpacing: 2,
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
