import React from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ImageBackground,
  SafeAreaView,
  StatusBar 
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function MobileLandingPage() {
  return (
    <>
      <StatusBar barStyle="light-content" />
      {/* Immersive Full-Screen Background Image */}
      <ImageBackground 
        source={{ uri: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?q=80&w=1000&auto=format&fit=crop' }} 
        style={styles.backgroundImage}
      >
        {/* Dark overlay to make text readable */}
        <View style={styles.overlay}>
          <SafeAreaView style={styles.safeArea}>
            
            {/* Top Section: Logo & Branding */}
            <View style={styles.headerContainer}>
              <Ionicons name="star" size={32} color="#c9a227" style={styles.icon} />
              <Text style={styles.title}>Azure Horizon</Text>
              <Text style={styles.subtitle}>Your Digital Resort Companion</Text>
            </View>

            {/* Bottom Section: Quick Actions */}
            <View style={styles.actionCard}>
              <Text style={styles.welcomeText}>Welcome to Paradise</Text>
              
              {/* Primary Action */}
              <TouchableOpacity 
                style={styles.primaryButton} 
                onPress={() => router.push('/login' as any)}
              >
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Sign In to Your Stay</Text>
              </TouchableOpacity>

              {/* Secondary Action */}
              <TouchableOpacity 
                style={styles.secondaryButton} 
                onPress={() => router.push('/guest-portal' as any)}
              >
                <Ionicons name="compass-outline" size={20} color="#1e3a5f" />
                <Text style={styles.secondaryButtonText}>Explore the Resort</Text>
              </TouchableOpacity>

              {/* Tertiary Action */}
              <TouchableOpacity 
                style={styles.textButton} 
                onPress={() => router.push('/register' as any)}
              >
                <Text style={styles.textButtonText}>Don't have an account? Create one</Text>
              </TouchableOpacity>
            </View>

            {/* Hidden Staff Portal Link at the very bottom */}
            <TouchableOpacity 
              style={styles.staffLink} 
              onPress={() => router.push('/staff-login' as any)}
            >
              <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.staffLinkText}>Staff & Admin Access</Text>
            </TouchableOpacity>

          </SafeAreaView>
        </View>
      </ImageBackground>
    </>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)', // Elegant dark tint
    justifyContent: 'space-between',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 80,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#ffffff',
    fontFamily: 'serif',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#e2e8f0',
    fontStyle: 'italic',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  actionCard: {
    backgroundColor: '#ffffff',
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
    color: '#1e3a5f',
    marginBottom: 20,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#c9a227',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  secondaryButtonText: {
    color: '#1e3a5f',
    fontSize: 16,
    fontWeight: 'bold',
  },
  textButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  textButtonText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '500',
  },
  staffLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    gap: 4,
  },
  staffLinkText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
