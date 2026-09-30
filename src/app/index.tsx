import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, StatusBar, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/context/AuthContext';
import { loginMobileUser } from '@/services/firebase-services';
import { homeRouteFor } from '@/utils/role-home';
import { Alert } from 'react-native';

const HERO_IMAGE = require('../../assets/images/resort-exterior.jpg');

// One-tap demos — one chip per SRS Increment-2 actor (no duplicate roles).
type DemoAccount = { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; email: string; password: string };
const DEMO_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  Admin: 'shield-checkmark-outline', 'Kitchen Mgr': 'people-outline', 'Kitchen Staff': 'restaurant-outline',
  'Staff A': 'person-outline', 'Staff B': 'person-outline', Courier: 'basket-outline',
  'Hotel Staff': 'person-outline', 'NPO Rep': 'heart-outline',
};
// Demo credentials are NOT in source. Provide EXPO_PUBLIC_DEMO_ACCOUNTS (JSON)
// in the gitignored .env to show one-tap chips; otherwise they are hidden.
const DEMO_ACCOUNTS: DemoAccount[] = (() => {
  try {
    const raw = process.env.EXPO_PUBLIC_DEMO_ACCOUNTS;
    if (!raw) return [];
    // Tolerate a double-encoded value (the whole JSON serialised once more) and
    // an object wrapper, so a quoting slip in .env degrades gracefully.
    let parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (!Array.isArray(parsed)) {
      const bag = parsed as { accounts?: unknown; demoAccounts?: unknown };
      parsed = bag?.accounts ?? bag?.demoAccounts ?? [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((a: any) => ({
        label: String(a?.label || ''),
        icon: (DEMO_ICONS[a?.label] || 'person-outline') as React.ComponentProps<typeof Ionicons>['name'],
        email: String(a?.email || ''),
        password: String(a?.password || ''),
      }))
      .filter((a) => a.email && a.password);
  } catch { return []; }
})();

export default function WelcomePage() {
  const theme = useAppTheme();
  const styles = createStyles(theme);
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
    <Screen padded={false} style={[styles.root, { marginTop: Platform.OS === 'android' ? -insets.top : 0 }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Background Image Layer */}
      <Image 
        source={HERO_IMAGE}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />

      {/* Dark Overlay Layer for Text Readability */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]} />

      {/* Foreground Content */}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerContainer}>
          <Ionicons name="star" size={32} color={theme.colors.primary} style={styles.icon} />
          <Text style={[styles.title, { color: theme.colors.textInverse }]}>Azure Horizon</Text>
          <Text style={styles.subtitle}>Your Digital Resort Companion</Text>
        </View>

        <View style={[styles.actionCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.welcomeText, { color: theme.colors.text }]}>Welcome to Paradise</Text>
          
          <TouchableOpacity 
            style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]} 
            onPress={() => router.push('/login' as any)}
          >
            <Ionicons name="log-in-outline" size={20} color={theme.colors.textInverse} />
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
            <Ionicons name="lock-closed" size={12} color={theme.colors.textMuted} />
            <Text style={styles.staffLinkText}>Staff & Admin Access</Text>
          </TouchableOpacity>
        </View>

        {DEMO_ACCOUNTS.length > 0 ? (
        <View style={styles.quickAccess}>
          <Text style={styles.quickAccessLabel}>One-tap demo logins</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChips}>
            {DEMO_ACCOUNTS.map((a) => (
              <TouchableOpacity
                key={a.label}
                style={[styles.quickChip, { backgroundColor: theme.colors.surfaceVariant }]}
                onPress={() => handleQuickLogin(a)}
                disabled={quickLogging !== null}
              >
                {quickLogging === a.label ? (
                  <ActivityIndicator size="small" color={theme.colors.textInverse} />
                ) : (
                  <Ionicons name={a.icon} size={14} color={theme.colors.textInverse} style={styles.quickChipIcon} />
                )}
                <Text style={styles.quickChipText}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        ) : null}
      </SafeAreaView>
    </Screen>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.cameraBackdrop,
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
    color: theme.colors.textInverse,
    marginTop: 8,
  },
  actionCard: {
    marginHorizontal: 8,
    padding: 24,
    borderRadius: 20,
    gap: 16,
    alignItems: 'center',
    shadowColor: theme.colors.shadow,
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
    color: theme.colors.textInverse,
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
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  quickAccess: {
    marginBottom: 8,
  },
  quickAccessLabel: {
    color: theme.colors.textMuted,
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
    borderColor: theme.colors.borderStrong,
    minWidth: 74,
    justifyContent: 'center',
  },
  quickChipIcon: {
    marginRight: 6,
  },
  quickChipText: {
    color: theme.colors.textInverse,
    fontSize: 13,
    fontWeight: '600',
  },
});
