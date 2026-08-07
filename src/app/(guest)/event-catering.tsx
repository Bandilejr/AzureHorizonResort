import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Image,
  Modal,
  Dimensions,
  SafeAreaView
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

// --- LOCAL IMAGE MAP FOR REACT NATIVE ---
// React Native cannot load local images from dynamic strings.
// You must map the image names from your database to your local require() paths here:
const localCateringImages: Record<string, any> = {
  'highlands_braai_combo_1.jpg': require('../../../assets/images/catering/highlands_braai_combo_1.jpg'),
  'highlands_braai_combo_2.jpg': require('../../../assets/images/catering/highlands_braai_combo_2.jpg'),
  'highlands_braai_combo_3.jpg': require('../../../assets/images/catering/highlands_braai_combo_3.jpg'),
  'highlands_braai_combo_4.jpg': require('../../../assets/images/catering/highlands_braai_combo_4.jpg'),
  'william_wallace_combo_1.jpg': require('../../../assets/images/catering/william_wallace_combo_1.jpg'),
  'william_wallace_combo_2.jpg': require('../../../assets/images/catering/william_wallace_combo_2.jpg'),
  'william_wallace_combo_3.jpg': require('../../../assets/images/catering/william_wallace_combo_3.jpg'),
  'wedding_bells_canapes_1.jpg': require('../../../assets/images/catering/wedding_bells_canapes_1.jpg'),
  'wedding_bells_canapes_2.jpg': require('../../../assets/images/catering/wedding_bells_canapes_2.jpg'),
  'wedding_bells_canapes_3.jpg': require('../../../assets/images/catering/wedding_bells_canapes_3.jpg'),
  'wedding_bells_three_package_2.jpg': require('../../../assets/images/catering/wedding_bells_three_package_2.jpg'),
  'wedding_bells_three_package_3.jpg': require('../../../assets/images/catering/wedding_bells_three_package_3.jpg'),
  'wedding_bells_three_package_4.jpg': require('../../../assets/images/catering/wedding_bells_three_package_4.jpg'),
  'wedding_bells_three_package_5.jpg': require('../../../assets/images/catering/wedding_bells_three_package_5.jpg'),
  'two_desserts_selection_1.jpg': require('../../../assets/images/catering/two_desserts_selection_1.jpg'),
  'two_desserts_selection_2.jpg': require('../../../assets/images/catering/two_desserts_selection_2.jpg'),
  'two_desserts_selection_3.jpg': require('../../../assets/images/catering/two_desserts_selection_3.jpg'),
  'mixed_beverages_soft_drinks_1.jpg': require('../../../assets/images/catering/mixed_beverages_soft_drinks_1.jpg'),
  'mixed_beverages_soft_drinks_2.jpg': require('../../../assets/images/catering/mixed_beverages_soft_drinks_2.jpg'),
  'mixed_beverages_soft_drinks_3.jpg': require('../../../assets/images/catering/mixed_beverages_soft_drinks_3.jpg'),
  
  // Fallback
  'placeholder': require('../../../assets/images/catering/highlands_braai_combo_1.jpg'),
};

// Helper to extract filename and fetch local image
const resolveCateringImageSource = (imagePath?: string) => {
  if (!imagePath) return localCateringImages['placeholder'];
  if (imagePath.startsWith('http')) return { uri: imagePath };
  
  // Extract filename if it includes paths
  const filename = imagePath.split('/').pop() || 'placeholder';
  return localCateringImages[filename] || localCateringImages['placeholder'];
};

// --- DATA STRUCTURE ---
interface CateringItem {
  id: string;
  name: string;
  pricePerPerson: number;
  minPeople: number;
  images: string[];  // Changed from any[] to string[] for filenames
  description: string;
  menuDetails: string[];
}

