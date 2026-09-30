import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, SafeAreaView , useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { loginMobileUser } from '@/services/firebase-services';
import { homeRouteFor } from '@/utils/role-home';
import { Ionicons } from '@expo/vector-icons';

import { getTheme } from '@/constants/theme';

export default function StaffLoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  const handleStaffLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const profile = (await loginMobileUser(email.trim(), password)) as { role?: string };
      setLoading(false);
      if (profile.role === 'admin' || profile.role === 'staff' || (profile as any).role === 'kitchen_manager' || (profile as any).role === 'chef' || (profile as any).role === 'npo_rep') {
        router.replace(homeRouteFor(profile as any) as any);
      } else {
        router.replace('/(guest)/guest-portal' as any);
      }
    } catch (error: any) {
      setLoading(false);
      Alert.alert('Login Failed', error.message || 'Invalid credentials.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: theme.colors.text }]}>Staff & Admin Access</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Sign in to manage resort operations</Text>

        <TextInput
          style={[styles.input, {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            color: theme.colors.text
          }]}
          placeholder="Work Email Address"
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

        <TouchableOpacity style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={handleStaffLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
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
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 50,
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
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
  backButton: {
    marginTop: 24,
  },
  backButtonText: {
    fontSize: 14,
  },
  passwordWrap: {
    width: '100%',
    height: 50,
    borderRadius: 8,
    marginBottom: 16,
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
});