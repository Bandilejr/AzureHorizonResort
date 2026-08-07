import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Picker } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { db } from '@/services/firebase-services';
import { createLiveComplaint } from '@/services/firebase-services';

const CATEGORIES = [
  { value: 'ac', label: 'AC / Climate Control' },
  { value: 'catering', label: 'Catering / Food' },
  { value: 'av', label: 'AV / Sound System' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'cleanliness', label: 'Cleanliness' },
  { value: 'other', label: 'Other' },
];

const URGENCY_LEVELS = [
  { value: 'low', label: 'Low - Minor inconvenience' },
  { value: 'medium', label: 'Medium - Affecting experience' },
  { value: 'high', label: 'High - Major disruption' },
  { value: 'critical', label: 'Critical - Safety concern' },
];

export default function LiveComplaintScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const eventId = params.eventId as string;
  
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('medium');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!category || !location.trim() || !description.trim()) {
      Alert.alert('Missing Information', 'Please fill in all fields');
      return;
    }

    setSubmitting(true);
    try {
      await createLiveComplaint({
        eventId,
        guestId: 'current', // Will be replaced by actual user ID
        category,
        location: location.trim(),
        description: description.trim(),
        urgency: urgency as any,
      });
      Alert.alert('Complaint Filed', 'Our team has been notified and will address this shortly.');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to file complaint');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#1e3a5f" />
        </TouchableOpacity>
        <Text style={styles.title}>File Live Complaint</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={24} color="#c9a227" style={{ marginRight: 8 }} />
          <Text style={styles.warningText}>For immediate safety concerns, please contact staff directly.</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Issue Category</Text>
          <Picker
            selectedValue={category}
            onValueChange={setCategory}
            style={styles.picker}
            itemStyle={styles.pickerItem}
          >
            <Picker.Item label="Select category" value="" />
            {CATEGORIES.map((cat) => (
              <Picker.Item key={cat.value} label={cat.label} value={cat.value} />
            ))}
          </Picker>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Location in Venue</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Main hall, Table 5, Stage area"
            value={location}
            onChangeText={setLocation}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Urgency Level</Text>
          <Picker
            selectedValue={urgency}
            onValueChange={setUrgency}
            style={styles.picker}
            itemStyle={styles.pickerItem}
          >
            {URGENCY_LEVELS.map((level) => (
              <Picker.Item key={level.value} label={level.label} value={level.value} />
            ))}
          </Picker>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the issue in detail..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
          />
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Complaint</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// Need to import TextInput
import { TextInput } from 'react-native';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backButton: { padding: 8, marginLeft: -8 },
  title: { flex: 1, fontSize: 28, fontWeight: 'bold', color: '#1e3a5f', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  warningBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', padding: 12, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#fde68a' },
  warningText: { flex: 1, color: '#92400e', fontSize: 13 },
  field: { marginBottom: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#1e3a5f', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 16, fontSize: 16, backgroundColor: '#f8fafc' },
  textArea: { textAlignVertical: 'top', minHeight: 120 },
  picker: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, backgroundColor: '#f8fafc' },
  pickerItem: { fontSize: 16 },
  submitBtn: { backgroundColor: '#dc2626', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: '#cbd5e1' },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});