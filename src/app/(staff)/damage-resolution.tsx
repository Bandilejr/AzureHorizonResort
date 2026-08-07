import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function DamageResolutionScreen() {
  const damageRecords = [
    { id: '1', event: 'Wedding - Grand Ballroom', item: 'AV Projector', status: 'in_repair', technician: 'Mike Johnson', cost: 12000 },
    { id: '2', event: 'Corporate Conference', item: 'Chair (x3)', status: 'resolved', technician: 'Sarah Wilson', cost: 1350 },
    { id: '3', event: 'Birthday Party', item: 'Table surface', status: 'recorded', technician: null, cost: 800 },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Damage Resolution</Text>
        <Text style={styles.subtitle}>Track and resolve damage claims</Text>
      </View>

      {damageRecords.map((record) => (
        <TouchableOpacity key={record.id} style={styles.card} onPress={() => {}}>
          <View style={styles.cardHeader}>
            <Text style={styles.eventName}>{record.event}</Text>
            <View style={[styles.statusBadge, { 
              backgroundColor: record.status === 'resolved' ? '#ecfdf5' : record.status === 'in_repair' ? '#fffbeb' : '#fee2e2' 
            }]}>
              <Text style={[styles.statusText, { 
                color: record.status === 'resolved' ? '#16a34a' : record.status === 'in_repair' ? '#c9a227' : '#dc2626' 
              }]}>{record.status.toUpperCase().replace('_', ' ')}</Text>
            </View>
          </View>
          <Text style={styles.damageItem}>{record.item}</Text>
          <View style={styles.cardFooter}>
            <Text style={styles.technician}>Technician: {record.technician || 'Unassigned'}</Text>
            <Text style={styles.damageCost}>R {record.cost.toLocaleString()}</Text>
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  eventName: { fontSize: 16, fontWeight: 'bold', color: '#1e3a5f' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  damageItem: { fontSize: 14, color: '#64748b', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  technician: { fontSize: 13, color: '#64748b' },
  damageCost: { fontSize: 15, fontWeight: 'bold', color: '#dc2626' },
});