const CATERING_OPTIONS: CateringItem[] = [
  {
    id: 'spit-braai-trad',
    name: 'Traditional Spit Braai',
    pricePerPerson: 200,
    minPeople: 25,
    images: [
      'highlands_braai_combo_1.jpg',
      'highlands_braai_combo_2.jpg',
      'highlands_braai_combo_3.jpg',
      'highlands_braai_combo_4.jpg',
    ],
    description: 'Traditional Lamb on the Spit – basted in our secret marinade.',
    menuDetails: [
      'Served with Home Made Mint Sauce',
      'Choice of One: Spit Braai baby Potatoes, Lemon & Rosemary Potato Wedges, Garlic & Parsley Baby Potatoes, Garlic Hasselback Potatoes, Pap & Chakalaka, Phutu Pap & Sauce',
      'Choice of Two Salads: Greek, Pasta, Curried Pasta, Curried Rice, Coleslaw, 3 Bean, Potato with egg, Honey Dijon Baby Potato, Butternut/Feta/Rocket, Chinese Cabbage, Broccoli & Bacon, Beetroot/Feta/Rocket, Asian Slaw',
      'Choice of One Bread: Knotted Cocktail Rolls & Butter (2 each), Crispy Round Roll & Butter (1 each), Garlic Bread'
    ]
  },
  {
    id: 'spit-braai-chicken',
    name: 'Chicken & Spit Braai',
    pricePerPerson: 220,
    minPeople: 25,
    images: [
      'william_wallace_combo_1.jpg',
      'william_wallace_combo_2.jpg',
      'william_wallace_combo_3.jpg',
    ],
    description: 'Traditional Lamb & Lemon & Herb Chicken Pieces.',
    menuDetails: [
      'Traditional Lamb on the Spit – basted in our secret marinade',
      'Lemon & Herb Chicken Pieces - cooked in the spit',
      'Served with Home Made Mint Sauce',
      'Choice of One: Spit Braai baby Potatoes, Lemon & Rosemary Potato Wedges, Garlic Hasselback Potatoes, Garlic & Parsley Baby Potatoes, Pap & Chakalaka, Phutu Pap & Sauce',
      'Choice of Two Salads: Greek, Pasta, Curried Pasta, Curried Rice, Coleslaw, 3 Bean, Potato with Egg, Honey Dijon Baby Potato, Butternut/Feta/Olive/Rocket, Chinese Cabbage, Broccoli & Bacon, Beetroot/Feta/Rocket, Asian Slaw',
      'Choice of One Bread: Knotted Cocktail Rolls & Butter (2 each), Crispy Round Roll & Butter (1 each), Garlic Bread Loaves'
    ]
  },
  {
    id: 'wedding-canapes',
    name: 'Wedding Bells Canapes',
    pricePerPerson: 150,
    minPeople: 20,
    images: [
      'wedding_bells_canapes_1.jpg',
      'wedding_bells_canapes_2.jpg',
      'wedding_bells_canapes_3.jpg',
    ],
    description: 'Elegant bite-sized starters to welcome your guests.',
    menuDetails: [
      'Chef\'s selection of premium hot and cold canapes',
      'Includes vegetarian, beef, and seafood options',
      'Served on arrival as a welcome snack'
    ]
  },
  {
    id: 'wedding-package',
    name: 'Wedding Bells Three Package',
    pricePerPerson: 350,
    minPeople: 20,
    images: [
      'wedding_bells_three_package_2.jpg',
      'wedding_bells_three_package_3.jpg',
      'wedding_bells_three_package_4.jpg',
      'wedding_bells_three_package_5.jpg',
    ],
    description: 'A comprehensive premium dining experience for your special day.',
    menuDetails: [
      'Plated Starter: Choice of soup or fresh seasonal salad',
      'Main Course: Choice of two premium meats (Beef Fillet, Kingklip, or Chicken Roulade)',
      'Served with seasonal roasted vegetables and savory rice',
      'Vegetarian alternative available upon request'
    ]
  },
  {
    id: 'two-desserts',
    name: 'Two Dessert Selection',
    pricePerPerson: 85,
    minPeople: 20,
    images: [
      'two_desserts_selection_1.jpg',
      'two_desserts_selection_2.jpg',
      'two_desserts_selection_3.jpg',
    ],
    description: 'A sweet conclusion to your event with traditional favorites.',
    menuDetails: [
      'Traditional South African Malva Pudding with warm custard',
      'Decadent Peppermint Crisp Tart',
      'Accompanied by seasonal fruit skewers'
    ]
  },
  {
    id: 'mixed-beverages',
    name: 'Mixed Beverages & Soft Drinks',
    pricePerPerson: 65,
    minPeople: 10,
    images: [
      'mixed_beverages_soft_drinks_1.jpg',
      'mixed_beverages_soft_drinks_2.jpg',
      'mixed_beverages_soft_drinks_3.jpg',
    ],
    description: 'Refreshing assorted beverages served on ice.',
    menuDetails: [
      'Assorted 300ml sodas (Coke, Sprite, Fanta)',
      '100% Fruit Juice selections',
      'Still and Sparkling Mineral Water',
      'Served from a self-service iced beverage station'
    ]
  }
];

