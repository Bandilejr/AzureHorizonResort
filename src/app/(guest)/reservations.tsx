import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator 
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Firebase Imports
import { auth, db } from '../../services/firebase-services';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function ReservationsScreen() {
  const [reservations, setReservations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    fetchReservations();
  }, [user]);

  const fetchReservations = async () => {
    setIsLoading(true);
    try {
      const allReservations: any[] = [];

      // 1. Get Spa Bookings
      const spaQ = query(collection(db, 'spa_bookings'), where('guestId', '==', user?.uid));
      const spaDocs = await getDocs(spaQ);
      spaDocs.forEach(doc => {
        const data = doc.data();
        allReservations.push({
          id: doc.id,
          type: 'spa',
          title: data.treatmentName,
          date: data.date,
          time: data.time,
          status: data.status,
          price: data.price
        });
      });

      // 2. Get Tour Bookings
      const tourQ = query(collection(db, 'tour_bookings'), where('guestId', '==', user?.uid));
      const tourDocs = await getDocs(tourQ);
      tourDocs.forEach(doc => {
        const data = doc.data();
        allReservations.push({
          id: doc.id,
          type: 'tour',
          title: data.tourName,
          date: data.date,
          time: data.time,
          status: data.status,
          price: data.totalAmount,
          tickets: data.tickets // Extra data for tours
        });
      });

      // 3. Sort Chronologically by Date and Time
      allReservations.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA.getTime() - dateB.getTime();
      });

      setReservations(allReservations);
    } catch (error) {
      console.error("Error fetching reservations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getIconForType = (type: string) => {
    return type === 'spa' ? 'leaf' : 'compass';
  };

  const getColorForType = (type: string) => {
    return type === 'spa' ? '#81b29a' : '#e8aa42';
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#1e3a5f" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Itinerary</Text>
          <Text style={styles.headerSubtitle}>Upcoming Reservations</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchReservations}>
          <Ionicons name="refresh" size={24} color="#1e3a5f" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#1e3a5f" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {reservations.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No Upcoming Events</Text>
              <Text style={styles.emptyText}>Book a spa treatment or an island tour to build your itinerary.</Text>
            </View>
          ) : (
            <View style={styles.timeline}>
              {reservations.map((res, index) => {
                const iconColor = getColorForType(res.type);
                return (
                  <View key={res.id} style={styles.timelineItem}>
                    {/* Timeline Line & Dot */}
                    <View style={styles.timelineGraphic}>
                      <View style={[styles.timelineDot, { borderColor: iconColor }]} />
                      {index !== reservations.length - 1 && <View style={styles.timelineLine} />}
                    </View>
                    
                    {/* Reservation Card */}
                    <View style={styles.resCard}>
                      <View style={styles.resCardHeader}>
                        <View style={[styles.iconBox, { backgroundColor: `${iconColor}20` }]}>
                          <Ionicons name={getIconForType(res.type) as any} size={20} color={iconColor} />
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: '#dcfce3' }]}>
                          <Text style={styles.statusText}>Confirmed</Text>
                        </View>
                      </View>
                      
                      <Text style={styles.resTitle}>{res.title}</Text>
                      
                      <View style={styles.resDetailsRow}>
                        <View style={styles.resDetail}>
                          <Ionicons name="calendar-outline" size={14} color="#64748b" />
                          <Text style={styles.resDetailText}>{res.date}</Text>
                        </View>
                        <View style={styles.resDetail}>
                          <Ionicons name="time-outline" size={14} color="#64748b" />
                          <Text style={styles.resDetailText}>{res.time}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  backButton: { padding: 4, marginLeft: -8 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e3a5f' },
  headerSubtitle: { fontSize: 12, color: '#64748b' },
  refreshBtn: { padding: 4, marginRight: -8 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e3a5f', marginTop: 16, marginBottom: 8 },
  emptyText: { textAlign: 'center', color: '#64748b', lineHeight: 22 },
  timeline: { marginTop: 10 },
  timelineItem: { flexDirection: 'row', marginBottom: 20 },
  timelineGraphic: { width: 30, alignItems: 'center', marginRight: 12 },
  timelineDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 4, backgroundColor: '#fff', zIndex: 2 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#e2e8f0', marginTop: -4, marginBottom: -24 },
  resCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  resCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: 'bold', color: '#16a34a' },
  resTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 12 },
  resDetailsRow: { flexDirection: 'row', gap: 16 },
  resDetail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resDetailText: { fontSize: 13, color: '#475569', fontWeight: '500' }
});
