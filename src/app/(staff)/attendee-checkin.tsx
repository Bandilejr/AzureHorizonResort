import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function AttendeeCheckinScreen() {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [scanning, setScanning] = useState(false);

  const attendees = [
    { id: '1', name: 'John Smith', email: 'john@example.com', status: 'checked_in', time: '1:45 PM' },
    { id: '2', name: 'Sarah Johnson', email: 'sarah@example.com', status: 'invited', time: null },
    { id: '3', name: 'Michael Brown', email: 'michael@example.com', status: 'invited', time: null },
    { id: '4', name: 'Emily Davis', email: 'emily@example.com', status: 'checked_in', time: '1:50 PM' },
  ];

  const filtered = attendees.filter(a => 
    a.name.toLowerCase().includes(searchText.toLowerCase()) ||
    a.email.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCheckIn = (attendee: any) => {
    if (attendee.status === 'checked_in') {
      Alert.alert('Already Checked In', `${attendee.name} is already checked in`);
      return;
    }
    Alert.alert('Check In', `Check in ${attendee.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Check In', onPress: () => Alert.alert('Success', `${attendee.name} checked in!`) }
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Attendee Check-in</Text>
        <Text style={styles.subtitle}>Wedding - Grand Ocean Ballroom</Text>
      </View>

      <View style={styles.searchCard}>
        <TouchableOpacity style={styles.scanBtn} onPress={() => setScanning(true)}>
          <Ionicons name="qr-code" size={24} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.scanBtnText}>Scan QR Code</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      <View style={styles.list}>
        {filtered.map((attendee) => (
          <TouchableOpacity key={attendee.id} style={styles.attendeeCard} onPress={() => handleCheckIn(attendee)}>
            <View style={styles.attendeeInfo}>
              <Text style={styles.attendeeName}>{attendee.name}</Text>
              <Text style={styles.attendeeEmail}>{attendee.email}</Text>
            </View>
            <View style={styles.attendeeStatus}>
              {attendee.status === 'checked_in' ? (
                <View style={styles.checkedInBadge}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" style={{ marginRight: 4 }} />
                  <Text style={styles.checkedInText}>Checked In</Text>
                  <Text style={styles.checkinTime}>{attendee.time}</Text>
                </View>
              ) : (
                <View style={styles.pendingBadge}>
                  <Ionicons name="radio-button-off" size={18} color="#c9a227" style={{ marginRight: 4 }} />
                  <Text style={styles.pendingText}>Pending</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1e3a5f' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  searchCard: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  scanBtn: { backgroundColor: '#1e3a5f', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 8 },
  scanBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  searchInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 16, fontSize: 16 },
  list: { gap: 12 },
  attendeeCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  attendeeInfo: { flex: 1 },
  attendeeName: { fontSize: 16, fontWeight: '600', color: '#1e3a5f' },
  attendeeEmail: { fontSize: 13, color: '#64748b', marginTop: 2 },
  attendeeStatus: { alignItems: 'flex-end' },
  checkedInBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ecfdf5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  checkedInText: { color: '#16a34a', fontWeight: '600', fontSize: 13 },
  checkinTime: { color: '#16a34a', fontSize: 11, marginTop: 2 },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  pendingText: { color: '#c9a227', fontWeight: '600', fontSize: 13 },
});