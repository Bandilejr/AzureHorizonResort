import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/context/PermissionsContext';
import { getTheme } from '@/constants/theme';

const STAFF_TABS_CONFIG = {
  'staff-dashboard': { title: 'Dashboard', icon: 'speedometer' },
  'attendee-checkin': { title: 'Event Ops', icon: 'qr-code' },
  'pre-event-inspection': { title: 'Inspections', icon: 'clipboard' },
  'live-complaints': { title: 'Complaints', icon: 'warning' },
};

const HIDDEN_SCREENS = [
  'staff-checkin',
  'post-event-inspection',
  'damage-resolution',
  'refund-management',
  'today-events',
  'event-ops',
  'clock-in-out',
  'loyalty-scanner',
];

export default function StaffLayout() {
  const { profile, loading } = useAuth();
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  if (loading) {
    return (
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarStyle: { backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border },
        }}
      >
        <Tabs.Screen name="staff-dashboard" />
      </Tabs>
    );
  }

  // 4 Core Main Tabs for Staff Navigation
  const availableTabs = [
    'staff-dashboard',
    'attendee-checkin',
    'pre-event-inspection',
    'live-complaints',
  ];

  return (
    <Tabs
      screenOptions={({ route }) => {
        const config = STAFF_TABS_CONFIG[route.name as keyof typeof STAFF_TABS_CONFIG];
        return {
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={(config?.icon || 'help') as any} size={size} color={color} />
          ),
          tabBarLabel: config?.title || route.name,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        };
      }}
    >
      <Tabs.Screen name="staff-dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="attendee-checkin" options={{ title: 'Event Ops' }} />
      <Tabs.Screen name="pre-event-inspection" options={{ title: 'Inspections' }} />
      <Tabs.Screen name="live-complaints" options={{ title: 'Complaints' }} />

      <Tabs.Screen name="staff-checkin" options={{ href: null }} />
      <Tabs.Screen name="post-event-inspection" options={{ href: null }} />
      <Tabs.Screen name="damage-resolution" options={{ href: null }} />
      <Tabs.Screen name="refund-management" options={{ href: null }} />
      <Tabs.Screen name="today-events" options={{ href: null }} />
      <Tabs.Screen name="event-ops" options={{ href: null }} />
      <Tabs.Screen name="clock-in-out" options={{ href: null }} />
      <Tabs.Screen name="loyalty-scanner" options={{ href: null }} />
    </Tabs>
  );
}