import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function PreEventInspectionScreen() {
  const router = useRouter();

  const checklist = [
    { item: 'Room layout matches floor plan', status: 'pending' },
    { item: 'Seating count matches guest list', status: 'pending' },
    { item: 'Lighting system operational', status: 'pending' },
    { item: 'AV equipment tested', status: 'pending' },
    { item: 'Microphones working', status: 'pending' },
    { item: 'Projector/screen aligned', status: 'pending' },
    { item: 'Climate control set', status: 'pending' },
    { item: 'Emergency exits clear', status: 'pending' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Pre-Event Inspection</Text>
        <Text style={styles.subtitle}>Grand Ocean Ballroom - Today 2:00 PM</Text>
      </View>

      <View style={styles.card}>
        {checklist.map((item, i) => (
          <TouchableOpacity key={i} style={styles.checkItem} onPress={() => {}}>
            <View style={styles.checkLeft}>
              <Ionicons name={item.status === 'passed' ? 'checkmark-circle' : item.status === 'failed' ? 'close-circle' : 'radio-button-off'} size={24} color={item.status === 'passed' ? '#16a34a' : item.status === 'failed' ? '#dc2626' : '#94a3b8'} />
              <Text style={styles.checkText}>{item.item}</Text>
            </View>
            <Ionicons name='chevron-forward' size={20} color='#94a3b8' />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.submitBtn}>
        <Text style={styles.submitBtnText}>Submit Inspection</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1e3a5f' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  checkItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  checkLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  checkText: { fontSize: 15, color: '#1e3a5f' },
  submitBtn: { backgroundColor: '#1e3a5f', marginTop: 24, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});