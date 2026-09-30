// (courier) Alerts — thin wrapper over the shared notification inbox.
import React from 'react';
import { ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { NotificationsList } from '@/components/NotificationsList';
import { getTheme } from '@/constants/theme';

export default function CourierNotificationsScreen() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);
  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <NotificationsList fallback="/(courier)/dashboard" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 16 } });