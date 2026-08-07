import React, { useState, useEffect, useMemo } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  Image,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebase-services';
import { collection, getDocs, addDoc } from 'firebase/firestore';

interface Room {
  id: string;
  name: string;
  type: string;
  price: number;
  capacity: number;
  description: string;
  amenities: string[];
}

const LOCAL_ROOM_IMAGES: Record<string, any[]> = {
  'coastal-breeze': [
    require('../../../assets/images/rooms/coastal-breeze.png'),
    require('../../../assets/images/rooms/coastal-breeze-balcony.jpg'),
    require('../../../assets/images/rooms/coastal-breeze-bathroom.jpg'),
  ],
  'family-villa': [
    require('../../../assets/images/rooms/family-villa.png'),
    require('../../../assets/images/rooms/family-villa-living.jpg'),
    require('../../../assets/images/rooms/family-villa-kids.png'),
  ],
  'garden-terrace': [
    require('../../../assets/images/rooms/garden-terrace-garden.png'),
    require('../../../assets/images/rooms/garden-terrace-bedroom.jpg'),
    require('../../../assets/images/rooms/garden-terrace-patio.jpg'),
  ],
  'heritage-suite': [
    require('../../../assets/images/rooms/heritage-suite.png'),
    require('../../../assets/images/rooms/heritage-suite-bedroom.jpg'),
    require('../../../assets/images/rooms/heritage-suite-living.jpg'),
  ],
  'honeymoon-suite': [
    require('../../../assets/images/rooms/honeymoon-suite.png'),
    require('../../../assets/images/rooms/honeymoon-suite-bathroom.jpg'),
    require('../../../assets/images/rooms/honeymoon-suite-view.jpg'),
  ],
  'ocean-suite': [
    require('../../../assets/images/rooms/ocean-suite.png'),
    require('../../../assets/images/rooms/ocean-suite-bedroom.jpg'),
    require('../../../assets/images/rooms/ocean-suite-balcony.jpg'),
    require('../../../assets/images/rooms/ocean-suite-bathroom.jpg'),
  ],
  'penthouse': [
    require('../../../assets/images/rooms/penthouse.png'),
    require('../../../assets/images/rooms/penthouse-living.jpg'),
    require('../../../assets/images/rooms/penthouse-pool.jpg'),
    require('../../../assets/images/rooms/penthouse-view.jpg'),
  ],
  'presidential-suite': [
    require('../../../assets/images/rooms/presidential-suite.png'),
    require('../../../assets/images/rooms/presidential-suite-living.jpg'),
    require('../../../assets/images/rooms/presidential-suite-kichen.jpg'),
    require('../../../assets/images/rooms/presidential-suite-piano.jpg'),
  ],
  'sunset-view': [
    require('../../../assets/images/rooms/sunset-view.png'),
    require('../../../assets/images/rooms/sunset-view-badroom.jpg'),
    require('../../../assets/images/rooms/sunset-view-balcony.jpg'),
  ],
  'zen-studio': [
    require('../../../assets/images/rooms/zen-studio.png'),
    require('../../../assets/images/rooms/zen-studio-bathroom.jpg'),
    require('../../../assets/images/rooms/zen-studio-meditation.jpg'),
  ],
};

const formatDate = (date: Date) => {
  return date.toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' });
};

const generateDateArray = (startDate: Date, count: number) => {
  return Array.from({ length: count }).map((_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  });
};

