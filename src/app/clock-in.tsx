import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import ClockInPanel from '@/components/clock-in-panel';
import { getTheme } from '@/constants/theme';

export default function WebClockInScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Azure Hotel</Text>
        <Text style={styles.title}>Staff Clock In / Out</Text>
        <Text style={styles.subtitle}>GPS-verified - tap on site, no hardware needed</Text>
      </View>

      {!user && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Please sign in to clock in/out. Install the Azure Hotel app for the full experience.
          </Text>
          <TouchableOpacity
            style={styles.bannerBtn}
            onPress={() => router.push('/login' as never)}
          >
            <Text style={styles.bannerBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      )}

      <ClockInPanel />

      <Text style={styles.footer} onPress={() => Linking.openURL('https://azurerest.netlify.app')}>
        azurerest.netlify.app
      </Text>
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { alignItems: 'center', paddingTop: 48, paddingBottom: 12 },
  logo: { color: theme.colors.primary, fontWeight: 'bold', fontSize: 13, letterSpacing: 2 },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: 'bold', marginTop: 8 },
  subtitle: { color: theme.colors.textMuted, fontSize: 13, marginTop: 4 },
  banner: { margin: 16, backgroundColor: theme.colors.warningLight, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  bannerText: { color: theme.colors.warning, textAlign: 'center', marginBottom: 12 },
  bannerBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  bannerBtnText: { color: theme.colors.textInverse, fontWeight: 'bold' },
  footer: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 12, padding: 16 },
});