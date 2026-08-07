import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from 'react-native';
import { getTheme } from '@/constants/theme';

export default function StaffDashboardScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  const quickActions = [
    { title: 'Today\'s Events', icon: 'calendar', action: () => {} },
    { title: 'Pending Check-ins', icon: 'people', action: () => {} },
    { title: 'Open Complaints', icon: 'warning', action: () => {} },
    { title: 'Upcoming Inspections', icon: 'clipboard', action: () => {} },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.colors.textSecondary }]}>Good Morning,</Text>
            <Text style={[styles.name, { color: theme.colors.text }]}>{profile?.displayName || 'Staff Member'}</Text>
            <Text style={[styles.role, { color: theme.colors.primary }]}>{profile?.subRole || 'Staff'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Quick Actions</Text>
          <View style={styles.grid}>
            {quickActions.map((action, i) => (
              <TouchableOpacity 
                key={i} 
                style={[styles.actionCard, { backgroundColor: theme.colors.surface }]} 
                onPress={action.action}
              >
                <Ionicons name={action.icon} size={28} color={theme.colors.primary} />
                <Text style={[styles.actionTitle, { color: theme.colors.text }]}>{action.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Today's Events</Text>
          <View style={[styles.eventCard, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.eventTitle, { color: theme.colors.text }]}>Wedding - Grand Ocean Ballroom</Text>
            <Text style={[styles.eventTime, { color: theme.colors.textSecondary }]}>2:00 PM - 10:00 PM</Text>
            <Text style={[styles.eventStatus, { color: theme.colors.success }]}>Setup in progress</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  role: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '48%',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionTitle: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  eventCard: {
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  eventTime: {
    fontSize: 14,
    marginTop: 4,
  },
  eventStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
});