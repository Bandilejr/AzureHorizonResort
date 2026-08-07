import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PostEventInspectionScreen() {
  const damages = [
    { item: 'Chair - Leg broken', severity: 'high', cost: 450 },
    { item: 'Table - Scratched surface', severity: 'medium', cost: 800 },
    { item: 'AV Projector - Not powering on', severity: 'high', cost: 12000 },
    { item: 'Wall - Scuff marks', severity: 'low', cost: 300 },
  ];

  const totalCost = damages.reduce((sum, d) => sum + d.cost, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Post-Event Inspection</Text>
        <Text style={styles.subtitle}>Wedding - Grand Ocean Ballroom</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Damage Checklist</Text>
        {damages.map((damage, i) => (
          <View key={i} style={styles.damageRow}>
            <View style={styles.damageInfo}>
              <Text style={styles.damageItem}>{damage.item}</Text>
              <View style={styles.severityBadge}>
                <Text style={[styles.severityText, { backgroundColor: damage.severity === 'high' ? '#fee2e2' : damage.severity === 'medium' ? '#fffbeb' : '#ecfdf5' }]}>{damage.severity.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.damageCost}>R {damage.cost.toLocaleString()}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Estimated Cost:</Text>
          <Text style={styles.totalValue}>R {totalCost.toLocaleString()}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.submitBtn}>
        <Text style={styles.submitBtnText}>Record Damages & Generate Invoice</Text>
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
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e3a5f', marginBottom: 16 },
  damageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  damageInfo: { flex: 1 },
  damageItem: { fontSize: 15, color: '#1e3a5f' },
  severityBadge: { marginTop: 8, alignSelf: 'flex-start' },
  severityText: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  damageCost: { fontSize: 15, fontWeight: '600', color: '#dc2626', marginLeft: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  totalLabel: { fontSize: 16, fontWeight: 'bold', color: '#1e3a5f' },
  totalValue: { fontSize: 18, fontWeight: 'bold', color: '#dc2626' },
  submitBtn: { backgroundColor: '#dc2626', marginTop: 24, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});