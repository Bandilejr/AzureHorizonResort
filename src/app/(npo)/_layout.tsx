import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { getTheme } from '@/constants/theme';
import RouteGuard from '@/components/RouteGuard';

const NPO_TABS_CONFIG = {
  'dashboard': { title: 'Home', icon: 'home' },
  'allocations': { title: 'Donations', icon: 'gift' },
  'notifications': { title: 'Alerts', icon: 'notifications' },
};

function NpoTabs() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  return (
    <Tabs
      screenOptions={({ route }) => {
        const config = NPO_TABS_CONFIG[route.name as keyof typeof NPO_TABS_CONFIG];
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
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="allocations" options={{ title: 'Donations' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="collections" options={{ href: null }} />
      <Tabs.Screen name="organisation" options={{ href: null }} />
    </Tabs>
  );
}

export default function NpoLayout() {
  return (
    <RouteGuard allow="npo">
      <NpoTabs />
    </RouteGuard>
  );
}
