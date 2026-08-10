import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme, useColorScheme } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

const HERO_IMAGE = require('../../assets/images/resort-exterior.jpg');

export default function WelcomePage() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const { user, signOut } = useAuth();

  const handleExploreResort = async () => {
    try {
      if (user) {
        await signOut();
      }
    } catch (_) {}
    router.push({ pathname: '/guest-portal', params: { mode: 'visitor' } } as any);
  };

  return (
    <View style={styles.root}>
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
});