export default function EventCateringScreen() {
  const params = useLocalSearchParams();
  const expectedAttendance = Number(params.expectedAttendance) || 30;
  const bookingId = params.bookingId as string;

  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  
  // Modal States
  const [activeGalleryImages, setActiveGalleryImages] = useState<any[] | null>(null);
  const [activeInfoItem, setActiveInfoItem] = useState<CateringItem | null>(null);

  const toggleSelection = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const calculateTotal = () => {
    let total = 0;
    CATERING_OPTIONS.forEach(item => {
      if (selectedItems[item.id]) {
        total += item.pricePerPerson * Math.max(expectedAttendance, item.minPeople);
      }
    });
    return total;
  };

  const handleFinalize = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // In the next step, we will save this to Firebase along with the folio!
    router.replace('/(tabs)/GuestPortal' as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#1e3a5f" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event Catering</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.guestCountBadge}>
          <Ionicons name="people" size={20} color="#d97706" />
          <Text style={styles.guestCountText}>Catering for {expectedAttendance} Guests</Text>
        </View>

        {CATERING_OPTIONS.map((item) => {
          const isSelected = selectedItems[item.id];
          const itemTotal = item.pricePerPerson * Math.max(expectedAttendance, item.minPeople);

          return (
            <View key={item.id} style={[styles.card, isSelected && styles.cardSelected]}>
              {/* IMAGE GALLERY TRIGGER */}
              <TouchableOpacity 
                activeOpacity={0.9} 
                onPress={() => setActiveGalleryImages(item.images)}
              >
                <Image source={resolveCateringImageSource(item.images[0])} style={styles.cardImage} />
                <View style={styles.galleryBadge}>
                  <Ionicons name="images" size={14} color="#fff" />
                  <Text style={styles.galleryBadgeText}>1/{item.images.length}</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <Text style={styles.itemTitle}>{item.name}</Text>
                  <Text style={styles.itemPrice}>R{item.pricePerPerson} pp</Text>
                </View>
                
                <Text style={styles.itemDesc}>{item.description}</Text>
                
                <View style={styles.actionRow}>
                  {/* MORE INFO BUTTON */}
                  <TouchableOpacity 
                    style={styles.infoBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveInfoItem(item);
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={18} color="#1e3a5f" />
                    <Text style={styles.infoBtnText}>View Menu</Text>
                  </TouchableOpacity>

                  {/* ADD TO ORDER BUTTON */}
                  <TouchableOpacity 
                    style={[styles.addBtn, isSelected && styles.addBtnSelected]}
                    onPress={() => toggleSelection(item.id)}
                  >
                    <Text style={[styles.addBtnText, isSelected && styles.addBtnTextSelected]}>
                      {isSelected ? 'Remove' : 'Select'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {isSelected && (
                  <View style={styles.selectedFooter}>
                    <Text style={styles.selectedFooterText}>Item Total:</Text>
                    <Text style={styles.selectedFooterPrice}>R {itemTotal.toLocaleString()}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* STICKY BOTTOM CHECKOUT */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.bottomTotalLabel}>Catering Total</Text>
          <Text style={styles.bottomTotalValue}>R {calculateTotal().toLocaleString()}</Text>
        </View>
        <TouchableOpacity style={styles.checkoutBtn} onPress={handleFinalize}>
          <Text style={styles.checkoutBtnText}>Complete Booking</Text>
        </TouchableOpacity>
      </View>

      {/* ---------------- MODALS ---------------- */}

      {/* 1. IMAGE GALLERY MODAL */}
      <Modal visible={!!activeGalleryImages} transparent={true} animationType="fade">
        <View style={styles.modalDarkOverlay}>
          <TouchableOpacity 
            style={styles.closeGalleryBtn} 
            onPress={() => setActiveGalleryImages(null)}
          >
            <Ionicons name="close-circle" size={40} color="#fff" />
          </TouchableOpacity>
          
          <ScrollView 
            horizontal 
            pagingEnabled 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center' }}
          >
            {activeGalleryImages?.map((img, index) => (
              <View key={index} style={{ width, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={resolveCateringImageSource(img)} style={styles.fullScreenImage} resizeMode="contain" />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* 2. MENU DETAILS MODAL */}
      <Modal visible={!!activeInfoItem} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.infoModalCard}>
            <View style={styles.infoModalHeader}>
              <Text style={styles.infoModalTitle}>{activeInfoItem?.name}</Text>
              <TouchableOpacity onPress={() => setActiveInfoItem(null)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false} style={{ padding: 20 }}>
              <Text style={styles.infoModalSub}>Menu Inclusions & Choices:</Text>
              
              {activeInfoItem?.menuDetails.map((detail, index) => (
                <View key={index} style={styles.menuDetailRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#c9a227" style={{ marginTop: 2 }} />
                  <Text style={styles.menuDetailText}>{detail}</Text>
                </View>
              ))}
              
              <View style={styles.minimumNotice}>
                <Ionicons name="alert-circle" size={16} color="#b45309" />
                <Text style={styles.minimumNoticeText}>
                  Requires a minimum order for {activeInfoItem?.minPeople} people.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  backButton: { padding: 4, marginLeft: -8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e3a5f' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  
  guestCountBadge: { flexDirection: 'row', backgroundColor: '#fffbeb', padding: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, borderWidth: 1, borderColor: '#fde68a' },
  guestCountText: { color: '#92400e', fontWeight: 'bold', fontSize: 15 },
  
  card: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3, borderWidth: 2, borderColor: 'transparent' },
  cardSelected: { borderColor: '#c9a227' },
  cardImage: { width: '100%', height: 180 },
  galleryBadge: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
  galleryBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  cardBody: { padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', flex: 1 },
  itemPrice: { fontSize: 16, fontWeight: 'bold', color: '#16a34a' },
  itemDesc: { fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 18 },
  
  actionRow: { flexDirection: 'row', gap: 12 },
  infoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', paddingVertical: 12, borderRadius: 10, gap: 6 },
  infoBtnText: { color: '#1e3a5f', fontWeight: '600', fontSize: 14 },
  addBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e3a5f', paddingVertical: 12, borderRadius: 10 },
  addBtnSelected: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1' },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  addBtnTextSelected: { color: '#475569' },
  
  selectedFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  selectedFooterText: { color: '#64748b', fontWeight: '500' },
  selectedFooterPrice: { color: '#1e3a5f', fontWeight: 'bold', fontSize: 16 },
  
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 16, paddingBottom: 30, borderTopWidth: 1, borderTopColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 10 },
  bottomTotalLabel: { fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  bottomTotalValue: { fontSize: 22, fontWeight: 'bold', color: '#1e3a5f' },
  checkoutBtn: { backgroundColor: '#c9a227', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  checkoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  /* Modal Styles */
  modalDarkOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  closeGalleryBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  fullScreenImage: { width: width, height: width * 1.2 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  infoModalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  infoModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  infoModalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e3a5f', flex: 1 },
  infoModalSub: { fontSize: 14, fontWeight: 'bold', color: '#475569', marginBottom: 16 },
  menuDetailRow: { flexDirection: 'row', gap: 10, marginBottom: 12, paddingRight: 20 },
  menuDetailText: { fontSize: 14, color: '#475569', lineHeight: 22 },
  minimumNotice: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', padding: 12, borderRadius: 8, gap: 8, marginTop: 20, marginBottom: 20 },
  minimumNoticeText: { color: '#92400e', fontSize: 13, fontWeight: '500' }
});