export default function RoomGalleryScreen() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [showBookingModal, setShowBookingModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guests, setGuests] = useState<number>(1);
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1); 
  
  const [checkInDate, setCheckInDate] = useState<Date>(tomorrow);
  const [checkOutDate, setCheckOutDate] = useState<Date>(() => {
    const d = new Date(tomorrow);
    d.setDate(d.getDate() + 3); 
    return d;
  });

  const user = auth.currentUser;

  const checkInOptions = useMemo(() => generateDateArray(tomorrow, 14), []);
  const checkOutOptions = useMemo(() => {
    const minCheckOut = new Date(checkInDate);
    minCheckOut.setDate(minCheckOut.getDate() + 1);
    return generateDateArray(minCheckOut, 14);
  }, [checkInDate]);

  const handleCheckInSelect = (date: Date) => {
    setCheckInDate(date);
    if (date >= checkOutDate) {
      const newOut = new Date(date);
      newOut.setDate(newOut.getDate() + 1);
      setCheckOutDate(newOut);
    }
  };

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const roomsRef = collection(db, 'rooms');
        const snapshot = await getDocs(roomsRef);
        const roomsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
        setRooms(roomsData);
      } catch (error) {
        console.error("Error fetching rooms:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRooms();
  }, []);

  // BULLETPROOF IMAGE MAPPER
  const getRoomImages = (room: Room) => {
    const searchString = `${room.name} ${room.type} ${room.id}`.toLowerCase();

    // 1. Aggressive Keyword Matching
    if (searchString.includes('ocean')) return LOCAL_ROOM_IMAGES['ocean-suite'];
    if (searchString.includes('presidential')) return LOCAL_ROOM_IMAGES['presidential-suite'];
    if (searchString.includes('penthouse')) return LOCAL_ROOM_IMAGES['penthouse'];
    if (searchString.includes('family') || searchString.includes('villa')) return LOCAL_ROOM_IMAGES['family-villa'];
    if (searchString.includes('garden')) return LOCAL_ROOM_IMAGES['garden-terrace'];
    if (searchString.includes('sunset')) return LOCAL_ROOM_IMAGES['sunset-view'];
    if (searchString.includes('zen') || searchString.includes('studio')) return LOCAL_ROOM_IMAGES['zen-studio'];
    if (searchString.includes('heritage')) return LOCAL_ROOM_IMAGES['heritage-suite'];
    if (searchString.includes('breeze') || searchString.includes('coastal')) return LOCAL_ROOM_IMAGES['coastal-breeze'];
    if (searchString.includes('honeymoon')) return LOCAL_ROOM_IMAGES['honeymoon-suite'];

    // 2. Deterministic Fallback (Ensures a stable, unique gallery if keywords fail)
    const keys = Object.keys(LOCAL_ROOM_IMAGES);
    const stableIndex = (room.id?.length || room.name?.length || 0) % keys.length;
    return LOCAL_ROOM_IMAGES[keys[stableIndex]];
  };

  // SMART CAPACITY CALCULATOR
  const getRoomCapacity = (room: Room) => {
    if (room.capacity && room.capacity > 0) return room.capacity;
    // Fallback if Firestore capacity is missing or broken
    const nameLower = room.name?.toLowerCase() || '';
    if (nameLower.includes('villa') || nameLower.includes('family') || nameLower.includes('presidential')) return 6;
    if (nameLower.includes('penthouse')) return 4;
    return 2;
  };

  const openGallery = (room: Room, index: number = 0) => {
    setSelectedRoom(room);
    setCurrentImageIndex(index);
    setShowGalleryModal(true);
  };

  const handleProceedToPayment = async () => {
    if (!user) {
      Alert.alert("Authentication Required", "Please log in to book a room.");
      router.push('/login');
      return;
    }
    if (!selectedRoom) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'room_bookings'), {
        guestId: user.uid,
        guestName: user.displayName || 'Resort Guest',
        suiteName: selectedRoom.name,
        nightlyRate: selectedRoom.price,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        nights: nightsCount,
        guests: guests,
        totalAmount: totalAmountDue,
        status: 'pending_payment',
        createdAt: new Date().toISOString()
      });

      setShowBookingModal(false);

      router.push({
        pathname: '/payment',
        params: { 
          roomName: selectedRoom.name,
          total: totalAmountDue, 
          depositAmount: totalAmountDue,
          nights: nightsCount,
          checkIn: formatDate(checkInDate),
          guests: guests
        }
      } as any);

    } catch (err) {
      console.error("Booking error:", err);
      Alert.alert("Error", "Could not process reservation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  const timeDiff = checkOutDate.getTime() - checkInDate.getTime();
  const nightsCount = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  const currentNightlyRate = selectedRoom ? selectedRoom.price : 0;
  const subTotalAmount = currentNightlyRate * nightsCount;
  const estimatedTaxes = Math.round(subTotalAmount * 0.15); 
  const totalAmountDue = subTotalAmount + estimatedTaxes;

  const renderRoomItem = ({ item: room }: { item: Room }) => {
    const roomImages = getRoomImages(room);
    const resolvedCapacity = getRoomCapacity(room);

    return (
      <View style={styles.card}>
        <TouchableOpacity 
          activeOpacity={0.9} 
          onPress={() => openGallery(room, 0)}
          style={styles.imageContainer}
        >
          <Image source={roomImages[0]} style={styles.cardImage} />
          <View style={styles.priceBadge}>
            <Text style={styles.priceBadgeText}>R {room.price} / night</Text>
          </View>
          {roomImages.length > 1 && (
            <View style={styles.photoCountBadge}>
              <Ionicons name="images-outline" size={14} color="#fff" />
              <Text style={styles.photoCountText}>{roomImages.length} Photos</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.cardBody}>
          <Text style={styles.roomName}>{room.name}</Text>
          <Text style={styles.roomCapacity}>Up to {resolvedCapacity} Guests</Text>
          <Text style={styles.roomDesc} numberOfLines={2}>{room.description}</Text>

          <View style={styles.cardFooter}>
            <TouchableOpacity 
              style={styles.galleryBtn} 
              onPress={() => openGallery(room, 0)}
            >
              <Ionicons name="eye-outline" size={16} color="#1e3a5f" />
              <Text style={styles.galleryBtnText}>View Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.bookBtn} 
              onPress={() => {
                setSelectedRoom(room);
                setGuests(1); // Reset guests
                setShowBookingModal(true);
              }}
            >
              <Text style={styles.bookBtnText}>Select</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#1e3a5f" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Suites Collection</Text>
          <Text style={styles.headerSubtitle}>Select Your Sanctuary</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        renderItem={renderRoomItem}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
      />

      {/* GALLERY MODAL */}
      <Modal visible={showGalleryModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          {selectedRoom && (
            <View style={styles.galleryContainer}>
              <View style={styles.galleryHeader}>
                <Text style={styles.galleryTitle}>{selectedRoom.name}</Text>
                <TouchableOpacity onPress={() => setShowGalleryModal(false)}>
                  <Ionicons name="close-circle" size={32} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.galleryMainImageWrapper}>
                <Image 
                  source={getRoomImages(selectedRoom)[currentImageIndex]} 
                  style={styles.galleryMainImage} 
                  resizeMode="contain"
                />
              </View>

              <FlatList
                horizontal
                data={getRoomImages(selectedRoom)}
                keyExtractor={(_, idx) => idx.toString()}
                contentContainerStyle={styles.thumbnailScroll}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item: img, index: idx }) => (
                  <TouchableOpacity 
                    onPress={() => setCurrentImageIndex(idx)}
                    style={[styles.thumbnailButton, currentImageIndex === idx && styles.thumbnailActive]}
                  >
                    <Image source={img} style={styles.thumbnailImage} />
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>
      </Modal>

      {/* BOOKING MODAL */}
      <Modal visible={showBookingModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            {selectedRoom && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Reservation Details</Text>
                  <TouchableOpacity onPress={() => setShowBookingModal(false)}>
                    <Ionicons name="close-circle" size={28} color="#94a3b8" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSuiteName}>{selectedRoom.name}</Text>
                
                {/* Check-In Date */}
                <View style={styles.dateSection}>
                  <View style={styles.dateLabelRow}>
                    <Ionicons name="calendar" size={16} color="#1e3a5f" />
                    <Text style={styles.dateLabelText}>Check-In Date</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
                    {checkInOptions.map((date, idx) => {
                      const isSelected = date.toDateString() === checkInDate.toDateString();
                      return (
                        <TouchableOpacity 
                          key={idx} 
                          onPress={() => handleCheckInSelect(date)}
                          style={[styles.dateChip, isSelected && styles.dateChipActive]}
                        >
                          <Text style={[styles.dateChipText, isSelected && styles.dateChipTextActive]}>
                            {formatDate(date)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Check-Out Date */}
                <View style={styles.dateSection}>
                  <View style={styles.dateLabelRow}>
                    <Ionicons name="calendar-outline" size={16} color="#e8aa42" />
                    <Text style={styles.dateLabelText}>Check-Out Date</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
                    {checkOutOptions.map((date, idx) => {
                      const isSelected = date.toDateString() === checkOutDate.toDateString();
                      return (
                        <TouchableOpacity 
                          key={idx} 
                          onPress={() => setCheckOutDate(date)}
                          style={[styles.dateChip, isSelected && styles.dateChipActiveAlt]}
                        >
                          <Text style={[styles.dateChipText, isSelected && styles.dateChipTextActive]}>
                            {formatDate(date)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* GUEST SELECTOR */}
                <View style={styles.dateSection}>
                  <View style={styles.dateLabelRow}>
                    <Ionicons name="people" size={16} color="#1e3a5f" />
                    <Text style={styles.dateLabelText}>Number of Guests</Text>
                  </View>
                  <View style={styles.guestControlContainer}>
                    <TouchableOpacity 
                      style={styles.guestBtn} 
                      onPress={() => setGuests(prev => Math.max(1, prev - 1))}
                    >
                      <Ionicons name="remove" size={20} color="#1e3a5f" />
                    </TouchableOpacity>
                    <Text style={styles.guestCount}>{guests}</Text>
                    <TouchableOpacity 
                      style={styles.guestBtn} 
                      onPress={() => setGuests(prev => Math.min(getRoomCapacity(selectedRoom), prev + 1))}
                    >
                      <Ionicons name="add" size={20} color="#1e3a5f" />
                    </TouchableOpacity>
                    <Text style={styles.guestMaxText}>(Max: {getRoomCapacity(selectedRoom)})</Text>
                  </View>
                </View>

                {/* Summary Box */}
                <View style={styles.summaryBox}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Nightly Rate ({nightsCount} {nightsCount === 1 ? 'night' : 'nights'}):</Text>
                    <Text style={styles.summaryValue}>R {subTotalAmount.toLocaleString()}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Taxes & Resort Fees (15%):</Text>
                    <Text style={styles.summaryValue}>R {estimatedTaxes.toLocaleString()}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryTotalLabel}>Total Amount Due:</Text>
                    <Text style={styles.summaryTotalValue}>R {totalAmountDue.toLocaleString()}</Text>
                  </View>
                </View>

                <TouchableOpacity 
                  style={styles.confirmBtn} 
                  onPress={handleProceedToPayment}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.confirmBtnText}>Proceed to Payment</Text>
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
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  backButton: { padding: 4, marginLeft: -8 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e3a5f' },
  headerSubtitle: { fontSize: 12, color: '#64748b' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  imageContainer: { height: 200, position: 'relative' },
  cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  priceBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: '#1e3a5f', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  priceBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  photoCountBadge: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  photoCountText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  cardBody: { padding: 20 },
  roomName: { fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  roomCapacity: { fontSize: 13, color: '#e8aa42', fontWeight: '600', marginBottom: 8 },
  roomDesc: { fontSize: 14, color: '#64748b', lineHeight: 20, marginBottom: 16 },
  cardFooter: { flexDirection: 'row', gap: 12 },
  galleryBtn: { flex: 1, backgroundColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, gap: 6 },
  galleryBtnText: { color: '#1e3a5f', fontWeight: 'bold', fontSize: 13 },
  bookBtn: { flex: 1, backgroundColor: '#1e3a5f', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
  bookBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center' },
  galleryContainer: { flex: 1, justifyContent: 'space-between', paddingVertical: 50 },
  galleryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  galleryTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  galleryMainImageWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 20 },
  galleryMainImage: { width: '100%', height: '100%' },
  thumbnailScroll: { paddingHorizontal: 20, gap: 10, paddingBottom: 20 },
  thumbnailButton: { width: 60, height: 60, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbnailActive: { borderColor: '#e8aa42' },
  thumbnailImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  bottomSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '95%', position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: '#64748b' },
  modalSuiteName: { fontSize: 22, fontWeight: 'bold', color: '#1e3a5f', marginBottom: 20 },
  dateSection: { marginBottom: 20 },
  dateLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  dateLabelText: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
  dateScroll: { gap: 10, paddingRight: 20 },
  dateChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#f1f5f9', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  dateChipActive: { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f' },
  dateChipActiveAlt: { backgroundColor: '#e8aa42', borderColor: '#e8aa42' },
  dateChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  dateChipTextActive: { color: '#fff' },
  guestControlContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', alignSelf: 'flex-start', padding: 6, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  guestBtn: { backgroundColor: '#fff', padding: 8, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  guestCount: { fontSize: 16, fontWeight: 'bold', color: '#1e3a5f', minWidth: 30, textAlign: 'center' },
  guestMaxText: { fontSize: 12, color: '#64748b', marginLeft: 12, marginRight: 6 },
  summaryBox: { backgroundColor: '#f8fafc', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 20 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 13, color: '#64748b' },
  summaryValue: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  summaryDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 6 },
  summaryTotalLabel: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
  summaryTotalValue: { fontSize: 18, fontWeight: 'bold', color: '#1e3a5f' },
  confirmBtn: { backgroundColor: '#e8aa42', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
