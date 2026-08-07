import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { logoutMobileUser } from '@/services/firebase-services';
import { useColorScheme } from 'react-native';
import { getTheme } from '@/constants/theme';

export default function ProfileScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  const handleSignOut = async () => {
    try {
      await logoutMobileUser();
    } catch (error) {
      console.error('Error signing out:', error);
    }
    router.replace('/login');
  };

  const confirmSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.avatarContainer, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Ionicons name="person" size={48} color={theme.colors.secondary} />
        </View>
        <Text style={[styles.name, { color: theme.colors.text }]}>
          {profile?.displayName || user?.displayName || 'Guest'}
        </Text>
        <Text style={[styles.email, { color: theme.colors.textSecondary }]}>
          {user?.email || profile?.email || 'Not signed in'}
        </Text>

        <View style={[styles.infoCard, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.infoRow}>
            <Ionicons name="bed-outline" size={20} color={theme.colors.secondary} />
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>Room</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text }]}>{profile?.roomNumber || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="diamond-outline" size={20} color={theme.colors.secondary} />
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>Loyalty Tier</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text }]}>{profile?.loyaltyTier || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="star-outline" size={20} color={theme.colors.secondary} />
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>Points</Text>
            <Text style={[styles.infoValue, { color: theme.colors.text }]}>{profile?.loyaltyPoints ?? 0}</Text>
          </View>
        </View>

        {user && (
          <TouchableOpacity style={[styles.signOutButton, { backgroundColor: theme.colors.surface }]} onPress={confirmSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#e11d48" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    marginBottom: 24,
  },
  infoCard: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  infoLabel: {
    flex: 1,
    fontSize: 15,
    marginLeft: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  signOutText: {
    color: '#e11d48',
    fontSize: 16,
    fontWeight: '600',
  },
});