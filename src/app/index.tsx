import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, StatusBar, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme, useColorScheme } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { loginMobileUser } from '@/services/firebase-services';
import { homeRouteFor } from '@/utils/role-home';
import { Alert } from 'react-native';

const HERO_IMAGE = require('../../assets/images/resort-exterior.jpg');

// One-tap demos — one chip per SRS Increment-2 actor (no duplicate roles).
const DEMO_ACCOUNTS = [
  { label: 'Admin', icon: 'shield-checkmark-outline' as const, email: 'staff@azure.com', password: 'Staff.1234' },
  { label: 'Kitchen Mgr', icon: 'people-outline' as const, email: 'kim.kitchen@azurehorizon.demo', password: 'Kitchen.1234' },
  { label: 'Kitchen Staff', icon: 'restaurant-outline' as const, email: 's.khoza@azurehorizon.com', password: 'Kitchen.1234' },
  { label: 'Staff A', icon: 'person-outline' as const, email: 'staffa@azurehorizon.demo', password: 'Staff.1234' },
  { label: 'Staff B', icon: 'person-outline' as const, email: 'staffb@azurehorizon.demo', password: 'Staff.1234' },
  { label: 'Courier', icon: 'basket-outline' as const, email: 'sam.staff@azurehorizon.demo', password: 'Staff.1234' },
  { label: 'Hotel Staff', icon: 'person-outline' as const, email: 'joe.staff@azurehorizon.demo', password: 'Staff.1234' },
  { label: 'NPO Rep', icon: 'heart-outline' as const, email: 'npo1@azurehorizon.demo', password: 'password123' },
];

export default function WelcomePage() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [quickLogging, setQuickLogging] = useState<string | null>(null);

  const handleExploreResort = async () => {
    try {
      if (user) {
        await signOut();
      }
    } catch (_) {}
    router.push({ pathname: '/guest-portal', params: { mode: 'visitor' } } as any);
  };

  const handleQuickLogin = async (account: typeof DEMO_ACCOUNTS[number]) => {
    setQuickLogging(account.label);
    try {
      const profile = (await loginMobileUser(account.email, account.password)) as { role?: string };
      router.replace(homeRouteFor(profile) as any);
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'Invalid credentials.');
    } finally {
      setQuickLogging(null);
    }
  };

  return (
    <View style={[styles.root, { marginTop: Platform.OS === 'android' ? -insets.top : 0 }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Background Image Layer */}
      <Image 
        source={HERO_IMAGE}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />

      {/* Dark Overlay Layer for Text Readability */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15, 23, 42, 0.55)' }]} />

      {/* Foreground Content */}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerContainer}>
          <Ionicons name="star" size={32} color={theme.colors.primary} style={styles.icon} />
          <Text style={[styles.title, { color: '#ffffff', fontFamily: theme.typography.fontFamilies.sans }]}>Azure Horizon</Text>
          <Text style={styles.subtitle}>Your Digital Resort Companion</Text>
        </View>

        <View style={[styles.actionCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.welcomeText, { color: theme.colors.text }]}>Welcome to Paradise</Text>
          
          <TouchableOpacity 
            style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]} 
            onPress={() => router.push('/login' as any)}
          >
            <Ionicons name="log-in-outline" size={20} color="#1e3a5f" />
            <Text style={styles.primaryButtonText}>Sign In to Your Stay</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.secondaryButton, { backgroundColor: theme.colors.surfaceVariant, borderWidth: 1, borderColor: theme.colors.border }]} 
            onPress={handleExploreResort}
          >
            <Ionicons name="compass-outline" size={20} color={theme.colors.secondary} />
            <Text style={[styles.secondaryButtonText, { color: theme.colors.secondary }]}>Explore the Resort</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.textButton} 
            onPress={() => router.push('/register' as any)}
          >
            <Text style={[styles.textButtonText, { color: theme.colors.textSecondary }]}>Don&apos;t have an account? Create one</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.staffLink}>
          <TouchableOpacity 
            style={styles.staffLinkTouchable}
            onPress={() => router.push('/staff-login' as any)}
          >
            <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={styles.staffLinkText}>Staff & Admin Access</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quickAccess}>
          <Text style={styles.quickAccessLabel}>One-tap demo logins</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChips}>
            {DEMO_ACCOUNTS.map((a) => (
              <TouchableOpacity
                key={a.label}
                style={[styles.quickChip, { backgroundColor: quickLogging === a.label ? theme.colors.surfaceVariant : 'rgba(255,255,255,0.14)' }]}
                onPress={() => handleQuickLogin(a)}
                disabled={quickLogging !== null}
              >
                {quickLogging === a.label ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name={a.icon} size={14} color="#fff" style={styles.quickChipIcon} />
                )}
                <Text style={styles.quickChipText}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 8,
  },
  actionCard: {
    marginHorizontal: 8,
    padding: 24,
    borderRadius: 20,
    gap: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 52,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#1e3a5f',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 52,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  textButton: {
    marginTop: 4,
  },
  textButtonText: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  staffLink: {
    alignItems: 'center',
    marginBottom: 12,
  },
  staffLinkTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  staffLinkText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  quickAccess: {
    marginBottom: 8,
  },
  quickAccessLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  quickChips: {
    paddingHorizontal: 4,
    gap: 8,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    minWidth: 74,
    justifyContent: 'center',
  },
  quickChipIcon: {
    marginRight: 6,
  },
  quickChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
