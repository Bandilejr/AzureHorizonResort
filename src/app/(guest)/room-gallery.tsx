import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  Image,
  Modal,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/context/AuthContext';
import { auth } from '../../services/firebase-services';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';

interface Room {
  id: string;
  name: string;
  type: string;
  price: number;
  capacity: number;
  description: string;
  amenities: string[];
  imageUrl: string;
  galleryUrls: string[];
}

const SUITE_DATA: Room[] = [
  {
    id: '1',
    name: 'Oceanfront Sunset Suite',
    type: 'Deluxe Suite',
    price: 349,
    capacity: 2,
    description: 'Breathtaking panoramic views of the Atlantic ocean with private balcony, king canopy bed, and freestanding marble bathtub.',
    amenities: ['Private Balcony', 'Ocean View', 'Free High-Speed WiFi', 'Complimentary Breakfast', 'Mini Bar'],
    imageUrl: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80',
    ],
  },
  {
    id: '2',
    name: 'Royal Palm Garden Villa',
    type: 'Private Villa',
    price: 520,
    capacity: 4,
    description: 'Secluded luxury villa surrounded by lush tropical gardens, features a private heated plunge pool and personal butler service.',
    amenities: ['Private Plunge Pool', 'Personal Butler', 'Private Garden', 'Espresso Machine', 'Spa Rain Shower'],
    imageUrl: 'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=800&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
    ],
  },
  {
    id: '3',
    name: 'Presidential Sky Penthouse',
    type: 'Penthouse',
    price: 950,
    capacity: 6,
    description: 'The pinnacle of resort living. 300sqm rooftop penthouse featuring 360-degree coast views, private infinity jacuzzi, and wine cellar.',
    amenities: ['Rooftop Jacuzzi', 'Wine Cellar', '360° Coast View', '24/7 Concierge', 'Helipad Access'],
    imageUrl: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=800&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80',
    ],
  },
  {
    id: '4',
    name: 'Coral Reef Family Suite',
    type: 'Executive Family',
    price: 430,
    capacity: 5,
    description: 'Spacious interconnecting suite designed for families, steps away from the main resort infinity pool and kids lounge.',
    amenities: ['Direct Pool Access', '2 Master Bedrooms', 'Kids Lounge Access', 'Kitchenette', 'Gaming Console'],
    imageUrl: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=800&q=80',
    galleryUrls: [
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80',
    ],
  },
];

