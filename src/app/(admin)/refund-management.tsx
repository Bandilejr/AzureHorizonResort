import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function RefundManagementAdminScreen() {
  const refundRequests = [
    { id: '1', event: 'Wedding - Grand Ballroom', guest: 'John Smith', amount: 5000, reason: 'AC failure during event', status: 'pending', date: '2026-08-01', validated: true },
    { id: '2', event: 'Corporate Conference', guest: 'Acme Corp', amount: 12000, reason: 'Sound system malfunction', status: 'pending', date: '2026-07-28', validated: false },
    { id: '3', event: 'Birthday Party', guest: 'Sarah Johnson', amount: 3000, reason: 'Catering delay', status: 'approved', date: '2026-07-20', validated: true },
    { id: '4', event: 'Anniversary Dinner', guest: 'Mike Wilson', amount: 8000, reason: 'Power outage', status: 'rejected', date: '2026-07-15', validated: true },
  ];

  const handleApprove = (request: any) => {
    Alert.alert('Approve Refund', `Approve R${request.amount.toLocaleString()} refund for ${request.guest}?\n\nValidation: ${request.validated ? 'Passed' : 'Pending'}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => Alert.alert('Approved', 'Refund approved and sent to payment gateway') }
    ]);
  };

  const handleReject = (request: any) => {
    Alert.alert('Reject Refund', `Reject refund request for ${request.guest}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => Alert.alert('Rejected', 'Refund request has been rejected') }
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Refund Management</Text>
        <Text style={styles.subtitle}>Admin review of all refund requests</Text>
      </View>

      {refundRequests.map((request) => (
        <View key={request.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.eventName}>{request.event}</Text>
            <View style={[styles.statusBadge, { 
              backgroundColor: request.status === 'approved' ? '#ecfdf5' : request.status === 'rejected' ? '#fee2e2' : '#fffbeb' 
            }]}>
              <Text style={[styles.statusText, { 
                color: request.status === 'approved' ? '#16a34a' : request.status === 'rejected' ? '#dc2626' : '#c9a227' 
              }]}>{request.status.toUpperCase()}</Text>
            </View>
          </View>
          
          <View style={styles.validationRow}>
            <Ionicons name={request.validated ? 'checkmark-circle' : 'time'} size={16} color={request.validated ? '#16a34a' : '#c9a227'} />
            <Text style={styles.validationText}>Validation: {request.validated ? 'Passed' : 'Pending Review'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Guest:</Text>
            <Text style={styles.infoValue}>{request.guest}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Amount:</Text>
            <Text style={[styles.infoValue, { color: '#dc2626', fontWeight: 'bold' }]}>R {request.amount.toLocaleString()}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Reason:</Text>
            <Text style={styles.infoValue}>{request.reason}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date:</Text>
            <Text style={styles.infoValue}>{request.date}</Text>
          </View>

          {request.status === 'pending' && (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(request)}>
                <Text style={styles.approveBtnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(request)}>
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  eventName: { fontSize: 16, fontWeight: 'bold', color: '#1e3a5f' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  validationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  validationText: { fontSize: 13, fontWeight: '500' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  infoLabel: { fontSize: 14, color: '#64748b' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#1e3a5f', textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  approveBtn: { flex: 1, backgroundColor: '#16a34a', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontWeight: 'bold' },
  rejectBtn: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  rejectBtnText: { color: '#fff', fontWeight: 'bold' },
});