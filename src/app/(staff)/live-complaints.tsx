import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function LiveComplaintsScreen() {
  const complaints = [
    { id: '1', category: 'AC Failure', location: 'Grand Ballroom', urgency: 'high', status: 'assigned', guest: 'John Smith', time: '2:15 PM' },
    { id: '2', category: 'Catering Delay', location: 'Kitchen', urgency: 'medium', status: 'in_progress', guest: 'Event Host', time: '1:45 PM' },
    { id: '3', category: 'Sound System', location: 'Vineyards', urgency: 'high', status: 'open', guest: 'Sarah Johnson', time: '12:30 PM' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Live Complaints</Text>
        <Text style={styles.subtitle}>Real-time issue tracking</Text>
      </View>

      {complaints.map((complaint) => (
        <TouchableOpacity key={complaint.id} style={styles.card} onPress={() => {}}>
          <View style={styles.cardHeader}>
            <View style={[styles.urgencyBadge, { 
              backgroundColor: complaint.urgency === 'high' ? '#fee2e2' : complaint.urgency === 'medium' ? '#fffbeb' : '#ecfdf5' 
            }]}>
              <Text style={[styles.urgencyText, { 
                color: complaint.urgency === 'high' ? '#dc2626' : complaint.urgency === 'medium' ? '#c9a227' : '#16a34a' 
              }]}>{complaint.urgency.toUpperCase()}</Text>
            </View>
            <View style={[styles.statusBadge, { 
              backgroundColor: complaint.status === 'resolved' ? '#ecfdf5' : complaint.status === 'in_progress' ? '#eff6ff' : complaint.status === 'assigned' ? '#fffbeb' : '#f1f5f9' 
            }]}>
              <Text style={[styles.statusText, { 
                color: complaint.status === 'resolved' ? '#16a34a' : complaint.status === 'in_progress' ? '#2563eb' : complaint.status === 'assigned' ? '#c9a227' : '#64748b' 
              }]}>{complaint.status.toUpperCase().replace('_', ' ')}</Text>
            </View>
          </View>
          <Text style={styles.category}>{complaint.category}</Text>
          <Text style={styles.location}>{complaint.location}</Text>
          <View style={styles.cardFooter}>
            <Text style={styles.guest}>Guest: {complaint.guest}</Text>
            <Text style={styles.time}>{complaint.time}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1e3a5f' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  urgencyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  urgencyText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  category: { fontSize: 16, fontWeight: '600', color: '#1e3a5f', marginBottom: 4 },
  location: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  guest: { fontSize: 13, color: '#64748b' },
  time: { fontSize: 13, color: '#94a3b8' },
});