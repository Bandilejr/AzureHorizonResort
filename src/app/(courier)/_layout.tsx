// (courier) Phase 1 §24 — Collector/Courier route group.
// Collectors land on the Courier & Collections home (never manager Kitchen
// Operations). RouteGuard enforces the courier role area on every deep link.
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { getTheme } from '@/constants/theme';
import RouteGuard from '@/components/RouteGuard';

function CourierTabs() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  return (
    <Tabs
      screenOptions={({ route }) => {
        const config = route.name === 'dashboard'
          ? { title: 'Collections', icon: 'bicycle' }
          : route.name === 'notifications'
            ? { title: 'Alerts', icon: 'notifications' }
            : null;
        return {
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
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
      <Tabs.Screen name="dashboard" options={{ title: 'Collections' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts' }} />
    </Tabs>
  );
}

export default function CourierLayout() {
  return (
    <RouteGuard allow="courier">
      <CourierTabs />
    </RouteGuard>
  );
}