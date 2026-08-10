import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/services/firebase-services';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getTheme } from '@/constants/theme';

export default function StaffCheckinScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const [staffId, setStaffId] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const searchStaff = async () => {
    if (!staffId.trim()) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('uid', '==', staffId.trim()));
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSearchResults(results);
    } catch (error) {
      Alert.alert('Error', 'Failed to search staff');
    } finally {
      setLoading(false);
    }
  };

  const checkInStaff = async (staff: any) => {
    try {
      // Update staff shift assignment
      const assignmentsQuery = query(
        collection(db, 'staff_shift_assignments'),
        where('staffId', '==', staff.id),
        where('status', '==', 'assigned')
      );
      const assignmentsSnap = await getDocs(assignmentsQuery);
      
      for (const assignmentDoc of assignmentsSnap.docs) {
        await updateDoc(doc(db, 'staff_shift_assignments', assignmentDoc.id), {
          status: 'checked_in',
          checkedInAt: new Date().toISOString(),
        });
      }

      Alert.alert('Success', `${staff.displayName} checked in successfully`);
      setStaffId('');
      setSearchResults([]);
    } catch (error) {
      Alert.alert('Error', 'Failed to check in staff');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Staff Check-in</Text>
        <Text style={styles.subtitle}>Scan or enter staff ID to check in</Text>
      </View>

      <View style={styles.searchCard}>
        <TextInput
          style={styles.input}
          placeholder="Enter Staff ID"
          value={staffId}
          onChangeText={setStaffId}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={searchStaff} disabled={loading}>
          {loading ? <ActivityIndicator color={theme.colors.textInverse} /> : <Text style={styles.searchBtnText}>Search</Text>}
        </TouchableOpacity>
      </View>

      {searchResults.length > 0 && (
        <View style={styles.results}>
          <Text style={styles.resultsTitle}>Search Results</Text>
          {searchResults.map((staff) => (
            <View key={staff.id} style={styles.staffCard}>
              <View style={styles.staffInfo}>
                <Text style={styles.staffName}>{staff.displayName}</Text>
                <Text style={styles.staffRole}>{staff.subRole || 'Staff'}</Text>
              </View>
              <TouchableOpacity style={styles.checkinBtn} onPress={() => checkInStaff(staff)}>
                <Text style={styles.checkinBtnText}>Check In</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.colors.text },
  subtitle: { fontSize: 14, color: theme.colors.textMuted, marginTop: 4 },
  searchCard: { backgroundColor: theme.colors.surface, padding: 20, borderRadius: 16, marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 16, fontSize: 16, marginBottom: 12, color: theme.colors.text },
  searchBtn: { backgroundColor: theme.colors.secondary, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  searchBtnText: { color: theme.colors.textInverse, fontWeight: 'bold', fontSize: 16 },
  results: { marginTop: 16 },
  resultsTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginBottom: 12 },
  staffCard: { backgroundColor: theme.colors.surface, padding: 16, borderRadius: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  staffInfo: { flex: 1 },
  staffName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  staffRole: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  checkinBtn: { backgroundColor: theme.colors.success, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  checkinBtnText: { color: theme.colors.textInverse, fontWeight: 'bold' },
});