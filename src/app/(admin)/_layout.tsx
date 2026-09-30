import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { getTheme } from '@/constants/theme';
import RouteGuard from '@/components/RouteGuard';

const ADMIN_TABS_CONFIG = {
  'dashboard': { title: 'Dashboard', icon: 'speedometer' },
  'npo-verification': { title: 'NPO Review', icon: 'business' },
  'refund-management': { title: 'Refunds', icon: 'cash' },
  'impact': { title: 'Reports', icon: 'bar-chart' },
};

function AdminTabs() {
  const colorScheme = useColorScheme();
  const theme = getTheme(colorScheme as any);

  return (
    <Tabs
      screenOptions={({ route }) => {
        const config = ADMIN_TABS_CONFIG[route.name as keyof typeof ADMIN_TABS_CONFIG];
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
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="npo-verification" options={{ title: 'NPO Review' }} />
      <Tabs.Screen name="refund-management" options={{ title: 'Refunds' }} />
      <Tabs.Screen name="impact" options={{ title: 'Reports' }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

export default function AdminLayout() {
  return (
    <RouteGuard allow="admin">
      <AdminTabs />
    </RouteGuard>
  );
}
