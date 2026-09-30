// (staff) Staff check-in — search a staff member and check them into their
// active shift assignment. Batch F: rebuilt on the design system; the Firestore
// queries and update payload are unchanged.
import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { db } from '@/services/firebase-services';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen, PageHeader, SectionHeader } from '@/components/ui/screen';
import { Card } from '@/components/ui/surface';
import { ListRow } from '@/components/ui/list-row';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/inputs';
import { EmptyState } from '@/components/ui/states';

export default function StaffCheckinScreen() {
  const theme = useAppTheme();
  const [staffId, setStaffId] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const searchStaff = async () => {
    if (!staffId.trim()) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('uid', '==', staffId.trim()));
      const snapshot = await getDocs(q);
      setSearchResults(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      Alert.alert('Error', 'Failed to search staff');
    } finally {
      setLoading(false);
    }
  };

  const checkInStaff = async (staff: any) => {
    try {
      const assignmentsQuery = query(
        collection(db, 'staff_shift_assignments'),
        where('staffId', '==', staff.id),
        where('status', '==', 'assigned'),
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
    } catch {
      Alert.alert('Error', 'Failed to check in staff');
    }
  };

  return (
    <Screen scroll>
      <PageHeader title="Staff check-in" subtitle="Search a staff member to check them in" showBack fallback="/(staff)/staff-dashboard" />

      <View style={{ gap: theme.space.sm }}>
        <SearchField value={staffId} onChangeText={setStaffId} placeholder="Enter staff ID" accessibilityLabel="Staff ID" />
        <Button label="Search staff" icon="search-outline" onPress={searchStaff} loading={loading} />
      </View>

      <SectionHeader title={`Results${searchResults.length ? ` (${searchResults.length})` : ''}`} />
      {searchResults.length === 0 ? (
        <EmptyState icon="id-card-outline" title="No staff selected" message="Enter a staff ID and search to check someone in." />
      ) : (
        <Card padding="none" style={{ paddingHorizontal: theme.space.lg }}>
          {searchResults.map((staff, i) => (
            <View key={staff.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.border } : undefined}>
              <ListRow
                title={staff.displayName || 'Staff member'}
                subtitle={staff.subRole ? String(staff.subRole).replace(/_/g, ' ') : 'Staff'}
                showChevron={false}
                trailing={<Button label="Check in" fullWidth={false} onPress={() => checkInStaff(staff)} />}
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
