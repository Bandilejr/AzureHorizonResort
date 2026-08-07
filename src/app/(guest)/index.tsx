import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ImageBackground, StatusBar, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTheme, useColorScheme } from '@/constants/theme';

export default function MobileLandingPage() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <ImageBackground 
        source={{ uri: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?q=80&w=1000&auto=format&fit=crop' }} 
        style={styles.backgroundImage}
      >
        <View style={styles.container}>
          <View style={styles.safeArea}>
            <View style={styles.headerContainer}>
              <Ionicons name="star" size={32} color={theme.colors.primary} style={styles.icon} />
              <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.fontFamilies.sans }]}>Azure Horizon</Text>
              <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Your Digital Resort Companion</Text>
            </View>

            <View style={[styles.actionCard, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.welcomeText, { color: theme.colors.text }]}>Welcome to Paradise</Text>
              
              <TouchableOpacity 
                style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]} 
                onPress={() => router.push('/login' as any)}
              >
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Sign In to Your Stay</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.secondaryButton, { backgroundColor: theme.colors.surfaceVariant, borderWidth: 1, borderColor: theme.colors.border }]} 
                onPress={() => router.push('/guest-portal' as any)}
              >
                <Ionicons name="compass-outline" size={20} color={theme.colors.secondary} />
                <Text style={[styles.secondaryButtonText, { color: theme.colors.secondary }]}>Explore the Resort</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.textButton} 
                onPress={() => router.push('/register' as any)}
              >
                <Text style={[styles.textButtonText, { color: theme.colors.textSecondary }]}>Don't have an account? Create one</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.staffLink} 
              onPress={() => router.push('/staff-login' as any)}
            >
              <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.staffLinkText}>Staff & Admin Access</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'space-between',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 42,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    fontStyle: 'italic',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  actionCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  textButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  textButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  staffLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    marginTop: 20,
    gap: 12,
  },
  staffLinkText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});