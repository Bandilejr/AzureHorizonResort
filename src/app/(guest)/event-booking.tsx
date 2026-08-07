import React, { useState, useEffect, useMemo } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Image,
  Modal,
  Alert,
  ActivityIndicator,
  Switch,
  Platform
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auth, db } from '../../services/firebase-services';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';

// Define the Venue structure
interface Venue {
  id: string;
  name: string;
  type: ('Conference' | 'Wedding' | 'Party' | 'Social')[];
  pricePerDay: number;
  maxCapacity: number;
  description: string;
  amenities: string[];
}

// Updated Curated Resort Venues
const VENUES: Venue[] = [
  {
    id: 'v-grand-ballroom',
    name: 'The Grand Ocean Ballroom',
    type: ['Wedding', 'Conference', 'Party'],
    pricePerDay: 25000,
    maxCapacity: 400,
    description: 'Our flagship venue featuring crystal chandeliers, panoramic ocean views, and a massive mahogany dance floor. Perfect for prestigious galas and weddings.',
    amenities: ['AV System', 'Mahogany Dance Floor', 'Private Bar', 'Stage', 'Backstage VIP Area']
  },
  {
    id: 'v-ashanti-estate',
    name: 'Ashanti Estate',
    type: ['Wedding', 'Party', 'Social'],
    pricePerDay: 32000,
    maxCapacity: 300,
    description: 'An exclusive, secluded estate offering ultimate privacy. Features sprawling lawns, classical architecture, and an elegant arrival courtyard.',
    amenities: ['Private Courtyard', 'Bridal Suite', 'Fountain Feature', 'Exclusive Entrance']
  },
  {
    id: 'v-klein-vineyards',
    name: 'Klein Parys Vineyards',
    type: ['Wedding', 'Party', 'Social'],
    pricePerDay: 18000,
    maxCapacity: 120,
    description: 'Rustic charm meets luxury. Nestled against the resort vineyards, providing a breathtaking, intimate backdrop for romantic celebrations and social mixers.',
    amenities: ['Wine Cellar Access', 'Rustic Decor', 'Fairy Lighting', 'Outdoor Fire Pits']
  },
  {
    id: 'v-beach-pavilion',
    name: 'Sunset Beach Pavilion',
    type: ['Wedding', 'Party', 'Social'],
    pricePerDay: 15000,
    maxCapacity: 150,
    description: 'An elegant open-air structure situated directly on the sand. Let the sound of crashing waves be the backdrop to your special day.',
    amenities: ['Open Air Architecture', 'Direct Beach Access', 'Tiki Torches', 'Ambient Lighting']
  },
  {
    id: 'v-garden-terrace',
    name: 'Botanical Garden Terrace',
    type: ['Party', 'Social', 'Wedding'],
    pricePerDay: 9000,
    maxCapacity: 80,
    description: 'A lush, manicured garden space surrounded by indigenous flora. Ideal for afternoon tea parties, intimate ceremonies, or social mixers.',
    amenities: ['Marquee Available', 'Floral Arches', 'Outdoor Seating', 'Water Features']
  }
];

// Complex Asset Mapper combining old endpoints and the new venues folder
const LOCAL_VENUE_IMAGES: Record<string, any[]> = {
  'v-grand-ballroom': [
    require('../../../assets/images/venues/grand_ocean_ballroom_1.png'),
    require('../../../assets/images/venues/grand_ocean_ballroom_2.png'),
    require('../../../assets/images/venues/grand_ocean_ballroom_3.png'),
    require('../../../assets/images/venues/grand_ocean_ballroom_4.png'),
    require('../../../assets/images/venues/grand_ocean_ballroom_5.png'),
    require('../../../assets/images/venues/grand_ocean_ballroom_6.png'),
  ],
  'v-ashanti-estate': [
    require('../../../assets/images/venues/ashanti_estate_1.png'),
    require('../../../assets/images/venues/ashanti_estate_3.png'),
    require('../../../assets/images/venues/ashanti_estate_4.png'),
    require('../../../assets/images/venues/ashanti_estate_5.png'),
    require('../../../assets/images/venues/ashanti_estate_6.png'),
    require('../../../assets/images/venues/ashanti_estate_7.png'),
  ],
  'v-klein-vineyards': [
    require('../../../assets/images/venues/klein_parys_vineyards_1.png'),
    require('../../../assets/images/venues/klein_parys_vineyards_2.png'),
    require('../../../assets/images/venues/klein_parys_vineyards_3.png'),
  ],
  'v-beach-pavilion': [
    require('../../../assets/images/rooms/coastal-breeze-balcony.jpg'), // Original requested fallback
    require('../../../assets/images/venues/sunset_beach_pavilion_2.jpg'),
    require('../../../assets/images/venues/sunset_beach_pavilion_3.jpg'),
    require('../../../assets/images/venues/sunset_beach_pavilion_4.jpg'),
    require('../../../assets/images/venues/sunset_beach_pavilion_5.jpg'),
    require('../../../assets/images/venues/sunset_beach_pavilion_6.jpg'),
  ],
 'v-garden-terrace': [
    require('../../../assets/images/rooms/garden-terrace-garden.png'), // Original fallback
    require('../../../assets/images/venues/botanical_garden_terrace_2.jpeg'), // Updated to .jpeg
    require('../../../assets/images/venues/botanical_garden_terrace_3.jpg'),  // Updated to .jpg
  ]
};

