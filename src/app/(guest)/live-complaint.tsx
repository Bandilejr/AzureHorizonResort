import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, TextInput, useColorScheme, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth, db, uploadImage , createLiveComplaint } from '@/services/firebase-services';
import { getTheme } from '@/constants/theme';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';
import * as ImagePicker from 'expo-image-picker';

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
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('medium');
  const [submitting, setSubmitting] = useState(false);
  const [photoUris, setPhotoUris] = useState<string[]>([]);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const handlePickPhoto = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsMultipleSelection: true,
      });
      if (!res.canceled) {
        const uris = res.assets.map(a => a.uri);
        setPhotoUris(prev => [...prev, ...uris]);
      }
    } catch (e: any) {
      showAlert({ title: 'Photo Error', message: e.message || 'Failed to select image', type: 'error' });
    }
  };

  const handleSubmit = async () => {
    const user = auth.currentUser;
    if (!user) {
      showAlert({
        title: "🔒 Sign In Required",
        message: "Please sign in to your room stay account to submit live complaints or service reports.",
        type: "warning",
        confirmText: "Sign In",
        cancelText: "Cancel",
        onConfirm: () => router.push('/login'),
      });
      return;
    }

    if (!category || !location.trim() || !description.trim()) {
      showAlert({ title: 'Missing Information', message: 'Please fill in all fields', type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const uploadedUrls: string[] = [];
      for (const uri of photoUris) {
        const url = await uploadImage(uri, 'live_complaints');
        uploadedUrls.push(url);
      }

      await createLiveComplaint({
        eventId: eventId || 'general_resort',
        guestId: user.uid,
        category,
        location: location.trim(),
        description: description.trim(),
        urgency: urgency as any,
        photos: uploadedUrls,
      });
      showAlert({
        title: 'Complaint Filed',
        message: 'Our team has been notified and will address this shortly.',
        type: 'success',
        onConfirm: () => router.back(),
      });
    } catch (error: any) {
      showAlert({ title: 'Error', message: error.message || 'Failed to file complaint', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>File Live Complaint</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={24} color={theme.colors.warning} style={{ marginRight: 8 }} />
          <Text style={styles.warningText}>For immediate safety concerns, please contact staff directly.</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Issue Category</Text>
          <View style={styles.chipWrap}>
            {CATEGORIES.map((cat) => {
              const selected = category === cat.value;
              return (
                <TouchableOpacity
                  key={cat.value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setCategory(cat.value)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{cat.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Location in Venue</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Main hall, Table 5, Stage area"
            placeholderTextColor={theme.colors.textMuted}
            value={location}
            onChangeText={setLocation}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Urgency Level</Text>
          <View style={styles.chipWrap}>
            {URGENCY_LEVELS.map((level) => {
              const selected = urgency === level.value;
              return (
                <TouchableOpacity
                  key={level.value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setUrgency(level.value)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{level.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the issue in detail..."
            placeholderTextColor={theme.colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Photo Attachments */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Photo Evidence (Optional)</Text>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 14, marginBottom: 10 }} 
            onPress={handlePickPhoto}
          >
            <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.primary }}>Attach Photo Evidence</Text>
          </TouchableOpacity>
          {photoUris.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              {photoUris.map((uri, idx) => (
                <View key={idx} style={{ position: 'relative', marginRight: 10 }}>
                  <Image source={{ uri }} style={{ width: 70, height: 70, borderRadius: 10 }} />
                  <TouchableOpacity
                    style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#dc2626', borderRadius: 10, padding: 2 }}
                    onPress={() => setPhotoUris(photoUris.filter((_, i) => i !== idx))}
                  >
                    <Ionicons name="close" size={14} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color={theme.colors.textInverse} /> : <Text style={styles.submitBtnText}>Submit Complaint</Text>}
        </TouchableOpacity>
      </View>

      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backButton: { padding: 8, marginLeft: -8 },
  title: { flex: 1, fontSize: 28, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  warningBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.warningLight, padding: 12, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: theme.colors.warning },
  warningText: { flex: 1, color: theme.colors.warning, fontSize: 13 },
  field: { marginBottom: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 16, fontSize: 16, backgroundColor: theme.colors.surfaceVariant, color: theme.colors.text },
  textArea: { textAlignVertical: 'top', minHeight: 120 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextSelected: { color: theme.colors.textInverse },
  submitBtn: { backgroundColor: theme.colors.error, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: theme.colors.borderStrong },
  submitBtnText: { color: theme.colors.textInverse, fontWeight: 'bold', fontSize: 16 },
});
