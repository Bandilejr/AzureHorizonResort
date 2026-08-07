import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  useColorScheme,
  StatusBar
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebase-services';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getTheme } from '@/constants/theme';

function GuestPortal() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeBooking, setActiveBooking] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isLoggedIn = !!auth.currentUser;
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const user = auth.currentUser;
        
        if (!user) {
          setCurrentUser({ name: 'Visitor', status: 'visitor', roomNumber: 'N/A' });
          return; 
        }

        const usersRef = collection(db, 'users'); 
        const q = query(usersRef, where("uid", "==", user.uid));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data();
          setCurrentUser(userData);

          const isResident = userData.status === 'resident' || (userData.roomNumber && userData.roomNumber !== 'N/A');
          
          if (isResident) {
            setActiveBooking({
              roomNumber: userData.roomNumber !== 'N/A' ? userData.roomNumber : 'TBD',
              roomName: 'Ocean View Suite', 
              checkOutDate: 'Oct 16',
              wifiPass: `AZURE-${userData.roomNumber}`
            });
          }
        } else {
          setCurrentUser({ name: 'Visitor', status: 'visitor', roomNumber: 'N/A' });
        }
      } catch (error) {
        console.error("Local execution error:", error);
        setCurrentUser({ name: 'Visitor', status: 'visitor', roomNumber: 'N/A' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const isResident = currentUser?.status === 'resident' || (currentUser?.roomNumber && currentUser.roomNumber !== 'N/A');

  const handleFeatureClick = (feature: string, locked: boolean) => {
    if (locked) {
      Alert.alert("Feature Locked", "Please sign in and check into a room to unlock this feature.");
      return;
    }
    Alert.alert("Navigation", `Opening ${feature}...`);
  };

  const handleUnlockDoor = () => {
    Alert.alert("Digital Key", "NFC Activated. Hold phone near door lock.");
  };

  const handleAuthAction = async () => {
    if (isLoggedIn) {
      await auth.signOut();
    }
    router.replace('/login');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar 
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} 
      />
      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.colors.textSecondary }]}>Good Afternoon,</Text>
            <Text style={[styles.name, { color: theme.colors.text }]}>{currentUser?.name || 'Visitor'}</Text>
          </View>
          <TouchableOpacity style={[styles.profileAvatar, { backgroundColor: theme.colors.surfaceVariant }]} onPress={handleAuthAction}>
            <Ionicons 
              name={isLoggedIn ? "log-out-outline" : "log-in-outline"} 
              size={24} 
              color={theme.colors.secondary} 
            />
          </TouchableOpacity>
        </View>

        {isResident && activeBooking ? (
          <View style={styles.digitalKeyCard}>
            <View style={styles.keyHeader}>
              <Text style={styles.roomLabel}>YOUR SUITE</Text>
              <Text style={styles.roomNumber}>{activeBooking.roomNumber}</Text>
            </View>
            <Text style={styles.roomName}>{activeBooking.roomName}</Text>
            
            <TouchableOpacity style={styles.unlockButton} onPress={handleUnlockDoor}>
              <View style={styles.nfcRing}>
                <Ionicons name="wifi" size={32} color="#fff" style={{ transform: [{ rotate: '90deg' }] }} />
              </View>
              <Text style={styles.unlockText}>Tap to Unlock Door</Text>
            </TouchableOpacity>
            
            <View style={styles.keyFooter}>
              <Text style={styles.keyFooterText}>Checkout: {activeBooking.checkOutDate}</Text>
              <Text style={styles.keyFooterText}>WiFi: {activeBooking.wifiPass}</Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.visitorPromoCard}
            activeOpacity={0.9}
            onPress={() => router.push('/room-gallery' as any)}
          >
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1542314831-c6a4d1424391?q=80&w=800&auto=format&fit=crop' }} 
              style={styles.promoImage} 
            />
            <View style={styles.promoOverlay}>
              <Text style={styles.promoTitle}>Ready for Paradise?</Text>
              <Text style={styles.promoSubtitle}>Explore luxury suites and check in today.</Text>
              <View style={styles.promoButton}>
                <Text style={styles.promoButtonText}>Browse Suites</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {isResident && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Member Rewards</Text>
            <TouchableOpacity 
              style={[styles.loyaltyCard, { backgroundColor: theme.colors.primary }]}
              onPress={() => router.push('/loyalty' as any)}
              activeOpacity={0.9}
            >
              <View style={styles.loyaltyContent}>
                <Text style={styles.loyaltyTitle}>Loyalty Program</Text>
                <Text style={styles.loyaltySubtitle}>View points, tier status, and redeem rewards</Text>
              </View>
              <Ionicons name="gift" size={32} color="#fff" style={styles.loyaltyIcon} />
            </TouchableOpacity>
          </View>
        )}

        {isResident && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Quick Actions</Text>
            <View style={styles.quickActionsContainer}>
              {[
                { icon: 'bed', label: 'Housekeeping', route: '/room-service' },
                { icon: 'fast-food', label: 'My Orders', route: '/my-orders' }, 
                { icon: 'leaf', label: 'Spa Booking', route: '/spa' },
                { icon: 'wallet', label: 'My Bill', route: '/billing' } 
              ].map((action, i) => (
                <TouchableOpacity 
                  key={i} 
                  style={styles.quickActionButton} 
                  onPress={() => {
                    if (action.route) {
                      router.push(action.route as any);
                    } else {
                      handleFeatureClick(action.label, false);
                    }
                  }}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.surface }]}>
                    <Ionicons name={action.icon as any} size={24} color={theme.colors.secondary} />
                  </View>
                  <Text style={[styles.quickActionLabel, { color: theme.colors.textSecondary }]}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swimlane}>
            {[
              { title: 'Suites & Villas', sub: 'Accommodations', icon: 'bed-outline', color: theme.colors.primary, route: '/room-gallery' },
              { title: 'Event Venues', sub: 'Book Spaces', icon: 'business-outline', color: theme.colors.secondary, route: '/event-booking' },
              { title: 'The Ocean Grill', sub: 'Fine Dining', icon: 'restaurant', color: '#e07a5f', route: '/dining' },
              { title: 'Horizon Spa', sub: 'Wellness', icon: 'leaf', color: '#81b29a', route: '/spa' },
              { title: 'Island Tours', sub: 'Excursions', icon: 'compass', color: '#e8aa42', route: '/tours' }
            ].map((item, i) => (
              <TouchableOpacity 
                key={i} 
                style={styles.amenityCard} 
                onPress={() => {
                  if (item.route) {
                    router.push(item.route as any);
                  } else {
                    handleFeatureClick(item.title, false);
                  }
                }}
              >
                <View style={[styles.amenityIconContainer, { backgroundColor: item.color + '20' }]}>
                  <Ionicons name={item.icon as any} size={28} color={item.color} />
                </View>
                <Text style={[styles.amenityTitle, { color: theme.colors.text }]}>{item.title}</Text>
                <Text style={[styles.amenitySub, { color: theme.colors.textSecondary }]}>{item.sub}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={[styles.section, { paddingBottom: 40 }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>My Account</Text>
          <View style={styles.listContainer}>
            {[
              { title: 'My Reservations', icon: 'calendar', locked: !isResident, route: '/reservations' },
              { title: 'Current Bill & Charges', icon: 'receipt', locked: !isResident, route: '/billing' },
              { title: 'Guest Concierge Chat', icon: 'chatbubbles', locked: !isResident, route: '/concierge' }
            ].map((item, i) => (
              <TouchableOpacity 
                key={i} 
                style={[styles.listItem, item.locked && styles.listItemLocked]}
                onPress={() => {
                  if (item.locked) {
                    handleFeatureClick(item.title, true);
                  } else if (item.route) {
                    router.push(item.route as any);
                  }
                }}
              >
                <View style={styles.listItemLeft}>
                  <Ionicons 
                    name={item.icon as any} 
                    size={22} 
                    color={item.locked ? theme.colors.textMuted : theme.colors.secondary} 
                  />
                  <Text style={[styles.listItemText, item.locked && styles.listItemTextLocked]}>{item.title}</Text>
                </View>
                {item.locked ? (
                  <Ionicons name="lock-closed" size={18} color={theme.colors.textMuted} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

export default GuestPortal;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  digitalKeyCard: {
    marginHorizontal: 20,
    backgroundColor: '#1e3a5f',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  keyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomLabel: {
    color: '#c9a227',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  roomNumber: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  roomName: {
    color: '#fff',
    fontSize: 24,
    marginTop: 4,
    marginBottom: 30,
  },
  unlockButton: {
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  nfcRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    marginBottom: 12,
  },
  unlockText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  keyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 16,
  },
  keyFooterText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  visitorPromoCard: {
    marginHorizontal: 20,
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
  },
  promoImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  promoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 24,
    justifyContent: 'flex-end',
  },
  promoTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  promoSubtitle: {
    color: '#fff',
    opacity: 0.9,
    marginBottom: 16,
  },
  promoButton: {
    backgroundColor: '#c9a227',
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  promoButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  loyaltyCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loyaltyContent: {
    flex: 1,
  },
  loyaltyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  loyaltySubtitle: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.9,
  },
  loyaltyIcon: {
    opacity: 0.8,
    marginLeft: 16,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  quickActionButton: {
    alignItems: 'center',
    width: '23%',
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionLabel: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '500',
  },
  swimlane: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  amenityCard: {
    width: 140,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 20,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  amenityIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  amenityTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
  },
  amenitySub: {
    fontSize: 12,
  },
  listContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  listItemLocked: {
    opacity: 0.6,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
  listItemTextLocked: {
    color: '#94a3b8',
  }
});