export default function RoomGalleryScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const openGallery = (room: Room) => {
    setSelectedRoom(room);
    setCurrentImageIndex(0);
    setShowGalleryModal(true);
  };

  const { profile } = useAuth();
  const user = auth.currentUser;
  const isVisitor = !user || profile?.status === 'visitor';

  const handleSelectRoom = (room: Room) => {
    if (isVisitor) {
      showAlert({
        title: '🔒 Resident Sign-In Required',
        message: 'Please sign in to your room stay account to complete suite reservations and room bookings.',
        type: 'warning',
        confirmText: 'Sign In Now',
        cancelText: 'Cancel',
        onConfirm: () => {
          router.push('/login');
        },
      });
      return;
    }

    showAlert({
      title: `Reserve ${room.name}`,
      message: `Nightly Rate: R${room.price}/night\nMax Capacity: ${room.capacity} Guests\n\nWould you like to proceed to room reservation booking?`,
      type: 'info',
      confirmText: 'Proceed to Book',
      cancelText: 'Cancel',
      onConfirm: () => {
        router.push('/(guest)/reservations' as any);
      },
    });
  };

  const renderRoomItem = ({ item: room }: { item: Room }) => (
    <View style={styles.card}>
      <TouchableOpacity 
        activeOpacity={0.9} 
        onPress={() => openGallery(room)}
        style={styles.imageContainer}
      >
        <Image source={{ uri: room.imageUrl }} style={styles.cardImage} resizeMode="cover" />
        <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>R {room.price} / night</Text>
        </View>
        <View style={styles.photoCountBadge}>
          <Ionicons name="images-outline" size={14} color={theme.colors.textInverse} />
          <Text style={styles.photoCountText}>{room.galleryUrls.length} Photos</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.cardBody}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{room.type}</Text>
        </View>
        <Text style={styles.roomName}>{room.name}</Text>
        <Text style={styles.roomCapacity}>Up to {room.capacity} Guests · Premium Oceanfront</Text>
        <Text style={styles.roomDesc} numberOfLines={2}>{room.description}</Text>

        <View style={styles.amenityRow}>
          {room.amenities.slice(0, 3).map((am, i) => (
            <View key={i} style={styles.amenityPill}>
              <Text style={styles.amenityText}>{am}</Text>
            </View>
          ))}
        </View>

        <View style={styles.cardFooter}>
          <TouchableOpacity 
            style={styles.galleryBtn} 
            onPress={() => openGallery(room)}
          >
            <Ionicons name="eye-outline" size={16} color={theme.colors.gold} />
            <Text style={styles.galleryBtnText}>Photo Tour</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.bookBtn} 
            onPress={() => handleSelectRoom(room)}
          >
            <Text style={styles.bookBtnText}>Reserve Suite</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <Screen scroll={false} padded={false}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Suites & Villa Gallery</Text>
          <Text style={styles.subtitle}>Explore oceanfront luxury accommodations</Text>
        </View>
      </View>

      <FlatList
        data={SUITE_DATA}
        keyExtractor={(item) => item.id}
        renderItem={renderRoomItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* FULLSCREEN PHOTO GALLERY MODAL */}
      <Modal visible={showGalleryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{selectedRoom?.name}</Text>
              <Text style={styles.modalSubtitle}>Photo {currentImageIndex + 1} of {selectedRoom?.galleryUrls.length || 1}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowGalleryModal(false)} style={styles.closeModalBtn}>
              <Ionicons name="close" size={24} color={theme.colors.textInverse} />
            </TouchableOpacity>
          </View>

          {selectedRoom && (
            <View style={styles.modalBody}>
              <Image
                source={{ uri: selectedRoom.galleryUrls[currentImageIndex] }}
                style={styles.modalImage}
                resizeMode="cover"
              />

              <View style={styles.thumbnailRow}>
                {selectedRoom.galleryUrls.map((url, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => setCurrentImageIndex(index)}
                    style={[styles.thumbnailWrap, currentImageIndex === index && styles.thumbnailWrapActive]}
                  >
                    <Image source={{ uri: url }} style={styles.thumbnailImage} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      </Modal>

      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </Screen>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
    subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },

    listContent: { padding: 20, paddingTop: 10, paddingBottom: 40 },
    card: { backgroundColor: theme.colors.surface, borderRadius: 24, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border, shadowColor: theme.colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    imageContainer: { height: 220, width: '100%', position: 'relative' },
    cardImage: { width: '100%', height: '100%' },

    priceBadge: { position: 'absolute', top: 14, right: 14, backgroundColor: theme.colors.text, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.primary },
    priceBadgeText: { color: theme.colors.primary, fontWeight: '900', fontSize: 13 },

    photoCountBadge: { position: 'absolute', bottom: 14, left: 14, backgroundColor: theme.colors.overlay, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    photoCountText: { color: theme.colors.textInverse, fontSize: 12, fontWeight: '700' },

    cardBody: { padding: 20 },
    typeBadge: { alignSelf: 'flex-start', backgroundColor: theme.colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
    typeBadgeText: { color: theme.colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },

    roomName: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
    roomCapacity: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2, fontWeight: '600' },
    roomDesc: { fontSize: 13, color: theme.colors.textMuted, marginTop: 8, lineHeight: 18 },

    amenityRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    amenityPill: { backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    amenityText: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },

    cardFooter: { flexDirection: 'row', gap: 10, marginTop: 20 },
    galleryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 14, paddingVertical: 12 },
    galleryBtnText: { color: theme.colors.primary, fontWeight: '800', fontSize: 13 },
    bookBtn: { flex: 1, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 12 },
    bookBtnText: { color: theme.colors.text, fontWeight: '800', fontSize: 14 },

    modalOverlay: { flex: 1, backgroundColor: theme.colors.overlay, padding: 20, paddingTop: 50, justifyContent: 'space-between' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { color: theme.colors.textInverse, fontSize: 20, fontWeight: '800' },
    modalSubtitle: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
    closeModalBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' },

    modalBody: { flex: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 20 },
    modalImage: { width: '100%', height: 320, borderRadius: 20, marginBottom: 20 },

    thumbnailRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
    thumbnailWrap: { width: 70, height: 50, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
    thumbnailWrapActive: { borderColor: theme.colors.primary },
    thumbnailImage: { width: '100%', height: '100%' },
  });