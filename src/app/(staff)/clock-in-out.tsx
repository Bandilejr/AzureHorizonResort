import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import ClockInPanel from '@/components/clock-in-panel';
import { getTheme } from '@/constants/theme';

export default function StaffClockInOutScreen() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Clock In / Out</Text>
        <Text style={styles.subtitle}>📍 DUT Ritson Campus • 400m geofence • GPS-verified shifts</Text>
      </View>
      <ClockInPanel />
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 0 },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.colors.text },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
});