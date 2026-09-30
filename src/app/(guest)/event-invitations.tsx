import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth, db , generateInvitationQR } from '@/services/firebase-services';

import { sendInviteeQREmail } from '@/services/emailjs-service';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ListSkeleton } from '@/components/ui/states';
import { collection, query, where, getDocs, onSnapshot, doc, getDoc } from 'firebase/firestore';
import QRCode from 'react-native-qrcode-svg';

export default function EventInvitationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const eventId = params.eventId as string;
  const [invitees, setInvitees] = useState<{ email: string; name: string }[]>([{ email: '', name: '' }]);
  const [sending, setSending] = useState(false);
  const [sentInvitations, setSentInvitations] = useState<any[]>([]);
  const [selectedQrPass, setSelectedQrPass] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const theme = useAppTheme();
  const styles = createStyles(theme);

  // Live subscription: loads invitations on mount and reflects RSVP changes instantly
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const subscribe = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          Alert.alert('Authentication Required', 'Please sign in to manage event invitations.');
          router.back();
          return;
        }
        if (!eventId) {
          Alert.alert('Missing Event ID', 'Invalid event selection.');
          router.back();
          return;
        }

        // Security check: verify logged-in user owns this event
        const eventSnap = await getDoc(doc(db, 'event_bookings', eventId));
        if (eventSnap.exists() && eventSnap.data().guestId !== user.uid) {
          Alert.alert('🔒 Unauthorized', 'You do not have permission to view or manage invitations for this event.');
          router.back();
          return;
        }

        const q = query(collection(db, 'event_invitations'), where('eventId', '==', eventId));
        unsub = onSnapshot(q, (snapshot) => {
          setSentInvitations(snapshot.docs.map(snapDoc => ({ id: snapDoc.id, ...snapDoc.data() })));
          setLoading(false);
        }, (error) => {
          console.error('Failed to load invitations:', error);
          setLoading(false);
        });
      } catch (error) {
        console.error('Failed to load invitations:', error);
        setLoading(false);
      }
    };
    subscribe();
    return () => { if (unsub) unsub(); };
  }, [eventId]);

  const addInvitee = () => {
    setInvitees([...invitees, { email: '', name: '' }]);
  };

  const removeInvitee = (index: number) => {
    setInvitees(invitees.filter((_, i) => i !== index));
  };

  const updateInvitee = (index: number, field: 'email' | 'name', value: string) => {
    setInvitees(invitees.map((inv, i) => i === index ? { ...inv, [field]: value } : inv));
  };

  const sendQrEmail = async (to_email: string, to_name: string, qr_code: string) =>
    sendInviteeQREmail({
      to_email,
      to_name,
      event_title: 'Resort Gala Event',
      event_date: new Date().toLocaleDateString(),
      venue_name: 'Azure Horizon Pavilion',
      qr_code,
    });

  const sendInvitations = async () => {
    const validInvitees = invitees.filter(i => i.email.trim() && i.name.trim());
    if (validInvitees.length === 0) {
      Alert.alert('Error', 'Please add at least one invitee');
      return;
    }

    setSending(true);
    try {
      let sentCount = 0;
      let emailFailed = false;
      for (const invitee of validInvitees) {
        const email = invitee.email.trim().toLowerCase();
        const existing = sentInvitations.find(
          (i: any) => String(i.inviteeEmail || '').toLowerCase() === email
        );

        // Already invited — reuse the existing QR pass instead of creating a duplicate
        if (existing?.qrCode) {
          const emailSent = await sendQrEmail(email, invitee.name.trim(), existing.qrCode);
          if (!emailSent) emailFailed = true;
          sentCount++;
          continue;
        }

        const res = await generateInvitationQR({
          eventId,
          inviteeEmail: email,
          inviteeName: invitee.name.trim(),
        });

        if (res?.data?.qrCode) {
          const emailSent = await sendQrEmail(email, invitee.name.trim(), res.data.qrCode);
          if (!emailSent) {
            emailFailed = true;
          }
        }
        sentCount++;
      }
      if (emailFailed) {
        Alert.alert('Partial Success', `${sentCount} invitation(s) created in app, but some QR Pass emails failed to send. Please check your EmailJS configuration.`);
      } else {
        Alert.alert('Success', `${sentCount} invitation(s) sent & QR Pass emails dispatched!`);
      }
      setInvitees([{ email: '', name: '' }]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send invitations');
    } finally {
      setSending(false);
    }
  };

  const resendPass = async (inv: any) => {
    if (!inv?.qrCode) {
      Alert.alert('Error', 'No QR pass available for this invitee.');
      return;
    }
    try {
      const sent = await sendQrEmail(inv.inviteeEmail, inv.inviteeName || 'Guest', inv.qrCode);
      Alert.alert(
        sent ? 'QR Pass Resent' : 'Email Failed',
        sent ? `Pass re-sent to ${inv.inviteeEmail}.` : 'EmailJS failed to send. Please check your configuration.'
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to resend pass.');
    }
  };

  // One row per unique invitee email (latest invitation wins)
  const uniqueInvitations = sentInvitations
    .slice()
    .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .filter((inv: any, i: number, arr: any[]) =>
      arr.findIndex((x: any) => String(x.inviteeEmail || '').toLowerCase() === String(inv.inviteeEmail || '').toLowerCase()) === i
    );

  const invitedCount = uniqueInvitations.filter(i => i.rsvpStatus === 'invited' || !i.rsvpStatus).length;
  const acceptedCount = uniqueInvitations.filter(i => i.rsvpStatus === 'accepted' || i.status === 'checked_in').length;
  const declinedCount = uniqueInvitations.filter(i => i.rsvpStatus === 'declined').length;

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={theme.colors.secondary} />
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
              placeholderTextColor={theme.colors.textMuted}
              value={invitee.email}
              onChangeText={(v) => updateInvitee(index, 'email', v)}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={theme.colors.textMuted}
              value={invitee.name}
              onChangeText={(v) => updateInvitee(index, 'name', v)}
            />
            {invitees.length > 1 && (
              <TouchableOpacity style={styles.removeBtn} onPress={() => removeInvitee(index)}>
                <Ionicons name="close" size={24} color={theme.colors.error} />
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity style={styles.addBtn} onPress={addInvitee}>
          <Ionicons name="add" size={20} color={theme.colors.secondary} />
          <Text style={styles.addBtnText}>Add Another Invitee</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.sendBtn, sending && styles.sendBtnDisabled]} onPress={sendInvitations} disabled={sending}>
          {sending ? <ActivityIndicator color={theme.colors.textInverse} /> : <Text style={styles.sendBtnText}>Send Invitations</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sent Invitations</Text>
        {/* RSVP STATUS DASHBOARD */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <View style={{ flex: 1, backgroundColor: theme.colors.surfaceVariant, padding: 12, borderRadius: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.textSecondary }}>{invitedCount}</Text>
            <Text style={{ fontSize: 11, color: theme.colors.textSecondary, fontWeight: '700' }}>Invited</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: theme.colors.successSoft, padding: 12, borderRadius: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.success }}>{acceptedCount}</Text>
            <Text style={{ fontSize: 11, color: theme.colors.success, fontWeight: '700' }}>Accepted</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: theme.colors.errorSoft, padding: 12, borderRadius: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.error }}>{declinedCount}</Text>
            <Text style={{ fontSize: 11, color: theme.colors.error, fontWeight: '700' }}>Declined</Text>
          </View>
        </View>

        {loading ? (
          <ListSkeleton rows={3} />
        ) : sentInvitations.length === 0 ? (
          <EmptyState icon="mail-outline" title="No invitations sent yet" />
        ) : (
          uniqueInvitations.map((inv) => (
            <View key={inv.id} style={styles.invitationCard}>
              <View style={styles.invitationInfo}>
                <Text style={styles.invitationName}>{inv.inviteeName}</Text>
                <Text style={styles.invitationEmail}>{inv.inviteeEmail}</Text>
                {inv.status === 'checked_in' ? (
                  <View style={[styles.rsvpBadge, { backgroundColor: theme.colors.successSoft }]}>
                    <Text style={[styles.rsvpBadgeText, { color: theme.colors.success }]}>🟢 Checked-In</Text>
                  </View>
                ) : inv.rsvpStatus === 'accepted' ? (
                  <View style={[styles.rsvpBadge, { backgroundColor: theme.colors.successSoft }]}>
                    <Text style={[styles.rsvpBadgeText, { color: theme.colors.success }]}>✅ Accepted</Text>
                  </View>
                ) : inv.rsvpStatus === 'declined' ? (
                  <View style={[styles.rsvpBadge, { backgroundColor: theme.colors.errorSoft }]}>
                    <Text style={[styles.rsvpBadgeText, { color: theme.colors.error }]}>❌ Declined</Text>
                  </View>
                ) : (
                  <View style={[styles.rsvpBadge, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <Text style={[styles.rsvpBadgeText, { color: theme.colors.textSecondary }]}>⏳ Invited — Awaiting RSVP</Text>
                  </View>
                )}
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity style={styles.resendBtn} onPress={() => resendPass(inv)}>
                  <Ionicons name="mail-outline" size={16} color={theme.colors.primary} />
                  <Text style={styles.resendBtnText}>Resend</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.viewQrBtn} onPress={() => setSelectedQrPass(inv)}>
                  <Text style={styles.viewQrBtnText}>View Pass</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* QR PASS MODAL */}
      <Modal visible={!!selectedQrPass} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 24, padding: 28, alignItems: 'center', width: '90%' }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text, marginBottom: 4 }}>Event Access Pass</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.info, marginBottom: 16 }}>{selectedQrPass?.inviteeName}</Text>
            
            <View style={{ backgroundColor: theme.colors.surface, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: theme.colors.border, marginBottom: 16 }}>
              {selectedQrPass?.qrCode ? (
                <QRCode value={selectedQrPass.qrCode} size={200} />
              ) : null}
            </View>

            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 20 }}>
              Show this QR code at the door for entry (UC27 scan).
            </Text>

            <TouchableOpacity 
              style={{ backgroundColor: theme.colors.secondary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 14 }}
              onPress={() => setSelectedQrPass(null)}
            >
              <Text style={{ color: theme.colors.textInverse, fontWeight: '800', fontSize: 14 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backButton: { padding: 8, marginLeft: -8 },
  title: { flex: 1, fontSize: 28, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },
  section: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20, marginBottom: 24, shadowColor: theme.colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text, marginBottom: 16 },
  inviteeRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 16, fontSize: 16, color: theme.colors.text },
  removeBtn: { padding: 8, marginTop: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 8, marginBottom: 16 },
  addBtnText: { color: theme.colors.primary, fontWeight: '600' },
  sendBtn: { backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  sendBtnDisabled: { backgroundColor: theme.colors.borderStrong },
  sendBtnText: { color: theme.colors.textInverse, fontWeight: 'bold', fontSize: 16 },
  loading: { marginVertical: 20 },
  emptyText: { textAlign: 'center', color: theme.colors.textMuted, marginVertical: 20 },
  invitationCard: { backgroundColor: theme.colors.surface, padding: 16, borderRadius: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: theme.colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  invitationInfo: { flex: 1 },
  invitationName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  invitationEmail: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  rsvpBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 6 },
  rsvpBadgeText: { fontSize: 12, fontWeight: '700' },
  viewQrBtn: { backgroundColor: theme.colors.secondary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  viewQrBtnText: { color: theme.colors.textInverse, fontWeight: '600' },
  resendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  resendBtnText: { color: theme.colors.primary, fontWeight: '600', fontSize: 13 },
});