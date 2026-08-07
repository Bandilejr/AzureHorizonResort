import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function StaffDashboardScreen() {
  const { profile } = useAuth();
  const router = useRouter();

  const quickActions = [
    { title: 'Today\'s Events', icon: 'calendar', action: () => {} },
    { title: 'Pending Check-ins', icon: 'people', action: () => {} },
    { title: 'Open Complaints', icon: 'warning', action: () => {} },
    { title: 'Upcoming Inspections', icon: 'clipboard', action: () => {} },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good Morning,</Text>
          <Text style={styles.name}>{profile?.displayName || 'Staff Member'}</Text>
          <Text style={styles.role}>{profile?.subRole || 'Staff'}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.grid}>
          {quickActions.map((action, i) => (
            <TouchableOpacity key={i} style={styles.actionCard} onPress={action.action}>
              <Ionicons name={action.icon} size={28} color="#c9a227" />
              <Text style={styles.actionTitle}>{action.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Events</Text>
        <View style={styles.eventCard}>
          <Text style={styles.eventTitle}>Wedding - Grand Ocean Ballroom</Text>
          <Text style={styles.eventTime}>2:00 PM - 10:00 PM</Text>
          <Text style={styles.eventStatus}>Setup in progress</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 24 },
  greeting: { fontSize: 14, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  name: { fontSize: 28, fontWeight: 'bold', color: '#1e3a5f' },
  role: { fontSize: 14, color: '#c9a227', fontWeight: '600', marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { width: '48%', backgroundColor: '#fff', padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  actionTitle: { marginTop: 12, fontSize: 13, fontWeight: '600', color: '#1e3a5f', textAlign: 'center' },
  eventCard: { backgroundColor: '#fff', padding: 16, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  eventTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e3a5f' },
  eventTime: { fontSize: 14, color: '#64748b', marginTop: 4 },
  eventStatus: { fontSize: 12, color: '#c9a227', fontWeight: '600', marginTop: 8 },
});