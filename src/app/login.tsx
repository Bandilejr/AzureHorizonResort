import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, SafeAreaView , useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { loginMobileUser, logoutMobileUser } from '@/services/firebase-services';
import { getTheme } from '@/constants/theme';

const REMEMBERED_CREDENTIALS_KEY = 'azure_remembered_credentials';

interface RememberedCredentials {
  email: string;
  password: string;
}

function navigateForRole(router: any, profile: any) {
  if (profile.role === 'admin') {
    router.replace('/(admin)/refund-management' as any);
  } else if (profile.role === 'staff') {
    router.replace('/(staff)/staff-dashboard' as any);
  } else {
    router.replace('/(guest)/guest-portal' as any);
  }
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [hasRememberedCredentials, setHasRememberedCredentials] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(REMEMBERED_CREDENTIALS_KEY);
        if (stored) {
          const creds = JSON.parse(stored) as RememberedCredentials;
          if (creds.email && creds.password) {
            setEmail(creds.email);
            setPassword(creds.password);
            setRememberMe(true);
            setHasRememberedCredentials(true);
          }
        }
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometricEnabled(hasHardware && enrolled);
      } catch (_) {
        // SecureStore / biometrics unavailable - fall back to normal login
      }
    })();
  }, []);

  const persistCredentials = async () => {
    try {
      if (rememberMe) {
        await SecureStore.setItemAsync(REMEMBERED_CREDENTIALS_KEY, JSON.stringify({ email: email.trim(), password } as RememberedCredentials));
        setHasRememberedCredentials(true);
      } else {
        await SecureStore.deleteItemAsync(REMEMBERED_CREDENTIALS_KEY);
        setHasRememberedCredentials(false);
      }
    } catch (_) {
      // non-fatal: just skip persistence
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const profile = (await loginMobileUser(email.trim(), password)) as { role?: string };
      await persistCredentials();
      setLoading(false);
      navigateForRole(router, profile);
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Login Failed', error.message || 'Invalid credentials.');
    }
  };

  const handleFingerprintLogin = async () => {
    if (!hasRememberedCredentials) return;
    setBioLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in to Azure Horizon',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (!result.success) {
        setBioLoading(false);
        return;
      }
      const stored = await SecureStore.getItemAsync(REMEMBERED_CREDENTIALS_KEY);
      if (!stored) {
        setBioLoading(false);
        return;
      }
      const creds = JSON.parse(stored) as RememberedCredentials;
      const profile = (await loginMobileUser(creds.email.trim(), creds.password)) as { role?: string };
      setBioLoading(false);
      navigateForRole(router, profile);
    } catch (error: any) {
      setBioLoading(false);
      Alert.alert('Login Failed', error.message || 'Unable to sign in with fingerprint.');
    }
  };

  const handleExploreResort = async () => {
    try {
      await logoutMobileUser();
    } catch (error) {
      console.error("Error clearing cached session:", error);
    }
    router.replace('/guest-portal');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: theme.colors.text }]}>Azure Horizon</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Sign In to Your Stay</Text>

        <TextInput
          style={[styles.input, { 
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text
          }]}
          placeholder="Email Address"
          placeholderTextColor={theme.colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <View style={[styles.passwordWrap, { 
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        }]}>
          <TextInput
            style={[styles.passwordInput, { 
              color: theme.colors.text
            }]}
            placeholder="Password"
            placeholderTextColor={theme.colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe(!rememberMe)}>
          <View style={[styles.checkbox, { borderColor: theme.colors.borderStrong, backgroundColor: rememberMe ? theme.colors.primary : 'transparent' }]}>
            {rememberMe && <Ionicons name="checkmark" size={14} color={theme.colors.textInverse} />}
          </View>
          <Text style={[styles.rememberText, { color: theme.colors.textSecondary }]}>Remember me on this device</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        {biometricEnabled && hasRememberedCredentials && (
          <TouchableOpacity style={[styles.bioButton, { borderColor: theme.colors.borderStrong }]} onPress={handleFingerprintLogin} disabled={bioLoading || loading}>
            {bioLoading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <View style={styles.bioButtonContent}>
                <Ionicons name="finger-print" size={20} color={theme.colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.bioButtonText, { color: theme.colors.primary }]}>Sign in with Fingerprint</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.visitorButton} onPress={handleExploreResort} disabled={loading}>
          <Text style={[styles.visitorButtonText, { color: theme.colors.secondary }]}>Explore Resort as Visitor</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/')}>
          <Text style={[styles.backButtonText, { color: theme.colors.textSecondary }]}>Back to Welcome</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  input: {
    width: '100%',
    height: 50,
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  passwordWrap: {
    width: '100%',
    height: 50,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 16,
  },
  eyeButton: {
    paddingHorizontal: 12,
    height: '100%',
    justifyContent: 'center',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 8,
    marginLeft: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  rememberText: {
    fontSize: 14,
  },
  button: {
    width: '100%',
    height: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bioButton: {
    width: '100%',
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  bioButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  visitorButton: {
    width: '100%',
    height: 50,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  visitorButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    marginTop: 24,
  },
  backButtonText: {
    fontSize: 14,
  },
});