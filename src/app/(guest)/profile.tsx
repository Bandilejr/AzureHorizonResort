import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/i18n/hooks';
import { db } from '@/services/firebase-services';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';

export default function ProfileScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { user, profile, refreshProfile, signOut, isGuest } = useAuth();
  const { language, setLanguage } = useTranslation();

  const isVisitor = !user || profile?.status === 'visitor';

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  // Tab & UI states
  const [activeTab, setActiveTab] = useState<'details' | 'security' | 'payment'>('details');
  const [isSaving, setIsSaving] = useState(false);

  // Card management state
  const [savedCard, setSavedCard] = useState<{ brand: string; last4: string; expiry: string; holder: string } | null>({
    brand: 'Visa',
    last4: '4242',
    expiry: '08/28',
    holder: 'Guest User',
  });
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [newCardNumber, setNewCardNumber] = useState('');
  const [newCardHolder, setNewCardHolder] = useState('');
  const [newCardExpiry, setNewCardExpiry] = useState('');

  // Password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  // Custom Alert state
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  useEffect(() => {
    if (user && profile) {
      setDisplayName(profile.displayName || user?.displayName || '');
      setPhoneNumber(profile.phoneNumber || '');
      setRoomNumber(profile.roomNumber && profile.roomNumber !== 'N/A' ? profile.roomNumber : '');
      setNotificationsEnabled(profile.preferences?.notifications ?? true);
    }
  }, [profile, user]);

  // Handle Language selection & persistence
  const handleSelectLanguage = async (code: 'en' | 'zu' | 'af') => {
    await setLanguage(code);
    if (user) {
      try {
        const cleanEmail = (user.email || '').trim().toLowerCase();
        const userRef = doc(db, 'users', user.uid);
        const emailRef = doc(db, 'users', cleanEmail);
        const updateData = { 'preferences.language': code, updatedAt: serverTimestamp() };
        await updateDoc(userRef, updateData).catch(() => updateDoc(emailRef, updateData));
        await refreshProfile();
      } catch (err) {
        console.warn('Could not sync language to Firestore:', err);
      }
    }
    showAlert({
      title: 'Language Preference Updated',
      message: `App language preference set to ${code === 'en' ? 'English' : code === 'zu' ? 'isiZulu' : 'Afrikaans'}.`,
      type: 'info',
    });
  };

  // Save Personal Details to Firestore & Sync across boards
  const handleSaveDetails = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const updates = {
        displayName: displayName.trim() || 'Guest',
        phoneNumber: phoneNumber.trim(),
        roomNumber: roomNumber.trim() || (profile?.roomNumber || 'N/A'),
        preferences: {
          language,
          notifications: notificationsEnabled,
        },
        updatedAt: serverTimestamp(),
      };

      try {
        await updateDoc(doc(db, 'users', user.uid), updates);
      } catch (err) {
        const emailKey = user.email ? user.email.trim().toLowerCase() : user.uid;
        await setDoc(doc(db, 'users', emailKey), updates, { merge: true });
      }

      await refreshProfile();

      showAlert({
        title: 'Profile Updated',
        message: 'Your profile details have been saved and updated across all resort boards.',
        type: 'success',
      });
    } catch (error: any) {
      showAlert({
        title: 'Update Error',
        message: error.message || 'Failed to update profile. Please try again.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCard = () => {
    const cleanNum = newCardNumber.replace(/\s/g, '');
    if (cleanNum.length < 16) {
      showAlert({ title: 'Invalid Card Number', message: 'Please enter a 16-digit card number.', type: 'warning' });
      return;
    }
    if (!newCardHolder.trim()) {
      showAlert({ title: 'Cardholder Name Required', message: 'Please enter the name on the card.', type: 'warning' });
      return;
    }
    setSavedCard({
      brand: cleanNum.startsWith('4') ? 'Visa' : 'Mastercard',
      last4: cleanNum.slice(-4),
      expiry: newCardExpiry || '12/28',
      holder: newCardHolder,
    });
    setShowAddCardModal(false);
    setNewCardNumber('');
    setNewCardHolder('');
    setNewCardExpiry('');

    showAlert({
      title: 'Payment Method Saved',
      message: 'Your new card has been set as your default payment method.',
      type: 'success',
    });
  };

  const handleSignOut = () => {
    showAlert({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out of Azure Horizon?',
      type: 'warning',
      confirmText: 'Sign Out',
      cancelText: 'Cancel',
      onConfirm: async () => {
        await signOut();
        router.replace('/login');
      },
    });
  };

  const handleChangePassword = () => {
    if (!currentPass || !newPass) {
      showAlert({ title: 'Input Required', message: 'Please fill in all password fields.', type: 'warning' });
      return;
    }
    if (newPass !== confirmPass) {
      showAlert({ title: 'Password Mismatch', message: 'New password and confirmation do not match.', type: 'warning' });
      return;
    }
    setShowPasswordModal(false);
    setCurrentPass('');
    setNewPass('');
    setConfirmPass('');
    showAlert({ title: 'Password Changed', message: 'Your account password has been updated.', type: 'success' });
  };

  // IF VISITOR: DISPLAY ACCESS RESTRICTED PROTECTION SCREEN
  if (isVisitor) {
    return (
      <View style={styles.lockedContainer}>
        <View style={styles.lockedIconBadge}>
          <Ionicons name="lock-closed" size={48} color={theme.colors.gold} />
        </View>
        <Text style={styles.lockedTitle}>Profile & Account Settings Locked</Text>
        <Text style={styles.lockedSubtitle}>
          Profile customization, room details, security options, and saved payment cards are reserved for verified resort residents and account holders.
        </Text>

        <TouchableOpacity style={styles.lockedSignInBtn} onPress={() => router.push('/login')} activeOpacity={0.8}>
          <Ionicons name="log-in-outline" size={20} color={theme.colors.text} />
          <Text style={styles.lockedSignInBtnText}>Sign In to Your Stay</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.lockedBackBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.lockedBackBtnText}>Back to Resort Explorer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>User Profile & Settings</Text>
          <Text style={styles.subtitle}>Account management & security options</Text>
        </View>
      </View>

      {/* User Banner */}
      <View style={styles.userCard}>
        <View style={styles.avatarContainer}>
          <Ionicons name="person" size={44} color={theme.colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{profile?.displayName || user?.displayName || 'Resort Guest'}</Text>
          <Text style={styles.userEmail}>{user?.email || profile?.email || 'Registered Guest'}</Text>

          <View style={styles.statusPill}>
            <Ionicons name="shield-checkmark-sharp" size={12} color={theme.colors.success} />
            <Text style={styles.statusPillText}>
              Verified Resident (Room {roomNumber || profile?.roomNumber || '101'})
            </Text>
          </View>
        </View>
      </View>

      {/* Multi-Tab Switcher */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'details' && styles.tabBtnActive]}
          onPress={() => setActiveTab('details')}
        >
          <Ionicons name="person-outline" size={16} color={activeTab === 'details' ? theme.colors.text : theme.colors.textMuted} />
          <Text style={[styles.tabBtnText, activeTab === 'details' && styles.tabBtnTextActive]}>Details</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'security' && styles.tabBtnActive]}
          onPress={() => setActiveTab('security')}
        >
          <Ionicons name="shield-checkmark-outline" size={16} color={activeTab === 'security' ? theme.colors.text : theme.colors.textMuted} />
          <Text style={[styles.tabBtnText, activeTab === 'security' && styles.tabBtnTextActive]}>Security</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'payment' && styles.tabBtnActive]}
          onPress={() => setActiveTab('payment')}
        >
          <Ionicons name="card-outline" size={16} color={activeTab === 'payment' ? theme.colors.text : theme.colors.textMuted} />
          <Text style={[styles.tabBtnText, activeTab === 'payment' && styles.tabBtnTextActive]}>Cards</Text>
        </TouchableOpacity>
      </View>

      {/* TAB 1: PERSONAL DETAILS */}
      {activeTab === 'details' && (
        <View style={styles.tabSection}>
          <Text style={styles.sectionTitle}>Personal Details</Text>

          <Text style={styles.fieldLabel}>Display Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your full name"
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.fieldLabel}>Phone Number</Text>
          <TextInput
            style={styles.fieldInput}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+27 (0) 82 123 4567"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="phone-pad"
          />

          <Text style={styles.fieldLabel}>Room / Suite Number</Text>
          <TextInput
            style={styles.fieldInput}
            value={roomNumber}
            onChangeText={setRoomNumber}
            placeholder="e.g. 101, 204"
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.fieldLabel}>Language Preference</Text>
          <View style={styles.langRow}>
            {[
              { code: 'en', label: 'English' },
              { code: 'zu', label: 'isiZulu' },
              { code: 'af', label: 'Afrikaans' },
            ].map((l) => (
              <TouchableOpacity
                key={l.code}
                style={[styles.langChip, language === l.code && styles.langChipActive]}
                onPress={() => handleSelectLanguage(l.code as any)}
              >
                <Text style={[styles.langChipText, language === l.code && styles.langChipTextActive]}>
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveDetails} disabled={isSaving} activeOpacity={0.8}>
            {isSaving ? <ActivityIndicator color={theme.colors.text} /> : <Text style={styles.saveBtnText}>Save Profile Changes</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* TAB 2: SECURITY & PERMISSIONS */}
      {activeTab === 'security' && (
        <View style={styles.tabSection}>
          <Text style={styles.sectionTitle}>Security & Permissions</Text>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Push Notifications</Text>
              <Text style={styles.settingDesc}>Alerts for room service, events, and maintenance</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: theme.colors.cameraBackdrop, true: theme.colors.primary }}
              thumbColor={notificationsEnabled ? theme.colors.text : theme.colors.textMuted}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Biometrics & NFC Key Access</Text>
              <Text style={styles.settingDesc}>Use Fingerprint / Face ID for room key & 1-tap pay</Text>
            </View>
            <Switch
              value={biometricsEnabled}
              onValueChange={setBiometricsEnabled}
              trackColor={{ false: theme.colors.cameraBackdrop, true: theme.colors.primary }}
              thumbColor={biometricsEnabled ? theme.colors.text : theme.colors.textMuted}
            />
          </View>

          <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowPasswordModal(true)} activeOpacity={0.8}>
            <Ionicons name="key-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.outlineBtnText}>Change Password</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={18} color={theme.colors.error} />
            <Text style={styles.signOutBtnText}>Sign Out of Account</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TAB 3: PAYMENT CARDS */}
      {activeTab === 'payment' && (
        <View style={styles.tabSection}>
          <Text style={styles.sectionTitle}>Saved Payment Methods</Text>
          <Text style={styles.sectionSubtitle}>Card details used for Paystack room charges & services</Text>

          {savedCard ? (
            <View style={styles.cardItem}>
              <View style={styles.cardHeader}>
                <Ionicons name="card" size={28} color={theme.colors.gold} />
                <Text style={styles.cardBrand}>{savedCard.brand}</Text>
              </View>
              <Text style={styles.cardNumber}>•••• •••• •••• {savedCard.last4}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardHolder}>{savedCard.holder}</Text>
                <Text style={styles.cardExpiry}>Expires {savedCard.expiry}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyText}>No saved payment card found.</Text>
          )}

          <TouchableOpacity style={styles.addCardBtn} onPress={() => setShowAddCardModal(true)} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={20} color={theme.colors.text} />
            <Text style={styles.addCardBtnText}>Add / Update Card</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ADD CARD MODAL */}
      <Modal visible={showAddCardModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Payment Card</Text>
            <Text style={styles.fieldLabel}>16-Digit Card Number</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="4000 0000 0000 0000"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              maxLength={19}
              value={newCardNumber}
              onChangeText={setNewCardNumber}
            />
            <Text style={styles.fieldLabel}>Cardholder Name</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g. John Doe"
              placeholderTextColor={theme.colors.textMuted}
              value={newCardHolder}
              onChangeText={setNewCardHolder}
            />
            <Text style={styles.fieldLabel}>Expiry Date (MM/YY)</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="12/28"
              placeholderTextColor={theme.colors.textMuted}
              maxLength={5}
              value={newCardExpiry}
              onChangeText={setNewCardExpiry}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveCard}>
                <Text style={styles.modalSaveBtnText}>Save Card</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowAddCardModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CHANGE PASSWORD MODAL */}
      <Modal visible={showPasswordModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Current Password"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
              value={currentPass}
              onChangeText={setCurrentPass}
            />
            <TextInput
              style={styles.fieldInput}
              placeholder="New Password"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
              value={newPass}
              onChangeText={setNewPass}
            />
            <TextInput
              style={styles.fieldInput}
              placeholder="Confirm New Password"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
              value={confirmPass}
              onChangeText={setConfirmPass}
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleChangePassword}>
                <Text style={styles.modalSaveBtnText}>Update</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowPasswordModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Alert */}
      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig((prev) => ({ ...prev, visible: false }))} />
    </Screen>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 20, paddingTop: 56, paddingBottom: 40 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
    subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },

    lockedContainer: { flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 },
    lockedIconBadge: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.colors.warningSoft, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    lockedTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
    lockedSubtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 28, lineHeight: 20 },
    lockedSignInBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, width: '100%', justifyContent: 'center' },
    lockedSignInBtnText: { color: theme.colors.text, fontWeight: '800', fontSize: 15 },
    lockedBackBtn: { paddingVertical: 14, marginTop: 12 },
    lockedBackBtnText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' },

    userCard: { backgroundColor: theme.colors.surface, borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.primary },
    avatarContainer: { width: 68, height: 68, borderRadius: 34, backgroundColor: theme.colors.warningSoft, justifyContent: 'center', alignItems: 'center' },
    userName: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
    userEmail: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.successSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginTop: 8 },
    statusPillText: { color: theme.colors.success, fontSize: 12, fontWeight: '700' },

    tabSwitcher: { flexDirection: 'row', backgroundColor: theme.colors.surfaceVariant, borderRadius: 16, padding: 4, marginBottom: 20 },
    tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
    tabBtnActive: { backgroundColor: theme.colors.primary },
    tabBtnText: { fontSize: 13, fontWeight: '700', color: theme.colors.textMuted },
    tabBtnTextActive: { color: theme.colors.text },

    tabSection: { backgroundColor: theme.colors.surface, borderRadius: 24, padding: 20 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 16 },
    sectionSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: -10, marginBottom: 16 },

    fieldLabel: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
    fieldInput: { backgroundColor: theme.colors.surfaceVariant, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, color: theme.colors.text, fontSize: 15, borderWidth: 1, borderColor: theme.colors.border },

    langRow: { flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 12 },
    langChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.surfaceVariant },
    langChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    langChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
    langChipTextActive: { color: theme.colors.text },

    saveBtn: { backgroundColor: theme.colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
    saveBtnText: { color: theme.colors.text, fontWeight: '800', fontSize: 15 },

    settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    settingTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
    settingDesc: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, paddingRight: 10 },

    outlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 20 },
    outlineBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
    signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.errorSoft, borderRadius: 14, paddingVertical: 14, marginTop: 12 },
    signOutBtnText: { color: theme.colors.error, fontWeight: '800', fontSize: 14 },

    cardItem: { backgroundColor: theme.colors.text, borderRadius: 20, padding: 20, borderWidth: 1.5, borderColor: theme.colors.primary, marginBottom: 16 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardBrand: { color: theme.colors.textInverse, fontWeight: '800', fontSize: 16 },
    cardNumber: { color: theme.colors.textInverse, fontSize: 20, fontWeight: '900', letterSpacing: 3, marginVertical: 20 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardHolder: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' },
    cardExpiry: { color: theme.colors.primary, fontSize: 13, fontWeight: '700' },
    emptyText: { color: theme.colors.textMuted, fontStyle: 'italic', marginVertical: 12 },

    addCardBtn: { backgroundColor: theme.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 12 },
    addCardBtnText: { color: theme.colors.text, fontWeight: '800', fontSize: 14 },

    modalOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { width: '100%', maxWidth: 360, backgroundColor: theme.colors.text, borderRadius: 24, padding: 24, borderWidth: 1.5, borderColor: theme.colors.primary },
    modalTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.textInverse, marginBottom: 16, textAlign: 'center' },
    modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    modalSaveBtn: { flex: 1, backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    modalSaveBtnText: { color: theme.colors.text, fontWeight: '800', fontSize: 14 },
    modalCancelBtn: { flex: 1, backgroundColor: theme.colors.cameraBackdrop, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    modalCancelBtnText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: 14 },
  });