// (npo) Organisation profile: verification status, registration details,
// capacity and lifetime allocation counts.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '@/services/firebase-services';
import { useAuth } from '@/context/AuthContext';
import { listenNpoPartners, listenMyAllocations, addNpoFacility } from '@/services/increment2-services';
import type { DonationBatch, NpoPartner } from '@/types/increment2';
import { getTheme } from '@/constants/theme';
import { formatStatus } from '@/utils/status-labels';
import { LiveErrorBanner } from '@/components/detail-kit';
import { goBack } from '@/utils/navigation';
import { useRouter } from 'expo-router';

export default function NpoOrganisationScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);
  const { profile, signOut } = useAuth();
  const email = (profile?.email || auth.currentUser?.email || '').toLowerCase();

  const [myNpo, setMyNpo] = useState<NpoPartner | null>(null);
  const [known, setKnown] = useState(false);
  const [items, setItems] = useState<DonationBatch[]>([]);
  const [loadError, setLoadError] = useState('');
  // Phase 1 (§30): registered facilities management.
  const [facName, setFacName] = useState('');
  const [facAddress, setFacAddress] = useState('');
  const [facCapacity, setFacCapacity] = useState('');
  const [facContact, setFacContact] = useState('');
  const [facBusy, setFacBusy] = useState(false);

  useEffect(() => {
    if (!email) { setKnown(true); return; }
    setLoadError('');
    const onErr = (e: Error) => setLoadError(e.message);
    return listenNpoPartners((list) => {
      setMyNpo(list.find((n) => n.email.toLowerCase() === email) || null);
      setKnown(true);
    }, onErr);
  }, [email]);

  useEffect(() => {
    if (!myNpo) return;
    return listenMyAllocations(myNpo.npoId, setItems, (e) => setLoadError(e.message));
  }, [myNpo]);

  if (!known) return <ActivityIndicator size="large" color={theme.colors.primary} />;

  const meals = items
    .filter((b) => b.status === 'collected_completed')
    .reduce((sum, b) => sum + (b.portionCount || 0), 0);

  const submitFacility = async () => {
    if (!myNpo) return;
    if (!facName.trim()) { setLoadError('Facility name is required.'); return; }
    setFacBusy(true);
    try {
      await addNpoFacility({
        npoDocId: myNpo.id, name: facName, address: facAddress,
        capacity: facCapacity ? Number(facCapacity) : undefined, contact: facContact,
      });
      setFacName(''); setFacAddress(''); setFacCapacity(''); setFacContact('');
      setLoadError('');
    } catch (e: any) {
      setLoadError(e?.message || 'Could not add facility.');
    } finally {
      setFacBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack(router, '/(npo)/dashboard')}><Ionicons name="arrow-back" size={24} color={theme.colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Organisation</Text>
      </View>
      <LiveErrorBanner error={loadError} onRetry={() => setLoadError('')} />
      {!myNpo && (
        <Text style={styles.muted}>
          No NPO record matches {email || 'this account'} yet. Ask an administrator to verify your organisation (UC34) — this profile activates on approval.
        </Text>
      )}
      {myNpo && (
        <>
          <Text style={styles.name}>{myNpo.organisationName}</Text>
          <Text style={styles.status}>{formatStatus(myNpo.verificationStatus)}</Text>
          {!!myNpo.rejectionReason && <Text style={styles.muted}>Reviewer note: {myNpo.rejectionReason}</Text>}
          <View style={styles.card}>
            <Row label="Contact" value={`${myNpo.contactName} · ${myNpo.phone}`} />
            <Row label="Email" value={myNpo.email} />
            <Row label="Registration" value={myNpo.registrationNumber} />
            {!!myNpo.pboNumber && <Row label="PBO" value={myNpo.pboNumber} />}
            <Row label="Service areas" value={(myNpo.serviceAreas || []).join(', ') || '—'} />
            <Row label="Beneficiary capacity" value={String(myNpo.beneficiaryCapacity ?? '—')} />
            <Row label="Transport" value={myNpo.transportType || '—'} />
            <Row label="Refrigeration" value={myNpo.refrigerationAvailable ? 'Available' : 'Not available'} />
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>REGISTERED FACILITIES</Text>
            {(myNpo.facilities || []).length === 0 && (
              <Text style={styles.muted}>No facilities registered yet — add your receiving facility so kitchen staff can schedule deliveries to it.</Text>
            )}
            {(myNpo.facilities || []).map((f) => (
              <View key={f.id} style={styles.facilityRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.facilityName}>{f.name}{f.active ? '' : ' (inactive)'}</Text>
                  {!!f.address && <Text style={styles.muted}>{f.address}</Text>}
                  <Text style={styles.muted}>{[f.capacity ? `capacity ${f.capacity}` : '', f.contact || ''].filter(Boolean).join(' · ') || '—'}</Text>
                </View>
              </View>
            ))}
            <TextInput style={styles.input} value={facName} onChangeText={setFacName} placeholder="Facility name *" placeholderTextColor="#64748b" />
            <TextInput style={styles.input} value={facAddress} onChangeText={setFacAddress} placeholder="Address" placeholderTextColor="#64748b" />
            <TextInput style={styles.input} value={facCapacity} onChangeText={setFacCapacity} placeholder="Capacity (beneficiaries)" placeholderTextColor="#64748b" keyboardType="number-pad" />
            <TextInput style={styles.input} value={facContact} onChangeText={setFacContact} placeholder="Contact person / phone" placeholderTextColor="#64748b" />
            <TouchableOpacity style={styles.addFacilityBtn} onPress={submitFacility} disabled={facBusy}>
              <Text style={styles.addFacilityText}>{facBusy ? 'Adding…' : 'Add facility'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.grid}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{items.length}</Text>
              <Text style={styles.statLabel}>Allocations</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{meals}</Text>
              <Text style={styles.statLabel}>Meals received</Text>
            </View>
          </View>
        </>
      )}
      <TouchableOpacity style={styles.signout} onPress={() => { signOut().then(() => router.replace('/login' as any)); }}>
        <Text style={styles.signoutText}>Sign out</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600' }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: 14, color: '#0f172a' }}>{value}</Text>
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  name: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  status: { fontSize: 14, fontWeight: '700', color: theme.colors.primary, marginBottom: 8 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 10, padding: 14, marginTop: 8, borderWidth: 1, borderColor: theme.colors.border },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.5, marginBottom: 8 },
  facilityRow: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 8, marginBottom: 4 },
  facilityName: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 10, color: theme.colors.text, marginTop: 6, backgroundColor: 'transparent' },
  addFacilityBtn: { backgroundColor: theme.colors.primary, borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 10 },
  addFacilityText: { color: '#fff', fontWeight: '700' },
  grid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  statValue: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  statLabel: { fontSize: 11, color: theme.colors.textMuted },
  muted: { color: theme.colors.textMuted, fontSize: 12, marginTop: 4 },
  signout: { marginTop: 16, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.error },
  signoutText: { color: theme.colors.error, fontWeight: '700' },
});