import React, { useState, useEffect } from 'react';
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
  ScrollView,
  SafeAreaView
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { getTheme } from '@/constants/theme';

interface Room {
  id: string;
  name: string;
  type: string;
  price: number;
  capacity: number;
  description: string;
  amenities: string[];
}

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

  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  useEffect(() => {
    const simulateRooms = async () => {
      await new Promise(r => setTimeout(r, 1000));
      setRooms([
        { id: '1', name: 'Ocean Suite', type: 'Deluxe', price: 299, capacity: 2, description: 'Stunning ocean views', amenities: ['Pool', 'WiFi'] },
        { id: '2', name: 'Garden Villa', type: 'Premium', price: 399, capacity: 4, description: 'Private garden access', amenities: ['Garden', 'WiFi'] },
        { id: '3', name: 'Presidential Suite', type: 'Luxury', price: 899, capacity: 6, description: 'Ultimate luxury experience', amenities: ['Terrace', 'WiFi', 'Spa'] },
      ]);
      setIsLoading(false);
    };
    simulateRooms();
  }, []);

  const openGallery = (room: Room) => {
    setSelectedRoom(room);
    setShowGalleryModal(true);
  };

  const handleProceedToPayment = () => {
    if (!selectedRoom) return;
    setShowBookingModal(false);
    Alert.alert("Booking", `Room ${selectedRoom.name} selected!`);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  const nightsCount = 3;

  const renderRoomItem = ({ item: room }: { item: Room }) => (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <TouchableOpacity 
        activeOpacity={0.9} 
        onPress={() => openGallery(room)}
        style={styles.imageContainer}
      >
        <View style={[styles.cardImage, { backgroundColor: theme.colors.surfaceVariant }]} />
        <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>R {room.price} / night</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.cardBody}>
        <Text style={[styles.roomName, { color: theme.colors.text }]}>{room.name}</Text>
        <Text style={[styles.roomCapacity, { color: theme.colors.textSecondary }]}>Up to {room.capacity} Guests</Text>
        <Text style={[styles.roomDesc, { color: theme.colors.textMuted }]} numberOfLines={2}>{room.description}</Text>

        <View style={styles.cardFooter}>
          <TouchableOpacity 
            style={[styles.galleryBtn, { backgroundColor: theme.colors.surfaceVariant }]} 
            onPress={() => openGallery(room)}
          >
            <Ionicons name="eye-outline" size={16} color={theme.colors.secondary} />
            <Text style={[styles.galleryBtnText, { color: theme.colors.secondary }]}>View Photos</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.bookBtn, { backgroundColor: theme.colors.primary }]} 
            onPress={() => {
              setSelectedRoom(room);
              setShowBookingModal(true);
            }}
          >
            <Text style={styles.bookBtnText}>Select</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Suites Collection</Text>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>Select Your Sanctuary</Text>
        </View>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        renderItem={renderRoomItem}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingTop: 60, 
    paddingHorizontal: 20, 
    paddingBottom: 16, 
    borderBottomWidth: 1 
  },
  backButton: { padding: 4, marginLeft: -8 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 12 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: { 
    backgroundColor: '#ffffff', 
    borderRadius: 20, 
    overflow: 'hidden', 
    marginBottom: 20, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.08, 
    shadowRadius: 10, 
    elevation: 4 
  },
  imageContainer: { height: 200, position: 'relative' },
  cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  priceBadge: { 
    position: 'absolute', 
    top: 12, 
    left: 12, 
    backgroundColor: '#1e3a5f', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 8 
  },
  priceBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  cardBody: { padding: 20 },
  roomName: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  roomCapacity: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  roomDesc: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  cardFooter: { flexDirection: 'row', gap: 12 },
  galleryBtn: { 
    flex: 1, 
    backgroundColor: '#f1f5f9', 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 12, 
    borderRadius: 10, 
    gap: 6 
  },
  galleryBtnText: { fontWeight: 'bold', fontSize: 13 },
  bookBtn: { 
    flex: 1, 
    backgroundColor: '#c9a227', 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 12, 
    borderRadius: 10 
  },
  bookBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});