const EVENT_TYPES = ['All', 'Conference', 'Wedding', 'Party', 'Social'];

const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Generate 14 days from tomorrow for the quick scroller
const generateDateArray = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(tomorrow);
    d.setDate(d.getDate() + i);
    return d;
  });
};

export default function EventBookingScreen() {
  const user = auth.currentUser;
  
  // Search & Filter States
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [selectedType, setSelectedType] = useState<string>('All');
  const [expectedAttendance, setExpectedAttendance] = useState<number>(50);

  // Calendar States
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Availability States
  const [bookedVenueIds, setBookedVenueIds] = useState<string[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(true);

  // Gallery & Booking Modal States
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showBookingModal, setShowBookingModal] = useState(false);
  
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableDates = useMemo(() => generateDateArray(), []);

  // REAL-TIME AVAILABILITY ENGINE
  useEffect(() => {
    const fetchAvailability = async () => {
      setIsCheckingAvailability(true);
      try {
        const dateString = selectedDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        const bookingsRef = collection(db, 'event_bookings');
        
        // Query Firestore for any bookings on this exact date string
        const q = query(bookingsRef, where('eventDateStr', '==', dateString));
        const snapshot = await getDocs(q);
        
        const bookedIds = snapshot.docs.map(doc => doc.data().venueId);
        setBookedVenueIds(bookedIds);
      } catch (error) {
        console.error("Failed to fetch venue availability:", error);
      } finally {
        setIsCheckingAvailability(false);
      }
    };

    fetchAvailability();
  }, [selectedDate]);

  // Filter venues based on capacity, type, AND Availability
  const filteredVenues = VENUES.filter(venue => {
    const matchesCapacity = venue.maxCapacity >= expectedAttendance;
    const matchesType = selectedType === 'All' || venue.type.includes(selectedType as any);
    const isAvailable = !bookedVenueIds.includes(venue.id); // Hides if already booked today
    return matchesCapacity && matchesType && isAvailable;
  });

  const onDateChange = (event: any, selected: Date | undefined) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selected) {
      // Ensure they can't pick the past
      const today = new Date();
      if (selected > today) {
        setSelectedDate(selected);
      } else {
        Alert.alert("Invalid Date", "Event bookings must be made at least one day in advance.");
      }
    }
  };

  const openGallery = (venue: Venue) => {
    setSelectedVenue(venue);
    setCurrentImageIndex(0);
    setShowGalleryModal(true);
  };

  const handleProceedToPayment = async () => {
    if (!user) {
      Alert.alert("Authentication Required", "Please log in to reserve a venue.");
      router.push('/login');
      return;
    }
    if (!selectedVenue) return;

    setIsSubmitting(true);
    try {
      const depositAmount = Math.round(selectedVenue.pricePerDay * 0.5); 
      const dateString = selectedDate.toISOString().split('T')[0];

      const bookingRef = await addDoc(collection(db, 'event_bookings'), {
        guestId: user.uid,
        guestName: user.displayName || 'Event Organizer',
        venueId: selectedVenue.id,
        venueName: selectedVenue.name,
        eventDate: selectedDate.toISOString(),
        eventDateStr: dateString, // Used for the availability query later
        expectedAttendance,
        eventType: selectedType !== 'All' ? selectedType : 'General Event',
        totalAmount: selectedVenue.pricePerDay,
        depositRequired: depositAmount,
        termsAccepted: true,
        status: 'pending_payment',
        createdAt: new Date().toISOString()
      });

      setShowBookingModal(false);

     // Route to our unified payment screen!
      router.push({
        pathname: '/payment',
        params: { 
          roomName: selectedVenue.name, 
          total: selectedVenue.pricePerDay, 
          depositAmount: depositAmount,
          checkIn: formatDate(selectedDate), 
          nights: 1, 
          bookingId: bookingRef.id,
          expectedAttendance: expectedAttendance // <--- THIS IS THE MAGIC KEY
        }
      } as any);

    } catch (err) {
      console.error("Venue Booking error:", err);
      Alert.alert("Error", "Could not secure the venue. Please try again.");
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
          <Text style={styles.headerTitle}>Reserve Event Space</Text>
          <Text style={styles.headerSubtitle}>Corporate & Social Venues</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* SEARCH & FILTER ENGINE */}
      <View style={styles.filterEngine}>
        
        <View style={styles.filterRow}>
          <Ionicons name="calendar-outline" size={16} color="#64748b" style={styles.filterIcon} />
          
          {/* Calendar Picker Trigger */}
          <TouchableOpacity 
            style={styles.calendarTriggerBtn}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar" size={18} color="#1e3a5f" />
          </TouchableOpacity>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
            {availableDates.map((date, idx) => {
              const isSelected = date.toDateString() === selectedDate.toDateString();
              return (
                <TouchableOpacity 
                  key={idx} 
                  onPress={() => setSelectedDate(date)}
                  style={[styles.dateChip, isSelected && styles.dateChipActive]}
                >
                  <Text style={[styles.dateChipText, isSelected && styles.dateChipTextActive]}>
                    {formatDate(date)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              minimumDate={new Date()}
              onChange={onDateChange}
            />
          )}
        </View>

        <View style={styles.filterRow}>
          <Ionicons name="briefcase-outline" size={16} color="#64748b" style={styles.filterIcon} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
            {EVENT_TYPES.map((type, idx) => (
              <TouchableOpacity 
                key={idx} 
                onPress={() => setSelectedType(type)}
                style={[styles.typeChip, selectedType === type && styles.typeChipActive]}
              >
                <Text style={[styles.typeChipText, selectedType === type && styles.dateChipTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={[styles.filterRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
          <Ionicons name="people-outline" size={16} color="#64748b" style={styles.filterIcon} />
          <Text style={styles.stepperLabel}>Expected Attendance:</Text>
          <View style={styles.stepperContainer}>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => setExpectedAttendance(prev => Math.max(10, prev - 10))}>
              <Ionicons name="remove" size={18} color="#1e3a5f" />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{expectedAttendance}</Text>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => setExpectedAttendance(prev => prev + 10)}>
              <Ionicons name="add" size={18} color="#1e3a5f" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* AVAILABLE VENUES LIST */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isCheckingAvailability ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#1e3a5f" />
            <Text style={styles.emptyStateTitle}>Checking Resort Availability...</Text>
          </View>
        ) : filteredVenues.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-clear-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyStateTitle}>Fully Booked</Text>
            <Text style={styles.emptyStateSub}>There are no venues matching your criteria for this date. They may already be reserved. Try adjusting your date or headcount.</Text>
          </View>
        ) : (
          filteredVenues.map((venue) => (
            <View key={venue.id} style={styles.card}>
              <TouchableOpacity 
                activeOpacity={0.9} 
                style={styles.imageContainer}
                onPress={() => openGallery(venue)}
              >
                <Image source={LOCAL_VENUE_IMAGES[venue.id][0]} style={styles.cardImage} />
                <View style={styles.capacityBadge}>
                  <Ionicons name="people" size={12} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.capacityBadgeText}>Max {venue.maxCapacity}</Text>
                </View>
                {LOCAL_VENUE_IMAGES[venue.id].length > 1 && (
                  <View style={styles.photoCountBadge}>
                    <Ionicons name="images-outline" size={14} color="#fff" />
                    <Text style={styles.photoCountText}>{LOCAL_VENUE_IMAGES[venue.id].length} Photos</Text>
                  </View>
                )}
              </TouchableOpacity>
              
              <View style={styles.cardBody}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.venueName}>{venue.name}</Text>
                  <Text style={styles.venuePrice}>R {venue.pricePerDay.toLocaleString()}</Text>
                </View>
                <Text style={styles.priceSubtext}>per day</Text>
                
                <Text style={styles.venueDesc} numberOfLines={2}>{venue.description}</Text>
                
                <View style={styles.amenitiesRow}>
                  {venue.amenities.slice(0, 3).map((amenity, idx) => (
                    <View key={idx} style={styles.amenityChip}>
                      <Text style={styles.amenityText}>{amenity}</Text>
                    </View>
                  ))}
                  {venue.amenities.length > 3 && (
                    <Text style={styles.amenityPlus}>+{venue.amenities.length - 3}</Text>
                  )}
                </View>

                <TouchableOpacity 
                  style={styles.bookBtn} 
                  onPress={() => {
                    setSelectedVenue(venue);
                    setTermsAccepted(false);
                    setShowBookingModal(true);
                  }}
                >
                  <Text style={styles.bookBtnText}>Review & Reserve Space</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* FULLSCREEN VENUE GALLERY MODAL */}
      <Modal visible={showGalleryModal} animationType="fade" transparent>
        <View style={styles.galleryOverlay}>
          {selectedVenue && (
            <View style={styles.galleryContainer}>
              <View style={styles.galleryHeader}>
                <View>
                  <Text style={styles.galleryTitle}>{selectedVenue.name}</Text>
                  <Text style={styles.gallerySubtitle}>Max {selectedVenue.maxCapacity} Guests</Text>
                </View>
                <TouchableOpacity onPress={() => setShowGalleryModal(false)}>
                  <Ionicons name="close-circle" size={32} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.galleryMainImageWrapper}>
                <Image 
                  source={LOCAL_VENUE_IMAGES[selectedVenue.id][currentImageIndex]} 
                  style={styles.galleryMainImage} 
                  resizeMode="contain"
                />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailScroll}>
                {LOCAL_VENUE_IMAGES[selectedVenue.id].map((img, idx) => (
                  <TouchableOpacity 
                    key={idx}
                    onPress={() => setCurrentImageIndex(idx)}
                    style={[styles.thumbnailButton, currentImageIndex === idx && styles.thumbnailActive]}
                  >
                    <Image source={img} style={styles.thumbnailImage} />
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Unique Add-ins / Amenities View under photos */}
              <View style={styles.galleryAmenitiesBox}>
                <Text style={styles.galleryAmenitiesTitle}>Included Venue Features</Text>
                <View style={styles.galleryAmenitiesRow}>
                  {selectedVenue.amenities.map((amenity, idx) => (
                    <View key={idx} style={styles.galleryAmenityChip}>
                      <Ionicons name="checkmark-circle" size={14} color="#e8aa42" style={{ marginRight: 6 }} />
                      <Text style={styles.galleryAmenityText}>{amenity}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* BOOKING REVIEW MODAL */}
      <Modal visible={showBookingModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            {selectedVenue && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Review Reservation</Text>
                  <TouchableOpacity onPress={() => setShowBookingModal(false)}>
                    <Ionicons name="close-circle" size={28} color="#94a3b8" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalVenueName}>{selectedVenue.name}</Text>
                
                <View style={styles.summaryBox}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Event Date:</Text>
                    <Text style={styles.summaryValue}>{formatDate(selectedDate)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Expected Guests:</Text>
                    <Text style={styles.summaryValue}>{expectedAttendance} / {selectedVenue.maxCapacity}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Daily Rental Rate:</Text>
                    <Text style={styles.summaryValue}>R {selectedVenue.pricePerDay.toLocaleString()}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabelDeposit}>Required Deposit (50%):</Text>
                    <Text style={styles.summaryValueDeposit}>R {(selectedVenue.pricePerDay * 0.5).toLocaleString()}</Text>
                  </View>
                </View>

                <View style={styles.policyBox}>
                  <View style={styles.policyHeader}>
                    <Ionicons name="document-text-outline" size={18} color="#1e3a5f" />
                    <Text style={styles.policyTitle}>Resort Rental Policies</Text>
                  </View>
                  <Text style={styles.policyText}>• A 50% non-refundable deposit is required to lock in your date.</Text>
                  <Text style={styles.policyText}>• Setup and breakdown must occur within your reserved 24-hour block.</Text>
                  <Text style={styles.policyText}>• After-parties and heavy noise must conclude strictly by 02:00 AM.</Text>
                  <Text style={styles.policyText}>• Food & Beverage must be handled via the Resort's internal Event Catering team.</Text>
                  <Text style={styles.policyText}>• A refundable breakage deposit of R5,000 will be added to your final folio.</Text>
                  
                  <View style={styles.termsToggleRow}>
                    <Text style={styles.termsToggleText}>I have read and accept the rental conditions.</Text>
                    <Switch
                      trackColor={{ false: '#cbd5e1', true: '#e8aa42' }}
                      thumbColor={termsAccepted ? '#fff' : '#f8fafc'}
                      onValueChange={setTermsAccepted}
                      value={termsAccepted}
                    />
                  </View>
                </View>

                <TouchableOpacity 
                  style={[styles.confirmBtn, !termsAccepted && styles.confirmBtnDisabled]} 
                  onPress={handleProceedToPayment}
                  disabled={isSubmitting || !termsAccepted}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.confirmBtnText}>Proceed to Secure Deposit</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', zIndex: 10 },
  backButton: { padding: 4, marginLeft: -8 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e3a5f' },
  headerSubtitle: { fontSize: 12, color: '#64748b' },
  filterEngine: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 3, zIndex: 5 },
  filterRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 12 },
  filterIcon: { marginRight: 12, marginTop: 2 },
  calendarTriggerBtn: { backgroundColor: '#f1f5f9', padding: 8, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  dateScroll: { gap: 8, paddingRight: 20 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f1f5f9', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  dateChipActive: { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f' },
  dateChipText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  dateChipTextActive: { color: '#fff' },
  typeChip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#cbd5e1' },
  typeChipActive: { backgroundColor: '#e8aa42', borderColor: '#e8aa42' },
  typeChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  stepperLabel: { flex: 1, fontSize: 14, color: '#475569', fontWeight: '500' },
  stepperContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 4 },
  stepperBtn: { padding: 4, backgroundColor: '#fff', borderRadius: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  stepperValue: { fontSize: 14, fontWeight: 'bold', color: '#1e3a5f', width: 40, textAlign: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyStateTitle: { fontSize: 18, fontWeight: 'bold', color: '#64748b', marginTop: 16, marginBottom: 8 },
  emptyStateSub: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 4 },
  imageContainer: { height: 180, position: 'relative' },
  cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  capacityBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  capacityBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  photoCountBadge: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  photoCountText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  cardBody: { padding: 16 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  venueName: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginRight: 8 },
  venuePrice: { fontSize: 18, fontWeight: 'bold', color: '#e8aa42' },
  priceSubtext: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginBottom: 12 },
  venueDesc: { fontSize: 13, color: '#64748b', lineHeight: 20, marginBottom: 16 },
  amenitiesRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  amenityChip: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  amenityText: { fontSize: 10, color: '#475569', fontWeight: '500' },
  amenityPlus: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold', marginLeft: 4 },
  bookBtn: { backgroundColor: '#1e3a5f', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  bookBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  galleryOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  galleryContainer: { flex: 1, justifyContent: 'flex-start', paddingTop: 60, paddingBottom: 40 },
  galleryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, marginBottom: 20 },
  galleryTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  gallerySubtitle: { color: '#e8aa42', fontSize: 13, fontWeight: '600' },
  galleryMainImageWrapper: { height: '40%', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  galleryMainImage: { width: '100%', height: '100%' },
  thumbnailScroll: { paddingHorizontal: 20, gap: 10, maxHeight: 70 },
  thumbnailButton: { width: 70, height: 70, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbnailActive: { borderColor: '#e8aa42' },
  thumbnailImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  galleryAmenitiesBox: { backgroundColor: 'rgba(255,255,255,0.05)', marginHorizontal: 20, marginTop: 24, borderRadius: 16, padding: 16 },
  galleryAmenitiesTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 12, letterSpacing: 0.5 },
  galleryAmenitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  galleryAmenityChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  galleryAmenityText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: '#64748b' },
  modalVenueName: { fontSize: 22, fontWeight: 'bold', color: '#1e3a5f', marginBottom: 20 },
  summaryBox: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 20 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 13, color: '#64748b' },
  summaryValue: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  summaryDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },
  summaryLabelDeposit: { fontSize: 14, fontWeight: 'bold', color: '#d97706' },
  summaryValueDeposit: { fontSize: 16, fontWeight: 'bold', color: '#d97706' },
  policyBox: { backgroundColor: '#fffbeb', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#fde68a', marginBottom: 24 },
  policyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  policyTitle: { fontSize: 15, fontWeight: 'bold', color: '#92400e' },
  policyText: { fontSize: 12, color: '#b45309', lineHeight: 18, marginBottom: 6 },
  termsToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#fcd34d' },
  termsToggleText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#92400e', marginRight: 16 },
  confirmBtn: { backgroundColor: '#16a34a', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  confirmBtnDisabled: { backgroundColor: '#cbd5e1' },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
