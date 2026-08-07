import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth, db } from '@/services/firebase-services';
import { generateInvitationQR } from '@/services/firebase-services';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';

export default function EventInvitationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const eventId = params.eventId as string;
  const [invitees, setInvitees] = useState<Array<{ email: string; name: string }>>([{ email: '', name: '' }]);
  const [sending, setSending] = useState(false);
  const [sentInvitations, setSentInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvitations = async () => {
    try {
      const q = query(collection(db, 'event_invitations'), where('eventId', '==', eventId));
      const snapshot = await getDocs(q);
      setSentInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Failed to fetch invitations:', error);
    } finally {
      setLoading(false);
    }
  };

  const addInvitee = () => {
    setInvitees([...invitees, { email: '', name: '' }]);
  };

  const removeInvitee = (index: number) => {
    setInvitees(invitees.filter((_, i) => i !== index));
  };

  const updateInvitee = (index: number, field: 'email' | 'name', value: string) => {
    setInvitees(invitees.map((inv, i) => i === index ? { ...inv, [field]: value } : inv));
  };

  const sendInvitations = async () => {
    const validInvitees = invitees.filter(i => i.email.trim() && i.name.trim());
    if (validInvitees.length === 0) {
      Alert.alert('Error', 'Please add at least one invitee');
      return;
    }

    setSending(true);
    try {
      for (const invitee of validInvitees) {
        await generateInvitationQR({
          eventId,
          inviteeEmail: invitee.email.trim().toLowerCase(),
          inviteeName: invitee.name.trim(),
        });
      }
      Alert.alert('Success', `${validInvitees.length} invitation(s) sent successfully!`);
      setInvitees([{ email: '', name: '' }]);
      await fetchInvitations();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send invitations');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#1e3a5f" />
        </TouchableOpacity>
        <Text style={styles.title}>Send Invitations</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add Invitees</Text>
        {invitees.map((invitee, index) => (
          <View key={index} style={styles.inviteeRow}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={invitee.email}
              onChangeText={(v) => updateInvitee(index, 'email', v)}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Name"
              value={invitee.name}
              onChangeText={(v) => updateInvitee(index, 'name', v)}
            />
            {invitees.length > 1 && (
              <TouchableOpacity style={styles.removeBtn} onPress={() => removeInvitee(index)}>
                <Ionicons name="close" size={24} color="#dc2626" />
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity style={styles.addBtn} onPress={addInvitee}>
          <Ionicons name="add" size={20} color="#1e3a5f" />
          <Text style={styles.addBtnText}>Add Another Invitee</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.sendBtn, sending && styles.sendBtnDisabled]} onPress={sendInvitations} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>Send Invitations</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sent Invitations</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#c9a227" style={styles.loading} />
        ) : sentInvitations.length === 0 ? (
          <Text style={styles.emptyText}>No invitations sent yet</Text>
        ) : (
          sentInvitations.map((inv) => (
            <View key={inv.id} style={styles.invitationCard}>
              <View style={styles.invitationInfo}>
                <Text style={styles.invitationName}>{inv.inviteeName}</Text>
                <Text style={styles.invitationEmail}>{inv.inviteeEmail}</Text>
                <Text style={styles.invitationStatus}>Status: {inv.status}</Text>
              </View>
              <TouchableOpacity style={styles.viewQrBtn} onPress={() => Alert.alert('QR Code', inv.qrCode)}>
                <Text style={styles.viewQrBtnText}>View QR</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backButton: { padding: 8, marginLeft: -8 },
  title: { flex: 1, fontSize: 28, fontWeight: 'bold', color: '#1e3a5f', textAlign: 'center' },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e3a5f', marginBottom: 16 },
  inviteeRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 16, fontSize: 16 },
  removeBtn: { padding: 8, marginTop: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderWidth: 1, borderColor: '#c9a227', borderRadius: 8, marginBottom: 16 },
  addBtnText: { color: '#c9a227', fontWeight: '600' },
  sendBtn: { backgroundColor: '#c9a227', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  sendBtnDisabled: { backgroundColor: '#cbd5e1' },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  loading: { marginVertical: 20 },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginVertical: 20 },
  invitationCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  invitationInfo: { flex: 1 },
  invitationName: { fontSize: 16, fontWeight: '600', color: '#1e3a5f' },
  invitationEmail: { fontSize: 13, color: '#64748b', marginTop: 2 },
  invitationStatus: { fontSize: 12, color: '#c9a227', fontWeight: '600', marginTop: 4 },
  viewQrBtn: { backgroundColor: '#1e3a5f', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  viewQrBtnText: { color: '#fff', fontWeight: '600' },
});