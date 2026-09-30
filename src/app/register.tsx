import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/services/firebase-services';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { CustomAlertModal, AlertConfig } from '@/components/CustomAlertModal';

export default function RegistrationPage() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { refreshProfile } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      showAlert({ title: 'Input Required', message: 'Please fill in all registration fields.', type: 'warning' });
      return;
    }
    if (password !== confirmPassword) {
      showAlert({ title: 'Password Mismatch', message: 'Password and confirmation do not match.', type: 'warning' });
      return;
    }
    if (password.length < 6) {
      showAlert({ title: 'Weak Password', message: 'Password must be at least 6 characters.', type: 'warning' });
      return;
    }

    setIsLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCred.user;

      await updateProfile(user, { displayName: name.trim() });

      const profileData = {
        uid: user.uid,
        email: cleanEmail,
        displayName: name.trim(),
        role: 'guest',
        status: 'resident',
        roomNumber: '101',
        loyaltyPoints: 500,
        loyaltyTier: 'Silver',
        phoneNumber: '',
        preferences: {
          language: 'en',
          notifications: true,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'users', user.uid), profileData);
      await setDoc(doc(db, 'users', cleanEmail), profileData);

      await refreshProfile();

      showAlert({
        title: 'Welcome to Azure Horizon! 🎉',
        message: `Account created for ${name.trim()}! Your Resident status, Digital Room Key (Room 101), and 500 Silver Loyalty points are ready.`,
        type: 'success',
        confirmText: 'Enter Guest Portal',
        onConfirm: () => {
          router.replace('/(guest)/guest-portal');
        },
      });
    } catch (error: any) {
      let msg = error.message || 'Registration failed.';
      if (error.code === 'auth/email-already-in-use') {
        msg = 'This email address is already registered. Please sign in instead.';
      }
      showAlert({
        title: 'Registration Error',
        message: msg,
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <KeyboardAvoidingView 
        style={styles.keyboardContent} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* Top Bar with Back Button */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.replace('/')} style={styles.backBtn} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
              <Text style={styles.backBtnText}>Welcome Screen</Text>
            </TouchableOpacity>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="star" size={36} color={theme.colors.gold} style={styles.icon} />
            <Text style={styles.title}>Join Azure Horizon</Text>
            <Text style={styles.subtitle}>Create a resident account for room key & resort access</Text>
          </View>

          {/* Registration Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create Account</Text>
            <Text style={styles.cardDescription}>Enter your details below to register your account</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput 
                style={styles.input}
                placeholder="e.g. Alex Morgan"
                placeholderTextColor={theme.colors.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput 
                style={styles.input}
                placeholder="resident@example.com"
                placeholderTextColor={theme.colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput 
                  style={[styles.input, { flex: 1, borderWidth: 0 }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput 
                  style={[styles.input, { flex: 1, borderWidth: 0 }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.registerButton} 
              onPress={handleRegister}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <>
                  <Ionicons name="person-add-outline" size={20} color={theme.colors.textInverse} />
                  <Text style={styles.registerButtonText}>Create Account & Sign In</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.loginLink} 
              onPress={() => router.push('/login')}
            >
              <Text style={styles.loginLinkText}>Already have an account? Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CustomAlertModal config={alertConfig} onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))} />
    </Screen>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    keyboardContent: { flex: 1 },
    scrollContent: { padding: 20, paddingTop: 10, paddingBottom: 40 },

    topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border },
    backBtnText: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },

    header: { alignItems: 'center', marginBottom: 20 },
    icon: { marginBottom: 8 },
    title: { fontSize: 26, fontWeight: '900', color: theme.colors.text },
    subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4, textAlign: 'center' },

    card: { backgroundColor: theme.colors.surface, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: theme.colors.gold, elevation: 6 },
    cardTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
    cardDescription: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 16 },

    inputGroup: { marginBottom: 14 },
    label: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    input: { backgroundColor: theme.colors.surfaceVariant, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: theme.colors.text, fontSize: 14, borderWidth: 1, borderColor: theme.colors.border },
    passwordWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surfaceVariant, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border },
    eyeBtn: { paddingHorizontal: 14 },

    registerButton: { backgroundColor: theme.colors.gold, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 },
    registerButtonText: { color: theme.colors.textInverse, fontSize: 15, fontWeight: '800' },

    loginLink: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
    loginLinkText: { color: theme.colors.primary, fontSize: 13, fontWeight: '700' },
  });